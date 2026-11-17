import { NextResponse } from "next/server";
import { and, asc, ne } from "drizzle-orm";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { demoGuard } from "@/lib/demo-guard";
import { withReadRetry } from "@/lib/api";
import { PLATFORM_USER_ID } from "@/server/rules/constants";

/**
 * B2 · GET /api/demo/accounts：切号列表。
 *
 * v1.8（m03494）：管理员的入口改成「电脑端密码后台 /admin/console」，
 * 所以切号列表里不再出现管理员账号——手机端只留 5 个业务身份，
 * 避免演示时误切到一个只能看后台的账号。
 */
export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = demoGuard(req);
  if (denied) return denied;
  // v1.19 · 只读查询重试一次：这个接口挂了会让整个切号列表空白
  const rows = await withReadRetry(
    () =>
      db
        .select({
          id: users.id,
          nickname: users.nickname,
          dormBuilding: users.dormBuilding,
          isAdmin: users.isAdmin,
        })
        .from(users)
        .where(and(ne(users.id, PLATFORM_USER_ID), ne(users.isAdmin, true)))
        .orderBy(asc(users.id)),
    "demo/accounts",
  );
  return NextResponse.json({ accounts: rows });
}
