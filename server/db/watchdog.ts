/**
 * 连接池健康探测的纯逻辑（v1.16）。
 *
 * 背景（m00383 线上事故）：ECS 上进程长时间运行后，两条池连接变成了「看起来活着、
 * 实际已被中间设备静默丢弃」的 socket。postgres.js 有 connect_timeout（管建连）与
 * statement_timeout（库侧，管服务端执行），但**管不到「已建连的 socket 写进去没人回」
 * 与「池里没有空闲连接时的排队」**——于是所有查询无限期挂着，全站页面转圈。
 *
 * 处理办法：后台定时探活（有流量时才探），连续失败就回收整个池，
 * 下一次查询自然重建连接。这里只放可单测的判定，真正的定时器在 server/db/index.ts。
 */

/** 探活间隔 */
export const DB_PROBE_INTERVAL_MS = 15_000;
/** 多久没有业务查询就不再探活（避免整夜空转、把 Neon 计算单元一直唤醒） */
export const DB_IDLE_GRACE_MS = 120_000;
/** 单次探活最多等多久（Neon 冷启动唤醒约 0.5–1s，留足余量） */
export const DB_PROBE_TIMEOUT_MS = 6_000;
/** 连续失败几次才回收（偶发一次慢查询不砸池） */
export const DB_FAILURES_BEFORE_RECYCLE = 2;

/** 该不该探活：池还没建 / 最近没有请求 → 不探 */
export function shouldProbe(args: {
  hasPool: boolean;
  lastUsedAt: number;
  now: number;
  idleGraceMs?: number;
}): boolean {
  if (!args.hasPool) return false;
  const grace = args.idleGraceMs ?? DB_IDLE_GRACE_MS;
  // lastUsedAt 为 0 表示本进程还没查过库，交给首个请求自己去建连
  if (args.lastUsedAt <= 0) return false;
  return args.now - args.lastUsedAt <= grace;
}

/** 连续失败计数：成功清零，失败累加 */
export function nextFailureCount(prev: number, ok: boolean): number {
  return ok ? 0 : prev + 1;
}

/** 是否该回收连接池 */
export function shouldRecycle(failures: number): boolean {
  return failures >= DB_FAILURES_BEFORE_RECYCLE;
}
