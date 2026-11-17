import { NextResponse } from "next/server";
import { demoGuard } from "@/lib/demo-guard";
import { getScale, setScale } from "@/server/clock";
import { TIME_SCALES } from "@/server/rules/constants";

/** B2 · POST /api/demo/scale：设置演示倍率 { scale: 1|8|30|60 } */
export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = demoGuard(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as { scale?: number } | null;
  const scale = body?.scale;
  if (!Number.isInteger(scale) || !(TIME_SCALES as readonly number[]).includes(scale as number)) {
    return NextResponse.json({ error: `scale 必须是 ${TIME_SCALES.join("/")}` }, { status: 400 });
  }
  await setScale(scale as number);
  return NextResponse.json({ ok: true, scale: await getScale() });
}
