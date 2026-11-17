import { NextResponse } from "next/server";
import { getCurrentUser } from "./session";
import { nowMs } from "@/server/clock";
import { toErrorResponse } from "@/server/rules/errors";
import { recycleDbPool } from "@/server/db";
import { describeDbError, runWithRetry } from "@/server/db/retry";
import type { users } from "@/server/db/schema";

/**
 * 路由薄壳统一入口（§5）：取当前用户 → 交给 server/rules → 规则错误映射成 HTTP。
 * 页面/组件不许在这里算钱判状态，只调规则函数与序列化器。
 *
 * v1.16（m00383）：所有走这里的接口都套一层 20s 数据库上限。线上出现过
 * 「连接池 socket 被静默丢弃 → 查询永远不返回 → 页面一直转圈」，
 * 现在到点就回收连接池并回 503 `DB_TIMEOUT`，下一个请求自动重建连接。
 */

export type CurrentUser = typeof users.$inferSelect;

type Handler<T> = (user: CurrentUser) => Promise<T>;

/** 单次请求最多等数据库多久 */
const DB_DEADLINE_MS = 20_000;

/** 内部信号：某个 await 等数据库超过了 DB_DEADLINE_MS */
class DbDeadlineError extends Error {
  constructor(label: string) {
    super(`数据库响应超时（${label}，>${DB_DEADLINE_MS}ms）`);
    this.name = "DbDeadlineError";
  }
}

async function withDbDeadline<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DbDeadlineError(label)), DB_DEADLINE_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 超时 → 回收池 + 503；不是超时就返回 null 交给通用错误映射。
 * v1.42 起对外导出：`/api/console/*` 这类不走 withUser 的路由也要能给出 503 而不是 500
 * （线上事故 m00002：后台快照 20s 超时被映射成「服务器内部错误」，前端静默吞掉）。
 */
export function dbTimeoutResponse(err: unknown): NextResponse | null {
  if (!(err instanceof DbDeadlineError)) return null;
  recycleDbPool(err.message);
  return NextResponse.json(
    {
      error: "数据库连接超时，已自动重置连接，请刷新重试",
      code: "DB_TIMEOUT",
    },
    { status: 503 },
  );
}

function unauthenticated(): NextResponse {
  return NextResponse.json({ error: "请先切号", code: "UNAUTHENTICATED" }, { status: 401 });
}

/** v1.19：只读接口的开关。默认关，只有白名单里的 GET 显式传 true。 */
export type ReadOptions = { retryRead?: boolean };

/**
 * v1.19 · 只读断连自愈：把一次「取数」包进 20s 预算 + 连接类错误重试。
 *
 * 为什么整段 handler 重试是安全的：这些 GET 里唯一的写操作是 `expireSweep()`，
 * 它是「条件 UPDATE + 事务」的幂等收敛——已终态的单不会再被动一次，
 * 所以重跑一遍最多是空转，不会重复退款/重复入账。真正的写接口（accept/confirm/
 * buy/addons/console/…）**一个都不接这里**，见 server/db/retry.ts 的边界说明。
 */
export async function withReadRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  return withDbDeadline(
    runWithRetry(fn, {
      onRetry: (err, attempt) => {
        console.warn(`[db] 读请求重试 ${attempt} 次：${label} ${describeDbError(err)}`);
      },
    }),
    label,
  );
}

/** 按需选择「带重试」还是「原样一次」——保持写接口行为完全不变 */
function attemptRead<T>(
  fn: () => Promise<T>,
  label: string,
  options?: ReadOptions,
): Promise<T> {
  if (options?.retryRead) return withReadRetry(fn, label);
  return withDbDeadline(fn(), label);
}

export async function withUser<T>(fn: Handler<T>, options?: ReadOptions): Promise<NextResponse> {
  try {
    const user = await attemptRead(getCurrentUser, "getCurrentUser", options);
    if (!user) return unauthenticated();
    return NextResponse.json(await attemptRead(() => fn(user), "handler", options));
  } catch (err) {
    const timedOut = dbTimeoutResponse(err);
    if (timedOut) return timedOut;
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * v1.11 · 性能：需要「当前用户 + 模拟时间」的读接口（大厅 / 详情）。
 * 两条查询彼此独立，并行发出 = 少一个往返（Neon 单条约 70–140ms）。
 * 用户拿不到就 401，时钟查询失败会抛错，由下面的通用 catch 转成 500 之外的清晰错误。
 *
 * 注意：`nowMs()` 未登录也查库，所以**未切号的请求同样会走数据库**——
 * 这正是 v1.16 把它一起套进超时判定的原因。
 */
export async function withUserClock<T>(
  fn: (user: CurrentUser, nowMs: number) => Promise<T>,
  options?: ReadOptions,
): Promise<NextResponse> {
  try {
    const [user, clock] = await attemptRead(
      () => Promise.all([getCurrentUser(), nowMs()]),
      "getCurrentUser+nowMs",
      options,
    );
    if (!user) return unauthenticated();
    return NextResponse.json(await attemptRead(() => fn(user, clock), "handler", options));
  } catch (err) {
    const timedOut = dbTimeoutResponse(err);
    if (timedOut) return timedOut;
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

/** 便捷：读 JSON body（空 body 也安全） */
export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

export function toInt(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}
