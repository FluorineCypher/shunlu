import { agreeBudget, confirmBudget, declineBudget, reportActual, requestBudget } from "@/server/rules/buy";
import { toOrderDetail } from "@/server/rules/serializers";
import { readJson, withUser } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A3b · 代买：request / agree / decline / report / confirm（M4 找零） */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withUser(async (user) => {
    const { id } = await ctx.params;
    const orderId = Number(id);
    const body = await readJson<{ action?: string; actualFen?: number; photoUrl?: string }>(req);

    switch (body.action) {
      case "request": {
        const order = await requestBudget(orderId, user.id, Number(body.actualFen));
        return { order: toOrderDetail(order, { id: user.id }) };
      }
      case "agree": {
        const order = await agreeBudget(orderId, user.id);
        return { order: toOrderDetail(order, { id: user.id }) };
      }
      case "decline": {
        const order = await declineBudget(orderId, user.id);
        return { order: toOrderDetail(order, { id: user.id }) };
      }
      case "report": {
        const order = await reportActual(orderId, user.id, {
          actualFen: Number(body.actualFen),
          photoUrl: String(body.photoUrl ?? ""),
        });
        return { order: toOrderDetail(order, { id: user.id }) };
      }
      case "confirm": {
        const result = await confirmBudget(orderId, user.id);
        return { order: toOrderDetail(result.order, { id: user.id }), refundFen: result.refundFen, reimburseFen: result.reimburseFen };
      }
      default:
        return { error: "未知动作" };
    }
  });
}
