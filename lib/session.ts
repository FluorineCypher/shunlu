import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { shouldSecureCookie } from "./cookie-secure";

/**
 * Mock 鉴权（M1）：cookie `sl_uid` = 当前用户 id，无登录页（规则 1）。
 * cookie 属性环境自适应（§2.1-9）：secure 按**这次请求实际走的协议**判定，
 * 见 lib/cookie-secure.ts——同一个 APP_URL=https 下，直连 http://IP:3000 演示也不能带 Secure，
 * 否则浏览器丢 cookie、切号后仍显示未登录。不写死 domain。
 */

export const SESSION_COOKIE = "sl_uid";

export async function getCurrentUserId(): Promise<number | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** 当前用户（未切号返回 null） */
export async function getCurrentUser() {
  const id = await getCurrentUserId();
  if (!id) return null;
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

/** 切号：写 cookie（仅 /api/auth/switch 调用） */
export async function setSessionUser(userId: number): Promise<void> {
  const store = await cookies();
  const h = await headers();
  const secure = shouldSecureCookie(h.get("host"), h.get("x-forwarded-proto"));
  store.set(SESSION_COOKIE, String(userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
  });
}
