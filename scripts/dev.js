/**
 * 本机开发服务器：若 DATABASE_URL 指向内嵌库且未启动，先拉起 Postgres，再 spawn next dev。
 * Neon 场景（远程 URL）自动跳过。保持零额外步骤：`npm run dev` 一条命令即可。
 */
const path = require("path");
const { spawn } = require("child_process");

function loadEnv() {
  try {
    require("dotenv").config({ path: [".env.local", ".env"], quiet: true });
  } catch {
    /* dotenv 缺失时依赖已注入的环境变量 */
  }
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

async function main() {
  loadEnv();
  try {
    await ensureDbIfLocal();
  } catch (err) {
    console.error("[dev] 本机数据库启动失败：", err);
    process.exit(1);
  }
  const nextBin = require.resolve("next/dist/bin/next");
  const child = spawn(process.execPath, [nextBin, "dev", "-H", "0.0.0.0"], {
    stdio: "inherit",
    cwd: path.resolve(__dirname, ".."),
    env: process.env,
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

main();
