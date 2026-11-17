import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { getDemoMode, getDemoToken } from "@/lib/env";
import { shouldSecureCookie } from "@/lib/cookie-secure";
import { DEMO_COOKIE, demoCookieValue, isLoopback, sameSecret } from "@/lib/demo-guard";

/**
 * POST /api/demo/login —— 口令框换 Cookie（v1.12）。
 * 为什么需要它：`?token=<DEMO_TOKEN>` 会把口令留在地址栏、书签和历史记录里，手机上每次都要手打。
 * 这里校验一次口令，种一个 12 小时的 httpOnly Cookie（`sl_demo` = sha256 派生值），
 * 之后 /api/demo/* 靠 demoGuard 认 Cookie，URL 里不再需要任何口令。
 * 它自己不能用 demoGuard（那会把入口本身锁死），只做 DEMO_MODE + 口令校验。
 */
export const runtime = "nodejs";

const MAX_AGE_SECONDS = 12 * 60 * 60;

export async function POST(req: Request) {
  if (!getDemoMode()) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }
  const expected = getDemoToken();
  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const input = typeof body?.token === "string" ? body.token.trim() : "";

  // 服务端没配口令：本机回环照旧放行（与 demoGuard 同口径），公网明确报错而不是假装成功
  if (!expected) {
    if (process.env.NODE_ENV === "production" && !isLoopback(req)) {
      return NextResponse.json({ error: "服务端未配置 DEMO_TOKEN，口令入口不可用" }, { status: 503 });
    }
    return NextResponse.json({ ok: true, required: false });
  }
  if (!input) {
    return NextResponse.json({ error: "请输入演示口令" }, { status: 400 });
  }
  if (!sameSecret(input, expected)) {
    return NextResponse.json({ error: "口令不对" }, { status: 403 });
  }

  const store = await cookies();
  const h = await headers();
  // 与 lib/session.ts 的 sl_uid 同口径，见 lib/cookie-secure.ts
  const secure = shouldSecureCookie(h.get("host"), h.get("x-forwarded-proto"));
  store.set(DEMO_COOKIE, demoCookieValue(expected), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge: MAX_AGE_SECONDS,
  });
  return NextResponse.json({ ok: true, required: true });
}

/** DELETE /api/demo/login —— 退出演示口令（换口令/清理演示机时用） */
export async function DELETE() {
  const store = await cookies();
  store.delete(DEMO_COOKIE);
  return NextResponse.json({ ok: true });
}
