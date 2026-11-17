import { readJson, toInt, withUser } from "@/lib/api";
import { createReview } from "@/server/rules/reviews";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A4 · 发布者评价接单跑腿者（一单一评，仅 completed） */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withUser(async (user) => {
    const { id } = await ctx.params;
    const body = await readJson<{ rating?: number; tags?: string[]; comment?: string }>(req);
    const review = await createReview({
      orderId: toInt(id),
      fromUserId: user.id,
      rating: Number(body.rating),
      tags: body.tags,
      comment: body.comment,
    });
    return { ok: true, review };
  });
}
