import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { batches, orderAddons, orders, users } from "@/server/db/schema";
import { now, nowMs } from "@/server/clock";
import { MIN_MS, DELIVER_DEADLINE_MINUTES, ACCEPT_DEADLINE_MINUTES } from "./durations";
import {
  ADDON_MAX_BUDGET_FEN,
  ADDON_MAX_ITEMS,
  ADDON_MIN_BUDGET_FEN,
  ADDON_TOTAL_MAX_FEN,
  BATCH_MIN_GAP_MINUTES,
  BATCH_PICKUP_STEP_MINUTES,
  CREDIT_ABANDON_PENALTY,
  CREDIT_MIN_ACCEPT,
  CREDIT_TIMEOUT_PENALTY,
  CREDIT_UNARRIVED_PENALTY,
  CREDIT_VENDOR_LATE_PENALTY,
  PUBLISHER_MAX_OPEN,
  REWARD_MAX_FEN,
  REWARD_MIN_FEN,
  SCHEDULE_MAX_LEAD_MINUTES,
  SCHEDULE_MIN_LEAD_MINUTES,
  calcRunnerRewardFen,
  runnerMaxActive,
} from "./constants";
import { Errors } from "./errors";
import { assertCan } from "./stateMachine";
import {
  adjustCredit,
  freezeFen,
  notify,
  recordEvent,
  refundEscrow,
  settleCompletion,
  type Executor,
} from "./ledger";
import type { BizType, OrderStatus } from "./types";

/** 事务包装：统一把 drizzle tx 适配成规则层 Executor */
export async function withTx<T>(fn: (tx: Executor) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => fn(tx as unknown as Executor));
}

export type OrderRow = typeof orders.$inferSelect;

export interface CreateOrderInput {
  bizType: BizType;
  pickupPoint: string;
  dropBuilding: string;
  dropFloor?: number | null;
  dropRoom?: string | null;
  phoneTail?: string | null;
  note?: string | null;
  itemDesc?: string | null;
  photoUrls?: string[];
  rewardFen: number;
  /** buy：采购额度（分）；food 由 addons 预算合计推导，忽略该字段 */
  budgetFen?: number;
  /** food：捎带项（v1.3）。如「可乐 1 瓶 / 预算 3.5 元」，预算随主单一起冻结 */
  addons?: { title?: string; budgetFen?: number }[];
  acceptMinutes?: number;
  /** 预订单（v1.5）：距现在多少分钟后送达。null/缺省 = 立即单 */
  expectDeliveryMinutes?: number | null;
}

export interface AddonInput {
  title: string;
  budgetFen: number;
}

/** 校验并规范化捎带项入参（允许空数组；buy 单不允许捎带项） */
export function normalizeAddons(raw: CreateOrderInput["addons"]): AddonInput[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw Errors.invalid("捎带项格式不正确");
  const clean = raw
    .map((a) => ({ title: String(a?.title ?? "").trim(), budgetFen: Number(a?.budgetFen) }))
    .filter((a) => a.title.length > 0 || Number.isFinite(a.budgetFen));
  if (clean.length === 0) return [];
  if (clean.length > ADDON_MAX_ITEMS) throw Errors.invalid(`捎带项最多 ${ADDON_MAX_ITEMS} 件`);
  let total = 0;
  for (const a of clean) {
    if (!a.title) throw Errors.invalid("请填写捎带项名称");
    if (a.title.length > 20) throw Errors.invalid("捎带项名称最多 20 个字");
    if (!Number.isInteger(a.budgetFen) || a.budgetFen < ADDON_MIN_BUDGET_FEN) {
      throw Errors.invalid(`「${a.title}」的预算至少 ${ADDON_MIN_BUDGET_FEN / 100} 元`);
    }
    if (a.budgetFen > ADDON_MAX_BUDGET_FEN) {
      throw Errors.invalid(`「${a.title}」的预算不能超过 ${ADDON_MAX_BUDGET_FEN / 100} 元`);
    }
    total += a.budgetFen;
  }
  if (total > ADDON_TOTAL_MAX_FEN) throw Errors.invalid(`捎带预算合计不能超过 ${ADDON_TOTAL_MAX_FEN / 100} 元`);
  return clean;
}

function orderCode(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SL-${y}${m}${d}-${rand}`;
}

/** A1 · 发布：校验 → 冻结 → 上架（同一事务，失败整体回滚） */
export async function createOrder(publisherId: number, input: CreateOrderInput): Promise<OrderRow> {
  if (!Number.isInteger(input.rewardFen) || input.rewardFen < REWARD_MIN_FEN || input.rewardFen > REWARD_MAX_FEN) {
    throw Errors.invalid(`赏金需在 ${REWARD_MIN_FEN / 100}–${REWARD_MAX_FEN / 100} 元之间`);
  }
  const bizType: BizType = input.bizType === "buy" ? "buy" : "food";
  const addons = bizType === "food" ? normalizeAddons(input.addons) : [];
  const addonBudgetFen = addons.reduce((s, a) => s + a.budgetFen, 0);
  const budgetFen = bizType === "buy" ? Math.max(0, input.budgetFen ?? 0) : addonBudgetFen;
  if (bizType === "buy" && budgetFen <= 0) throw Errors.invalid("代买订单必须填写采购额度");
  if (!input.pickupPoint?.trim()) throw Errors.invalid("请填写取餐/取货点");
  if (!input.dropBuilding?.trim()) throw Errors.invalid("请填写送达楼栋");
  const acceptMinutes = input.acceptMinutes ?? ACCEPT_DEADLINE_MINUTES[1];
  if (!(ACCEPT_DEADLINE_MINUTES as readonly number[]).includes(acceptMinutes)) {
    throw Errors.invalid("接单截止时间只能是 5 / 10 / 15 / 30 分钟");
  }
  // 预订单（v1.5）：提前下单，指定预计送达时间；必须给跑腿者留足余量
  const scheduleMinutes =
    input.expectDeliveryMinutes == null || input.expectDeliveryMinutes === 0 ? null : Number(input.expectDeliveryMinutes);
  if (scheduleMinutes !== null) {
    if (!Number.isInteger(scheduleMinutes)) throw Errors.invalid("预约送达时间格式不正确");
    if (scheduleMinutes < SCHEDULE_MIN_LEAD_MINUTES) {
      throw Errors.invalid(`预约送达至少要提前 ${SCHEDULE_MIN_LEAD_MINUTES} 分钟，记得给跑腿者留余量`);
    }
    if (scheduleMinutes > SCHEDULE_MAX_LEAD_MINUTES) {
      throw Errors.invalid(`预约送达最多提前 ${SCHEDULE_MAX_LEAD_MINUTES / 60} 小时`);
    }
  }

  return withTx(async (tx) => {
    const openRows = await tx
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(orders)
      .where(and(eq(orders.publisherId, publisherId), eq(orders.status, "open")));
    if ((openRows[0]?.n ?? 0) >= PUBLISHER_MAX_OPEN) {
      throw Errors.conflict(`同时最多可发布 ${PUBLISHER_MAX_OPEN} 条待接单，请等待已有订单完成或取消其中一条`);
    }

    const t = await now();
    const expectDeliveryAt = scheduleMinutes === null ? null : new Date(t.getTime() + scheduleMinutes * MIN_MS);
    const totalFen = input.rewardFen + budgetFen;
    const [created] = await tx
      .insert(orders)
      .values({
        code: orderCode(t),
        publisherId,
        bizType,
        status: "open",
        pickupPoint: input.pickupPoint.trim(),
        dropBuilding: input.dropBuilding.trim(),
        dropFloor: input.dropFloor ?? null,
        dropRoom: input.dropRoom ?? null,
        phoneTail: input.phoneTail ?? null,
        note: input.note ?? null,
        itemDesc: input.itemDesc ?? null,
        photoUrls: input.photoUrls ?? [],
        rewardFen: input.rewardFen,
        runnerRewardFen: calcRunnerRewardFen(input.rewardFen),
        budgetFen,
        expectDeliveryAt,
        // 预订单的接单截止 = 预约送达时间（到点还没人接就自动过期退款）；即时单按发布时选的分钟数
        acceptDeadlineAt: expectDeliveryAt ?? new Date(t.getTime() + acceptMinutes * MIN_MS),
        createdAt: t,
      })
      .returning();

    await freezeFen(tx, {
      userId: publisherId,
      orderId: created.id,
      amountFen: totalFen,
      memo:
        bizType === "buy"
          ? `发布代买：奖励 ${input.rewardFen} + 额度 ${budgetFen}`
          : addons.length
            ? `发布外卖单：奖励 ${input.rewardFen} + 捎带预算 ${addonBudgetFen}`
            : scheduleMinutes !== null
              ? `预约跑腿单：奖励 ${input.rewardFen}（${scheduleMinutes} 分钟后送达）`
              : "发布跑腿单",
    });
    if (addons.length) {
      await tx.insert(orderAddons).values(
        addons.map((a) => ({
          orderId: created.id,
          title: a.title,
          budgetFen: a.budgetFen,
        }))
      );
    }
    await recordEvent(tx, { orderId: created.id, type: "created", actorId: publisherId });
    return created;
  });
}

/** 读取订单（事务内） */
export async function getOrder(tx: Executor, orderId: number): Promise<OrderRow> {
  const rows = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!rows[0]) throw Errors.notFound();
  return rows[0];
}

async function requireUser(tx: Executor, userId: number) {
  const rows = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!rows[0]) throw Errors.notFound("用户不存在");
  return rows[0];
}

async function activeCount(tx: Executor, runnerId: number): Promise<number> {
  const rows = await tx
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(orders)
    .where(and(eq(orders.runnerId, runnerId), inArray(orders.status, ["accepted", "picked", "delivered"])));
  return rows[0]?.n ?? 0;
}

async function assertRunnerCanAccept(tx: Executor, runnerId: number, extra = 1): Promise<void> {
  const runner = await requireUser(tx, runnerId);
  if (runner.creditScore < CREDIT_MIN_ACCEPT) {
    throw Errors.forbidden(`信用分 ${runner.creditScore} 低于 ${CREDIT_MIN_ACCEPT}，暂时不能接单`);
  }
  const active = await activeCount(tx, runnerId);
  const max = runnerMaxActive(runner.creditScore);
  if (active + extra > max) {
    throw Errors.conflict(`同时最多 ${max} 单在手上（当前 ${active} 单）`);
  }
}

/**
 * v1.10 · 性别硬规则（园区安全）：女生发布的订单，男跑手一律不能接。
 * 只单向限制（男跑手 × 女发布者），女跑手接男生的单不受影响。
 */
async function assertGenderAllowed(tx: Executor, runnerId: number, publisherId: number): Promise<void> {
  const [rows, runner] = await Promise.all([
    tx.select({ dormGender: users.dormGender }).from(users).where(eq(users.id, publisherId)).limit(1),
    requireUser(tx, runnerId),
  ]);
  const publisherGender = rows[0]?.dormGender ?? null;
  if (runner.dormGender === "male" && publisherGender === "female") {
    throw Errors.forbidden("该订单由女用户发布，按园区安全规定男用户不可接单");
  }
}

/**
 * v1.10 · 批次时间冲突（用户口径）：
 * 「最后一个取货点取完的时间」与「同批最早一单的送达截止」之差必须 ≥ 5 分钟，
 * 否则为了最后一件货，第一单必然超时。
 * 取货耗时估算：不同取货点每多一个 +3 分钟（同取餐点一次取完不计）。
 */
export function batchTimeConflict(
  rows: {
    code: string;
    pickupPoint: string;
    expectDeliveryAt: Date | null;
  }[],
  nowValue: number,
): string | null {
  if (rows.length < 2) return null;
  const pickupPoints = new Set(rows.map((r) => r.pickupPoint.trim()));
  const lastPickupAt = nowValue + Math.max(0, pickupPoints.size - 1) * BATCH_PICKUP_STEP_MINUTES * MIN_MS;
  const deadlines = rows
    .map((r) => ({
      code: r.code,
      at: (r.expectDeliveryAt ?? new Date(nowValue + DELIVER_DEADLINE_MINUTES * MIN_MS)).getTime(),
    }))
    .sort((a, b) => a.at - b.at);
  const earliest = deadlines[0];
  const gapMs = earliest.at - lastPickupAt;
  if (gapMs < BATCH_MIN_GAP_MINUTES * MIN_MS) {
    const gapMin = Math.max(0, Math.round(gapMs / MIN_MS));
    return `同批最早一单「${earliest.code}」只剩 ${gapMin} 分钟就要送达，取完 ${pickupPoints.size} 个取货点后不足 ${BATCH_MIN_GAP_MINUTES} 分钟，请少带一单或分开接`;
  }
  return null;
}

function assertBatchTimeFits(rows: { code: string; pickupPoint: string; expectDeliveryAt: Date | null }[], t: Date): void {
  const msg = batchTimeConflict(rows, t.getTime());
  if (msg) throw Errors.conflict(msg);
}

/** A2 · 单接：条件 UPDATE，affected=0 → 返回「已被接走 / 已过截止」 */
export async function acceptOrder(orderId: number, runnerId: number): Promise<OrderRow> {
  // 先做一次惰性过期：万一大厅数据旧了，接单瞬间已过截止 → 走独立事务退款后再报「已超过接单截止时间」
  const [pre] = await db
    .select({ status: orders.status, acceptDeadlineAt: orders.acceptDeadlineAt })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (pre?.status === "open" && pre.acceptDeadlineAt && pre.acceptDeadlineAt.getTime() <= (await now()).getTime()) {
    await expireSweep();
    throw Errors.conflict("接单失败：该订单已超过接单截止时间");
  }

  return withTx(async (tx) => {
    const order = await getOrder(tx, orderId);
    if (order.publisherId === runnerId) throw Errors.forbidden("不能接自己发布的订单");
    const t = await now();
    if (order.status !== "open") throw Errors.conflict("接单失败：该订单已被其他跑腿者接单");
    if (order.acceptDeadlineAt && order.acceptDeadlineAt.getTime() <= t.getTime()) {
      // 不在本事务里改状态（抛错会回滚）：过期由 expireSweep 在独立事务里处理
      throw Errors.conflict("接单失败：该订单已超过接单截止时间");
    }
    await assertGenderAllowed(tx, runnerId, order.publisherId);
    await assertRunnerCanAccept(tx, runnerId);

    const [updated] = await tx
      .update(orders)
      .set({
        status: "accepted",
        runnerId,
        acceptedAt: t,
        // 预订单：送达截止 = 预约送达时间（承诺时刻）；即时单：接单后 20 分钟
        deliverDeadlineAt: order.expectDeliveryAt ?? new Date(t.getTime() + DELIVER_DEADLINE_MINUTES * MIN_MS),
        batchId: null,
      })
      .where(and(eq(orders.id, orderId), eq(orders.status, "open")))
      .returning();
    if (!updated) throw Errors.conflict("接单失败：该订单已被其他跑腿者接单");

    await recordEvent(tx, { orderId, type: "accepted", actorId: runnerId });
    await notify(tx, {
      userId: order.publisherId,
      orderId,
      content: order.expectDeliveryAt
        ? `你的预约单 ${order.code} 已被接单，跑腿者会在 ${order.expectDeliveryAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 前送达`
        : `你的订单 ${order.code} 已被接单，跑腿者会尽快取餐`,
    });
    return updated;
  });
}

/** A2 · 批量接单：全部成功或全部回滚（单条失败 → 抛错 → tx 回滚） */
export async function acceptBatch(orderIds: number[], runnerId: number): Promise<{ batchId: number; orders: OrderRow[] }> {
  if (orderIds.length < 2) throw Errors.invalid("批量接单至少选择 2 单");
  if (new Set(orderIds).size !== orderIds.length) throw Errors.invalid("订单重复");

  return withTx(async (tx) => {
    const rows = await tx.select().from(orders).where(inArray(orders.id, orderIds));
    if (rows.length !== orderIds.length) throw Errors.notFound("部分订单不存在");
    for (const row of rows) {
      if (row.status !== "open") throw Errors.conflict(`「${row.code}」已被其他跑腿者接单，请刷新大厅`);
      if (row.publisherId === runnerId) throw Errors.forbidden("不能接自己发布的订单");
    }
    const buildings = new Set(rows.map((r) => r.dropBuilding));
    if (buildings.size > 1) throw Errors.invalid("批量接单需同一楼栋");
    const t = await now();
    for (const row of rows) {
      if (row.acceptDeadlineAt && row.acceptDeadlineAt.getTime() <= t.getTime()) {
        throw Errors.conflict(`「${row.code}」已超过接单截止时间，请刷新大厅`);
      }
      await assertGenderAllowed(tx, runnerId, row.publisherId);
    }
    // v1.10 · 时间冲突：最后一个取货点取完 → 同批最早一单的送达截止，必须还剩 ≥5 分钟
    assertBatchTimeFits(rows, t);
    await assertRunnerCanAccept(tx, runnerId, rows.length);

    const [batch] = await tx
      .insert(batches)
      .values({
        runnerId,
        orderCount: rows.length,
        expectedRewardFen: rows.reduce((sum, r) => sum + r.runnerRewardFen, 0),
        autoComplete: true,
        status: "active",
        createdAt: t,
      })
      .returning();

    // 逐单条件更新（预订单的送达截止各不相同：= 各自的预约时间；即时单 = 接单后 20 分钟）。
    // 任一单被抢先 → 抛错 → 整个事务回滚，保证「全成功或全失败」。
    const updated: OrderRow[] = [];
    for (const row of rows) {
      const [one] = await tx
        .update(orders)
        .set({
          status: "accepted",
          runnerId,
          batchId: batch.id,
          acceptedAt: t,
          deliverDeadlineAt: row.expectDeliveryAt ?? new Date(t.getTime() + DELIVER_DEADLINE_MINUTES * MIN_MS),
        })
        .where(and(eq(orders.id, row.id), eq(orders.status, "open")))
        .returning();
      if (!one) throw Errors.conflict("批量接单失败：所选订单中已有订单被其他跑腿者接单");
      updated.push(one);
    }

    for (const row of updated) {
      await recordEvent(tx, { orderId: row.id, type: "accepted", actorId: runnerId, payload: { batchId: batch.id } });
      await notify(tx, { userId: row.publisherId, orderId: row.id, content: `你的订单 ${row.code} 已被批量接单` });
    }
    return { batchId: batch.id, orders: updated };
  });
}

/** A3 · 取到货：accepted → picked */
export async function pickOrder(orderId: number, runnerId: number): Promise<OrderRow> {
  return withTx(async (tx) => {
    const order = await getOrder(tx, orderId);
    assertCan("pick", order, runnerId);
    const t = await now();
    const [updated] = await tx
      .update(orders)
      .set({ status: "picked", pickedAt: t })
      .where(and(eq(orders.id, orderId), eq(orders.status, "accepted")))
      .returning();
    if (!updated) throw Errors.conflict("订单状态已变化，请刷新");
    await recordEvent(tx, { orderId, type: "picked", actorId: runnerId });
    await notify(tx, { userId: order.publisherId, orderId, content: `订单 ${order.code} 已取到，正在送往你的位置` });
    return updated;
  });
}

/** A3 · 送达：picked → delivered（必填凭证照），写 auto_confirm_at */
export async function deliverOrder(orderId: number, runnerId: number, proofPhotoUrl: string): Promise<OrderRow> {
  if (!proofPhotoUrl?.trim()) throw Errors.invalid("送达必须上传凭证照片");
  return withTx(async (tx) => {
    const order = await getOrder(tx, orderId);
    assertCan("deliver", order, runnerId);
    // 改（m02503）：捎带项必须先逐件确认「买了没 / 实付多少」，否则送达后预算会被当成全退，钱款算错
    const pendingAddons = (await addonsOf(tx, orderId)).filter((a) => a.status === "pending");
    if (order.bizType === "food" && pendingAddons.length > 0) {
      throw Errors.invalid(
        `请先确认「${pendingAddons.map((a) => a.title).join("、")}」买了没、实付多少，再点送达`
      );
    }
    const t = await now();
    const batch = order.batchId
      ? (await tx.select().from(batches).where(eq(batches.id, order.batchId)).limit(1))[0]
      : undefined;
    const autoMs = batch?.autoComplete ? 10 * MIN_MS : 2 * 60 * MIN_MS;
    const [updated] = await tx
      .update(orders)
      .set({
        status: "delivered",
        deliveredAt: t,
        proofPhotoUrl,
        autoConfirmAt: new Date(t.getTime() + autoMs),
      })
      .where(and(eq(orders.id, orderId), eq(orders.status, "picked")))
      .returning();
    if (!updated) throw Errors.conflict("订单状态已变化，请刷新");
    await recordEvent(tx, { orderId, type: "delivered", actorId: runnerId, payload: { proofPhotoUrl } });
    await notify(tx, {
      userId: order.publisherId,
      orderId,
      content: batch?.autoComplete
        ? `订单 ${order.code} 已送达（批次 10 分钟后自动确认）`
        : `订单 ${order.code} 已送达，请确认收货`,
    });
    return updated;
  });
}

/** A3 · 取不到餐：accepted → open（不扣信用，清 runner/batch，重置接单截止） */
export async function markUnpickable(orderId: number, runnerId: number): Promise<OrderRow> {
  return withTx(async (tx) => {
    const order = await getOrder(tx, orderId);
    assertCan("unpickable", order, runnerId);
    const t = await now();
    const reopened = await reopen(tx, order, {
      abnormalReason: "取不到餐",
      acceptMinutes: ACCEPT_DEADLINE_MINUTES[1],
    });
    await recordEvent(tx, { orderId, type: "unpickable", actorId: runnerId, payload: { reason: "取不到餐" } });
    await notify(tx, {
      userId: order.publisherId,
      orderId,
      content: `订单 ${order.code} 取不到餐，已重新上架，可以再等等或取消`,
    });
    return reopened ?? { ...order, status: "open" as OrderStatus, acceptDeadlineAt: new Date(t.getTime() + 10 * MIN_MS) };
  });
}

/**
 * A3 · 预约到点餐还没到手（跑腿者主动反馈）：accepted|picked → open
 *
 * 责任分两种（v1.7，用户 m03188/m03192 口径）：
 * - `vendor_late`：商家/外卖骑手没送到，跑腿者去取了也取不到 → **扣发单者**信用，
 *   因为发单时没给商家出餐与骑手配送留够余量；跑腿者不扣分。
 * - `runner_late`（未指定时的默认，沿用 v1.5）：跑腿者自己送晚了 → 扣跑腿者信用 −10。
 * 两种都会把订单重新上架，并附上一句跑腿者留言（note）通知发单者，
 * 让发单者知道「是外卖真的晚了」而不是跑腿者故意不送。
 */
export type UnarrivedReason = "vendor_late" | "runner_late";

export async function reportUnarrived(
  orderId: number,
  runnerId: number,
  opts: { reason?: UnarrivedReason; note?: string } = {}
): Promise<OrderRow> {
  return withTx(async (tx) => {
    const order = await getOrder(tx, orderId);
    assertCan("unarrived", order, runnerId);
    if (!order.expectDeliveryAt) throw Errors.invalid("只有预约单才有「餐未送达」这个反馈");
    const reason: UnarrivedReason = opts.reason === "vendor_late" ? "vendor_late" : "runner_late";
    const note = (opts.note ?? "").trim().slice(0, 40);
    const t = await now();
    const [updated] = await tx
      .update(orders)
      .set({
        status: "open",
        runnerId: null,
        batchId: null,
        acceptedAt: null,
        pickedAt: null,
        deliverDeadlineAt: null,
        abnormalReason:
          reason === "vendor_late" ? "外卖没送到（商家/骑手延迟）" : "餐未送达（跑腿者送晚了）",
        acceptDeadlineAt: new Date(t.getTime() + ACCEPT_DEADLINE_MINUTES[1] * MIN_MS),
      })
      .where(and(eq(orders.id, orderId), inArray(orders.status, ["accepted", "picked"])))
      .returning();
    if (!updated) throw Errors.conflict("订单状态已变化，请刷新");
    await resetAddons(tx, orderId);

    const penalty = reason === "vendor_late" ? CREDIT_VENDOR_LATE_PENALTY : CREDIT_UNARRIVED_PENALTY;
    const punishedUserId = reason === "vendor_late" ? order.publisherId : runnerId;
    await adjustCredit(tx, punishedUserId, -penalty);
    await recordEvent(tx, {
      orderId,
      type: reason === "vendor_late" ? "vendor_late" : "unarrived",
      actorId: runnerId,
      payload: { reason, penalty: -penalty, punishedUserId, note },
    });

    if (reason === "vendor_late") {
      await notify(tx, {
        userId: order.publisherId,
        orderId,
        content:
          `跑腿者反馈：到了预约时间外卖还没送到，订单 ${order.code} 已重新上架。` +
          `这次扣的是发单者信用 −${penalty}（下单时没给商家/骑手留够余量）` +
          (note ? `；跑腿者留言：${note}` : ""),
      });
      await notify(tx, {
        userId: runnerId,
        orderId,
        content: `你反馈「外卖没送到」已记录，信用分不扣；订单 ${order.code} 已回大厅`,
      });
    } else {
      await notify(tx, {
        userId: order.publisherId,
        orderId,
        content:
          `跑腿者反馈「餐未送达」：订单 ${order.code} 已重新上架，你可以再等等或取消` +
          (note ? `；跑腿者留言：${note}` : ""),
      });
    }
    if (order.batchId) await maybeCloseBatch(tx, order.batchId);
    return updated;
  });
}

/** A3 · 放弃接单：accepted → open，信用 −5 */
export async function abandonOrder(orderId: number, runnerId: number): Promise<OrderRow> {
  return withTx(async (tx) => {
    const order = await getOrder(tx, orderId);
    assertCan("abandon", order, runnerId);
    const reopened = await reopen(tx, order, { acceptMinutes: ACCEPT_DEADLINE_MINUTES[1] });
    await adjustCredit(tx, runnerId, -CREDIT_ABANDON_PENALTY);
    await recordEvent(tx, {
      orderId,
      type: "abandon",
      actorId: runnerId,
      payload: { penalty: -CREDIT_ABANDON_PENALTY },
    });
    await notify(tx, { userId: order.publisherId, orderId, content: `订单 ${order.code} 被跑腿者放弃，已重新上架` });
    return reopened ?? order;
  });
}

/** 把 accepted 订单放回大厅（清 runner/batch、重设接单截止），返回更新后的行 */
async function reopen(
  tx: Executor,
  order: OrderRow,
  opts: { acceptMinutes: number; abnormalReason?: string | null }
): Promise<OrderRow | null> {
  const t = await now();
  const [updated] = await tx
    .update(orders)
    .set({
      status: "open",
      runnerId: null,
      batchId: null,
      acceptedAt: null,
      deliverDeadlineAt: null,
      abnormalReason: opts.abnormalReason ?? order.abnormalReason,
      acceptDeadlineAt: new Date(t.getTime() + opts.acceptMinutes * MIN_MS),
    })
    .where(and(eq(orders.id, order.id), eq(orders.status, "accepted")))
    .returning();
  // 换人重接：上一任跑腿者上报过的捎带实付作废，回到待买状态（预算冻结额不变）
  if (updated) await resetAddons(tx, order.id);
  return updated ?? null;
}

/** 捎带项回到待买状态（重新上架 / 换人接单时调用） */
export async function resetAddons(tx: Executor, orderId: number): Promise<void> {
  await tx
    .update(orderAddons)
    .set({ status: "pending", actualFen: null })
    .where(eq(orderAddons.orderId, orderId));
  await tx.update(orders).set({ actualFen: null }).where(and(eq(orders.id, orderId), eq(orders.bizType, "food")));
}

/** 读订单的全部捎带项（按 id 升序，展示顺序稳定） */
export async function addonsOf(tx: Executor, orderId: number) {
  return tx.select().from(orderAddons).where(eq(orderAddons.orderId, orderId)).orderBy(asc(orderAddons.id));
}

/** A3 · 发布者取消（仅 open）：全额退 */
export async function cancelOrder(orderId: number, publisherId: number, reason?: string): Promise<OrderRow> {
  return withTx(async (tx) => {
    const order = await getOrder(tx, orderId);
    assertCan("cancel", order, publisherId);
    const [updated] = await tx
      .update(orders)
      .set({ status: "cancelled", cancelReason: reason ?? "发布者取消", completedAt: await now() })
      .where(and(eq(orders.id, orderId), eq(orders.status, "open")))
      .returning();
    if (!updated) throw Errors.conflict("订单状态已变化，请刷新");
    await refundEscrow(tx, { orderId, publisherId, memo: "发布者取消退回" });
    await recordEvent(tx, { orderId, type: "cancelled", actorId: publisherId, payload: { reason } });
    return updated;
  });
}

/**
 * A3 · 加价重发（仅 expired）：终态不可原地复活 → 新建 linked 订单，旧单保持 expired。
 * extraFen 为「加价」金额（新单奖励 = 原奖励 + extra）。
 */
export async function bumpOrder(
  orderId: number,
  publisherId: number,
  extraFen: number
): Promise<{ previous: OrderRow; created: OrderRow }> {
  return withTx(async (tx) => {
    const previous = await getOrder(tx, orderId);
    assertCan("bump", previous, publisherId);
    if (!Number.isInteger(extraFen) || extraFen <= 0) throw Errors.invalid("加价金额必须大于 0");
    const rewardFen = previous.rewardFen + extraFen;
    if (rewardFen > REWARD_MAX_FEN) throw Errors.invalid(`加价后赏金不能超过 ${REWARD_MAX_FEN / 100} 元`);

    const existing = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.linkedPrevId, previous.id))
      .limit(1);
    if (existing[0]) throw Errors.conflict("该订单已加价重发过");

    const t = await now();
    const totalFen = rewardFen + previous.budgetFen;
    const [created] = await tx
      .insert(orders)
      .values({
        code: orderCode(t),
        publisherId,
        bizType: previous.bizType,
        status: "open",
        pickupPoint: previous.pickupPoint,
        dropBuilding: previous.dropBuilding,
        dropFloor: previous.dropFloor,
        dropRoom: previous.dropRoom,
        phoneTail: previous.phoneTail,
        note: previous.note,
        itemDesc: previous.itemDesc,
        photoUrls: previous.photoUrls,
        rewardFen,
        runnerRewardFen: calcRunnerRewardFen(rewardFen),
        budgetFen: previous.budgetFen,
        // 预约时点还没过就沿用（重发后仍然是同一承诺时刻），过了就降级为立即单
        expectDeliveryAt:
          previous.expectDeliveryAt && previous.expectDeliveryAt.getTime() > t.getTime() ? previous.expectDeliveryAt : null,
        acceptDeadlineAt:
          previous.expectDeliveryAt && previous.expectDeliveryAt.getTime() > t.getTime()
            ? previous.expectDeliveryAt
            : new Date(t.getTime() + ACCEPT_DEADLINE_MINUTES[1] * MIN_MS),
        linkedPrevId: previous.id,
        createdAt: t,
      })
      .returning();
    await freezeFen(tx, { userId: publisherId, orderId: created.id, amountFen: totalFen, memo: "加价重发冻结" });
    // 捎带项随单复制（预算已含在 previous.budgetFen 里，一起重新冻结）
    const prevAddons = previous.bizType === "food" ? await addonsOf(tx, previous.id) : [];
    if (prevAddons.length) {
      await tx.insert(orderAddons).values(
        prevAddons.map((a) => ({ orderId: created.id, title: a.title, budgetFen: a.budgetFen }))
      );
    }
    await recordEvent(tx, { orderId: created.id, type: "created", actorId: publisherId, payload: { linkedPrevId: previous.id } });
    return { previous, created };
  });
}

/** A4 · 确认收货（发布者 / 系统自动）：delivered → completed 并结算 */
export async function confirmDelivered(
  orderId: number,
  publisherId: number | null
): Promise<{
  order: OrderRow;
  settlement: Awaited<ReturnType<typeof settleCompletion>>;
}> {
  return withTx(async (tx) => {
    const order = await getOrder(tx, orderId);
    if (publisherId !== null) assertCan("confirm", order, publisherId);
    else if (order.status !== "delivered") throw Errors.conflict("订单不在待确认状态");
    // 改（m02503）：双方都确认后才动钱——跑腿者没确认捎带项时，发布者点确认会被拦住
    const pendingAddons = (await addonsOf(tx, orderId)).filter((a) => a.status === "pending");
    if (order.bizType === "food" && pendingAddons.length > 0) {
      throw Errors.conflict(
        `跑腿者还没确认「${pendingAddons.map((a) => a.title).join("、")}」买了没、实付多少，暂不能结算`
      );
    }
    const by = publisherId === null ? "system" : "publisher";
    const t = await now();
    const [updated] = await tx
      .update(orders)
      .set({ status: "completed", completedAt: t, confirmedBy: by })
      .where(and(eq(orders.id, orderId), eq(orders.status, "delivered")))
      .returning();
    if (!updated) throw Errors.conflict("订单状态已变化，请刷新");
    const settlement = await settleCompletion(tx, updated);
    if (updated.runnerId) await adjustCredit(tx, updated.runnerId, 1);
    if (updated.batchId) await maybeCloseBatch(tx, updated.batchId);
    await recordEvent(tx, { orderId, type: "completed", actorId: publisherId, payload: { by, ...settlement } });
    if (updated.runnerId) {
      await notify(tx, {
        userId: updated.runnerId,
        orderId,
        content: by === "system" ? `订单 ${updated.code} 已自动确认，收入到账` : `订单 ${updated.code} 已确认收货`,
      });
    }
    return { order: updated, settlement };
  });
}

/** 批次内全部订单终态后关闭批次 */
export async function maybeCloseBatch(tx: Executor, batchId: number): Promise<void> {
  const rows = await tx.select({ status: orders.status }).from(orders).where(eq(orders.batchId, batchId));
  const open = rows.some((r) => !["completed", "expired", "cancelled", "abnormal"].includes(r.status));
  if (!open) {
    await tx.update(batches).set({ status: "closed", closedAt: await now() }).where(eq(batches.id, batchId));
  }
}

/** v1.43 · 单次 sweep 最多处理多少单：剩下的留给下一次读接口，避免一次请求长时间占锁 */
const EXPIRE_SWEEP_BATCH = 50;

/**
 * 惰性过期判定（规则 8）：每次读接口前调用；也可直接跑全表。
 * - open 超 accept_deadline → expired + 全额退
 * - accepted 超 deliver_deadline → 回 open（信用 −10）；buy 且 requested → cancelled + 全额退
 * - picked 超 deliver_deadline → abnormal + 全额退 + 信用 −10
 * - delivered 超 auto_confirm_at → completed（系统自动确认）
 * 返回本次处理的订单数。
 *
 * v1.43（m00266）：以前是「一个事务扫完所有到期单」——只要有一张单的行锁被别的
 * 请求攥着，整轮 sweep 就排在锁队列里，把后面所有读接口一起拖到 statement_timeout，
 * 线上表现就是「大量 500」。现在改成逐单小事务 + `for update skip locked`：
 *   · 每单只锁它自己，账本 / 事件 / 通知仍在同一个事务里，语义不变；
 *   · 被别的事务锁住的单直接跳过（skip locked 不排队），下个请求再收；
 *   · 单笔失败（锁等待超时 / 死锁）只跳过这一单，不连累其他单。
 */
export async function expireSweep(nowValue?: Date | number): Promise<number> {
  // v1.11 · 性能：调用方已经取过模拟时间时直接传入，省掉一次往返
  const t = nowValue === undefined ? await now() : new Date(nowValue);
  const dueWhere = or(
    and(eq(orders.status, "open"), lte(orders.acceptDeadlineAt, t)),
    and(eq(orders.status, "accepted"), lte(orders.deliverDeadlineAt, t)),
    and(eq(orders.status, "picked"), lte(orders.deliverDeadlineAt, t)),
    and(eq(orders.status, "delivered"), lte(orders.autoConfirmAt, t)),
  );

  // 先无事务探一下（绝大多数读请求一条都没有，省掉 BEGIN/COMMIT 与行锁）
  const candidates = await db
    .select({ id: orders.id })
    .from(orders)
    .where(dueWhere)
    .limit(EXPIRE_SWEEP_BATCH);
  if (candidates.length === 0) return 0;

  let handled = 0;
  for (const { id } of candidates) {
    const done = await withTx(async (tx) => {
      // skip locked：这张单正被别的事务改（例如发布者刚点确认收货）就先放过，
      // 绝不排队等锁；下一轮读接口它自然会重新进入 due。
      const [order] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.id, id), dueWhere))
        .limit(1)
        .for("update", { skipLocked: true });
      if (!order) return 0;
      return sweepOne(tx, order, t);
    }).catch((err: unknown) => {
      console.warn("[expireSweep] 单笔跳过", id, err instanceof Error ? err.message : err);
      return 0;
    });
    handled += done;
  }
  return handled;
}

/** 单笔到期单的状态分发（进入时已持有这一行的 FOR UPDATE 锁） */
async function sweepOne(tx: Executor, order: OrderRow, t: Date): Promise<number> {
  if (order.status === "open") {
    const done = await transitionTo(tx, order, "expired", {
      memo: "接单超时退回",
      event: "expired",
      notifyPublisher: order.expectDeliveryAt
        ? `预约单 ${order.code} 到点还没人接单，已自动取消，冻结金额全额退回`
        : `订单 ${order.code} 超时未接单，冻结金额已退回`,
    });
    return done ? 1 : 0;
  }
  if (order.status === "accepted") return sweepAcceptedTimeout(tx, order, t);
  if (order.status === "picked") return sweepPickedTimeout(tx, order, t);
  if (order.status === "delivered") return sweepAutoConfirm(tx, order, t);
  return 0;
}

/** accepted 超送达截止：buy 且已 request 超额度 → cancelled + 全额退；否则回 open（信用 −10） */
async function sweepAcceptedTimeout(tx: Executor, order: OrderRow, t: Date): Promise<number> {
  if (order.bizType === "buy" && order.budgetStatus === "requested") {
    const [updated] = await tx
      .update(orders)
      .set({ status: "cancelled", budgetStatus: "abandoned", cancelReason: "超额度未获同意，超时取消", completedAt: t })
      .where(and(eq(orders.id, order.id), eq(orders.status, "accepted")))
      .returning();
    if (!updated) return 0;
    await refundEscrow(tx, { orderId: order.id, publisherId: order.publisherId, memo: "超额度未确认，全额退款" });
    await recordEvent(tx, { orderId: order.id, type: "cancelled", payload: { reason: "budget_abandoned" } });
    for (const uid of [order.publisherId, order.runnerId].filter((x): x is number => !!x)) {
      await notify(tx, { userId: uid, orderId: order.id, content: `订单 ${order.code} 超额度未处理，已取消并全额退款` });
    }
    return 1;
  }
  const [updated] = await tx
    .update(orders)
    .set({
      status: "open",
      runnerId: null,
      batchId: null,
      acceptedAt: null,
      deliverDeadlineAt: null,
      acceptDeadlineAt: new Date(t.getTime() + ACCEPT_DEADLINE_MINUTES[1] * MIN_MS),
      abnormalReason: "超时未送达",
    })
    .where(and(eq(orders.id, order.id), eq(orders.status, "accepted")))
    .returning();
  if (!updated) return 0;
  if (order.runnerId) await adjustCredit(tx, order.runnerId, -CREDIT_TIMEOUT_PENALTY);
  await recordEvent(tx, { orderId: order.id, type: "timeout_released", payload: { status: "open" } });
  await notify(tx, {
    userId: order.publisherId,
    orderId: order.id,
    content: order.expectDeliveryAt
      ? `预约单 ${order.code} 到点仍未送达，已重新上架（可再等等或取消退款）`
      : `订单 ${order.code} 超时未送达，已重新上架`,
  });
  if (order.runnerId) {
    await notify(tx, { userId: order.runnerId, orderId: order.id, content: `订单 ${order.code} 超时未送达，已释放（信用 −${CREDIT_TIMEOUT_PENALTY}）` });
  }
  return 1;
}

/** picked 超送达截止 → abnormal + 全额退 + 信用 −10 */
async function sweepPickedTimeout(tx: Executor, order: OrderRow, t: Date): Promise<number> {
  const [updated] = await tx
    .update(orders)
    .set({ status: "abnormal", abnormalReason: "取货后超时未送达", completedAt: t })
    .where(and(eq(orders.id, order.id), eq(orders.status, "picked")))
    .returning();
  if (!updated) return 0;
  await refundEscrow(tx, { orderId: order.id, publisherId: order.publisherId, memo: "超时异常全额退款" });
  if (order.runnerId) await adjustCredit(tx, order.runnerId, -CREDIT_TIMEOUT_PENALTY);
  if (order.batchId) await maybeCloseBatch(tx, order.batchId);
  await recordEvent(tx, { orderId: order.id, type: "abnormal", payload: { reason: "picked_timeout" } });
  await notify(tx, { userId: order.publisherId, orderId: order.id, content: `订单 ${order.code} 异常，已全额退款` });
  return 1;
}

/** delivered 超自动确认时间 → completed（系统自动确认）+ 未上报捎带项按「没买到」落定 */
async function sweepAutoConfirm(tx: Executor, order: OrderRow, t: Date): Promise<number> {
  const [updated] = await tx
    .update(orders)
    .set({ status: "completed", completedAt: t, confirmedBy: "system" })
    .where(and(eq(orders.id, order.id), eq(orders.status, "delivered")))
    .returning();
  if (!updated) return 0;
  // 改（m02503）：自动确认时若还有没上报的捎带项，按「没买到」落定，预算全额退回，绝不静默吞钱
  const pendingAddons = (await addonsOf(tx, order.id)).filter((a) => a.status === "pending");
  let settled: OrderRow = updated;
  if (pendingAddons.length > 0) {
    await tx
      .update(orderAddons)
      .set({ status: "failed", actualFen: 0 })
      .where(and(eq(orderAddons.orderId, order.id), eq(orderAddons.status, "pending")));
    const rows = await addonsOf(tx, order.id);
    const actual = rows.reduce((sum, a) => sum + (a.status === "bought" ? (a.actualFen ?? 0) : 0), 0);
    const [refreshed] = await tx.update(orders).set({ actualFen: actual }).where(eq(orders.id, order.id)).returning();
    if (refreshed) settled = refreshed;
    await recordEvent(tx, {
      orderId: order.id,
      type: "addons_auto_failed",
      payload: { titles: pendingAddons.map((a) => a.title) },
    });
    if (settled.runnerId) {
      await notify(tx, {
        userId: settled.runnerId,
        orderId: order.id,
        content: `订单 ${settled.code} 自动确认：未上报的捎带项按「没买到」处理，预算已退回发布者`,
      });
    }
  }
  await settleCompletion(tx, settled);
  if (updated.runnerId) await adjustCredit(tx, updated.runnerId, 1);
  if (updated.batchId) await maybeCloseBatch(tx, updated.batchId);
  await recordEvent(tx, { orderId: order.id, type: "completed", payload: { by: "system" } });
  if (updated.runnerId) {
    await notify(tx, { userId: updated.runnerId, orderId: order.id, content: `订单 ${updated.code} 已自动确认，收入到账` });
  }
  return 1;
}

/** open → expired（条件更新 + 退款 + 事件 + 通知），返回是否真的处理了 */
async function transitionTo(
  tx: Executor,
  order: OrderRow,
  status: OrderStatus,
  opts: { memo: string; event: string; notifyPublisher: string }
): Promise<boolean> {
  const [updated] = await tx
    .update(orders)
    .set({ status, completedAt: await now() })
    .where(and(eq(orders.id, order.id), eq(orders.status, order.status)))
    .returning();
  if (!updated) return false;
  await refundEscrow(tx, { orderId: order.id, publisherId: order.publisherId, memo: opts.memo });
  await recordEvent(tx, { orderId: order.id, type: opts.event });
  await notify(tx, { userId: order.publisherId, orderId: order.id, content: opts.notifyPublisher });
  return true;
}

/** 演示/测试辅助：直接读模拟时间的毫秒值 */
export async function currentSimMs(): Promise<number> {
  return nowMs();
}
