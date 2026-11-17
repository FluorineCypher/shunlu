import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { getDatabaseUrl } from "@/lib/env";
import * as schema from "./schema";
import {
  DB_PROBE_INTERVAL_MS,
  DB_PROBE_TIMEOUT_MS,
  nextFailureCount,
  shouldProbe,
  shouldRecycle,
} from "./watchdog";

/**
 * 连接客户端（postgres.js）。
 * - Neon：必须 ssl；本机内嵌库：无 ssl（否则握手失败）
 * - **惰性创建**：`next build` 收集路由时不会连接数据库（无凭据也能构建），
 *   第一次真正查询时才读 DATABASE_URL 并建池，缺失即抛清晰错误。
 * - **v1.16 自愈**：见文件末尾 `startDbWatchdog`。线上事故 m00383 是池里两条
 *   socket 被中间设备静默丢弃，所有查询无限排队 → 全站转圈、只能重启。
 */
type Schema = typeof schema;

let _sql: Sql | null = null;
let _db: PostgresJsDatabase<Schema> | null = null;

/** 最近一次取用连接池的时间（毫秒时间戳）。watchdog 据此判断「现在有没有人用」 */
let _lastUsedAt = 0;

function touch(): void {
  _lastUsedAt = Date.now();
}

function connect(): { sql: Sql; db: PostgresJsDatabase<Schema> } {
  if (_sql && _db) return { sql: _sql, db: _db };
  const url = getDatabaseUrl();
  const isLocal = /(?:^|@)(?:localhost|127\.0\.0\.1)(?::|\/)/.test(url);
  /**
   * v1.11 性能加固（Neon 新加坡 region，单条查询 ~80–105ms）：
   * - `keep_alive`：Neon 空闲会挂起计算 / 池代理会悄悄断连，连接池里会留下
   *   「看起来活着其实已死」的 socket，取到它的请求会一直挂到 OS 超时（曾实测卡 >20s）。
   * - `idle_timeout` / `max_lifetime`：定期主动回收，避免拿到陈旧连接。
   * - `connect_timeout`：冷启动（Neon 唤醒）超过 8s 就报错，而不是无限等。
   * - `statement_timeout` / `idle_in_transaction_session_timeout`：库侧兜底，
   *   单条 SQL 最长 15s；事务开着不干活超过 30s 直接被库踢掉，防止一个卡死事务
   *   长期持有 `orders` 行锁把后续「确认收货 / 过期清扫」全部堵死。
   *
   * v1.16 调整（m00383）：
   * - `max` 2 → 4：2 条连接时只要有一条僵死，全站就串行等它；4 条给多设备留喘息，
   *   且仍处于「不频繁 TLS 握手」的量级（实测新建连接 400–700ms，查询 70–200ms）。
   * - `idle_timeout` 60 → 20、`max_lifetime` 15 分钟 → 2 分钟：陈旧 socket 更快被淘汰。
   * - `keep_alive` 30 → 10：更早就开始 TCP 保活探测，让内核更早发现对端消失。
   */
  _sql = postgres(url, {
    ssl: isLocal ? false : "require",
    max: 4,
    /**
     * v1.11 · 性能（负优化记录，勿再试）：把 prepare 关掉不仅没省往返，反而更慢——
     * 关掉后每条带参查询恒定为 2 个往返（实测 443ms ≈ 2 × 214ms），
     * 保持默认预编译时预热后只要 1 个往返（208–226ms），且首条查询也更快。
     * 结论：瓶颈是「往返次数」，不是预编译协议开销；要提速只能减少查询条数。
     */
    keep_alive: 10,
    idle_timeout: 20,
    max_lifetime: 60 * 2,
    connect_timeout: 8,
    /**
     * v1.43（m00266）· lock_timeout：等行锁最多 4s，超时让语句以 55P03 失败。
     * 以前只有 statement_timeout 15s —— 一条被锁住的 UPDATE 会白等 15s 才报错，
     * 4 条连接全被占满，后面的请求只能排队，线上表现就是「整站 500」。
     * 短锁等待 + errors.ts 的 55P03→503 映射，让前端 4s 内就拿到「系统正忙」。
     */
    connection: { statement_timeout: 15000, idle_in_transaction_session_timeout: 30000, lock_timeout: 4000 },
  });
  _db = drizzle(_sql, { schema });
  return { sql: _sql, db: _db };
}

export function getDb(): PostgresJsDatabase<Schema> {
  touch();
  return connect().db;
}

/** 惰性代理：调用方依旧 `db.select(...)`，但不在模块加载时连库/读环境变量 */
export const db: PostgresJsDatabase<Schema> = new Proxy({} as PostgresJsDatabase<Schema>, {
  get(_target, prop, receiver) {
    touch();
    const real = connect().db as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
export type Db = PostgresJsDatabase<Schema>;

/** 脚本收尾用：关闭连接池 */
export function closeSql(): void {
  if (_sql) void _sql.end({ timeout: 5 });
  _sql = null;
  _db = null;
}

/**
 * 探活：跑一条 `select 1`，超过 timeoutMs 就当池子坏了。
 * 注意这是**没有被任何超时保护的排队**——正是要检测的场景。
 */
export async function pingDb(timeoutMs = DB_PROBE_TIMEOUT_MS): Promise<boolean> {
  let sql: Sql;
  try {
    sql = connect().sql;
  } catch {
    return false;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      sql`select 1 as ok`,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("db ping timeout")), timeoutMs);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 回收连接池：正在进行的查询会收到连接中断错误，下一次查询自动重建 */
export function recycleDbPool(reason: string): void {
  if (!_sql) return;
  console.error(`[db] 回收连接池：${reason}`);
  closeSql();
}

let _watchdog: ReturnType<typeof setInterval> | null = null;
let _failures = 0;

/**
 * 启动后台探活（在 `instrumentation.ts` 里调用，每个进程一次）。
 * 只在「最近 2 分钟有请求」时探活，连续 2 次失败才回收池，
 * 避免偶发慢查询砸池，也不让 Neon 整夜被唤醒。
 */
export function startDbWatchdog(): void {
  if (_watchdog) return;
  _watchdog = setInterval(() => {
    void (async () => {
      const now = Date.now();
      if (!shouldProbe({ hasPool: _sql !== null, lastUsedAt: _lastUsedAt, now })) {
        _failures = 0;
        return;
      }
      const ok = await pingDb();
      _failures = nextFailureCount(_failures, ok);
      if (ok) return;
      console.error(`[db] 探活失败（连续 ${_failures} 次）`);
      if (shouldRecycle(_failures)) {
        recycleDbPool(`探活连续失败 ${_failures} 次`);
        _failures = 0;
      }
    })();
  }, DB_PROBE_INTERVAL_MS);
  // 不要因为探活把进程钉住（脚本/测试里也能干净退出）
  if (typeof _watchdog.unref === "function") _watchdog.unref();
  console.log(`[db] watchdog 已启动（每 ${DB_PROBE_INTERVAL_MS / 1000}s 探活一次，有流量时才探）`);
}
