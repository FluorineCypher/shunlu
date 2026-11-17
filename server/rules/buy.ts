import { and, eq } from "drizzle-orm";
import { orders } from "@/server/db/schema";
import { now } from "@/server/clock";
import { Errors } from "./errors";
import { freezeFen, frozenFen, insertLog, notify, recordEvent, refundEscrow, type Executor } from "./ledger";
import { getOrder, withTx, type OrderRow } from "./orders";

/**
 * 代买（buy）决策表（§3.3）：
 * - report：实付 ≤ 生效额度（budget_fen）→ picked，落 actual_fen
 * - request：实付 > 额度 → budget_status=requested，订单保持 accepted
 * - agree：追加冻结差额，budget_fen ← requested，budget_status=agreed
 * - decline：清 requested，跑腿者可按原额度继续
 * - confirm（M4）：退 budget−actual 给发布者，报 actual 给跑腿者（垫付报销，不计服务费）
 */

function assertBuy(order: OrderRow): void {
  if (order.bizType !== "buy") throw Errors.invalid("该操作仅适用于代买订单");
}

/** A3b · 实付上报（≤ 额度）：accepted → picked */
export async function reportActual(
  orderId: number,
  runnerId: number,
  input: { actualFen: number; photoUrl: string }
): Promise<OrderRow> {
  if (!Number.isInteger(input.actualFen) || input.actualFen <= 0) throw Errors.invalid("实付金额必须大于 0");
  if (!input.photoUrl?.trim()) throw Errors.invalid("请上传实物凭证照");

  return withTx(async (tx) => {
    const order = await getOrder(tx, orderId);
    assertBuy(order);
    if (order.runnerId !== runnerId) throw Errors.forbidden("只有接单跑腿者能上报实付");
    if (order.status !== "accepted") throw Errors.conflict("当前状态不能上报实付");
    const limit = order.budgetFen;
    if (input.actualFen > limit) {
      throw Errors.invalid(`实付 ${(input.actualFen / 100).toFixed(2)} 元超过额度，请先申请加额度`);
    }
    const t = await now();
    const [updated] = await tx
      .update(orders)
      .set({
        status: "picked",
        actualFen: input.actualFen,
        pickupPhotoUrl: input.photoUrl,
        pickedAt: t,
      })
      .where(and(eq(orders.id, orderId), eq(orders.status, "accepted")))
      .returning();
    if (!updated) throw Errors.conflict("订单状态已变化，请刷新");
    await recordEvent(tx, { orderId, type: "buy_reported", actorId: runnerId, payload: { actualFen: input.actualFen } });
    await notify(tx, {
      userId: order.publisherId,
      orderId,
      content: `代买订单 ${order.code} 已买好，实付 ${(input.actualFen / 100).toFixed(2)} 元，待你确认找零`,
    });
    return updated;
  });
}

/** A3b · 超额度申请：保持 accepted，等发布者同意 */
export async function requestBudget(
  orderId: number,
  runnerId: number,
  actualFen: number
): Promise<OrderRow> {
  if (!Number.isInteger(actualFen) || actualFen <= 0) throw Errors.invalid("实付金额必须大于 0");
  return withTx(async (tx) => {
    const order = await getOrder(tx, orderId);
    assertBuy(order);
    if (order.runnerId !== runnerId) throw Errors.forbidden("只有接单跑腿者能申请");
    if (order.status !== "accepted") throw Errors.conflict("当前状态不能申请加额度");
    if (actualFen <= order.budgetFen) throw Errors.invalid("没有超过额度，直接上报实付即可");
    const [updated] = await tx
      .update(orders)
      .set({ budgetStatus: "requested", requestedBudgetFen: actualFen })
      .where(and(eq(orders.id, orderId), eq(orders.status, "accepted")))
      .returning();
    if (!updated) throw Errors.conflict("订单状态已变化，请刷新");
    await recordEvent(tx, { orderId, type: "budget_requested", actorId: runnerId, payload: { actualFen } });
    await notify(tx, {
      userId: order.publisherId,
      orderId,
      content: `代买订单 ${order.code} 实付超额度，申请加到 ${(actualFen / 100).toFixed(2)} 元`,
    });
    return updated;
  });
}

/** A3b · 发布者同意追加额度：追加冻结差额 */
export async function agreeBudget(orderId: number, publisherId: number): Promise<OrderRow> {
  return withTx(async (tx) => {
    const order = await getOrder(tx, orderId);
    assertBuy(order);
    if (order.publisherId !== publisherId) throw Errors.forbidden("只有发布者能同意");
    if (order.budgetStatus !== "requested" || !order.requestedBudgetFen) {
      throw Errors.conflict("这笔订单没有待同意的加额度申请");
    }
    const diff = order.requestedBudgetFen - order.budgetFen;
    if (diff <= 0) throw Errors.invalid("申请额度没有超过当前额度");
    await freezeFen(tx, {
      userId: publisherId,
      orderId,
      amountFen: diff,
      memo: `代买追加额度 ${diff} 分`,
    });
    const [updated] = await tx
      .update(orders)
      .set({ budgetFen: order.requestedBudgetFen, budgetStatus: "agreed", requestedBudgetFen: null })
      .where(and(eq(orders.id, orderId), eq(orders.budgetStatus, "requested")))
      .returning();
    if (!updated) throw Errors.conflict("状态已变化，请刷新");
    await recordEvent(tx, { orderId, type: "budget_agreed", actorId: publisherId, payload: { budgetFen: updated.budgetFen } });
    if (order.runnerId) {
      await notify(tx, {
        userId: order.runnerId,
        orderId,
        content: `发布者同意了额度 ${(updated.budgetFen / 100).toFixed(2)} 元，可以继续买`,
      });
    }
    return updated;
  });
}

/** A3b · 发布者拒绝追加额度：清 requested，按原额度继续或跑腿者放弃 */
export async function declineBudget(orderId: number, publisherId: number): Promise<OrderRow> {
  return withTx(async (tx) => {
    const order = await getOrder(tx, orderId);
    assertBuy(order);
    if (order.publisherId !== publisherId) throw Errors.forbidden("只有发布者能拒绝");
    if (order.budgetStatus !== "requested") throw Errors.conflict("没有待处理的加额度申请");
    const [updated] = await tx
      .update(orders)
      .set({ budgetStatus: "none", requestedBudgetFen: null })
      .where(and(eq(orders.id, orderId), eq(orders.budgetStatus, "requested")))
      .returning();
    if (!updated) throw Errors.conflict("状态已变化，请刷新");
    await recordEvent(tx, { orderId, type: "budget_declined", actorId: publisherId });
    if (order.runnerId) {
      await notify(tx, {
        userId: order.runnerId,
        orderId,
        content: `发布者没同意加额度，请按原额度 ${(order.budgetFen / 100).toFixed(2)} 元继续，或放弃这一单`,
      });
    }
    return updated;
  });
}

/**
 * M4 · 发布者确认找零（picked 阶段）：一个事务内
 *   发布者 refund + (budget − actual)；跑腿者 income + actual（报销，不计服务费）。
 * 幂等判据：订单托管余额回到 reward 后重复调用直接拒绝（用账本推导，不额外加列）。
 */
export async function confirmBudget(
  orderId: number,
  publisherId: number
): Promise<{ order: OrderRow; refundFen: number; reimburseFen: number }> {
  return withTx(async (tx) => {
    const order = await getOrder(tx, orderId);
    assertBuy(order);
    if (order.publisherId !== publisherId) throw Errors.forbidden("只有发布者能确认找零");
    if (order.status !== "picked") throw Errors.conflict("订单还没买好，不能确认找零");
    if (order.actualFen === null) throw Errors.conflict("跑腿者还没上报实付");

    const escrow = await frozenFen(tx, orderId);
    if (escrow <= order.rewardFen) throw Errors.conflict("这笔订单已经结算过找零");

    const refundFen = order.budgetFen - order.actualFen;
    if (refundFen < 0) throw Errors.invalid("实付超过额度，请先走加额度流程");

    if (refundFen > 0) {
      await insertLog(tx, {
        userId: publisherId,
        orderId,
        type: "refund",
        amountFen: refundFen,
        memo: "代买未花完的额度退回",
      });
    }
    if (!order.runnerId) throw Errors.conflict("订单没有接单跑腿者");
    await insertLog(tx, {
      userId: order.runnerId,
      orderId,
      type: "income",
      amountFen: order.actualFen,
      memo: "代买垫付报销（不计服务费）",
    });
    const t = await now();
    await recordEvent(tx, {
      orderId,
      type: "budget_confirmed",
      actorId: publisherId,
      payload: { refundFen, reimburseFen: order.actualFen, at: t.toISOString() },
    });
    await notify(tx, {
      userId: order.runnerId,
      orderId,
      content: `发布者已确认找零，报销 ${(order.actualFen / 100).toFixed(2)} 元已到账`,
    });
    return { order, refundFen, reimburseFen: order.actualFen };
  });
}

export interface RefuseBuyResult {
  order: OrderRow;
  refundedFen: number;
}

/**
 * A3e · 跑腿者拒绝代买单（v1.10，用户口径「金额不足就拒绝/取消并全额退回」）：
 * 接单后觉得采购额度明显不够（发布时已提示要留足），可以不买、直接取消整单，
 * 托管全额退回发布者，跑腿者**不扣信用**，并通知发布者原因。
 */
export async function refuseBuy(
  orderId: number,
  runnerId: number,
  reason?: string
): Promise<RefuseBuyResult> {
  return withTx(async (tx) => {
    const order = await getOrder(tx, orderId);
    assertBuy(order);
    if (order.runnerId !== runnerId) throw Errors.forbidden("只有接单跑腿者能拒绝这一单");
    if (order.status !== "accepted") {
      throw Errors.conflict("已经买好（或已上报实付）的单不能拒绝，请直接送达或联系发布者");
    }

    const note = (reason ?? "").trim().slice(0, 40);
    const [updated] = await tx
      .update(orders)
      .set({
        status: "cancelled",
        cancelReason: note ? `代买额度不足：${note}` : "代买额度不足，跑腿者拒绝",
        runnerId: null,
        batchId: null,
      })
      .where(and(eq(orders.id, orderId), eq(orders.status, "accepted")))
      .returning();
    if (!updated) throw Errors.conflict("状态已变化，请刷新");

    const refundedFen = await refundEscrow(tx, {
      orderId,
      publisherId: order.publisherId,
      memo: "代买额度不足，跑腿者拒绝，托管全额退回",
    });
    await recordEvent(tx, {
      orderId,
      type: "buy_refused",
      actorId: runnerId,
      payload: { reason: note, refundedFen },
    });
    await notify(tx, {
      userId: order.publisherId,
      orderId,
      content: note
        ? `跑腿者拒绝了这单代买（${note}），已全额退回 ¥${(refundedFen / 100).toFixed(2)}，建议提高采购额度后重发`
        : `跑腿者觉得采购额度不够，已拒绝这单代买并全额退回 ¥${(refundedFen / 100).toFixed(2)}`,
    });

    return { order: updated, refundedFen };
  });
}

export type { Executor };
