import { and, eq, sql } from "drizzle-orm";
import { db, type Db } from "@/server/db";
import { batches, orderEvents, orders, users, walletLogs } from "@/server/db/schema";
import { BONUS_MIN_BATCH_SIZE, PLATFORM_USER_ID, calcBonusFen } from "./constants";
import { Errors } from "./errors";
import type { LedgerType } from "./types";

/**
 * 账本（规则 6 + 附录 A）：append-only，金额带符号（freeze 负 / 其余正）。
 * 不变式：
 *   1) users.balance_fen = Σ wallet_logs.amount_fen（每次写日志同步列）
 *   2) 未终态订单的托管余额 = −Σ(该单日志) ≥ 0
 * 所有函数都接收 tx，必须由调用方放进事务。
 */

export type Executor = Db;

export async function insertLog(
  tx: Executor,
  input: { userId: number; orderId?: number | null; type: LedgerType; amountFen: number; memo?: string }
): Promise<void> {
  if (!Number.isInteger(input.amountFen) || input.amountFen === 0) {
    throw Errors.invalid(`账本金额必须是非零整数分：${input.amountFen}`);
  }
  await tx.insert(walletLogs).values({
    userId: input.userId,
    orderId: input.orderId ?? null,
    type: input.type,
    amountFen: input.amountFen,
    memo: input.memo,
  });
  await tx
    .update(users)
    .set({ balanceFen: sql`${users.balanceFen} + ${input.amountFen}` })
    .where(eq(users.id, input.userId));
}

/** 冻结（发布 / 追加预算）：金额取正数传入，落库为负数 */
export async function freezeFen(
  tx: Executor,
  input: { userId: number; orderId: number; amountFen: number; memo?: string }
): Promise<void> {
  if (input.amountFen <= 0) throw Errors.invalid("冻结金额必须大于 0");
  const rows = await tx.select({ balance: users.balanceFen }).from(users).where(eq(users.id, input.userId));
  const balance = rows[0]?.balance;
  if (balance === undefined) throw Errors.notFound("用户不存在");
  if (balance < input.amountFen) {
    throw Errors.conflict(`余额不足：需要 ${(input.amountFen / 100).toFixed(2)} 元，当前 ${(balance / 100).toFixed(2)} 元`);
  }
  await insertLog(tx, { ...input, type: "freeze", amountFen: -input.amountFen });
}

/** 订单当前托管余额 = −Σ(该单全部日志)。终态应回到 0。 */
export async function frozenFen(tx: Executor, orderId: number): Promise<number> {
  const rows = await tx
    .select({ sum: sql<number>`COALESCE(SUM(${walletLogs.amountFen}), 0)::int` })
    .from(walletLogs)
    .where(eq(walletLogs.orderId, orderId));
  return -(rows[0]?.sum ?? 0);
}

/** 把订单剩余托管额全额退回发布者，返回退款额 */
export async function refundEscrow(
  tx: Executor,
  input: { orderId: number; publisherId: number; memo: string }
): Promise<number> {
  const amount = await frozenFen(tx, input.orderId);
  if (amount > 0) {
    await insertLog(tx, {
      userId: input.publisherId,
      orderId: input.orderId,
      type: "refund",
      amountFen: amount,
      memo: input.memo,
    });
  }
  return amount;
}

/**
 * 完成结算（附录 A）：跑腿者 income Y（+ 批次加成 bonus），平台 fee = X − Y − bonus。
 * 「送达即完成」的批次加成要求：同批 ≥3 单且同楼栋，每单 bonus = round(Y×5%)。
 */
export async function settleCompletion(
  tx: Executor,
  order: {
    id: number;
    publisherId: number;
    rewardFen: number;
    runnerRewardFen: number;
    runnerId: number | null;
    batchId: number | null;
    dropBuilding: string;
    bizType: string;
    actualFen: number | null;
  }
): Promise<{
  runnerIncomeFen: number;
  bonusFen: number;
  feeFen: number;
  refundedBudgetFen: number;
  reimburseFen: number;
}> {
  if (!order.runnerId) throw Errors.conflict("订单没有接单跑腿者，无法结算");
  const bonusFen = await batchBonusFen(tx, order);
  const feeFen = order.rewardFen - order.runnerRewardFen - bonusFen;
  if (feeFen < 0) throw Errors.invalid("平台服务费为负，检查费率常量");

  // 托管额 = 奖励 X + 未花完的采购/捎带额度。奖励部分由 income + fee 恰好冲平。
  // 额度部分（仅 food 捎带项）：先报销跑腿者垫付的实付，余额退回发布者。
  // buy 的额度仍走 M4 找零（confirmBudget）；没走 M4 就确认收货 = fail-safe 全额退回，不默认报销。
  const escrow = await frozenFen(tx, order.id);
  let budgetEscrow = Math.max(0, escrow - order.rewardFen);
  const actualFen = order.bizType === "food" ? (order.actualFen ?? 0) : 0;

  // 实付超出预算：发布者确认收货即视为认可这笔开销，差额在结算时补冻结（余额不足则整笔失败）。
  // 仅 food 捎带项适用；buy 的额度调整必须走 M4 的 agree 流程。
  let overBudgetFen = 0;
  if (order.bizType === "food" && budgetEscrow > 0 && actualFen > budgetEscrow) {
    overBudgetFen = actualFen - budgetEscrow;
    await freezeFen(tx, {
      userId: order.publisherId,
      orderId: order.id,
      amountFen: overBudgetFen,
      memo: "捎带/代买实付超出预算，确认收货时补扣",
    });
    budgetEscrow += overBudgetFen;
  }

  const reimburseFen = Math.min(budgetEscrow, actualFen);
  if (reimburseFen > 0) {
    await insertLog(tx, {
      userId: order.runnerId,
      orderId: order.id,
      type: "income",
      amountFen: reimburseFen,
      memo: "垫付报销（捎带/代买商品实付，不计服务费）",
    });
  }
  const refundedBudgetFen = budgetEscrow - reimburseFen;
  if (refundedBudgetFen > 0) {
    await insertLog(tx, {
      userId: order.publisherId,
      orderId: order.id,
      type: "refund",
      amountFen: refundedBudgetFen,
      memo: "采购/捎带额度未花完，随结算退回",
    });
  }

  await insertLog(tx, {
    userId: order.runnerId,
    orderId: order.id,
    type: "income",
    amountFen: order.runnerRewardFen,
    memo: `跑腿收入（奖励 ${(order.rewardFen / 100).toFixed(2)} 元 × 75%）`,
  });
  if (bonusFen > 0) {
    await insertLog(tx, {
      userId: order.runnerId,
      orderId: order.id,
      type: "bonus",
      amountFen: bonusFen,
      memo: "多单合并加成（平台让利）",
    });
  }
  await insertLog(tx, {
    userId: PLATFORM_USER_ID,
    orderId: order.id,
    type: "fee",
    amountFen: feeFen,
    memo: "平台服务费",
  });
  // 完成 +1 信用由调用方（confirmDelivered / 自动确认）统一加，这里只结算钱
  return { runnerIncomeFen: order.runnerRewardFen, bonusFen, feeFen, refundedBudgetFen, reimburseFen };
}

/** 批次加成：同批订单数 ≥3 且同楼栋时每单 round(Y×5%)，否则 0 */
async function batchBonusFen(
  tx: Executor,
  order: { id: number; runnerRewardFen: number; batchId: number | null; dropBuilding: string }
): Promise<number> {
  if (!order.batchId) return 0;
  const rows = await tx
    .select({ id: orders.id, dropBuilding: orders.dropBuilding })
    .from(orders)
    .where(eq(orders.batchId, order.batchId));
  const sameBuilding = rows.filter((r) => r.dropBuilding === order.dropBuilding).length;
  if (rows.length < BONUS_MIN_BATCH_SIZE || sameBuilding < BONUS_MIN_BATCH_SIZE) return 0;
  return calcBonusFen(order.runnerRewardFen);
}

/** 写状态时间轴（order_events） */
export async function recordEvent(
  tx: Executor,
  input: { orderId: number; type: string; actorId?: number | null; payload?: Record<string, unknown> }
): Promise<void> {
  await tx.insert(orderEvents).values({
    orderId: input.orderId,
    type: input.type,
    actorId: input.actorId ?? null,
    payload: input.payload,
  });
}

/** 信用分调整（clamp 0..120） */
export async function adjustCredit(tx: Executor, userId: number, delta: number): Promise<void> {
  await tx
    .update(users)
    .set({
      creditScore: sql`LEAST(120, GREATEST(0, ${users.creditScore} + ${delta}))`,
    })
    .where(eq(users.id, userId));
}

/** 通知（红点轮询用；M3 砍成 Toast + 红点） */
export async function notify(
  tx: Executor,
  input: { userId: number; orderId?: number | null; content: string }
): Promise<void> {
  const { notifications } = await import("@/server/db/schema");
  await tx.insert(notifications).values({
    userId: input.userId,
    orderId: input.orderId ?? null,
    content: input.content,
  });
}

/** 批次进度同步（订单数 / 期望收入），batch 不存在时忽略 */
export async function refreshBatch(tx: Executor, batchId: number): Promise<void> {
  const rows = await tx
    .select({ n: sql<number>`COUNT(*)::int`, sum: sql<number>`COALESCE(SUM(${orders.runnerRewardFen}), 0)::int` })
    .from(orders)
    .where(and(eq(orders.batchId, batchId)));
  const n = rows[0]?.n ?? 0;
  const sum = rows[0]?.sum ?? 0;
  await tx.update(batches).set({ orderCount: n, expectedRewardFen: sum }).where(eq(batches.id, batchId));
}
