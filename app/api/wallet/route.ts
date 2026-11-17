import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { orders, walletLogs } from "@/server/db/schema";
import { toWallet } from "@/server/rules/serializers";
import { withUser } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A5 · 钱包：余额 + 冻结（未终态订单的托管额之和）+ 最近流水 */
export async function GET() {
  return withUser(async (user) => {
    // v1.11 · 性能：冻结额与流水并行（两个互不依赖的往返）
    const [frozen, logs] = await Promise.all([
      db
        .select({ sum: sql<number>`COALESCE(SUM(${orders.rewardFen} + ${orders.budgetFen}), 0)::int` })
        .from(orders)
        .where(and(eq(orders.publisherId, user.id), inArray(orders.status, ["open", "accepted", "picked", "delivered"]))),
      db
        .select()
        .from(walletLogs)
        .where(eq(walletLogs.userId, user.id))
        .orderBy(desc(walletLogs.id))
        .limit(80),
    ]);

    return toWallet({
      balanceFen: user.balanceFen,
      frozenFen: frozen[0]?.sum ?? 0,
      logs: logs.map((l) => ({
        id: l.id,
        orderId: l.orderId,
        type: l.type,
        amountFen: l.amountFen,
        memo: l.memo,
        createdAt: l.createdAt,
      })),
    });
  }, { retryRead: true });
}

