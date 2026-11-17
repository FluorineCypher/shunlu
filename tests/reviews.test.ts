import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { notifications, orderEvents, reviews } from "@/server/db/schema";
import { acceptOrder, confirmDelivered, createOrder, deliverOrder, pickOrder } from "@/server/rules/orders";
import { createReview, REVIEW_TAGS, reviewSummaryOf } from "@/server/rules/reviews";
import { A, B, C, getUser } from "./helpers";

/** 造一张「已完成」的单：A 发布 → B 接单/取货/送达 → A 确认收货 */
async function completedOrder(publisher = A, runner = B) {
  const order = await createOrder(publisher, {
    bizType: "food",
    pickupPoint: "东门外卖柜",
    dropBuilding: "女寝3号楼",
    dropFloor: 4,
    dropRoom: "412",
    phoneTail: "8842",
    rewardFen: 500,
  });
  await acceptOrder(order.id, runner);
  await pickOrder(order.id, runner);
  await deliverOrder(order.id, runner, "https://example.com/proof.jpg");
  await confirmDelivered(order.id, publisher);
  return order;
}

describe("M2 评价", () => {
  beforeEach(async () => {
    // 每个用例前由 tests/setup.ts 重置种子
  });

  it("发布者评价完成后：写入 reviews、事件与通知，一单只能评一次", async () => {
    const order = await completedOrder();
    const before = await getUser(B);

    const review = await createReview({
      orderId: order.id,
      fromUserId: A,
      rating: 5,
      tags: [REVIEW_TAGS[0], REVIEW_TAGS[1], "乱填的标签"],
      comment: "  雨里也准时送到  ",
    });

    expect(review.rating).toBe(5);
    // 非法标签被过滤，最多 3 个
    expect(review.tags).toEqual([REVIEW_TAGS[0], REVIEW_TAGS[1]]);
    expect(review.comment).toBe("雨里也准时送到");
    expect(review.toUserId).toBe(B);

    const [saved] = await db.select().from(reviews).where(eq(reviews.orderId, order.id));
    expect(saved.rating).toBe(5);

    const events = await db.select().from(orderEvents).where(eq(orderEvents.orderId, order.id));
    expect(events.some((e) => e.type === "review")).toBe(true);

    const notes = await db.select().from(notifications).where(eq(notifications.userId, B));
    expect(notes.some((n) => n.content.includes("评价"))).toBe(true);

    // 评价不动钱、不再加信用（完成结算时已 +1）
    expect((await getUser(B)).balanceFen).toBe(before.balanceFen);
    expect((await getUser(B)).creditScore).toBe(before.creditScore);

    await expect(
      createReview({ orderId: order.id, fromUserId: A, rating: 4 })
    ).rejects.toThrow(/已经评价过/);
  });

  it("只有发布者能评价；跑腿者本人与旁观者都被拒绝", async () => {
    const order = await completedOrder();
    await expect(createReview({ orderId: order.id, fromUserId: B, rating: 5 })).rejects.toThrow(/只有发布者/);
    await expect(createReview({ orderId: order.id, fromUserId: C, rating: 5 })).rejects.toThrow(/只有发布者/);
  });

  it("未完成的订单不能评价；评分必须 1–5", async () => {
    const done = await completedOrder();
    await expect(createReview({ orderId: done.id, fromUserId: A, rating: 0 })).rejects.toThrow(/1–5 星/);
    await expect(createReview({ orderId: done.id, fromUserId: A, rating: 6 })).rejects.toThrow(/1–5 星/);

    const open = await createOrder(A, {
      bizType: "food",
      pickupPoint: "东门外卖柜",
      dropBuilding: "女寝3号楼",
      rewardFen: 500,
    });
    await expect(createReview({ orderId: open.id, fromUserId: A, rating: 5 })).rejects.toThrow(/完成后才能评价/);
  });

  it("标签最多保留 3 个，留言截断到 100 字", async () => {
    const order = await completedOrder();
    const review = await createReview({
      orderId: order.id,
      fromUserId: A,
      rating: 4,
      tags: [...REVIEW_TAGS],
      comment: "好".repeat(150),
    });
    expect(review.tags).toHaveLength(3);
    expect(review.comment).toHaveLength(100);
  });

  it("口碑汇总：条数与平均分，最近的排在前面", async () => {
    // 种子里 B 已有历史评价，先记基线
    const baseline = await reviewSummaryOf(db, B);
    const first = await completedOrder();
    await createReview({ orderId: first.id, fromUserId: A, rating: 5, comment: "第一单" });
    const second = await completedOrder();
    await createReview({ orderId: second.id, fromUserId: A, rating: 4, comment: "第二单" });

    const summary = await reviewSummaryOf(db, B);
    expect(summary.count).toBe(baseline.count + 2);
    expect(summary.recent[0].comment).toBe("第二单");
    expect(summary.recent[1].comment).toBe("第一单");
    expect(summary.avgRating).toBeGreaterThan(0);
    expect(summary.avgRating).toBeLessThanOrEqual(5);
  });

  it("完成结算给跑腿者 +1 信用（封顶 120）", async () => {
    const start = await getUser(B);
    await completedOrder();
    expect((await getUser(B)).creditScore).toBe(Math.min(120, start.creditScore + 1));
  });
});
