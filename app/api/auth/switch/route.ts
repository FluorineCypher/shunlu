import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { getDemoMode } from "@/lib/env";
import { setSessionUser } from "@/lib/session";
import { PLATFORM_USER_ID } from "@/server/rules/constants";

/** B2 · POST /api/auth/switch：Mock 切号（仅 DEMO_MODE；公网无门的风险已在 §2.1-10 评估接受） */
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!getDemoMode()) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => null)) as { userId?: number } | null;
  const userId = body?.userId;
  if (!Number.isInteger(userId) || (userId as number) <= 0) {
    return NextResponse.json({ error: "userId 必须为正整数" }, { status: 400 });
  }
  const rows = await db.select().from(users).where(eq(users.id, userId as number)).limit(1);
  const user = rows[0];
  if (!user) return NextResponse.json({ error: "账号不存在" }, { status: 404 });
  // 平台账号：固定 id、只收 fee、不进大厅、不可被切号（§3.4）
  if (user.id === PLATFORM_USER_ID || user.nickname === "平台") {
    return NextResponse.json({ error: "平台账号不可切号" }, { status: 403 });
  }
  await setSessionUser(user.id);
  return NextResponse.json({ ok: true, user: { id: user.id, nickname: user.nickname } });
}
