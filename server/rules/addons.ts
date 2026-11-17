import { and, eq } from "drizzle-orm";
import { orderAddons, orders } from "@/server/db/schema";
import { ADDON_MAX_BUDGET_FEN } from "./constants";
import { Errors } from "./errors";
import { insertLog, notify, recordEvent } from "./ledger";
import { addonsOf, getOrder, withTx, type OrderRow } from "./orders";

/**
 * 捎带项（v1.3 增补）：外卖单捆绑的代买小件（如「可乐 1 瓶」）。
 *
 * 与独立代买单的区别：
 *  - 不单独成单、不单独结算：预算计入主单 orders.budget_fen 一起冻结；
 *  - 跑腿者在取餐时一并上报每件的实付（或标记没买到），实付合计落 orders.actual_fen；
 *  - 发布者确认收货时一次结算：奖励走 75% 分成，实付全额报销给跑腿者，未花完的预算退回。
 */

export interface AddonReportItem {
  id: number;
  /** 实付（分）；failed=true 时可省略 */
  actualFen?: number | null;
  /** 没买到 / 断货：该件预算全额退回发布者 */
  failed?: boolean;
}

export interface AddonReportResult {
  order: OrderRow;
  addons: (typeof orderAddons.$inferSelect)[];
  /** 实付合计（分） */
  totalActualFen: number;
  /** 超出预算的金额（分，0 表示没超）；发布者确认收货时补扣 */
  overBudgetFen: number;
}

/**
 * A3c · 跑腿者上报捎带实付。允许 accepted / picked 两个状态（取餐时买、路上补买都可以）。
 * 必须一次性覆盖该单全部捎带项，避免「部分上报」导致结算口径含糊。
 */
export async function reportAddons(
  orderId: number,
  runnerId: number,
  items: AddonReportItem[]
): Promise<AddonReportResult> {
  if (!Array.isArray(items) || items.length === 0) throw Errors.invalid("请填写捎带项的实付金额");

  return withTx(async (tx) => {
    const order = await getOrder(tx, orderId);
    if (order.bizType !== "food") throw Errors.invalid("只有外卖单才有捎带项");
    if (order.runnerId !== runnerId) throw Errors.forbidden("只有接单跑腿者能上报捎带实付");
    if (!["accepted", "picked"].includes(order.status)) throw Errors.conflict("当前状态不能上报捎带实付");

    const addons = await addonsOf(tx, orderId);
    if (addons.length === 0) throw Errors.invalid("这一单没有捎带项");

    const byId = new Map(items.map((i) => [Number(i.id), i]));
    if (byId.size !== items.length) throw Errors.invalid("捎带项重复提交");
    for (const a of addons) {
      if (!byId.has(a.id)) throw Errors.invalid(`「${a.title}」还没填实付`);
    }
    for (const id of byId.keys()) {
      if (!addons.some((a) => a.id === id)) throw Errors.invalid("捎带项不属于这一单");
    }

    let totalActualFen = 0;
    for (const a of addons) {
      const item = byId.get(a.id)!;
      if (item.failed) {
        await tx
          .update(orderAddons)
          .set({ status: "failed", actualFen: null })
          .where(and(eq(orderAddons.id, a.id), eq(orderAddons.orderId, orderId)));
        continue;
      }
      const actualFen = Number(item.actualFen);
      if (!Number.isInteger(actualFen) || actualFen <= 0) {
        throw Errors.invalid(`「${a.title}」的实付金额必须大于 0，没买到请选「没买到」`);
      }
      if (actualFen > ADDON_MAX_BUDGET_FEN * 2) {
        throw Errors.invalid(`「${a.title}」实付异常（上限 ${(ADDON_MAX_BUDGET_FEN * 2) / 100} 元），请联系发布者确认`);
      }
      totalActualFen += actualFen;
      await tx
        .update(orderAddons)
        .set({ status: "bought", actualFen })
        .where(and(eq(orderAddons.id, a.id), eq(orderAddons.orderId, orderId)));
    }

    const overBudgetFen = Math.max(0, totalActualFen - order.budgetFen);
    const [updated] = await tx
      .update(orders)
      .set({ actualFen: totalActualFen })
      .where(eq(orders.id, orderId))
      .returning();

    await recordEvent(tx, {
      orderId,
      type: "addons_reported",
      actorId: runnerId,
      payload: { totalActualFen, overBudgetFen, items: addons.map((a) => a.id) },
    });
    await notify(tx, {
      userId: order.publisherId,
      orderId,
      content:
        overBudgetFen > 0
          ? `订单 ${order.code} 捎带已买好，实付 ${(totalActualFen / 100).toFixed(2)} 元（超出预算 ${(overBudgetFen / 100).toFixed(2)} 元，确认收货时补扣）`
          : `订单 ${order.code} 捎带已买好，实付 ${(totalActualFen / 100).toFixed(2)} 元`,
    });

    return { order: updated ?? order, addons: await addonsOf(tx, orderId), totalActualFen, overBudgetFen };
  });
}

export interface RejectAddonsResult {
  order: OrderRow;
  /** 退回发布者的捎带预算（分） */
  refundedFen: number;
  /** 被拒绝的捎带项标题 */
  titles: string[];
}

/**
 * A3d · 跑腿者拒绝捎带（v1.10，用户口径「金额不足就拒绝/取消并全额退回」）：
 * 代取外卖的主单**继续**履约，只把还没买的捎带项整组取消 ——
 * 它们对应的预算从订单托管里退给发布者，订单的 budget_fen 同步减掉，
 * 已买好的捎带项不受影响；跑腿者不扣信用。
 */
export async function rejectAddons(
  orderId: number,
  runnerId: number,
  reason?: string
): Promise<RejectAddonsResult> {
  return withTx(async (tx) => {
    const order = await getOrder(tx, orderId);
    if (order.bizType !== "food") throw Errors.invalid("只有外卖单才有捎带项");
    if (order.runnerId !== runnerId) throw Errors.forbidden("只有接单跑腿者能拒绝捎带");
    if (!["accepted", "picked"].includes(order.status)) throw Errors.conflict("当前状态不能拒绝捎带");

    const addons = await addonsOf(tx, orderId);
    const pending = addons.filter((a) => a.status === "pending");
    if (pending.length === 0) throw Errors.conflict("没有待买的捎带项可以拒绝");

    const refundedFen = pending.reduce((sum, a) => sum + a.budgetFen, 0);
    for (const a of pending) {
      await tx
        .update(orderAddons)
        .set({ status: "failed", actualFen: null })
        .where(and(eq(orderAddons.id, a.id), eq(orderAddons.orderId, orderId)));
    }

    const memoNote = (reason ?? "").trim().slice(0, 40);
    if (refundedFen > 0) {
      await insertLog(tx, {
        userId: order.publisherId,
        orderId,
        type: "refund",
        amountFen: refundedFen,
        memo: memoNote
          ? `跑腿者拒绝捎带（${memoNote}），预算退回`
          : "跑腿者拒绝捎带（预算不够），预算退回",
      });
    }

    const [updated] = await tx
      .update(orders)
      .set({ budgetFen: Math.max(0, order.budgetFen - refundedFen) })
      .where(eq(orders.id, orderId))
      .returning();

    await recordEvent(tx, {
      orderId,
      type: "addons_rejected",
      actorId: runnerId,
      payload: { refundedFen, addonIds: pending.map((a) => a.id), reason: memoNote },
    });
    await notify(tx, {
      userId: order.publisherId,
      orderId,
      content: memoNote
        ? `跑腿者拒绝了捎带（${memoNote}），已退回 ¥${(refundedFen / 100).toFixed(2)}，外卖还照常送`
        : `跑腿者觉得金额不够，已拒绝捎带并退回 ¥${(refundedFen / 100).toFixed(2)}，外卖还照常送`,
    });

    return {
      order: updated ?? order,
      refundedFen,
      titles: pending.map((a) => a.title),
    };
  });
}
