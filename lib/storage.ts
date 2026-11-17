import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { getBlobToken, getStorageDriver } from "./env";

/**
 * 文件存储双驱动（§2.1-2）：禁止业务代码直接碰磁盘，全部走这里。
 * - local：本机演示，写 .data/uploads/，经 GET /api/files/[id] 流出（目录不直接暴露）
 * - vercel-blob：线上，需 BLOB_READ_WRITE_TOKEN
 * 约束：单张图片 ≤ 4MB（§2.1-8），调用方（路由）负责前端压缩后的大小校验。
 */

const MAX_BYTES = 4 * 1024 * 1024;

export type StoredFile = { id: string; url: string; bytes: number; mime: string };

const localRoot = path.join(process.cwd(), ".data", "uploads");

/** id = 内容 sha256 前 16 位 + uuid 片段，天然去重且不可枚举 */
function makeId(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16) + "-" + randomUUID().slice(0, 8);
}

export async function saveUpload(buf: Buffer, mime: string): Promise<StoredFile> {
  if (buf.byteLength > MAX_BYTES) {
    throw new Error(`文件超过 4MB 上限（${buf.byteLength} bytes）`);
  }
  const driver = getStorageDriver();
  const id = makeId(buf);

  if (driver === "vercel-blob") {
    const token = getBlobToken();
    if (!token) {
      throw new Error("[storage] vercel-blob 驱动需要 BLOB_READ_WRITE_TOKEN");
    }
    const { put } = await import("@vercel/blob");
    const pathname = `uploads/${id}`;
    const blob = await put(pathname, buf, { token, contentType: mime, access: "public" });
    return { id, url: blob.url, bytes: buf.byteLength, mime };
  }

  await mkdir(localRoot, { recursive: true });
  await writeFile(path.join(localRoot, id), buf);
  return { id, url: `/api/files/${id}`, bytes: buf.byteLength, mime };
}

/** local 驱动：读回文件（/api/files/[id] 用）；不存在返回 null */
export async function readLocal(id: string): Promise<{ buf: Buffer; mime: string } | null> {
  if (!/^[a-f0-9-]+$/.test(id)) return null; // 防路径穿越
  try {
    const buf = await readFile(path.join(localRoot, id));
    return { buf, mime: "application/octet-stream" };
  } catch {
    return null;
  }
}
