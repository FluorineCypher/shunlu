import { config } from "dotenv";

/**
 * `npm run seed`：清库并写入种子（AGENTS.md 附录 B）。
 * - 先加载 .env.local（Next 的约定），再按需拉起本机内嵌库
 * - 动态 import 业务模块，确保 env 在模块求值前就位
 */
config({ path: [".env.local", ".env"], quiet: true });

async function ensureDb(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("[seed] 缺少 DATABASE_URL，请先配置 .env.local");
  const u = new URL(url);
  const isLocal =
    (u.hostname === "127.0.0.1" || u.hostname === "localhost") && (u.port || "5432") === "55432";
  if (!isLocal) return;
  const { ensureLocalDb } = await import("./local-db.mjs");
  await ensureLocalDb();
}

async function main() {
  await ensureDb();
  console.log("[seed] 开始写入种子数据…");

  const { resetAndSeed } = await import("../server/demo/seed");
  const { db, closeSql } = await import("../server/db");
  const { users } = await import("../server/db/schema");
  const { count } = await import("drizzle-orm");

  await resetAndSeed();

  const rows = await db.select({ n: count() }).from(users);
  console.log(`[seed] 完成：users=${rows[0]?.n ?? 0}。可运行 npm run dev 开始演示`);

  closeSql();
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error("[seed] 失败：", err);
  process.exit(1);
});
