import { NextResponse } from "next/server";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/server/db";
import { orders, users } from "@/server/db/schema";
import { getCurrentUser } from "@/lib/session";
import { withReadRetry } from "@/lib/api";
import { expireSweep } from "@/server/rules/orders";

/**
 * B3 · GET /api/admin/orders（m02503：管理员处理纠纷要能翻每一单的记录）
 * 守卫与 B1 一致：未切号 401；is_admin=false 403。
 * 管理员视图包含房号 / 手机尾号 / 实付等隐私字段——只在 admin 接口出现，大厅与普通详情仍过滤（规则 5）。
 * 查询参数：status（默认 all）、q（单号 / 楼栋 / 房号模糊）、limit（默认 50，上限 200）。
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = [
  "open",
  "accepted",
  "picked",
  "delivered",
  "completed",
  "expired",
  "cancelled",
  "abnormal",
] as const;

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "未切号" }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status") ?? "all";
  const q = (url.searchParams.get("q") ?? "").trim();
  const limitRaw = Number(url.searchParams.get("limit") ?? 50);
  const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? Math.trunc(limitRaw) : 50));

  const conds: SQL[] = [];
  if (statusParam !== "all" && (STATUSES as readonly string[]).includes(statusParam)) {
    conds.push(eq(orders.status, statusParam));
  }
  if (q) {
    const like = `%${q}%`;
    conds.push(
      or(ilike(orders.code, like), ilike(orders.dropBuilding, like), ilike(orders.dropRoom, like)) as SQL
    );
  }

  /**
   * v1.19 · 只读查询（含 expireSweep）整段重试一次。
   * 重试安全：expireSweep 是条件 UPDATE + 事务的幂等收敛，已终态的单不会再动。
   */
  const { rows, userRows } = await withReadRetry(async () => {
  await expireSweep();

  const rows = await db
    .select({
      id: orders.id,
      code: orders.code,
      bizType: orders.bizType,
      status: orders.status,
      publisherId: orders.publisherId,
      runnerId: orders.runnerId,
      batchId: orders.batchId,
      pickupPoint: orders.pickupPoint,
      dropBuilding: orders.dropBuilding,
      dropFloor: orders.dropFloor,
      dropRoom: orders.dropRoom,
      phoneTail: orders.phoneTail,
      note: orders.note,
      itemDesc: orders.itemDesc,
      rewardFen: orders.rewardFen,
      runnerRewardFen: orders.runnerRewardFen,
      budgetFen: orders.budgetFen,
      actualFen: orders.actualFen,
      budgetStatus: orders.budgetStatus,
      abnormalReason: orders.abnormalReason,
      cancelReason: orders.cancelReason,
      confirmedBy: orders.confirmedBy,
      linkedPrevId: orders.linkedPrevId,
      createdAt: orders.createdAt,
      acceptedAt: orders.acceptedAt,
      deliveredAt: orders.deliveredAt,
      completedAt: orders.completedAt,
      addonCount: sql<number>`(SELECT COUNT(*)::int FROM order_addons WHERE order_id = orders.id)`,
      addonPending: sql<number>`(SELECT COUNT(*)::int FROM order_addons WHERE order_id = orders.id AND status = 'pending')`,
      addonActualFen: sql<number>`(SELECT COALESCE(SUM(actual_fen), 0)::int FROM order_addons WHERE order_id = orders.id AND status = 'bought')`,
    })
    .from(orders)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(orders.id))
    .limit(limit);

  const userRows = await db.select({ id: users.id, nickname: users.nickname }).from(users);
  return { rows, userRows };
  }, "admin/orders");

  const names = new Map(userRows.map((u) => [u.id, u.nickname]));

  return NextResponse.json({
    ok: true,
    count: rows.length,
    orders: rows.map((r) => ({
      ...r,
      publisherNickname: names.get(r.publisherId) ?? `#${r.publisherId}`,
      runnerNickname: r.runnerId ? (names.get(r.runnerId) ?? `#${r.runnerId}`) : null,
    })),
  });
}
