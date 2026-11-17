import { NextResponse } from "next/server";
import { demoGuard } from "@/lib/demo-guard";
import { advance, nowMs } from "@/server/clock";

/** B2 · POST /api/demo/clock：手动推进模拟时间 { advanceMs } */
export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = demoGuard(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as { advanceMs?: number } | null;
  const advanceMs = body?.advanceMs;
  if (!Number.isInteger(advanceMs) || (advanceMs as number) <= 0) {
    return NextResponse.json({ error: "advanceMs 必须为正整数" }, { status: 400 });
  }
  await advance(advanceMs as number);
  return NextResponse.json({ ok: true, now: await nowMs() });
}
