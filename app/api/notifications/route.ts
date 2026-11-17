import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { notifications } from "@/server/db/schema";
import { expireSweep } from "@/server/rules/orders";
import { now } from "@/server/clock";
import { withUser, withUserClock } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A5 · 通知：轮询未读（前端 3s），POST 全部标记已读 */
export async function GET() {
  // v1.11 · 性能：前端 3 秒轮询一次，必须少往返 —— 用户与时钟并行，过期探测复用同一时间
  return withUserClock(async (user, nowMsValue) => {
    await expireSweep(nowMsValue);
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.id))
      .limit(30);
    return { items: rows, unread: rows.filter((n) => !n.readAt).length };
  }, { retryRead: true });
}

export async function POST() {
  return withUser(async (user) => {
    await db
      .update(notifications)
      .set({ readAt: await now() })
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
    return { ok: true };
  });
}
