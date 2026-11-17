import { reportAddons } from "@/server/rules/addons";
import { toAddonView } from "@/server/rules/serializers";
import { readJson, withUser } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A3c · 捎带项实付上报（v1.3）：接单跑腿者在取餐时一并填写每件实付，或标记没买到 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withUser(async (user) => {
    const { id } = await ctx.params;
    const body = await readJson<{ items?: { id: number; actualFen?: number | null; failed?: boolean }[] }>(req);

    const result = await reportAddons(
      Number(id),
      user.id,
      (body.items ?? []).map((i) => ({ id: Number(i.id), actualFen: i.actualFen, failed: i.failed }))
    );

    return {
      totalActualFen: result.totalActualFen,
      overBudgetFen: result.overBudgetFen,
      addons: result.addons.map((a) => toAddonView(a, true)),
    };
  });
}
