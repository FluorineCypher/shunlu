/**
 * 规则层错误：路由层只负责把 status/code 映射成 HTTP 响应，
 * 业务语义（为什么拒绝）全部在这里表达。
 */
export class RuleError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "RuleError";
    this.code = code;
    this.status = status;
  }
}

export const Errors = {
  unauthenticated: () => new RuleError("UNAUTHENTICATED", "未切号", 401),
  forbidden: (msg = "无权操作") => new RuleError("FORBIDDEN", msg, 403),
  notFound: (msg = "订单不存在") => new RuleError("NOT_FOUND", msg, 404),
  conflict: (msg: string) => new RuleError("CONFLICT", msg, 409),
  invalid: (msg: string) => new RuleError("INVALID", msg, 400),
  /** v1.43 · 数据库侧繁忙（锁等待超时 / 死锁 / 语句被取消）：可重试的临时失败，不是 500 */
  busy: (msg = "系统正忙（数据库锁等待超时），请稍后重试") => new RuleError("DB_BUSY", msg, 503),
};

/**
 * v1.43（m00266）· PostgreSQL SQLSTATE → 503 DB_BUSY
 *
 * 线上「大量 500」的根因是写事务攥着 `orders` 行锁，而读接口里的 expireSweep
 * 在锁队列里一直等到 statement_timeout。锁超时（55P03）/ 语句被取消（57014）/
 * 死锁（40P01）在语义上都是「现在忙，过一会儿再来」，不该报成「服务器内部错误」，
 * 否则前端只能看到无法解释的 500。统一映射成 503 + code=DB_BUSY。
 *
 * postgres.js 把 SQLSTATE 放在 err.code，drizzle 偶尔会包一层 cause，所以往下钻几层。
 */
const DB_BUSY_SQLSTATES = new Set(["55P03", "57014", "40P01"]);

export function dbBusyState(err: unknown, depth = 0): string | null {
  if (!err || typeof err !== "object" || depth > 3) return null;
  const code = (err as { code?: unknown }).code;
  if (typeof code === "string" && DB_BUSY_SQLSTATES.has(code)) return code;
  return dbBusyState((err as { cause?: unknown }).cause, depth + 1);
}

export function isDbBusyError(err: unknown): boolean {
  return dbBusyState(err) !== null;
}

/** 路由层统一出口：RuleError / 数据库繁忙 → { error, code }，其余才是 500 */
export function toErrorResponse(err: unknown): { status: number; body: { error: string; code?: string } } {
  if (err instanceof RuleError) {
    return { status: err.status, body: { error: err.message, code: err.code } };
  }
  const state = dbBusyState(err);
  if (state) {
    console.warn(`[rules] 数据库繁忙（${state}），按可重试的 503 处理`);
    return { status: 503, body: { error: "系统正忙（数据库锁等待超时），请稍后重试", code: "DB_BUSY" } };
  }
  console.error("[rules] 未预期错误", err);
  return { status: 500, body: { error: "服务器内部错误" } };
}
