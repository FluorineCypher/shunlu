import { confirmDelivered } from "@/server/rules/orders";
import { withUser } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A4 · 发布者确认收货（delivered → completed 并结算，附录 A） */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withUser(async (user) => {
    const { id } = await ctx.params;
    const { order, settlement } = await confirmDelivered(Number(id), user.id);
    return { order: { id: order.id, status: order.status }, settlement };
  });
}
