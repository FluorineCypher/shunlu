import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { orders, walletLogs } from "@/server/db/schema";
import {
  adjustUserMoney,
  adminCancelOrder,
  consoleSnapshot,
  setUserCredit,
} from "@/server/rules/console";
import { B, E, SEED, escrowFen, getOrder, getUser } from "./helpers";

/**
 * 电脑端调试后台（v1.7）：不切号改钱 / 改信用 / 代取消订单。
 * 关键约束：钱仍走 wallet_logs（不变式 1 不能破）；终态订单不能再取消。
 */
describe("电脑端调试后台（v1.7）", () => {
  it("快照带账号、订单与时钟", async () => {
    const snap = await consoleSnapshot();
    expect(snap.users.length).toBeGreaterThanOrEqual(7);
    expect(snap.orders.length).toBeGreaterThan(0);
    expect(snap.clock.scale).toBe(1);
    expect(snap.users.find((u) => u.id === B)?.balanceFen).toBeGreaterThan(0);
  });

  it("加钱/扣钱写一条 bonus 流水，余额同步", async () => {
    const before = await getUser(E);
    const r = await adjustUserMoney({ userId: E, deltaFen: 500, memo: "演示补钱" });
    expect(r.balanceFen).toBe(before.balanceFen + 500);
    expect((await getUser(E)).balanceFen).toBe(before.balanceFen + 500);

    const logs = await db.select().from(walletLogs).where(eq(walletLogs.userId, E));
    const mine = logs.filter((l) => (l.memo ?? "").includes("演示补钱"));
    expect(mine).toHaveLength(1);
    expect(mine[0].type).toBe("bonus");
    expect(mine[0].amountFen).toBe(500);

    const back = await adjustUserMoney({ userId: E, deltaFen: -200 });
    expect(back.balanceFen).toBe(before.balanceFen + 300);
  });

  it("扣钱不能把余额扣成负数，也不能是 0", async () => {
    const u = await getUser(E);
    await expect(adjustUserMoney({ userId: E, deltaFen: -(u.balanceFen + 1) })).rejects.toThrow(/余额不足/);
    await expect(adjustUserMoney({ userId: E, deltaFen: 10 })).resolves.toBeTruthy();
    await expect(adjustUserMoney({ userId: E, deltaFen: 0 })).rejects.toThrow(/非零整数分/);
  });

  it("信用分覆盖并 clamp 到 0..120", async () => {
    expect((await setUserCredit({ userId: B, creditScore: 77 })).creditScore).toBe(77);
    expect((await setUserCredit({ userId: B, creditScore: 999 })).creditScore).toBe(120);
    expect((await setUserCredit({ userId: B, creditScore: -5 })).creditScore).toBe(0);
  });

  it("代取消未终态订单：状态 cancelled、托管归零、发单者收回全款", async () => {
    const order = await getOrder(SEED.open1);
    const publisherBefore = await getUser(order.publisherId);
    const escrow = await escrowFen(order.id);
    expect(escrow).toBeGreaterThan(0);

    const r = await adminCancelOrder({ orderId: order.id, reason: "纠纷处理" });
    expect(r.refundedFen).toBe(escrow);

    const after = await getOrder(order.id);
    expect(after.status).toBe("cancelled");
    expect(after.cancelReason).toContain("纠纷处理");
    expect(await escrowFen(order.id)).toBe(0);
    expect((await getUser(order.publisherId)).balanceFen).toBe(publisherBefore.balanceFen + escrow);
  });

  it("已终态订单不能再取消", async () => {
    const rows = await db.select().from(orders).where(eq(orders.status, "completed")).limit(1);
    await expect(adminCancelOrder({ orderId: rows[0].id })).rejects.toThrow(/已结束，无法取消/);
  });
});
