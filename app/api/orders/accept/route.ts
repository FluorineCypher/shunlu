import { acceptBatch, acceptOrder } from "@/server/rules/orders";
import { readJson, withUser } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A2 · 接单：1 单走 acceptOrder，多单走批次（全成功或全回滚） */
export async function POST(req: Request) {
  return withUser(async (user) => {
    const body = await readJson<{ orderId?: number; orderIds?: number[] }>(req);
    const raw = body.orderIds ?? (body.orderId != null ? [body.orderId] : []);
    const ids = raw.map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return { ok: false };

    if (ids.length === 1) {
      const order = await acceptOrder(ids[0], user.id);
      return { ok: true, orderIds: [order.id], batchId: null };
    }
    const { batchId, orders } = await acceptBatch(ids, user.id);
    return { ok: true, batchId, orderIds: orders.map((o) => o.id) };
  });
}
