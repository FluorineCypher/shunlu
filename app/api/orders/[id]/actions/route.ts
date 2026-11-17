import {
  abandonOrder,
  bumpOrder,
  cancelOrder,
  deliverOrder,
  markUnpickable,
  pickOrder,
  reportUnarrived,
} from "@/server/rules/orders";
import { refuseBuy } from "@/server/rules/buy";
import { rejectAddons } from "@/server/rules/addons";
import { toOrderDetail } from "@/server/rules/serializers";
import { readJson, withUser } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A3 · 状态动作：pick / deliver / unpickable / abandon / cancel / bump（守卫在 rules） */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withUser(async (user) => {
    const { id } = await ctx.params;
    const orderId = Number(id);
    const body = await readJson<{
      action?: string;
      proofPhotoUrl?: string;
      extraFen?: number;
      reason?: string;
      note?: string;
    }>(req);

    switch (body.action) {
      case "pick": {
        const order = await pickOrder(orderId, user.id);
        return { order: toOrderDetail(order, { id: user.id }) };
      }
      case "deliver": {
        const order = await deliverOrder(orderId, user.id, String(body.proofPhotoUrl ?? ""));
        return { order: toOrderDetail(order, { id: user.id }) };
      }
      case "unpickable": {
        const order = await markUnpickable(orderId, user.id);
        return { order: toOrderDetail(order, { id: user.id }) };
      }
      case "unarrived": {
        // body.reason：vendor_late（商家/骑手没送到，扣发单者）| runner_late（自己送晚，扣跑腿者）
        // body.note：附给对方的留言（「真的是外卖晚了」）
        const reason = body.reason === "vendor_late" ? "vendor_late" : "runner_late";
        const order = await reportUnarrived(orderId, user.id, { reason, note: body.note });
        return { order: toOrderDetail(order, { id: user.id }) };
      }
      case "abandon": {
        const order = await abandonOrder(orderId, user.id);
        return { order: toOrderDetail(order, { id: user.id }) };
      }
      case "cancel": {
        const order = await cancelOrder(orderId, user.id, body.reason);
        return { order: toOrderDetail(order, { id: user.id }) };
      }
      case "bump": {
        const { previous, created } = await bumpOrder(orderId, user.id, Number(body.extraFen));
        return { previous: toOrderDetail(previous, { id: user.id }), order: toOrderDetail(created, { id: user.id }) };
      }
      case "refuseBuy": {
        // v1.10 · 代买额度不够：跑腿者拒单，整单取消并全额退回（不扣信用）
        const { order, refundedFen } = await refuseBuy(orderId, user.id, body.reason);
        return { order: toOrderDetail(order, { id: user.id }), refundedFen };
      }
      case "rejectAddons": {
        // v1.10 · 捎带额度不够：只取消捎带，外卖主单继续，预算退回发布者
        const { order, refundedFen, titles } = await rejectAddons(orderId, user.id, body.reason);
        return { order: toOrderDetail(order, { id: user.id }), refundedFen, titles };
      }
      default:
        return { error: "未知动作" };
    }
  });
}
