import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { orders, users } from "@/server/db/schema";
import { createOrder, expireSweep } from "@/server/rules/orders";
import { toHallOrder } from "@/server/rules/serializers";
import { readJson, withUser, withUserClock } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TERMINAL = ["completed", "expired", "cancelled", "abnormal"];

/** A5 · 我的订单：scope=published（我发布的）| accepted（我接的） */
export async function GET(req: Request) {
  return withUserClock(async (user, nowMs) => {
    await expireSweep(nowMs);
    const scope = new URL(req.url).searchParams.get("scope") ?? "published";
    const filter =
      scope === "accepted"
        ? and(eq(orders.runnerId, user.id), inArray(orders.status, ["accepted", "picked", "delivered"]))
        : eq(orders.publisherId, user.id);

    const rows = await db
      .select({ order: orders, nickname: users.nickname })
      .from(orders)
      .leftJoin(users, eq(users.id, orders.runnerId))
      .where(filter)
      .orderBy(desc(orders.createdAt))
      .limit(60);

    return {
      orders: rows.map((r) => ({
        ...toHallOrder(r.order),
        runnerId: r.order.runnerId,
        runnerNickname: r.nickname,
        isActive: !TERMINAL.includes(r.order.status),
        isTerminal: TERMINAL.includes(r.order.status),
      })),
    };
  }, { retryRead: true });
}

/** A1 · 发布：校验 → 冻结 → 上架（失败整体回滚） */
export async function POST(req: Request) {
  return withUser(async (user) => {
    const body = await readJson<{
      bizType?: string;
      pickupPoint?: string;
      dropBuilding?: string;
      dropFloor?: number | null;
      dropRoom?: string | null;
      phoneTail?: string | null;
      note?: string | null;
      itemDesc?: string | null;
      photoUrls?: string[];
      rewardFen?: number;
      budgetFen?: number;
      addons?: { title?: string; budgetFen?: number }[];
      acceptMinutes?: number;
      expectDeliveryMinutes?: number | null;
    }>(req);

    const created = await createOrder(user.id, {
      bizType: body.bizType === "buy" ? "buy" : "food",
      pickupPoint: String(body.pickupPoint ?? ""),
      dropBuilding: String(body.dropBuilding ?? ""),
      dropFloor: body.dropFloor ?? null,
      dropRoom: body.dropRoom ? String(body.dropRoom) : null,
      phoneTail: body.phoneTail ? String(body.phoneTail).slice(-4) : null,
      note: body.note ? String(body.note) : null,
      itemDesc: body.itemDesc ? String(body.itemDesc) : null,
      photoUrls: Array.isArray(body.photoUrls) ? body.photoUrls : [],
      rewardFen: Number(body.rewardFen),
      budgetFen: body.budgetFen === undefined ? 0 : Number(body.budgetFen),
      addons: Array.isArray(body.addons)
        ? body.addons.map((a) => ({ title: String(a?.title ?? ""), budgetFen: Number(a?.budgetFen) }))
        : [],
      acceptMinutes: body.acceptMinutes === undefined ? undefined : Number(body.acceptMinutes),
      expectDeliveryMinutes:
        body.expectDeliveryMinutes === undefined || body.expectDeliveryMinutes === null
          ? null
          : Number(body.expectDeliveryMinutes),
    });

    return { order: toHallOrder(created) };
  });
}
