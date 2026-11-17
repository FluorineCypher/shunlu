/**
 * `npm run start` 包装（AGENTS.md §2 主力演示形态）：
 * 1) 打印本机局域网地址（手机同 WiFi 直连）
 * 2) 若 DATABASE_URL 指向内嵌库则自动拉起 Postgres
 * 3) 启动 next start（-H 0.0.0.0 供局域网访问）
 */
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
function loadEnv() {
  try {
    require("dotenv").config({ path: [".env.local", ".env"], quiet: true });
  } catch {
    /* 环境变量已由外部注入 */
  }
}

function lanAddresses() {
  const out = new Set();
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] || []) {
      if (ni.family === "IPv4" && !ni.internal) out.add(ni.address);
    }
  }
  return [...out];
}

async function ensureDbIfLocal() {
  const url = process.env.DATABASE_URL;
  if (!url) return;
  let host, port;
  try {
    const u = new URL(url);
    host = u.hostname;
    port = u.port || "5432";
  } catch {
    return;
  }
  if (!(host === "127.0.0.1" || host === "localhost")) return;
  if (port !== "55432") return;
  const { ensureLocalDb } = await import("./local-db.mjs");
  await ensureLocalDb();
}

/**
 * v1.11 · 演示期数据库保温（仅本机 start 包装，Vercel 不会执行这段）：
 * Neon 免费档在空闲约 5 分钟后挂起计算，下一位打开演示页的人要等 1–10s 唤醒。
 * 这里每 4 分钟跑一条 `select 1`，让演示期间计算保持热；进程退出即停止。
 * 不写任何业务状态（§2.1-1），只是保活连接。
 */
function keepDatabaseWarm() {
  const url = process.env.DATABASE_URL;
  if (!url || !/^postgres(ql)?:\/\//.test(url)) return () => {};
  let sql = null;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      if (!sql) {
        const postgres = require("postgres");
        const isLocal = /(?:^|@)(?:localhost|127\.0\.0\.1)(?::|\/)/.test(url);
        sql = postgres(url, { ssl: isLocal ? false : "require", max: 1, connect_timeout: 15 });
      }
      const t0 = Date.now();
      await sql`select 1`;
      if (Date.now() - t0 > 1500) console.log(`[start] 数据库保活（唤醒耗时 ${Date.now() - t0}ms）`);
    } catch (err) {
      console.warn("[start] 数据库保活失败（忽略）：", err instanceof Error ? err.message : err);
      if (sql) {
        try {
          await sql.end({ timeout: 3 });
        } catch {
          /* ignore */
        }
        sql = null;
      }
    }
  };

  void tick();
  const timer = setInterval(tick, 4 * 60 * 1000);
  timer.unref?.();

  return () => {
    stopped = true;
    clearInterval(timer);
    if (sql) sql.end({ timeout: 3 }).catch(() => {});
  };
}

async function main() {
  loadEnv();
  const stopWarm = keepDatabaseWarm();
  process.on("exit", stopWarm);

  const port = process.env.PORT || 3000;
  console.log("=========================================");
  console.log("  顺路 · 本机演示服务");
  for (const ip of lanAddresses()) {
    console.log(`  局域网访问: http://${ip}:${port}`);
  }
  console.log(`  本机访问:   http://localhost:${port}`);
  console.log("=========================================");

  try {
    await ensureDbIfLocal();
  } catch (err) {
    console.error("[start] 本机数据库启动失败：", err);
    process.exit(1);
  }

  const nextBin = require.resolve("next/dist/bin/next");
  const child = spawn(
    process.execPath,
    [nextBin, "start", "-H", "0.0.0.0", "-p", String(port)],
    { stdio: "inherit", cwd: path.resolve(__dirname, ".."), env: process.env }
  );
  child.on("exit", (code) => process.exit(code ?? 0));
}

main();
