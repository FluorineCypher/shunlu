import { NextResponse } from "next/server";
import { requireConsole } from "@/lib/console-auth";
import { readJson } from "@/lib/api";
import { toErrorResponse } from "@/server/rules/errors";
import {
  adjustUserMoney,
  adminCancelOrder,
  setConsoleClock,
  setUserCredit,
} from "@/server/rules/console";
import { resetAndSeed } from "@/server/demo/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 电脑端后台 · 操作（v1.7）：一个入口 switch，body = { action, ...payload }。
 *
 * - money       { userId, deltaFen, memo? }  加/扣钱（写 wallet_logs，余额同步）
 * - credit      { userId, creditScore }      信用分覆盖（0..120）
 * - cancelOrder { orderId, reason? }         代取消未终态订单 + 全额退款
 * - clock       { scale?, advanceMs? }       调倍率 / 手动推进
 * - reset       {}                           重置回种子（原地修好「重置按钮」）
 *
 * 这是**演示调试**入口，与 /api/demo/* 同属演示支撑；业务代码不 import 它。
 * 密码校验在 requireConsole（ADMIN_PASSWORD），与手机端 DEMO_TOKEN 分开。
 */
export async function POST(req: Request) {
  const denied = requireConsole(req);
  if (denied) return denied;

  const body = await readJson<{
    action?: string;
    userId?: number;
    deltaFen?: number;
    memo?: string;
    creditScore?: number;
    orderId?: number;
    reason?: string;
    scale?: number;
    advanceMs?: number;
  }>(req);

  try {
    switch (body.action) {
      case "money": {
        const r = await adjustUserMoney({
          userId: Number(body.userId),
          deltaFen: Number(body.deltaFen),
          memo: body.memo,
        });
        return NextResponse.json({ ok: true, ...r });
      }
      case "credit": {
        const r = await setUserCredit({ userId: Number(body.userId), creditScore: Number(body.creditScore) });
        return NextResponse.json({ ok: true, ...r });
      }
      case "cancelOrder": {
        const r = await adminCancelOrder({ orderId: Number(body.orderId), reason: body.reason });
        return NextResponse.json({ ok: true, ...r });
      }
      case "clock": {
        const r = await setConsoleClock({
          scale: body.scale === undefined ? undefined : Number(body.scale),
          advanceMs: body.advanceMs === undefined ? undefined : Number(body.advanceMs),
        });
        return NextResponse.json({ ok: true, ...r });
      }
      case "reset": {
        await resetAndSeed();
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "未知操作" }, { status: 400 });
    }
  } catch (err) {
    const { status, body: errBody } = toErrorResponse(err);
    return NextResponse.json(errBody, { status });
  }
}
