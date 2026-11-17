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
};

/** 路由层统一出口：RuleError → { error, code } */
export function toErrorResponse(err: unknown): { status: number; body: { error: string; code?: string } } {
  if (err instanceof RuleError) {
    return { status: err.status, body: { error: err.message, code: err.code } };
  }
  console.error("[rules] 未预期错误", err);
  return { status: 500, body: { error: "服务器内部错误" } };
}
