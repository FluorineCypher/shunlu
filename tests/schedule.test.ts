import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { orders, orderEvents } from "@/server/db/schema";
import { acceptOrder, createOrder, expireSweep, reportUnarrived } from "@/server/rules/orders";
import { advance } from "@/server/clock";
import { B, C, E, SEED, escrowFen, getOrder, getUser } from "./helpers";

/**
 * 预订单（v1.5）：提前下单 + 预计送达时间。
 * 关键语义：接单截止 = 承诺时刻；送达截止 = 承诺时刻；到点没送到 → 跑腿者报「餐未送达」或超时释放，信用 −10。
 */
const BASE = {
  bizType: "food" as const,
  pickupPoint: "东门外卖柜",
  dropBuilding: "女寝3号楼",
  dropFloor: 4,
  dropRoom: "412",
  rewardFen: 500,
} as const;

function minutesBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 60000);
}

describe("预订单：提前下单与预计送达时间（v1.5）", () => {
  it("预约时间必须至少提前 20 分钟，否则拒绝并提示留余量", async () => {
    await expect(
      createOrder(E, { ...BASE, expectDeliveryMinutes: 10 })
    ).rejects.toThrow(/至少要提前 20 分钟/);
    await expect(
      createOrder(E, { ...BASE, expectDeliveryMinutes: -5 })
    ).rejects.toThrow(/至少要提前 20 分钟/);
    await expect(
      createOrder(E, { ...BASE, expectDeliveryMinutes: 60 * 25 })
    ).rejects.toThrow(/最多提前/);
  });

  it("预约单：接单截止 = 预约送达时间（到点没人接就自动过期退款）", async () => {
    const created = await createOrder(E, { ...BASE, expectDeliveryMinutes: 40 });
    expect(created.expectDeliveryAt).not.toBeNull();
    expect(minutesBetween(created.expectDeliveryAt!, created.createdAt)).toBe(40);
    expect(created.acceptDeadlineAt!.getTime()).toBe(created.expectDeliveryAt!.getTime());
  });

  it("接单后送达截止 = 预约送达时间（不是接单后 20 分钟）", async () => {
    const created = await createOrder(E, { ...BASE, expectDeliveryMinutes: 40 });
    const accepted = await acceptOrder(created.id, B);
    expect(accepted.deliverDeadlineAt!.getTime()).toBe(created.expectDeliveryAt!.getTime());
  });

  it("预约到点没送到：跑腿者反馈「餐未送达」→ 单回大厅、信用 −10、钱未动", async () => {
    const created = await createOrder(E, { ...BASE, expectDeliveryMinutes: 30 });
    await acceptOrder(created.id, B);
    const before = await getUser(B);

    await advance(31 * 60_000);
    const back = await reportUnarrived(created.id, B);

    expect(back.status).toBe("open");
    expect(back.runnerId).toBeNull();
    expect(back.abnormalReason).toContain("餐未送达");
    const after = await getUser(B);
    expect(after.creditScore).toBe(before.creditScore - 10);
    // 钱不动：仍在冻结里，等发布者决定（取消/再等人接）
    expect(await escrowFen(created.id)).toBe(created.rewardFen + created.budgetFen);

    const events = await db.select().from(orderEvents).where(eq(orderEvents.orderId, created.id));
    expect(events.some((e) => e.type === "unarrived")).toBe(true);
  });

  it("外卖/商家没送到（vendor_late）：扣发单者 5 分、跑腿者不扣、留言进通知（v1.7）", async () => {
    const created = await createOrder(E, { ...BASE, expectDeliveryMinutes: 30 });
    await acceptOrder(created.id, B);
    const runnerBefore = await getUser(B);
    const publisherBefore = await getUser(E);

    await advance(31 * 60_000);
    const back = await reportUnarrived(created.id, B, {
      reason: "vendor_late",
      note: "商家说要再等 10 分钟",
    });

    expect(back.status).toBe("open");
    expect(back.abnormalReason).toContain("外卖没送到");
    expect((await getUser(B)).creditScore).toBe(runnerBefore.creditScore);
    expect((await getUser(E)).creditScore).toBe(publisherBefore.creditScore - 5);
    // 钱仍冻结，等发单者决定
    expect(await escrowFen(created.id)).toBe(created.rewardFen + created.budgetFen);

    const events = await db.select().from(orderEvents).where(eq(orderEvents.orderId, created.id));
    const ev = events.find((e) => e.type === "vendor_late");
    expect(ev).toBeTruthy();
    expect(JSON.stringify(ev?.payload)).toContain("商家说要再等 10 分钟");
  });

  it("非预约单不能反馈「餐未送达」", async () => {
    await acceptOrder(SEED.open1, C);
    await expect(reportUnarrived(SEED.open1, C)).rejects.toThrow(/只有预约单/);
  });

  it("只有接单跑腿者本人能反馈", async () => {
    const created = await createOrder(E, { ...BASE, expectDeliveryMinutes: 30 });
    await acceptOrder(created.id, B);
    await expect(reportUnarrived(created.id, C)).rejects.toThrow(/只有接单跑腿者/);
  });

  it("预约到点还没人接 → 过期并全额退款", async () => {
    const created = await createOrder(E, { ...BASE, expectDeliveryMinutes: 20 });
    expect(await escrowFen(created.id)).toBe(created.rewardFen);

    await advance(21 * 60_000);
    await expireSweep();

    const expired = await getOrder(created.id);
    expect(expired.status).toBe("expired");
    expect(await escrowFen(created.id)).toBe(0);
  });

  it("预约单没在承诺时间前送达，超时也会释放并扣信用（不依赖跑腿者主动反馈）", async () => {
    const created = await createOrder(E, { ...BASE, expectDeliveryMinutes: 20 });
    // 用 C 接：种子单 16 在 B 手上，推进 21 分钟会一并超时，扣分会叠加
    await acceptOrder(created.id, C);
    const before = await getUser(C);

    await advance(21 * 60_000);
    await expireSweep();

    const released = await getOrder(created.id);
    expect(released.status).toBe("open");
    expect(released.runnerId).toBeNull();
    const after = await getUser(C);
    expect(after.creditScore).toBe(before.creditScore - 10);
  });

  it("发布者取消预约单 / 跑腿者放弃：状态与退款口径和即时单一致", async () => {
    const created = await createOrder(E, { ...BASE, expectDeliveryMinutes: 30 });
    expect(await escrowFen(created.id)).toBe(created.rewardFen);
    const rows = await db.select().from(orders).where(eq(orders.id, created.id));
    expect(rows[0].expectDeliveryAt).not.toBeNull();
  });
});
