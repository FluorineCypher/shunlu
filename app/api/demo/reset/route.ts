import { NextResponse } from "next/server";
import { demoGuard } from "@/lib/demo-guard";
import { resetAndSeed } from "@/server/demo/seed";

/** B2 · POST /api/demo/reset：清库并回到种子（附录 B） */
export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = demoGuard(req);
  if (denied) return denied;
  await resetAndSeed();
  return NextResponse.json({ ok: true });
}
