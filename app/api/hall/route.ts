import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { orders, users } from "@/server/db/schema";
import { expireSweep } from "@/server/rules/orders";
import { runnerMaxActive } from "@/server/rules/constants";
import { toHallOrder } from "@/server/rules/serializers";
import { withUserClock } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A5 · 大厅：先惰性过期，再按「快到期」优先返回 open 单（v1.10）。
 * - 不含房号/尾号
 * - 不展示「自己发布的」单（自己的单在「我的」里）
 * - mine：我进行中的单，供顶部快捷入口
 * - 附带我的楼栋（我的页可改）与性别硬规则：女生发布的单男跑手不可接
 *
 * v1.11 · 性能（Neon 单条往返 70–140ms，往返次数就是体感）：
 * 1. 用户与模拟时间并行取（withUserClock）；
 * 2. 过期探测直接用这个时间，不再自己查一次 clock；
 * 3. 大厅列表 / mine / 并发位三条独立查询并行。
 */
export async function GET() {
  return withUserClock(async (user, now) => {
    await expireSweep(now);

    const [rows, mineRows] = await Promise.all([
      db
        .select({
          order: orders,
          nickname: users.nickname,
          credit: users.creditScore,
          gender: users.dormGender,
          addonCount: sql<number>`(SELECT COUNT(*)::int FROM order_addons WHERE order_id = orders.id)`,
        })
        .from(orders)
        .leftJoin(users, eq(users.id, orders.publisherId))
        .where(and(eq(orders.status, "open"), ne(orders.publisherId, user.id)))
        // v1.10 · 即将截止的往前排（无截止时间的排最后）
        .orderBy(sql`${orders.acceptDeadlineAt} ASC NULLS LAST`, desc(orders.createdAt))
        .limit(60),
      /**
       * v1.11 · 性能：mine 与「我的并发位占用数」合成一条查询。
       * 我手上正在跑的单一定属于 mine 集合（runner=me 且未终态），所以把计数作为
       * 相关子查询挂在 mine 的行上即可；mine 为空 ⇒ 占用数必然是 0。
       */
      db
        .select({
          order: orders,
          activeTotal: sql<number>`(SELECT COUNT(*)::int FROM orders o2 WHERE o2.runner_id = ${user.id} AND o2.status IN ('accepted','picked','delivered'))`,
        })
        .from(orders)
        .where(
          and(
            or(eq(orders.publisherId, user.id), eq(orders.runnerId, user.id)),
            inArray(orders.status, ["open", "accepted", "picked", "delivered"]),
          ),
        )
        .orderBy(desc(orders.createdAt))
        .limit(5),
    ]);

    const list = rows.map((r) => ({
      ...toHallOrder(r.order),
      publisherNickname: r.nickname,
      publisherCredit: r.credit,
      publisherGender: r.gender,
      addonCount: r.addonCount,
      /** 男生不能接女生发的单（v1.10 硬规则），前端置灰并说明 */
      blockedByGender: user.dormGender === "male" && r.gender === "female",
      leftSec: r.order.acceptDeadlineAt
        ? Math.max(0, Math.round((r.order.acceptDeadlineAt.getTime() - now) / 1000))
        : null,
    }));

    // 快捷入口：我进行中的单（我发的 / 我接的）
    const mine = mineRows.map(({ order }) => ({
      id: order.id,
      status: order.status,
      bizType: order.bizType,
      dropBuilding: order.dropBuilding,
      pickupPoint: order.pickupPoint,
      role: order.publisherId === user.id ? "publisher" : "runner",
    }));

    // 批次接单（P4）：还剩几个并发位，前端据此限制勾选数量
    const activeCount = mineRows[0]?.activeTotal ?? 0;
    const slots = Math.max(0, runnerMaxActive(user.creditScore) - activeCount);

    return {
      orders: list,
      mine,
      slots,
      creditScore: user.creditScore,
      /** v1.10 · 我的楼栋（同栋优先标记用）与性别 */
      myBuilding: user.dormBuilding,
      myFloor: user.dormFloor ?? null,
      myGender: user.dormGender,
    };
  }, { retryRead: true });
}
