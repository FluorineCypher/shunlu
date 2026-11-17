/** 规则层公共类型（AGENTS.md §3） */

export type OrderStatus =
  | "open"
  | "accepted"
  | "picked"
  | "delivered"
  | "completed"
  | "expired"
  | "cancelled"
  | "abnormal";

export type BizType = "food" | "buy";
export type LedgerType = "freeze" | "refund" | "income" | "fee" | "bonus";
export type BudgetStatus = "none" | "requested" | "agreed" | "abandoned";

/** 终态：任何写操作一律拒绝（§3.2 铁律） */
export const TERMINAL_STATUSES: readonly OrderStatus[] = [
  "completed",
  "expired",
  "cancelled",
  "abnormal",
];

/** 跑腿者「履约中」状态（并发上限用，§4） */
export const ACTIVE_RUNNER_STATUSES: readonly OrderStatus[] = ["accepted", "picked", "delivered"];

export function isTerminal(status: string): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}
