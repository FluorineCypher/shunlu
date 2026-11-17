import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { orders, users } from "@/server/db/schema";
import { advance } from "@/server/clock";
import {
  acceptOrder,
  bumpOrder,
  cancelOrder,
  confirmDelivered,
  deliverOrder,
  expireSweep,
  pickOrder,
} from "@/server/rules/orders";
import { MIN_MS } from "@/server/rules/durations";
import { toHallOrder, toOrderDetail } from "@/server/rules/serializers";
import { SEED, A, B, D, E, PLATFORM, getUser, getOrder, escrowFen, logsOfOrder, assertUserBalance, failPendingAddons } from "./helpers";

describe("惰性过期与退款（规则 6 / 8，附录 A）", () => {
  it("open 超 accept_deadline → expired + 全额退发布者 + 托管归零", async () => {
    const before = await getUser(D);
    await advance(16 * MIN_MS);
    const handled = await expireSweep();
    expect(handled).toBeGreaterThanOrEqual(3);

    const order = await getOrder(SEED.open1);
    expect(order.status).toBe("expired");
    expect(await escrowFen(order.id)).toBe(0);

    const after = await getUser(D);
    // D 发布 12(350+捎带预算400) 与 13(400+捎带预算300) 两张，都过期退回
    expect(after.balanceFen - before.balanceFen).toBe(750 + 700);
    const refunds = (await logsOfOrder(SEED.open1)).filter((l) => l.type === "refund");
    expect(refunds[0]?.amountFen).toBe(750);
  });

  it("accepted 超 deliver_deadline → 回 open、清 runner、信用 −10、不退款", async () => {
    const before = await getUser(B);
    const escrowBefore = await escrowFen(SEED.accepted);
    await advance(21 * MIN_MS);
    await expireSweep();

    const order = await getOrder(SEED.accepted);
    expect(order.status).toBe("open");
    expect(order.runnerId).toBeNull();
    expect(order.batchId).toBeNull();
    expect(order.acceptDeadlineAt!.getTime()).toBeGreaterThan(order.createdAt.getTime());

    const after = await getUser(B);
    expect(after.creditScore).toBe(before.creditScore - 10);
    expect(await escrowFen(SEED.accepted)).toBe(escrowBefore); // 没动钱
  });

  it("picked 超 deliver_deadline → abnormal + 全额退 + 信用 −10", async () => {
    await acceptOrder(SEED.open1, B);
    await pickOrder(SEED.open1, B);
    await failPendingAddons(SEED.open1, B);
    const before = await getUser(B);
    const publisherBefore = await getUser(D);

    await advance(21 * MIN_MS);
    await expireSweep();

    const order = await getOrder(SEED.open1);
    expect(order.status).toBe("abnormal");
    expect(await escrowFen(order.id)).toBe(0);
    expect((await getUser(B)).creditScore).toBe(80); // #16 接单超时 −10 + 本单异常 −10
    expect((await getUser(D)).balanceFen - publisherBefore.balanceFen).toBe(750 + 700); // 12/13 过期退回（含捎带预算）
  });

  it("delivered 到 auto_confirm_at → 系统自动确认并结算", async () => {
    await acceptOrder(SEED.open1, B);
    await pickOrder(SEED.open1, B);
    await failPendingAddons(SEED.open1, B);
    await deliverOrder(SEED.open1, B, "https://example.com/proof.jpg");

    const delivered = await getOrder(SEED.open1);
    expect(delivered.status).toBe("delivered");
    expect(delivered.autoConfirmAt).not.toBeNull();

    const runnerBefore = await getUser(B);
    const platformBefore = await getUser(PLATFORM);

    await advance(2 * 60 * MIN_MS + MIN_MS);
    await expireSweep();

    const order = await getOrder(SEED.open1);
    expect(order.status).toBe("completed");
    expect(order.confirmedBy).toBe("system");
    expect(await escrowFen(order.id)).toBe(0);

    // 350 → Y=263（round 262.5）、fee=87，守恒 350
    expect((await getUser(B)).balanceFen - runnerBefore.balanceFen).toBe(263);
    expect((await getUser(PLATFORM)).balanceFen - platformBefore.balanceFen).toBe(87);
    expect((await getUser(B)).creditScore).toBe(91); // 100 −10（#16 超时）+1（本单完成）
    await assertUserBalance(B);
    await assertUserBalance(D);
  });
});

describe("发布者动作", () => {
  it("取消 open 单 → 全额退 + 终态", async () => {
    const before = await getUser(E);
    const cancelled = await cancelOrder(SEED.buyOpen, E);
    expect(cancelled.status).toBe("cancelled");
    expect(await escrowFen(SEED.buyOpen)).toBe(0);
    expect((await getUser(E)).balanceFen - before.balanceFen).toBe(1300);
  });

  it("他人不能取消", async () => {
    await expect(cancelOrder(SEED.open1, A)).rejects.toThrow(/只有发布者/);
  });

  it("加价重发：新建 linked 订单，旧单保持 expired", async () => {
    await advance(16 * MIN_MS);
    await expireSweep();
    const old = await getOrder(SEED.open2);
    expect(old.status).toBe("expired");

    const before = await getUser(D);
    const { created } = await bumpOrder(SEED.open2, D, 100);

    expect(created.status).toBe("open");
    expect(created.linkedPrevId).toBe(SEED.open2);
    expect(created.rewardFen).toBe(old.rewardFen + 100);
    // 新单同时复制旧单的捎带项预算
    expect(created.budgetFen).toBe(old.budgetFen);
    const escrow = created.rewardFen + created.budgetFen;
    expect(await escrowFen(created.id)).toBe(escrow);
    expect((await getOrder(SEED.open2)).status).toBe("expired");
    expect(before.balanceFen - (await getUser(D)).balanceFen).toBe(escrow);

    // 同一单不能重复加价重发
    await expect(bumpOrder(SEED.open2, D, 100)).rejects.toThrow(/已加价重发过/);
  });
});

describe("隐私出口过滤（规则 5）", () => {
  it("发布者本人查详情拿不到 phone_tail；接单跑腿者本人才拿得到", async () => {
    const order = await getOrder(SEED.accepted); // runner = B, publisher = A

    const asRunner = toOrderDetail(order, { id: B });
    expect(asRunner.dropRoom).toBe("412");
    expect(asRunner.phoneTail).toBe("8841");

    const asPublisher = toOrderDetail(order, { id: A });
    expect(asPublisher.phoneTail).toBeNull();
    expect(asPublisher.dropRoom).toBeNull();
    expect(asPublisher.publisherId).toBe(A);

    const asStranger = toOrderDetail(order, { id: E });
    expect(asStranger.phoneTail).toBeNull();
  });

  it("大厅序列化字段里没有隐私键", async () => {
    const order = await getOrder(SEED.open1);
    const hall = toHallOrder(order);
    expect(hall).not.toHaveProperty("dropRoom");
    expect(hall).not.toHaveProperty("phoneTail");
    expect(hall).not.toHaveProperty("proofPhotoUrl");
    expect(hall).not.toHaveProperty("linkedPrevId");
    expect(JSON.stringify(hall)).not.toContain("8841");
  });

  it("未接单（open）时任何人都拿不到房号", async () => {
    const order = await getOrder(SEED.open1);
    expect(toOrderDetail(order, { id: B }).dropRoom).toBeNull();
  });

  it("送达凭证对发布者可见，但房号/尾号仍然只有跑腿者可见", async () => {
    await pickOrder(SEED.accepted, B);
    await failPendingAddons(SEED.accepted, B);
    const delivered = await deliverOrder(SEED.accepted, B, "https://example.com/proof.jpg");

    const asPublisher = toOrderDetail(delivered, { id: A });
    expect(asPublisher.proofPhotoUrl).toBe("https://example.com/proof.jpg");
    expect(asPublisher.dropRoom).toBeNull();
    expect(asPublisher.phoneTail).toBeNull();

    const asRunner = toOrderDetail(delivered, { id: B });
    expect(asRunner.proofPhotoUrl).toBe("https://example.com/proof.jpg");

    const asStranger = toOrderDetail(delivered, { id: E });
    expect(asStranger.proofPhotoUrl).toBeNull();
  });
});
