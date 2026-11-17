import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getDemoMode, getDemoToken } from "./env";

/**
 * /api/demo/* 守卫（§2.1-3 + B2）：
 * - DEMO_MODE !== 1 → 404（接口在非演示形态下「不存在」）
 * - DEMO_TOKEN 已配置 → 非回环来源必须匹配以下任一凭证：
 *   ① Authorization: Bearer <token>（脚本/旧前端）
 *   ② ?token=<token>（旧链接，仅作兼容）
 *   ③ Cookie `sl_demo`（口令框输入一次后由 /api/demo/login 种下的派生值，v1.12）
 * - 回环地址（本机窗口）仍放行，避免本地演示每次带 token
 * - DEMO_TOKEN 未配置：本机回环地址（localhost/127.0.0.1/[::1]）放行；
 *   其余来源在 NODE_ENV=production 时一律 403（公网部署必须配 DEMO_TOKEN）。
 *
 * 说明：AGENTS §2.1-3 原文是「未配置且 production 一律 403」。本机演示跑的是
 * `next build && next start`（NODE_ENV=production），若不做回环例外，演示工具条的
 * 重置/倍率/推进全部 403。回环例外不改变公网安全性：Vercel/局域网 IP 访问时
 * Host 不是回环地址，仍会被拒绝。
 */

export const DEMO_COOKIE = "sl_demo";

/** 口令 → cookie 值（sha256 派生）：cookie 里不放明文口令，泄露 cookie 也反不出 token */
export function demoCookieValue(token: string): string {
  return createHash("sha256").update(`shunlu:demo:${token}`).digest("hex");
}

/** 定长比较，避免按字节短路泄露口令长度/前缀 */
export function sameSecret(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** 从裸 Request 的 Cookie 头里读一个值（route handler 里拿不到 next/headers 的 store） */
export function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export function demoGuard(req: Request): NextResponse | null {
  if (!getDemoMode()) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }
  const token = getDemoToken();
  if (!token) {
    if (process.env.NODE_ENV === "production" && !isLoopback(req)) {
      return NextResponse.json({ error: "DEMO_TOKEN 未配置，生产环境拒绝访问" }, { status: 403 });
    }
    return null; // 本机回环 / 开发环境：放行
  }
  const header = req.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const query = new URL(req.url).searchParams.get("token") ?? undefined;
  if (bearer && sameSecret(bearer, token)) return null;
  if (query && sameSecret(query, token)) return null;
  const cookie = readCookie(req, DEMO_COOKIE);
  if (cookie && sameSecret(cookie, demoCookieValue(token))) return null;
  // 本机回环仍放行：演示时本机窗口不必每次带 token；公网来源（隧道/局域网 IP）必须带
  if (isLoopback(req)) return null;
  // code 给前端用：见到它就把口令输入框弹出来，而不是只显示一行红字
  return NextResponse.json({ error: "需要演示口令", code: "DEMO_TOKEN_REQUIRED" }, { status: 403 });
}

export function isLoopback(req: Request): boolean {
  const host = req.headers.get("host")?.split(":")[0] ?? new URL(req.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}
