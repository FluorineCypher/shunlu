import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

/**
 * 迁移执行器（脚本 / 测试共用）：按 drizzle-kit 的 journal + sha256 规则
 * 写同一张 `drizzle.__drizzle_migrations`，drizzle-kit 之后仍能识别已应用的迁移。
 */

type JournalEntry = { idx: number; tag: string; when: number; breakpoints: boolean };

export async function migrateDatabase(url: string): Promise<{ applied: string[]; skipped: string[] }> {
  const isLocal = /(?:^|@)(?:localhost|127\.0\.0\.1)(?::|\/)/.test(url);
  const sql = postgres(url, { ssl: isLocal ? false : "require", max: 1, connect_timeout: 30, onnotice: () => {} });
  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    const journalRaw = await readFile("drizzle/meta/_journal.json", "utf8");
    const journal = JSON.parse(journalRaw) as { entries: JournalEntry[] };

    await sql`create schema if not exists drizzle`;
    await sql`
      create table if not exists drizzle.__drizzle_migrations (
        id serial primary key,
        hash text not null,
        created_at bigint
      )
    `;

    for (const entry of journal.entries) {
      const body = await readFile(path.join("drizzle", `${entry.tag}.sql`), "utf8");
      const hash = createHash("sha256").update(body).digest("hex");
      const existing = await sql`select id from drizzle.__drizzle_migrations where hash = ${hash} limit 1`;
      if (existing.length > 0) {
        skipped.push(entry.tag);
        continue;
      }
      const statements = body
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean);
      await sql.begin(async (tx) => {
        for (const statement of statements) {
          await tx.unsafe(statement);
        }
        await tx`insert into drizzle.__drizzle_migrations (hash, created_at) values (${hash}, ${entry.when})`;
      });
      applied.push(entry.tag);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  return { applied, skipped };
}
