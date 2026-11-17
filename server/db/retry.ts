/**
 * 只读接口的「断连透明重试」（v1.19）。
 *
 * 背景（v1.16/v1.17 线上日志）：Neon 侧会把空闲 socket 静默回收，下一次写入就报
 * `write CONNECTION_CLOSED …neon.tech:5432` / `ECONNRESET`。这类错误是**瞬时**的：
 * 换掉这条死连接、同一句查询重发一次就能成功。用户看到的却是 500 / 503，得手动刷新。
 *
 * 边界（刻意画死）：
 * - 只重试「连接类」错误（`isTransientDbError`）。语法错、约束冲突、唯一键重复、
 *   我们自己的 20s 超时（`DbDeadlineError`）**一律不重试**——重试它们只会把同一个错误再演一遍。
 * - 只给**只读 GET** 用（白名单显式开启，见 `lib/api.ts` 的 `{ retryRead: true }`）。
 *   写接口一次都不重试：重复冻结 / 重复入账的代价远大于一次 500。
 * - 总次数 2 次（1 次重试）、退避 120ms，且整个过程仍在 `lib/api.ts` 的 20s 预算内。
 *
 * 本文件不 import 任何数据库模块，纯函数 + 一层循环，方便单测。
 */

/** 一共尝试几次（含首次） */
export const READ_RETRY_ATTEMPTS = 2;
/** 退避基数：第 n 次重试前等 backoffMs × n */
export const READ_RETRY_BACKOFF_MS = 120;

/** 连接类错误的 `err.code`（postgres.js / Node 的原值，比较时统一大写） */
const TRANSIENT_CODES = new Set([
  "CONNECTION_CLOSED",
  "CONNECTION_ENDED",
  "CONNECTION_DESTROYED",
  "CONNECTION_CONNECT_TIMEOUT",
  "CONNECT_TIMEOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);

/** 错误文案里的连接类关键字（小写比较）。postgres.js 有时只把原因写进 message。 */
const TRANSIENT_MESSAGE_HINTS = [
  "connection closed",
  "connection terminated",
  "connection ended",
  "connection destroyed",
  "connection reset by peer",
  "client has encountered a connection error",
  "socket hang up",
  "econnreset",
  "epipe",
  "connection_closed",
  "connection_ended",
  "connection_destroyed",
];

type ErrorLike = {
  code?: unknown;
  name?: unknown;
  message?: unknown;
  cause?: unknown;
  errors?: unknown;
};

/** 顺着 cause / AggregateError.errors 收集错误链（最多 4 层，防环） */
function collectErrors(err: unknown, out: ErrorLike[] = [], depth = 0): ErrorLike[] {
  if (depth > 3 || !err || typeof err !== "object") return out;
  const e = err as ErrorLike;
  if (out.includes(e)) return out;
  out.push(e);
  collectErrors(e.cause, out, depth + 1);
  if (Array.isArray(e.errors)) {
    for (const inner of e.errors.slice(0, 3)) collectErrors(inner, out, depth + 1);
  }
  return out;
}

/**
 * 是不是「换条连接重发就能好」的错误。
 *
 * 明确排除：`DbDeadlineError`（20s 预算已经用完，再重试只会更慢）、
 * 各类 SQLSTATE（42601 语法错 / 23505 唯一键 / 23503 外键 / 40001 以外的业务约束）。
 */
export function isTransientDbError(err: unknown): boolean {
  const chain = collectErrors(err);
  for (const e of chain) {
    // 自己的超时信号：预算耗尽，别再试
    if (e.name === "DbDeadlineError") return false;
  }
  for (const e of chain) {
    const code = typeof e.code === "string" ? e.code.trim().toUpperCase() : "";
    if (code && TRANSIENT_CODES.has(code)) return true;
    if (typeof e.message !== "string" || !e.message) continue;
    const lower = e.message.toLowerCase();
    if (TRANSIENT_MESSAGE_HINTS.some((hint) => lower.includes(hint))) return true;
  }
  return false;
}

/** 给日志用的一行摘要：`CONNECTION_CLOSED: write CONNECTION_CLOSED …` */
export function describeDbError(err: unknown): string {
  const first = collectErrors(err)[0];
  if (!first) return String(err);
  const code = typeof first.code === "string" && first.code ? first.code : "";
  const name = typeof first.name === "string" && first.name !== "Error" ? first.name : "";
  const message = typeof first.message === "string" ? first.message.replace(/\s+/g, " ").slice(0, 180) : "";
  const label = code || name || "Error";
  return message ? `${label}: ${message}` : label;
}

export type RetryOptions = {
  /** 一共尝试几次（含首次），默认 {@link READ_RETRY_ATTEMPTS} */
  attempts?: number;
  /** 退避基数（毫秒），默认 {@link READ_RETRY_BACKOFF_MS} */
  backoffMs?: number;
  /** 每次决定重试时回调（用来打日志 / 计数），第 2 个参数是刚失败的尝试序号 */
  onRetry?: (err: unknown, failedAttempt: number) => void;
  /** 测试注入用，默认 setTimeout */
  sleep?: (ms: number) => Promise<void>;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 执行 `fn`，遇到连接类错误就退避后重发；非连接类错误**立刻**抛出，不吞。
 * 最后一次仍失败时抛出最后一个错误（保持原始错误对象身份，方便上层映射 HTTP）。
 */
export async function runWithRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, Math.floor(options.attempts ?? READ_RETRY_ATTEMPTS));
  const backoffMs = Math.max(0, options.backoffMs ?? READ_RETRY_BACKOFF_MS);
  const sleep = options.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt >= attempts || !isTransientDbError(err)) throw err;
      options.onRetry?.(err, attempt);
      if (backoffMs > 0) await sleep(backoffMs * attempt);
    }
  }
  throw lastError;
}
