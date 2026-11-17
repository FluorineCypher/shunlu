import { saveUpload } from "@/lib/storage";
import { withUser } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 上传凭据图 / 采购小票（≤ 4MB，前端已压缩） */
export async function POST(req: Request) {
  return withUser(async () => {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("缺少文件");
    if (file.size > 4 * 1024 * 1024) throw new Error("图片超过 4MB");
    const buf = Buffer.from(await file.arrayBuffer());
    const stored = await saveUpload(buf, file.type || "image/jpeg");
    return { url: stored.url, bytes: stored.bytes };
  });
}
