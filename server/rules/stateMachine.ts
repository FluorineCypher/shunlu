import { Errors } from "./errors";
import { isTerminal, type OrderStatus } from "./types";

/**
 * 订单状态机（§3.2）。纯函数：只判断「这一步能不能做」，不碰数据库。
 * 路由/服务层负责事务、条件 UPDATE 与副作用；这里给出唯一一份状态规则。
 */

export type OrderAction =
  | "accept"
  | "pick"
  | "deliver"
  | "unpickable"
  | "unarrived"
  | "abandon"
  | "cancel"
  | "confirm"
  | "review"
  | "bump";

type Actor = "publisher" | "runner";
type OrderLike = { status: string; publisherId: number; runnerId: number | null };

const ALLOWED_FROM: Record<OrderAction, readonly OrderStatus[]> = {
  accept: ["open"],
  pick: ["accepted"],
  deliver: ["picked"],
  unpickable: ["accepted"],
  unarrived: ["accepted", "picked"],
  abandon: ["accepted"],
  cancel: ["open"],
  confirm: ["delivered"],
  review: ["completed"],
  bump: ["expired"],
};

const ACTOR: Record<OrderAction, Actor> = {
  accept: "runner",
  pick: "runner",
  deliver: "runner",
  unpickable: "runner",
  unarrived: "runner",
  abandon: "runner",
  cancel: "publisher",
  confirm: "publisher",
  review: "publisher",
  bump: "publisher",
};

const LABEL: Record<OrderAction, string> = {
  accept: "接单",
  pick: "标记已取到",
  deliver: "送达",
  unpickable: "取不到餐",
  unarrived: "反馈餐未送达",
  abandon: "放弃接单",
  cancel: "取消订单",
  confirm: "确认收货",
  review: "评价",
  bump: "加价重发",
};

export function canAct(action: OrderAction, order: OrderLike, actorId: number): boolean {
  if (!ALLOWED_FROM[action].includes(order.status as OrderStatus)) return false;
  if (isTerminal(order.status) && action !== "review" && action !== "bump") return false;
  return ACTOR[action] === "publisher" ? order.publisherId === actorId : order.runnerId === actorId;
}

/** 抛 RuleError 的断言版本；返回动作的中文名（用于事件/通知文案） */
export function assertCan(action: OrderAction, order: OrderLike, actorId: number): string {
  if (!ALLOWED_FROM[action].includes(order.status as OrderStatus)) {
    throw Errors.conflict(`当前状态（${order.status}）不能${LABEL[action]}`);
  }
  const isPublisherAction = ACTOR[action] === "publisher";
  if (isPublisherAction && order.publisherId !== actorId) {
    throw Errors.forbidden(`只有发布者能${LABEL[action]}`);
  }
  if (!isPublisherAction && order.runnerId !== actorId) {
    throw Errors.forbidden(`只有接单跑腿者能${LABEL[action]}`);
  }
  return LABEL[action];
}

/** 发布者确认收货的两种来源 */
export function confirmedBy(actorId: number | null): "publisher" | "system" {
  return actorId === null ? "system" : "publisher";
}
