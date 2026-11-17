#!/usr/bin/env node
/**
 * scripts/preflight.mjs —— 演示开拍前自检（v1.24）
 *
 * 为什么要有它：录屏/答辩前最怕三件事——服务没起来、种子被上一轮演示用光（大厅 0 单）、
 * 账本对不上。这三件事都不该等到镜头前才发现。本脚本只读（--reset 时除外），
 * 用真实 HTTP 走一遍演示要用的接口，输出 PASS/FAIL/WARN 与退出码。
 *
 * 用法：
 *   node scripts/preflight.mjs                     # 自检本机 http://127.0.0.1:3000
 *   node scripts/preflight.mjs --reset             # 先重置种子再自检（开拍前推荐）
 *   node scripts/preflight.mjs --base https://shop.omzsh.top
 *   node scripts/preflight.mjs --admin 你的后台口令   # 不给就用 env ADMIN_PASSWORD
 *
 * 退出码：0 = 没有 FAIL；1 = 有 FAIL（WARN 不影响退出码）。
 */

const argv = process.argv.slice(2);
function argOf(name, fallback) {
  const i = argv.indexOf("--" + name);
  if (i === -1) return fallback;
  const v = argv[i + 1];
  return v && !v.startsWith("--") ? v : fallback;
}

const BASE = argOf("base", process.env.PREFLIGHT_BASE || "http://127.0.0.1:3000").replace(/\/+$/, "");
const RESET = argv.includes("--reset");
const TOKEN = argOf("token", process.env.DEMO_TOKEN || "shunlu-demo-2026");
const ADMIN = argOf("admin", process.env.ADMIN_PASSWORD || "");
const TIMEOUT_MS = 10000;

const results = [];
function log(level, name, detail) {
  const tag = level === "pass" ? "PASS" : level === "fail" ? "FAIL" : "WARN";
  results.push({ level, name, detail: detail || "" });
  const pad = name.length >= 16 ? name + " " : name + " ".repeat(16 - name.length + 1);
  console.log("[" + tag + "] " + pad + (detail || ""));
}

class Jar {
  constructor() { this.map = new Map(); }
  header() {
    const parts = [];
    for (const [k, v] of this.map) parts.push(k + "=" + v);
    return parts.join("; ");
  }
  absorb(res) {
    const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const raw of list) {
      const pair = raw.split(";")[0];
      const eq = pair.indexOf("=");
      if (eq > 0) this.map.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
}

const jar = new Jar();

async function call(method, path, body) {
  const headers = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  const cookie = jar.header();
  if (cookie) headers.cookie = cookie;
  try {
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    jar.absorb(res);
    let json = null;
    const text = await res.text();
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: res.status, json, text };
  } catch (e) {
    return { status: 0, json: null, text: String(e && e.message ? e.message : e) };
  }
}

function why(res) {
  if (res.status === 0) return "连不上：" + res.text;
  const msg = res.json && (res.json.error || res.json.message);
  return "HTTP " + res.status + (msg ? " · " + msg : "");
}

function yuan(fen) { return "¥" + (fen / 100).toFixed(2); }

async function main() {
  console.log("顺路 · 演示开拍前自检");
  console.log("目标 " + BASE + (RESET ? "（先重置种子）" : ""));
  console.log("");

  // 1) 服务在不在
  const home = await call("GET", "/");
  if (home.status !== 200) {
    log("fail", "server", "首页 " + why(home) + " —— 先 npm run start / 检查 systemd");
    return;
  }
  log("pass", "server", "首页 HTTP 200");

  // 2) 演示口令换 Cookie
  const login = await call("POST", "/api/demo/login", { token: TOKEN });
  if (login.status !== 200) {
    log("fail", "demo.login", why(login) + " —— 检查 DEMO_TOKEN 与脚本参数");
    return;
  }
  log("pass", "demo.login", login.json && login.json.required === false ? "服务端未配口令（本机放行）" : "口令已换成 12h Cookie");

  // 3) 可选：重置种子
  if (RESET) {
    const reset = await call("POST", "/api/demo/reset", {});
    if (reset.status !== 200) log("fail", "demo.reset", why(reset));
    else log("pass", "demo.reset", "种子已重置（大厅应立刻有 3 单待接）");
  }

  // 4) 切号列表
  const acc = await call("GET", "/api/demo/accounts");
  const accounts = (acc.json && Array.isArray(acc.json.accounts)) ? acc.json.accounts : [];
  if (acc.status !== 200) log("fail", "demo.accounts", why(acc));
  else if (accounts.length === 0) log("fail", "demo.accounts", "切号列表为空，演示无法切身份");
  else if (accounts.length < 5) log("warn", "demo.accounts", accounts.length + " 个身份：" + accounts.map((a) => a.nickname).join(" / "));
  else log("pass", "demo.accounts", accounts.length + " 个身份：" + accounts.map((a) => a.nickname).join(" / "));

  if (accounts.length === 0) return;

  // 5) 逐个身份切号 + /api/me
  const me = [];
  let switchFail = 0;
  for (const a of accounts) {
    const sw = await call("POST", "/api/auth/switch", { userId: a.id });
    if (sw.status !== 200) { switchFail += 1; continue; }
    const m = await call("GET", "/api/me");
    if (m.status !== 200 || !m.json || !m.json.user) { switchFail += 1; continue; }
    me.push({ id: a.id, nickname: m.json.user.nickname, balanceFen: m.json.user.balanceFen, credit: m.json.user.creditScore, rating: m.json.rating || null });
  }
  if (switchFail > 0) log("fail", "auth.switch", switchFail + "/" + accounts.length + " 个身份切号或 /api/me 失败");
  else log("pass", "auth.switch", "全部 " + me.length + " 个身份切号 + /api/me 正常");

  const balanceLine = me.map((u) => u.nickname + " " + yuan(u.balanceFen) + "(信用" + u.credit + ")").join("  ");
  if (balanceLine) log("pass", "account.state", balanceLine);

  // 6) 跑腿者视角：大厅
  const runner = me.slice().sort((x, y) => y.credit - x.credit)[0];
  let openCount = 0;
  let slots = 0;
  if (runner) {
    await call("POST", "/api/auth/switch", { userId: runner.id });
    const hall = await call("GET", "/api/hall");
    if (hall.status !== 200 || !hall.json) log("fail", "hall", why(hall));
    else {
      openCount = (hall.json.orders || []).length;
      slots = hall.json.slots;
      if (openCount === 0) log("warn", "hall", runner.nickname + " 的大厅 0 单待接 —— 开拍前请 --reset");
      else log("pass", "hall", runner.nickname + " 看到 " + openCount + " 单待接 · 剩余并发 " + slots);
    }
  }

  // 7) 发布者视角：我发布的 + 钱包流水
  const publisher = me[0];
  let published = 0;
  let walletLogs = 0;
  if (publisher) {
    await call("POST", "/api/auth/switch", { userId: publisher.id });
    const mine = await call("GET", "/api/orders");
    if (mine.status !== 200 || !mine.json) log("fail", "orders", why(mine));
    else {
      published = (mine.json.mine || []).length;
      log("pass", "orders", publisher.nickname + " 名下 " + published + " 单（含已完成/已过期）");
    }
    const wallet = await call("GET", "/api/wallet");
    if (wallet.status !== 200 || !wallet.json) log("fail", "wallet", why(wallet));
    else {
      walletLogs = (wallet.json.logs || []).length;
      log(walletLogs > 0 ? "pass" : "warn", "wallet", publisher.nickname + " 有 " + walletLogs + " 条流水");
    }
  }

  // 8) 后台对账（可选，需要 ADMIN_PASSWORD）
  let scale = null;
  let drift = null;
  let statusCounts = null;
  if (!ADMIN) {
    log("warn", "console", "未提供 ADMIN_PASSWORD，跳过对账（--admin 或 env ADMIN_PASSWORD）");
  } else {
    const login2 = await call("POST", "/api/console/login", { password: ADMIN });
    if (login2.status !== 200) log("fail", "console.login", why(login2));
    else {
      const snap = await call("GET", "/api/console/snapshot");
      if (snap.status !== 200 || !snap.json) log("fail", "console.snapshot", why(snap));
      else {
        log("pass", "console.login", "后台口令登录成功");
        const rec = snap.json.reconcile || {};
        drift = { user: rec.userDriftFen | 0, order: rec.orderDriftFen | 0 };
        scale = snap.json.clock ? snap.json.clock.scale : null;
        statusCounts = snap.json.statusCounts || {};
        if (drift.user === 0 && drift.order === 0) log("pass", "reconcile", "两条不变式差异均为 0（" + rec.checkedUsers + " 个账号 / " + rec.checkedOpenOrders + " 张未终态单）");
        else log("fail", "reconcile", "账不平：用户差异 " + drift.user + " 分、订单差异 " + drift.order + " 分");
        const counts = Object.keys(statusCounts).sort().map((k) => k + " " + statusCounts[k]).join(" · ");
        log("pass", "statusCounts", counts || "（空）");
        log(scale === 1 ? "pass" : "warn", "clock", "倍率 " + scale + (scale === 1 ? "" : " —— 演示前请在 /admin/console 拨回 1"));
      }
    }
  }

  // 9) 汇总
  const fails = results.filter((r) => r.level === "fail").length;
  const warns = results.filter((r) => r.level === "warn").length;
  const passes = results.filter((r) => r.level === "pass").length;
  console.log("");
  console.log("汇总 " + passes + " PASS / " + fails + " FAIL / " + warns + " WARN");

  const tips = [];
  if (openCount === 0) tips.push("大厅没单：node scripts/preflight.mjs --reset");
  if (scale !== null && scale !== 1) tips.push("时钟倍率不是 1：/admin/console → 时钟 → 1×");
  if (fails > 0) tips.push("有 FAIL 先修再开拍（上面每一行都写了原因）");
  if (tips.length === 0) tips.push("可以开拍：切号 → 大厅 → 接单 → 送达 → 确认，六脚本按 HANDOFF §5");
  for (const t of tips) console.log("→ " + t);

  if (fails > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error("[FAIL] 脚本自身出错：" + (e && e.stack ? e.stack : e));
  process.exitCode = 1;
});
