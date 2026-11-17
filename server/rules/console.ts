import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { orders, orderAddons, users, walletLogs } from "@/server/db/schema";
import { advance, getScale, nowMs, setScale } from "@/server/clock";
import { CREDIT_MAX } from "./constants";
import { Errors } from "./errors";
import { insertLog, notify, recordEvent, refundEscrow } from "./ledger";
import { maybeCloseBatch } from "./orders";

/**
 * 电脑端调试后台的业务规则（v1.7，用户 m03188/m03192）。
 *
 * 定位：**演示调试用**，不做真实运营。它绕开「切号 + 手机端点按钮」的摩擦，
 * 让一台电脑直接修数据。所有金额仍走 wallet_logs（append-only），保证两条不变式不破。
 * 与业务规则分离：这里不实现任何状态机流转，只做「管理员代执行」的三件事：
 *   1) 取消一张没走完的订单（全额退款）
 *   2) 手动给某个账号加/扣钱、改信用分
 *   3) 拨模拟时钟
 */

const TERMINAL = ["completed", "expired", "cancelled", "abnormal"] as const;

export type ConsoleUser = {
  id: number;
  nickname: string;
  dormBuilding: string | null;
  creditScore: number;
  balanceFen: number;
  frozenFen: number;
  isAdmin: boolean;
};

export type ConsoleOrder = {
  id: number;
  code: string;
  status: string;
  bizType: string;
  dropBuilding: string;
  dropRoom: string | null;
  rewardFen: number;
  budgetFen: number;
  publisherId: number;
  runnerId: number | null;
  publisherNickname: string | null;
  runnerNickname: string | null;
  createdAt: Date;
};

export type ConsoleSnapshot = {
  clock: { simNow: number; scale: number };
  users: ConsoleUser[];
  orders: ConsoleOrder[];
  statusCounts: Record<string, number>;
  platformFeeFen: number;
  pendingAddonCount: number;
  /** P9 对账（v1.9 / Step 8）：两条不变式的差异必须为 0 */
  reconcile: {
    userDriftFen: number;
    orderDriftFen: number;
    checkedUsers: number;
    checkedOpenOrders: number;
    completedOrders: number;
    distinctRunners: number;
    /** 人均带单数（completed 单数 / 接过的跑腿者人数，保留一位小数） */
    avgOrdersPerRunner: number;
  };
};

/** 后台首页快照：账号余额/信用、最近 60 单、时钟状态、平台累计服务费 */
export async function consoleSnapshot(): Promise<ConsoleSnapshot> {
  const publishers = sql<string | null>`(
    SELECT nickname FROM users WHERE users.id = orders.publisher_id
  )`;
  const runners = sql<string | null>`(
    SELECT nickname FROM users WHERE users.id = orders.runner_id
  )`;

  const [userRows, orderRows, statusRows, feeRow, addonRow] = await Promise.all([
    db
      .select({
        id: users.id,
        nickname: users.nickname,
        dormBuilding: users.dormBuilding,
        creditScore: users.creditScore,
        balanceFen: users.balanceFen,
        isAdmin: users.isAdmin,
      })
      .from(users)
      .orderBy(users.id),
    db
      .select({
        id: orders.id,
        code: orders.code,
        status: orders.status,
        bizType: orders.bizType,
        dropBuilding: orders.dropBuilding,
        dropRoom: orders.dropRoom,
        rewardFen: orders.rewardFen,
        budgetFen: orders.budgetFen,
        publisherId: orders.publisherId,
        runnerId: orders.runnerId,
        publisherNickname: publishers,
        runnerNickname: runners,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .orderBy(desc(orders.id))
      .limit(60),
    db.select({ status: orders.status, n: sql<number>`COUNT(*)::int` }).from(orders).groupBy(orders.status),
    db
      .select({ sum: sql<number>`COALESCE(SUM(${walletLogs.amountFen}), 0)::int` })
      .from(walletLogs)
      .where(eq(walletLogs.type, "fee")),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(orderAddons)
      .where(eq(orderAddons.status, "pending")),
  ]);

  // 每个账号的冻结额 = 未终态订单的 (reward + budget) 之和，与 /api/wallet 口径一致
  const frozenRows = await db
    .select({
      publisherId: orders.publisherId,
      sum: sql<number>`COALESCE(SUM(${orders.rewardFen} + ${orders.budgetFen}), 0)::int`,
    })
    .from(orders)
    .where(sql`${orders.status} NOT IN ('completed','expired','cancelled','abnormal')`)
    .groupBy(orders.publisherId);

  const frozenByUser = new Map<number, number>();
  for (const row of await frozenRows) frozenByUser.set(row.publisherId, row.sum);

  // P9 对账（v1.9 / Step 8）：口径与 scripts/check-db.ts 完全一致
  //   1) 每个用户：balance_fen 与 Σ wallet_logs.amount_fen 的差异
  //   2) 每张未终态订单：reward_fen + budget_fen 与 −Σ(该单日志) 的差异
  const [userDriftRows, orderDriftRows, doneRows] = await Promise.all([
    db.execute(sql`
      SELECT COALESCE(SUM(ABS(users.balance_fen - COALESCE(l.s, 0))), 0)::int AS drift,
             COUNT(*)::int AS checked
      FROM users
      LEFT JOIN (SELECT user_id, SUM(amount_fen)::int AS s FROM wallet_logs GROUP BY user_id) l
        ON l.user_id = users.id
    `),
    db.execute(sql`
      SELECT COALESCE(SUM(ABS((orders.reward_fen + orders.budget_fen) + COALESCE(l.s, 0))), 0)::int AS drift,
             COUNT(*)::int AS checked
      FROM orders
      LEFT JOIN (SELECT order_id, SUM(amount_fen)::int AS s FROM wallet_logs WHERE order_id IS NOT NULL GROUP BY order_id) l
        ON l.order_id = orders.id
      WHERE orders.status NOT IN ('completed','expired','cancelled','abnormal')
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS done, COUNT(DISTINCT orders.runner_id)::int AS runners
      FROM orders WHERE orders.status = 'completed'
    `),
  ]);
  const pick = (rows: unknown) => ((rows as Record<string, number>[])[0] ?? {}) as Record<string, number>;
  const userDrift = pick(userDriftRows);
  const orderDrift = pick(orderDriftRows);
  const done = pick(doneRows);
  const completedOrders = done.done ?? 0;
  const distinctRunners = done.runners ?? 0;

  return {
    clock: { simNow: await nowMs(), scale: await getScale() },
    users: userRows.map((u) => ({ ...u, frozenFen: frozenByUser.get(u.id) ?? 0 })),
    orders: orderRows,
    statusCounts: Object.fromEntries(statusRows.map((r) => [r.status, r.n])),
    platformFeeFen: feeRow[0]?.sum ?? 0,
    pendingAddonCount: addonRow[0]?.n ?? 0,
    reconcile: {
      userDriftFen: userDrift.drift ?? 0,
      orderDriftFen: orderDrift.drift ?? 0,
      checkedUsers: userDrift.checked ?? 0,
      checkedOpenOrders: orderDrift.checked ?? 0,
      completedOrders,
      distinctRunners,
      avgOrdersPerRunner: distinctRunners > 0 ? Math.round((completedOrders / distinctRunners) * 10) / 10 : 0,
    },
  };
}

/** 加/扣钱：走 wallet_logs（type=bonus，order_id 空），余额列同步 + 不允许扣成负数 */
export async function adjustUserMoney(input: {
  userId: number;
  deltaFen: number;
  memo?: string;
}): Promise<{ balanceFen: number }> {
  if (!Number.isInteger(input.deltaFen) || input.deltaFen === 0) {
    throw Errors.invalid("调整金额必须是非零整数分");
  }
  if (Math.abs(input.deltaFen) > 1_000_000) throw Errors.invalid("单次调整上限 10000 元");

  return db.transaction(async (tx) => {
    const rows = await tx.select({ balance: users.balanceFen }).from(users).where(eq(users.id, input.userId));
    const balance = rows[0]?.balance;
    if (balance === undefined) throw Errors.notFound("用户不存在");
    if (balance + input.deltaFen < 0) {
      throw Errors.conflict(`余额不足：当前 ${(balance / 100).toFixed(2)} 元，不能扣 ${(-input.deltaFen / 100).toFixed(2)} 元`);
    }
    const label = input.deltaFen > 0 ? "后台加钱" : "后台扣钱";
    await insertLog(tx, {
      userId: input.userId,
      type: "bonus",
      amountFen: input.deltaFen,
      memo: `${label}：${input.memo?.trim() || "调试调整"}`,
    });
    return { balanceFen: balance + input.deltaFen };
  });
}

/** 直接设定信用分（clamp 0..120）；与业务里的 adjustCredit 不同，这里是绝对值覆盖 */
export async function setUserCredit(input: { userId: number; creditScore: number }): Promise<{ creditScore: number }> {
  if (!Number.isFinite(input.creditScore)) throw Errors.invalid("信用分必须是数字");
  const value = Math.max(0, Math.min(CREDIT_MAX, Math.round(input.creditScore)));
  const rows = await db
    .update(users)
    .set({ creditScore: value })
    .where(eq(users.id, input.userId))
    .returning({ creditScore: users.creditScore });
  if (rows.length === 0) throw Errors.notFound("用户不存在");
  return { creditScore: rows[0].creditScore };
}

/**
 * 管理员代取消：任何未终态订单 → cancelled + 全额退托管额。
 * 用于演示时「卡住的单」：纠纷、跑腿者失联、外卖没送来又没人处理。
 */
export async function adminCancelOrder(input: {
  orderId: number;
  reason?: string;
}): Promise<{ orderId: number; refundedFen: number }> {
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(orders).where(eq(orders.id, input.orderId));
    const order = rows[0];
    if (!order) throw Errors.notFound("订单不存在");
    if ((TERMINAL as readonly string[]).includes(order.status)) {
      throw Errors.conflict("该订单已结束，无法取消");
    }
    const reason = input.reason?.trim() || "管理员调试取消";
    const [updated] = await tx
      .update(orders)
      .set({
        status: "cancelled",
        cancelReason: reason,
        acceptDeadlineAt: null,
        deliverDeadlineAt: null,
        autoConfirmAt: null,
      })
      .where(and(eq(orders.id, input.orderId), sql`${orders.status} NOT IN ('completed','expired','cancelled','abnormal')`))
      .returning();
    if (!updated) throw Errors.conflict("订单状态已变化，请刷新");

    const refundedFen = await refundEscrow(tx, {
      orderId: order.id,
      publisherId: order.publisherId,
      memo: `管理员取消订单，全额退款：${reason}`,
    });
    await recordEvent(tx, {
      orderId: order.id,
      type: "admin_cancel",
      actorId: null,
      payload: { reason, refundedFen },
    });
    await notify(tx, {
      userId: order.publisherId,
      orderId: order.id,
      content: `管理员取消了订单 ${order.code}：${reason}（已全额退款 ¥${(refundedFen / 100).toFixed(2)}）`,
    });
    if (order.runnerId) {
      await notify(tx, {
        userId: order.runnerId,
        orderId: order.id,
        content: `你手上的订单 ${order.code} 已被管理员取消：${reason}`,
      });
    }
    if (order.batchId) await maybeCloseBatch(tx, order.batchId);
    return { orderId: order.id, refundedFen };
  });
}

/** 拨时钟：倍率与手动推进（与演示工具条等价，但电脑端一次到位） */
export async function setConsoleClock(input: {
  scale?: number;
  advanceMs?: number;
}): Promise<{ simNow: number; scale: number }> {
  if (input.scale !== undefined) {
    if (![1, 8, 30, 60].includes(input.scale)) throw Errors.invalid("倍率只能是 1 / 8 / 30 / 60");
    await setScale(input.scale);
  }
  if (input.advanceMs !== undefined) {
    if (!Number.isFinite(input.advanceMs) || input.advanceMs <= 0) throw Errors.invalid("推进时长必须大于 0");
    if (input.advanceMs > 24 * 60 * 60_000) throw Errors.invalid("单次推进最多 24 小时");
    await advance(Math.round(input.advanceMs));
  }
  return { simNow: await nowMs(), scale: await getScale() };
}

/** 未终态且带 pending 捎带项的订单：后台提示跑腿者「先确认买了没」 */
export async function ordersAwaitingAddons(): Promise<number[]> {
  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        inArray(orders.status, ["accepted", "picked", "delivered"]),
        eq(orders.bizType, "food"),
        sql`EXISTS (SELECT 1 FROM order_addons a WHERE a.order_id = ${orders.id} AND a.status = 'pending')`
      )
    );
  return rows.map((r) => r.id);
}
