import { afterEach, describe, expect, it } from "vitest";
import { isLoopbackHost, shouldSecureCookie } from "@/lib/cookie-secure";

/**
 * Cookie Secure 判定（§2.1-9 / §4.3）。
 * 关键回归：APP_URL=https 时，http 直连 IP 或局域网也必须不 Secure，
 * 否则浏览器丢掉 sl_uid / sl_demo，表现为「切号后还是未登录」。
 */

const ORIGINAL = process.env.APP_URL;

function setAppUrl(value: string | undefined): void {
  if (value === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = value;
}

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = ORIGINAL;
});

describe("isLoopbackHost", () => {
  it("识别回环地址（含端口、大小写）", () => {
    expect(isLoopbackHost("localhost:3000")).toBe(true);
    expect(isLoopbackHost("LOCALHOST")).toBe(true);
    expect(isLoopbackHost("127.0.0.1:3000")).toBe(true);
    expect(isLoopbackHost("[::1]:3000")).toBe(true);
    expect(isLoopbackHost("47.97.167.178:3000")).toBe(false);
    expect(isLoopbackHost("shop.omzsh.top")).toBe(false);
    expect(isLoopbackHost("")).toBe(false);
    expect(isLoopbackHost(null)).toBe(false);
  });
});

describe("shouldSecureCookie", () => {
  it("回环地址永远不 Secure（本机 / 局域网反代也走 http）", () => {
    setAppUrl("https://shop.omzsh.top");
    expect(shouldSecureCookie("localhost:3000", null)).toBe(false);
    expect(shouldSecureCookie("127.0.0.1:3000", null)).toBe(false);
    expect(shouldSecureCookie("[::1]:3000", "https")).toBe(false);
  });

  it("有 x-forwarded-proto 时以它为准", () => {
    setAppUrl("http://47.97.167.178:3000");
    expect(shouldSecureCookie("shop.omzsh.top", "https")).toBe(true);
    expect(shouldSecureCookie("47.97.167.178:3000", "https")).toBe(true);
    expect(shouldSecureCookie("shop.omzsh.top", "http")).toBe(false);
    expect(shouldSecureCookie("shop.omzsh.top", "HTTPS")).toBe(true);
    // 代理链只认第一跳（最靠近客户端的那一段）
    expect(shouldSecureCookie("shop.omzsh.top", "https, http")).toBe(true);
    expect(shouldSecureCookie("shop.omzsh.top", "http, https")).toBe(false);
  });

  it("没有 proto 头时，Host 与 APP_URL 同域且 APP_URL 是 https 才 Secure", () => {
    setAppUrl("https://shop.omzsh.top");
    expect(shouldSecureCookie("shop.omzsh.top", null)).toBe(true);
    expect(shouldSecureCookie("SHOP.OMZSH.TOP", null)).toBe(true);
    // 同一个 APP_URL 下用 http 直连 IP / 局域网 —— 必须不 Secure（关键回归）
    expect(shouldSecureCookie("47.97.167.178:3000", null)).toBe(false);
    expect(shouldSecureCookie("192.168.1.63:3000", null)).toBe(false);
    expect(shouldSecureCookie("other.example.com", null)).toBe(false);
  });

  it("APP_URL 是 http 或未配置时一律不 Secure", () => {
    setAppUrl("http://shop.omzsh.top");
    expect(shouldSecureCookie("shop.omzsh.top", null)).toBe(false);
    setAppUrl(undefined);
    expect(shouldSecureCookie("shop.omzsh.top", null)).toBe(false);
  });

  it("APP_URL 写坏时不误判为 Secure", () => {
    setAppUrl("https://");
    expect(shouldSecureCookie("shop.omzsh.top", null)).toBe(false);
  });
});
