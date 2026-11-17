import { config } from "dotenv";

/** `pnpm db:ping`：确认 DATABASE_URL 可连（打印库名/版本/延迟），不打印密码。 */
config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 未配置");
  const host = new URL(url).host;
  const isLocal = /(?:^|@)(?:localhost|127\.0\.0\.1)(?::|\/)/.test(url);
  const postgres = (await import("postgres")).default;
  const t0 = Date.now();
  const sql = postgres(url, { ssl: isLocal ? false : "require", max: 1, connect_timeout: 20 });
  const rows = await sql`select current_database() as db, version() as v`;
  console.log(`✅ 已连接 ${host}（${Date.now() - t0}ms）`);
  console.log(`   库: ${rows[0].db} · ${String(rows[0].v).split(",")[0]}`);
  await sql.end();
}

main().catch((err) => {
  console.error("[db:ping] 失败：", err instanceof Error ? err.message : err);
  process.exit(1);
});
