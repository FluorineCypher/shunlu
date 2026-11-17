import { config } from "dotenv";

/**
 * `npm run db:check`：打印两条账本不变式与种子数据摘要。
 * 任何时刻都应全 0 差异（AGENTS.md 规则 6；P9 对账页展示同一组数）。
 */
config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const { ensureLocalDb } = await import("./local-db.mjs");
  const url = new URL(process.env.DATABASE_URL!);
  if (
    (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
    (url.port || "5432") === "55432"
  ) {
    await ensureLocalDb({ quiet: true });
  }

  const { db, closeSql } = await import("../server/db");
  const { sql } = await import("drizzle-orm");

  const balances = (await db.execute(sql`
    SELECT u.id, u.nickname, u.credit_score, u.balance_fen,
           COALESCE(SUM(w.amount_fen), 0)::int AS logs_sum,
           u.balance_fen - COALESCE(SUM(w.amount_fen), 0)::int AS drift
    FROM users u LEFT JOIN wallet_logs w ON w.user_id = u.id
    GROUP BY u.id ORDER BY u.id
  `)) as unknown as {
    id: number;
    nickname: string;
    credit_score: number;
    balance_fen: number;
    logs_sum: number;
    drift: number;
  }[];

  console.log("\n== 不变式 1：balance_fen = Σ wallet_logs ==");
  console.table(
    balances.map((b) => ({
      id: b.id,
      nickname: b.nickname,
      信用分: b.credit_score,
      余额: (b.balance_fen / 100).toFixed(2),
      流水合计: (b.logs_sum / 100).toFixed(2),
      差异: b.drift,
    }))
  );

  const frozen = (await db.execute(sql`
    SELECT o.id, o.code, o.status, (o.reward_fen + o.budget_fen) AS should_frozen,
           COALESCE(-SUM(w.amount_fen), 0)::int AS frozen,
           (o.reward_fen + o.budget_fen) - COALESCE(-SUM(w.amount_fen), 0)::int AS drift
    FROM orders o LEFT JOIN wallet_logs w ON w.order_id = o.id AND w.type = 'freeze'
    WHERE o.status NOT IN ('completed','expired','cancelled','abnormal')
    GROUP BY o.id ORDER BY o.id
  `)) as unknown as {
    id: number;
    code: string;
    status: string;
    should_frozen: number;
    frozen: number;
    drift: number;
  }[];

  console.log("\n== 不变式 2：未终态订单 冻结额 = 流水冻结 ==");
  console.table(
    frozen.map((f) => ({
      id: f.id,
      code: f.code,
      status: f.status,
      应冻结: (f.should_frozen / 100).toFixed(2),
      已冻结: (f.frozen / 100).toFixed(2),
      差异: f.drift,
    }))
  );

  const summary = (await db.execute(sql`
    SELECT status, COUNT(*)::int AS n FROM orders GROUP BY status ORDER BY status
  `)) as unknown as { status: string; n: number }[];
  const fee = (await db.execute(sql`
    SELECT COALESCE(SUM(amount_fen), 0)::int AS s FROM wallet_logs WHERE type = 'fee'
  `)) as unknown as { s: number }[];

  console.log("\n== 种子摘要 ==");
  console.log("订单状态：", summary.map((s) => `${s.status}=${s.n}`).join("  "));
  console.log("平台累计服务费：", ((fee[0]?.s ?? 0) / 100).toFixed(2), "元");

  const driftTotal =
    balances.reduce((a, b) => a + Math.abs(b.drift), 0) +
    frozen.reduce((a, f) => a + Math.abs(f.drift), 0);
  console.log(driftTotal === 0 ? "\n✅ 两条不变式全部成立（差异合计 0）" : `\n❌ 差异合计 ${driftTotal}`);

  closeSql();
  process.exit(driftTotal === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("[db:check] 失败：", err);
  process.exit(1);
});
