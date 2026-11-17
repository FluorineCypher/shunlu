import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { orders, users } from "@/server/db/schema";
import { expireSweep } from "@/server/rules/orders";
import { calcBonusFen, BONUS_MIN_BATCH_SIZE, runnerMaxActive } from "@/server/rules/constants";
import { nowMs } from "@/server/clock";
import { withUser } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 发布页辅助：某个楼栋里「别人的」待接单。
 * 发布者本来就要下楼/回楼，可以顺手把这几单接了赚赏金（不占发布额度，占跑腿并发位）。
 */
export async function GET(req: Request) {
  return withUser(async (user) => {
    const building = (new URL(req.url).searchParams.get("building") ?? "").trim();
    if (!building) {
      return { building, orders: [], totalRewardFen: 0, slots: 0, active: 0, bonusMinBatch: BONUS_MIN_BATCH_SIZE };
    }

    await expireSweep();
    const now = await nowMs();

    const rows = await db
      .select({
        order: orders,
        nickname: users.nickname,
        gender: users.dormGender,
        addonCount: sql<number>`(SELECT COUNT(*)::int FROM order_addons WHERE order_id = orders.id)`,
      })
      .from(orders)
      .leftJoin(users, eq(users.id, orders.publisherId))
      .where(
        and(
          eq(orders.status, "open"),
          // 楼栋名忽略空格差异：「女寝 3 号楼」与「女寝3号楼」视为同一栋
          sql`replace(${orders.dropBuilding}, ' ', '') = ${building.replace(/\s+/g, "")}`,
          ne(orders.publisherId, user.id),
        ),
      )
      .orderBy(asc(orders.acceptDeadlineAt))
      .limit(10);

    const [stat] = await db
      .select({
        active: sql<number>`COUNT(*) FILTER (WHERE ${orders.runnerId} = ${user.id} AND ${orders.status} IN ('accepted','picked','delivered'))::int`,
      })
      .from(orders);
    /** 手上进行中的单（accepted/picked/delivered）：发布页据此说明「本次还能带几单」 */
    const active = stat?.active ?? 0;
    const slots = Math.max(0, runnerMaxActive(user.creditScore) - active);

    const totalRewardFen = rows.reduce((sum, r) => sum + r.order.runnerRewardFen, 0);

    return {
      building,
      slots,
      active,
      /** 批量加成门槛（同栋同批 ≥3 单才有，见 AGENTS §4） */
      bonusMinBatch: BONUS_MIN_BATCH_SIZE,
      totalRewardFen,
      // v1.32：加成金额按「已勾选」在前端汇总，这里只给每单的加成额，避免按整栋待接单总数虚报
      orders: rows.map(({ order, nickname, gender, addonCount }) => ({
        id: order.id,
        pickupPoint: order.pickupPoint,
        dropBuilding: order.dropBuilding,
        dropFloor: order.dropFloor,
        note: order.note,
        rewardFen: order.rewardFen,
        runnerRewardFen: order.runnerRewardFen,
        bonusFen: calcBonusFen(order.runnerRewardFen),
        publisherNickname: nickname,
        publisherGender: gender,
        /** v1.10 · 女生发布的单，男跑手不能接 */
        blockedByGender: user.dormGender === "male" && gender === "female",
        addonCount,
        leftSec: order.acceptDeadlineAt
          ? Math.max(0, Math.round((order.acceptDeadlineAt.getTime() - now) / 1000))
          : null,
      })),
    };
  }, { retryRead: true });
}
