import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { batches, orderAddons, orders, users, walletLogs } from "@/server/db/schema";
import { reportAddons } from "@/server/rules/addons";

export const A = 1;
export const B = 2;
export const C = 3;
export const D = 4;
export const E = 5;
export const ADMIN = 8;
export const PLATFORM = 9;

/** 种子订单 id 固定：12/13/14 三条同楼 open，15 buy open，16 accepted(B) */
export const SEED = { open1: 12, open2: 13, open3: 14, buyOpen: 15, accepted: 16 } as const;

export async function getUser(id: number) {
  const rows = await db.select().from(users).where(eq(users.id, id));
  if (!rows[0]) throw new Error(`user ${id} 不存在`);
  return rows[0];
}

export async function getOrder(id: number) {
  const rows = await db.select().from(orders).where(eq(orders.id, id));
  if (!rows[0]) throw new Error(`order ${id} 不存在`);
  return rows[0];
}

export async function getBatch(id: number) {
  const rows = await db.select().from(batches).where(eq(batches.id, id));
  return rows[0] ?? null;
}

export async function logsOfOrder(orderId: number) {
  return db.select().from(walletLogs).where(eq(walletLogs.orderId, orderId));
}

/** 订单托管余额 = −Σ(该单日志)：完成/退款后应为 0；未终态 = 可退额 */
export async function escrowFen(orderId: number): Promise<number> {
  const rows = await db
    .select({ sum: sql<number>`COALESCE(SUM(${walletLogs.amountFen}), 0)::int` })
    .from(walletLogs)
    .where(eq(walletLogs.orderId, orderId));
  const sum = rows[0]?.sum ?? 0;
  return sum === 0 ? 0 : -sum;
}

/** 用户余额 = Σ日志（不变式 1），同时校验 users.balance_fen 列 */
export async function assertUserBalance(userId: number): Promise<number> {
  const user = await getUser(userId);
  const rows = await db
    .select({ sum: sql<number>`COALESCE(SUM(${walletLogs.amountFen}), 0)::int` })
    .from(walletLogs)
    .where(eq(walletLogs.userId, userId));
  const sum = rows[0]?.sum ?? 0;
  if (sum !== user.balanceFen) {
    throw new Error(`不变式 1 失败：user ${userId} balance=${user.balanceFen} ≠ Σlogs=${sum}`);
  }
  return sum;
}

export async function openOrderCount(publisherId: number): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(orders)
    .where(and(eq(orders.publisherId, publisherId), eq(orders.status, "open")));
  return rows[0]?.n ?? 0;
}

/**
 * 送达前必须逐件确认捎带项（v1.3 / m02503），测试里把没报过的都标「没买到」。
 * 只影响该单的 order_addons，返回本次上报的件数。
 */
export async function failPendingAddons(orderId: number, runnerId: number): Promise<number> {
  const rows = await db.select().from(orderAddons).where(eq(orderAddons.orderId, orderId));
  const pending = rows.filter((r) => r.status === "pending");
  if (pending.length === 0) return 0;
  await reportAddons(
    orderId,
    runnerId,
    pending.map((r) => ({ id: r.id, failed: true }))
  );
  return pending.length;
}
