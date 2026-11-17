import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { batches, orders, walletLogs } from "@/server/db/schema";
import { BONUS_MIN_BATCH_SIZE, calcBonusFen } from "./constants";
import { Errors } from "./errors";
import { expireSweep } from "./orders";
import { toOrderDetail } from "./serializers";
import { now } from "@/server/clock";

/**
 * 批次（P4，Step 4）：一次勾选 2–3 单一起带走。
 * 本文件只负责「读模型 + 开关」，接单/履约的写路径仍在 orders.ts（状态机唯一入口）。
 */

const ACTIVE_STATUSES = ["accepted", "picked", "delivered"] as const;
const FAILED_STATUSES = ["expired", "cancelled", "abnormal"] as const;

export interface BatchTotals {
  /** 批次里的订单数 */
  orderCount: number;
  /** 还在手上的（accepted / picked / delivered） */
  activeCount: number;
  /** 已结算完成 */
  settledCount: number;
  /** 没跑成（过期 / 取消 / 异常） */
  failedCount: number;
  /** Σ 跑腿者应得 Y（不含加成） */
  expectedRewardFen: number;
  /** 满足加成条件时的 Σ bonus */
  potentialBonusFen: number;
  /** 本趟理论到手 = Y + bonus */
  expectedTotalFen: number;
  /** 已经落袋（按 wallet_logs 的 income + bonus 汇总） */
  earnedFen: number;
  /** 已经落袋的加成部分 */
  earnedBonusFen: number;
}

/** 批次详情：跑腿者本人 / 批次内发布者 / 管理员可看 */
export async function getBatchDetail(batchId: number, viewerId: number, viewerIsAdmin = false) {
  if (!Number.isInteger(batchId) || batchId <= 0) throw Errors.notFound("批次不存在");
  // 惰性过期：进批次页也要先把到点的单判掉，否则「本趟赚」会读到过期未处理的单
  await expireSweep();

  const [batch] = await db.select().from(batches).where(eq(batches.id, batchId)).limit(1);
  if (!batch) throw Errors.notFound("批次不存在");

  const rows = await db.select().from(orders).where(eq(orders.batchId, batchId)).orderBy(asc(orders.id));
  const isRunner = batch.runnerId === viewerId;
  const isPublisher = rows.some((r) => r.publisherId === viewerId);
  if (!isRunner && !isPublisher && !viewerIsAdmin) throw Errors.forbidden("只有本批次的参与者能看批次详情");

  const isTerminal = (s: string) => (FAILED_STATUSES as readonly string[]).includes(s) || s === "completed";
  const activeCount = rows.filter((r) => (ACTIVE_STATUSES as readonly string[]).includes(r.status)).length;
  const settledCount = rows.filter((r) => r.status === "completed").length;
  const failedCount = rows.filter((r) => (FAILED_STATUSES as readonly string[]).includes(r.status)).length;

  // 已落袋：只统计接单跑腿者在本批次订单上的 income + bonus（报销与退款不算「赚」）
  const logs = rows.length
    ? await db
        .select({ orderId: walletLogs.orderId, type: walletLogs.type, amountFen: walletLogs.amountFen, memo: walletLogs.memo })
        .from(walletLogs)
        .where(
          and(
            inArray(
              walletLogs.orderId,
              rows.map((r) => r.id)
            ),
            eq(walletLogs.userId, batch.runnerId)
          )
        )
    : [];
  let earnedFen = 0;
  let earnedBonusFen = 0;
  const earnedByOrder = new Map<number, number>();
  for (const l of logs) {
    if (l.type !== "income" && l.type !== "bonus") continue;
    // 垫付报销也是 income 类型，但那是代垫商品的钱，不是「这趟赚的」
    if (l.type === "income" && (l.memo ?? "").startsWith("垫付报销")) continue;
    earnedFen += l.amountFen;
    if (l.type === "bonus") earnedBonusFen += l.amountFen;
    if (l.orderId != null) earnedByOrder.set(l.orderId, (earnedByOrder.get(l.orderId) ?? 0) + l.amountFen);
  }

  // 加成资格：同批次 ≥3 单且同楼栋（acceptBatch 已强制单楼栋，这里再判一次防止脏数据）
  const sameBuilding =
    rows.length >= BONUS_MIN_BATCH_SIZE && new Set(rows.map((r) => r.dropBuilding)).size === 1;
  const expectedRewardFen = rows.reduce((s, r) => s + r.runnerRewardFen, 0);
  const potentialBonusFen = sameBuilding
    ? rows.reduce((s, r) => s + calcBonusFen(r.runnerRewardFen), 0)
    : 0;

  const totals: BatchTotals = {
    orderCount: rows.length,
    activeCount,
    settledCount,
    failedCount,
    expectedRewardFen,
    potentialBonusFen,
    expectedTotalFen: expectedRewardFen + potentialBonusFen,
    earnedFen,
    earnedBonusFen,
  };

  return {
    batch: {
      id: batch.id,
      runnerId: batch.runnerId,
      orderCount: batch.orderCount,
      expectedRewardFen: batch.expectedRewardFen,
      autoComplete: batch.autoComplete,
      status: batch.status,
      createdAt: batch.createdAt,
      closedAt: batch.closedAt,
      /** 全部单都已终态才算「跑完」 */
      allDone: rows.length > 0 && rows.every((r) => isTerminal(r.status)),
      /** 送达即完成（10 分钟自动确认）只有接单者能切，且批次还没关 */
      canToggleAutoComplete: isRunner && batch.status === "active",
    },
    orders: rows.map((r) => ({
      ...toOrderDetail(r, { id: viewerId, isAdmin: viewerIsAdmin }),
      earnedFen: earnedByOrder.get(r.id) ?? 0,
    })),
    totals,
    bonusEligible: sameBuilding,
    isRunner,
  };
}

/** 批次开关：送达即完成（true = 10 分钟自动确认；false = 单 2 小时） */
export async function setBatchAutoComplete(batchId: number, runnerId: number, autoComplete: boolean) {
  const [batch] = await db.select().from(batches).where(eq(batches.id, batchId)).limit(1);
  if (!batch) throw Errors.notFound("批次不存在");
  if (batch.runnerId !== runnerId) throw Errors.forbidden("只有接单跑腿者能改批次设置");
  if (batch.status !== "active") throw Errors.conflict("批次已结束，不能再改设置");

  await db.update(batches).set({ autoComplete }).where(eq(batches.id, batchId));
  return { ok: true, autoComplete, at: await now() };
}
