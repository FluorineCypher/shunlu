import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminPassword, getDemoMode } from "./env";

/**
 * 电脑端调试后台（/admin/console）的密码登录态（v1.7）。
 *
 * 为什么不用切号：用户 m03188/m03192 的场景是「一台电脑 + 两台手机」，
 * 电脑端要能在**不切号**的情况下改钱、改信用、取消订单、拨时钟；
 * 若复用 sl_uid，就会把电脑的演示账号也一起换了。
 *
 * 安全边界：只认 ADMIN_PASSWORD 派生出的固定指纹（sha256），
 * 不落明文、不进数据库；DEMO_MODE 关闭时后台整体 404（与 /api/demo/* 同策略）。
 */

export const CONSOLE_COOKIE = "sl_console";

/** 由密码派生的 Cookie 指纹：改密码即让所有已登录的电脑端失效 */
export function consoleToken(password: string): string {
  return createHash("sha256").update(`shunlu-console-v1:${password}`).digest("hex");
}

function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** 后台是否开启：DEMO_MODE=1 且配了 ADMIN_PASSWORD */
export function consoleEnabled(): boolean {
  return getDemoMode() && Boolean(getAdminPassword());
}

/** 路由守卫：返回 null 表示通过，否则返回该直接返回的响应 */
export function requireConsole(req: Request): NextResponse | null {
  if (!getDemoMode()) return NextResponse.json({ error: "Not Found" }, { status: 404 });
  const password = getAdminPassword();
  if (!password) {
    return NextResponse.json(
      { error: "后台未启用：请在 .env.local 配置 ADMIN_PASSWORD 后重启" },
      { status: 503 }
    );
  }
  const token = readCookie(req, CONSOLE_COOKIE);
  if (!token || !safeEqual(token, consoleToken(password))) {
    return NextResponse.json({ error: "需要后台密码", code: "CONSOLE_LOCKED" }, { status: 401 });
  }
  return null;
}

/** Cookie 是否该带 Secure：跟随请求协议（公网 https 才带，本机 http 若带了会被浏览器丢弃） */
export function isHttpsRequest(req: Request): boolean {
  const proto = req.headers.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim() === "https";
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}
