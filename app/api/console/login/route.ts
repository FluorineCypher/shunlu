import { NextResponse } from "next/server";
import { getAdminPassword, getDemoMode } from "@/lib/env";
import { CONSOLE_COOKIE, consoleToken, isHttpsRequest } from "@/lib/console-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 电脑端后台登录（v1.7）：POST { password } → 种一个 httpOnly Cookie；DELETE → 退出。
 * 不做用户名、不做会话表：只有一块统一的调试密码（ADMIN_PASSWORD，写在 .env.local）。
 */
export async function POST(req: Request) {
  if (!getDemoMode()) return NextResponse.json({ error: "Not Found" }, { status: 404 });
  const password = getAdminPassword();
  if (!password) {
    return NextResponse.json(
      { error: "后台未启用：请在 .env.local 里加一行 ADMIN_PASSWORD=你的密码，然后重启服务" },
      { status: 503 }
    );
  }
  let body: { password?: string } = {};
  try {
    body = (await req.json()) as { password?: string };
  } catch {
    /* 空 body → 当作密码为空 */
  }
  if (!body.password || body.password !== password) {
    return NextResponse.json({ error: "密码不对" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: CONSOLE_COOKIE,
    value: consoleToken(password),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // 本机 http 演示不能带 Secure，否则浏览器直接丢弃 Cookie（§2.1-9 同理）
    secure: isHttpsRequest(req),
    maxAge: 60 * 60 * 12,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: CONSOLE_COOKIE, value: "", path: "/", maxAge: 0 });
  return res;
}
