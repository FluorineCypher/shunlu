import { NextResponse } from "next/server";
import { count, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { orders, users, walletLogs } from "@/server/db/schema";
import { getCurrentUser } from "@/lib/session";
import { withReadRetry } from "@/lib/api";

/**
 * B1 · GET /api/admin/overview（最小版，Step 8 再扩成完整看板）
 * 守卫（§3.4）：未切号 401；is_admin=false 403。
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未切号" }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });

  // v1.19 · 只读聚合：Neon 静默断连时换连接重试一次，用户看到 200 而不是 500
  const { userCount, statusRows, feeRow } = await withReadRetry(async () => {
    const [userCount] = await db.select({ n: count() }).from(users);
    const statusRows = await db
      .select({ status: orders.status, n: count() })
      .from(orders)
      .groupBy(orders.status);
    const [feeRow] = await db
      .select({ sum: sql<number>`COALESCE(SUM(${walletLogs.amountFen}), 0)::int` })
      .from(walletLogs)
      .where(eq(walletLogs.type, "fee"));
    return { userCount, statusRows, feeRow };
  }, "admin/overview");

  return NextResponse.json({
    ok: true,
    users: userCount?.n ?? 0,
    ordersByStatus: Object.fromEntries(statusRows.map((r) => [r.status, r.n])),
    platformIncomeFen: feeRow?.sum ?? 0,
    admin: { id: me.id, nickname: me.nickname },
  });
}
