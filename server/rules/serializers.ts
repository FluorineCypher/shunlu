import { ACTIVE_RUNNER_STATUSES, isTerminal } from "./types";
import type { OrderRow } from "./orders";

/**
 * 出口序列化（规则 5）：隐私字段只在「接单后 + 接单跑腿者本人」的详情里出现。
 * 任何列表（大厅 / 我发布的 / 我接的）都不含 drop_room、phone_tail。
 */

export interface Viewer {
  id: number;
  isAdmin?: boolean;
}

export type HallOrder = ReturnType<typeof publicFields>;

function publicFields(order: OrderRow) {
  return {
    id: order.id,
    code: order.code,
    publisherId: order.publisherId,
    bizType: order.bizType,
    status: order.status,
    pickupPoint: order.pickupPoint,
    dropBuilding: order.dropBuilding,
    dropFloor: order.dropFloor,
    note: order.note,
    itemDesc: order.itemDesc,
    photoUrls: order.photoUrls,
    rewardFen: order.rewardFen,
    runnerRewardFen: order.runnerRewardFen,
    budgetFen: order.budgetFen,
    actualFen: order.actualFen,
    budgetStatus: order.budgetStatus,
    requestedBudgetFen: order.requestedBudgetFen,
    expectDeliveryAt: order.expectDeliveryAt,
    acceptDeadlineAt: order.acceptDeadlineAt,
    deliverDeadlineAt: order.deliverDeadlineAt,
    autoConfirmAt: order.autoConfirmAt,
    acceptedAt: order.acceptedAt,
    pickedAt: order.pickedAt,
    deliveredAt: order.deliveredAt,
    completedAt: order.completedAt,
    createdAt: order.createdAt,
    batchId: order.batchId,
    abnormalReason: order.abnormalReason,
  };
}

/** 大厅 / 列表：绝不包含房号与手机尾号 */
export function toHallOrder(order: OrderRow): HallOrder {
  return publicFields(order);
}

/**
 * 详情：隐私字段（房号 / 手机尾号）仅当 viewer 是接单跑腿者本人且订单已接单。
 * 送达凭证与取货照片则对「发布者 + 接单跑腿者」都可见——发布者要靠它确认收货。
 * 管理员（m02503）：纠纷处理需要看到完整记录，房号 / 尾号 / 凭证全部可见；列表仍不含隐私字段。
 */
export function toOrderDetail(order: OrderRow, viewer: Viewer) {
  const isAssignedRunner = viewer.id === order.runnerId;
  const isPublisher = viewer.id === order.publisherId;
  const isAdmin = viewer.isAdmin === true;
  const runnerHasIt = isAssignedRunner && (ACTIVE_RUNNER_STATUSES as readonly string[]).includes(order.status);
  const maySeePrivate = isAdmin || runnerHasIt;
  return {
    ...publicFields(order),
    /** v1.10 · 取消原因（如「代买额度不足：…」）只在详情出现 */
    cancelReason: order.cancelReason,
    runnerId: order.runnerId,
    /** 加价重发链路只在详情里出现，列表（大厅）继续不含该字段（见 privacy 测试） */
    linkedPrevId: order.linkedPrevId,
    dropRoom: maySeePrivate ? order.dropRoom : null,
    phoneTail: maySeePrivate ? order.phoneTail : null,
    pickupPhotoUrl: isAdmin || runnerHasIt || isPublisher ? order.pickupPhotoUrl : null,
    proofPhotoUrl: isAdmin || runnerHasIt || isPublisher ? order.proofPhotoUrl : null,
    canConfirm: !isTerminal(order.status) && order.status === "delivered" && viewer.id === order.publisherId,
    canCancel: order.status === "open" && viewer.id === order.publisherId,
    canConfirmBudget: order.status === "picked" && viewer.id === order.publisherId && order.actualFen !== null,
    /** v1.10 · 代买额度不够：接单跑腿者可拒单（整单取消、全额退回、不扣信用） */
    canRefuseBuy: order.bizType === "buy" && isAssignedRunner && order.status === "accepted",
    /** v1.10 · 捎带额度不够：接单跑腿者可拒绝捎带（外卖主单继续，预算退回） */
    canRejectAddons:
      order.bizType === "food" &&
      isAssignedRunner &&
      (order.status === "accepted" || order.status === "picked"),
    /** 预订单（v1.5）：到点餐还没到，接单跑腿者可反馈「餐未送达」（信用 −10，单回大厅） */
    canReportUnarrived:
      order.expectDeliveryAt !== null &&
      isAssignedRunner &&
      (order.status === "accepted" || order.status === "picked"),
    viewAsAdmin: isAdmin,
  };
}

/** 捎带项视图（v1.3）：标题与预算对所有能看详情的人可见；实付只对发布者/接单跑腿者可见 */
export function toAddonView(
  addon: { id: number; title: string; budgetFen: number; actualFen: number | null; status: string },
  viewerIsParticipant: boolean
) {
  return {
    id: addon.id,
    title: addon.title,
    budgetFen: addon.budgetFen,
    status: addon.status,
    actualFen: viewerIsParticipant ? addon.actualFen : null,
  };
}

/** 钱包：余额 + 冻结 + 流水（append-only 原样） */
export function toWallet(input: {
  balanceFen: number;
  frozenFen: number;
  logs: { id: number; orderId: number | null; type: string; amountFen: number; memo: string | null; createdAt: Date }[];
}) {
  return {
    balanceFen: input.balanceFen,
    frozenFen: input.frozenFen,
    availableFen: input.balanceFen,
    logs: input.logs,
  };
}
