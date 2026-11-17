import { config } from "dotenv";
import { migrateDatabase } from "@/server/db/migrate";

/** `pnpm db:migrate:direct`：直接用 postgres.js 应用 drizzle/*.sql（drizzle-kit 连 Neon 时静默失败） */
config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 未配置");
  const { applied, skipped } = await migrateDatabase(url);
  for (const tag of skipped) console.log(`↷ 已应用 ${tag}`);
  for (const tag of applied) console.log(`✅ 已应用 ${tag}`);
  console.log(`完成：新应用 ${applied.length} 个，跳过 ${skipped.length} 个`);
}

main().catch((err) => {
  console.error("[db:migrate:direct] 失败：", err instanceof Error ? err.message : err);
  process.exit(1);
});
