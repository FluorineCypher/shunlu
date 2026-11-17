import { NextResponse } from "next/server";
import { APP_RELEASE, APP_VERSION } from "@/lib/version";
import { pingDb } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/version —— 线上到底跑的是哪一版（公开、无鉴权）。
 *
 * 三个字段各有用途：
 * - version / release：代码身份，用来和 docs/HANDOFF.md 对照；
 * - uptimeSec：**进程活了多久**。部署脚本最后会 systemctl restart，
 *   如果 version 是新的但 uptimeSec 很大，说明新码根本没被加载（服务没重启 / 起的是旧 unit）；
 * - buildId: Next 的构建号，同一次 build 内一致，重新 build 就变。
 *
 * v1.42 增补 `db`：3 秒上限的数据库探针。线上「后台输完口令没反应」是一次
 * 「服务器 → Neon 连接被掐死、查询永远不返回」的事故，而此前从外部只能靠
 * 等 20 秒超时来间接判断。现在一条 curl 就能分辨「应用挂了」还是「数据库连不上」。
 * 探针失败不影响本接口的状态码（永远是 200，它是诊断工具，不是健康检查的闸门）。
 */
export async function GET() {
  const startedAt = Date.now();
  const dbOk = await pingDb(6_000);
  return NextResponse.json(
    {
      version: APP_VERSION,
      release: APP_RELEASE,
      uptimeSec: Math.round(process.uptime()),
      nodeEnv: process.env.NODE_ENV ?? "unknown",
      port: process.env.PORT ?? null,
      /** {ok, ms}：ok=false 基本可判定是服务器到数据库这一段（网络/连接池），不是业务代码 */
      db: { ok: dbOk, ms: Date.now() - startedAt },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
