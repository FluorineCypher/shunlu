import { NextResponse } from "next/server";
import { readLocal } from "@/lib/storage";
import { getStorageDriver } from "@/lib/env";

/** GET /api/files/[id]：local 驱动的文件出口（目录不直接暴露，§2.1-2） */
export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (getStorageDriver() !== "local") {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }
  const { id } = await ctx.params;
  const file = await readLocal(id);
  if (!file) return NextResponse.json({ error: "Not Found" }, { status: 404 });
  return new NextResponse(new Uint8Array(file.buf), {
    headers: { "content-type": file.mime, "cache-control": "private, max-age=3600" },
  });
}
