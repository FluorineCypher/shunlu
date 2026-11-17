import { getAppUrl } from "./env";

/**
 * Cookie 的 Secure 属性判定（§2.1-9 / §4.3）。
 *
 * 旧实现只看 APP_URL：`APP_URL=https://…` 时，用 http 直连 IP 或局域网访问也会被加上 Secure，
 * 浏览器直接丢弃 cookie，表现就是「切号后还是未登录」。部署验收要求同一个服务**既走 https 隧道、
 * 又能用 http://IP:3000 演示**，所以必须按「这次请求实际走的协议」判断：
 *   1) 回环地址（localhost / 127.0.0.1 / [::1]）永远 http → 不 Secure；
 *   2) 有 x-forwarded-proto（隧道 / Vercel / nginx 都会带）→ 以它为准；
 *   3) 都没有时，只有 Host 与 APP_URL 同域且 APP_URL 是 https 才 Secure。
 *
 * 注意：Next 15 在 base-server.js 里会 `req.headers['x-forwarded-proto'] ??= isHttps ? 'https' : 'http'`，
 * 所以真实请求几乎总会带这个头（明文反代会被补成 http），分支 3 只是纯函数层的防御；
 * 反向代理必须显式传 X-Forwarded-Proto，APP_URL 不能当兜底开关（deploy/README.md §7.5）。
 */

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

export function isLoopbackHost(host: string | null | undefined): boolean {
  return LOOPBACK.test((host ?? "").trim());
}

export function shouldSecureCookie(
  host: string | null | undefined,
  forwardedProto: string | null | undefined
): boolean {
  const h = (host ?? "").trim().toLowerCase();
  if (isLoopbackHost(h)) return false;

  const proto = forwardedProto?.split(",")[0]?.trim().toLowerCase();
  if (proto) return proto === "https";

  const appUrl = getAppUrl().trim();
  if (!appUrl.toLowerCase().startsWith("https://")) return false;
  try {
    return new URL(appUrl).host.toLowerCase() === h;
  } catch {
    return false;
  }
}
