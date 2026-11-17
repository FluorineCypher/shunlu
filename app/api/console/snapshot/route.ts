import { NextResponse } from "next/server";
import { requireConsole } from "@/lib/console-auth";
import { dbTimeoutResponse, withReadRetry } from "@/lib/api";
import { toErrorResponse } from "@/server/rules/errors";
import { expireSweep } from "@/server/rules/orders";
import { consoleSnapshot } from "@/server/rules/console";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 电脑端后台 · 快照：账号余额/信用、最近 60 单、模拟时钟、平台累计服务费 */
export async function GET(req: Request) {
  const denied = requireConsole(req);
  if (denied) return denied;
  try {
    // v1.19 · 只读快照整段重试一次（expireSweep 幂等收敛，重试不会重复退款）
    const snapshot = await withReadRetry(async () => {
      // 先惰性过期：电脑端点开后台就能看到「卡住的单」已经按规则落定
      await expireSweep();
      return consoleSnapshot();
    }, "console/snapshot");
    return NextResponse.json({ ok: true, ...snapshot });
  } catch (err) {
    // v1.42：这条路由不走 withUser，超时以前会掉到通用映射变成 500「服务器内部错误」，
    // 前端只能干瞪眼。这里显式给出 503 DB_TIMEOUT（并顺带回收连接池，下个请求自动重连）。
    const timedOut = dbTimeoutResponse(err);
    if (timedOut) return timedOut;
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
