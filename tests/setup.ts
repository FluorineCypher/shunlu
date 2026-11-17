import { beforeAll, beforeEach } from "vitest";
import postgres from "postgres";

/**
 * 测试基座（AGENTS §1：Vitest 只跑 server/rules）。
 * - 用本机内嵌 Postgres 的独立库 `shunlu_test`，绝不碰 .env.local 里的 Neon 主库
 * - 每个用例前 resetAndSeed()，用例之间互不影响（单 fork 串行）
 */

const LOCAL = { host: "127.0.0.1", port: 55432, user: "postgres", password: "postgres" };
const TEST_DB = "shunlu_test";
const TEST_URL = `postgres://${LOCAL.user}:${LOCAL.password}@${LOCAL.host}:${LOCAL.port}/${TEST_DB}`;

// 必须在 import server/db 之前把连接指向测试库（db 模块是惰性连接，setupFiles 先于测试文件执行）
process.env.DATABASE_URL = TEST_URL;
process.env.DEMO_MODE = "1";
process.env.STORAGE_DRIVER = "local";
process.env.APP_URL = "http://localhost:3000";

let ready: Promise<void> | null = null;

async function ensureTestDb(): Promise<void> {
  const { ensureLocalDb } = await import("../scripts/local-db.mjs");
  await ensureLocalDb({ quiet: true });

  const admin = postgres(`postgres://${LOCAL.user}:${LOCAL.password}@${LOCAL.host}:${LOCAL.port}/shunlu`, {
    ssl: false,
    max: 1,
  });
  try {
    await admin.unsafe(`CREATE DATABASE ${TEST_DB}`);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "42P04") throw err; // 42P04 = duplicate_database
  } finally {
    await admin.end({ timeout: 5 });
  }

  const { migrateDatabase } = await import("@/server/db/migrate");
  await migrateDatabase(TEST_URL);
}

function ensure(): Promise<void> {
  ready ??= ensureTestDb();
  return ready;
}

beforeAll(async () => {
  await ensure();
}, 180_000);

beforeEach(async () => {
  await ensure();
  const { resetAndSeed } = await import("@/server/demo/seed");
  await resetAndSeed();
}, 60_000);

export { TEST_URL };
