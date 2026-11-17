import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { batches, orderEvents, orders, reviews, users } from "@/server/db/schema";
import { addonsOf, expireSweep, getOrder } from "@/server/rules/orders";
import { reviewSummaryOf } from "@/server/rules/reviews";
import { toAddonView, toOrderDetail } from "@/server/rules/serializers";
import { nowMs } from "@/server/clock";
import { withUserClock } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A5 · 订单详情：隐私字段只对「接单跑腿者本人 + 已接单」露出（规则 5） */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withUserClock(async (user, now) => {
    const { id } = await ctx.params;
    await expireSweep(now);

    const order = await getOrder(db, Number(id));
    // 管理员看清完整记录（m02503）：纠纷处理需要房号/尾号/实付全可见
    const detail = toOrderDetail(order, { id: user.id, isAdmin: user.isAdmin });
    const isParticipant = user.id === order.publisherId || user.id === order.runnerId || user.isAdmin;

    /**
     * v1.11 · 性能：详情页原来 7 条查询串行（Neon 单条 ~80ms ≈ 560ms）。
     * 这些查询彼此不依赖，统一并行；只有「跑腿者口碑」依赖 runner 结果，放到第二轮。
     */
    const [addonRows, publisherRows, runnerRows, batchRows, events, reviewRows] = await Promise.all([
      addonsOf(db, order.id),
      db.select().from(users).where(eq(users.id, order.publisherId)).limit(1),
      order.runnerId
        ? db.select().from(users).where(eq(users.id, order.runnerId)).limit(1)
        : Promise.resolve([] as (typeof users.$inferSelect)[]),
      order.batchId
        ? db.select().from(batches).where(eq(batches.id, order.batchId)).limit(1)
        : Promise.resolve([] as (typeof batches.$inferSelect)[]),
      db.select().from(orderEvents).where(eq(orderEvents.orderId, order.id)).orderBy(asc(orderEvents.at)).limit(50),
      db.select().from(reviews).where(eq(reviews.orderId, order.id)).limit(1),
    ]);
    const addons = addonRows.map((a) => toAddonView(a, isParticipant));
    const publisher = publisherRows[0];
    const runner = runnerRows[0] ?? null;
    const batch = batchRows[0] ?? null;
    const review = reviewRows[0] ?? null;

    // 跑腿者口碑（M2）：发布者确认收货前能看到「这个人平均几星、几单」
    const runnerRating = runner ? await reviewSummaryOf(db, runner.id, 0) : null;
    const left = (at: Date | null) => (at ? Math.max(0, Math.round((at.getTime() - now) / 1000)) : null);

    // 捎带项：跑腿者可在接单后/取货后上报实付；发布者在确认收货前看到结算预览
    const actualFen = order.actualFen ?? 0;
    const stillCanReportAddons =
      order.bizType === "food" &&
      addons.length > 0 &&
      order.runnerId === user.id &&
      ["accepted", "picked"].includes(order.status);
    const settlePreview =
      order.bizType === "food" &&
      (order.publisherId === user.id || user.isAdmin) &&
      order.status === "delivered"
        ? {
            rewardFen: order.rewardFen,
            addonBudgetFen: order.budgetFen,
            addonActualFen: actualFen,
            /** 未花完退回发布者 */
            refundFen: Math.max(0, order.budgetFen - actualFen),
            /** 超出预算、确认时补扣 */
            overBudgetFen: Math.max(0, actualFen - order.budgetFen),
            /** 跑腿者到手 = 奖励 75% + 垫付报销 */
            runnerTakeFen: order.runnerRewardFen + actualFen,
            feeFen: order.rewardFen - order.runnerRewardFen,
            /** 这一单发布者实际支出 = 奖励 + 实付 */
            publisherCostFen: order.rewardFen + actualFen,
          }
        : null;

    return {
      order: {
        ...detail,
        publisherNickname: publisher?.nickname ?? "同学",
        publisherCredit: publisher?.creditScore ?? 100,
        runnerNickname: runner?.nickname ?? null,
        runnerRating,
        acceptLeftSec: left(order.acceptDeadlineAt),
        deliverLeftSec: left(order.deliverDeadlineAt),
        canReview: order.status === "completed" && order.publisherId === user.id && !review,
        addons,
        canReportAddons: stillCanReportAddons,
        settlePreview,
        /** v1.10 · 性别硬规则：女生发布的单，男跑手不能接 */
        publisherGender: publisher?.dormGender ?? null,
        blockedByGender: user.dormGender === "male" && publisher?.dormGender === "female",
      },
      batch,
      events,
      review,
    };
  }, { retryRead: true });
}
