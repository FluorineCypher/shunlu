import { getBatchDetail, setBatchAutoComplete } from "@/server/rules/batches";
import { readJson, toInt, withUser } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A5 · 批次详情（P4）：合计、逐单进度、本趟赚多少；跑腿者本人 / 批次内发布者 / 管理员可看 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withUser(async (user) => {
    const { id } = await ctx.params;
    const detail = await getBatchDetail(toInt(id), user.id, user.isAdmin);
    return { ok: true, ...detail };
  }, { retryRead: true });
}

/** P4 · 批次开关：送达即完成（10 分钟自动确认）/ 关掉（单 2 小时） */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return withUser(async (user) => {
    const { id } = await ctx.params;
    const body = await readJson<{ autoComplete?: boolean }>(req);
    const result = await setBatchAutoComplete(toInt(id), user.id, body.autoComplete === true);
    return { ok: result.ok, autoComplete: result.autoComplete };
  });
}
