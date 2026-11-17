import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { orders, users } from "@/server/db/schema";
import { readJson, withUser } from "@/lib/api";
import { reviewSummaryOf } from "@/server/rules/reviews";
import { Errors } from "@/server/rules/errors";
import { getDemoMode } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A6 · 我的资料 + 顶栏计数（履约中 / 我发布的进行中） */
export async function GET() {
  return withUser(async (user) => {
    // v1.11 · 性能：计数与口碑并行（原来串行 2 个往返）
    const [[counts], rating] = await Promise.all([
      db
        .select({
          active: sql<number>`COUNT(*) FILTER (WHERE ${orders.runnerId} = ${user.id} AND ${orders.status} IN ('accepted','picked','delivered'))::int`,
          published: sql<number>`COUNT(*) FILTER (WHERE ${orders.publisherId} = ${user.id} AND ${orders.status} IN ('open','accepted','picked','delivered'))::int`,
        })
        .from(orders),
      // 跑腿者口碑（M2）：收到的评价条数 / 平均分 / 最近几条
      reviewSummaryOf(db, user.id, 3),
    ]);

    return {
      user: {
        id: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        dormBuilding: user.dormBuilding,
        // v1.31 · 常用宿舍信息：只回给本人（发单页据此自动带入）
        dormFloor: user.dormFloor,
        dormRoom: user.dormRoom,
        phoneTail: user.phoneTail,
        dormGender: user.dormGender,
        creditScore: user.creditScore,
        balanceFen: user.balanceFen,
        isAdmin: user.isAdmin,
      },
      counts: { active: counts?.active ?? 0, published: counts?.published ?? 0 },
      rating,
      // v1.29：演示模式改由这个接口下发（layout 静态化后不能再读 build 时的 env）
      demoMode: getDemoMode(),
    };
  }, { retryRead: true });
}

type DormPatch = {
  nickname?: string;
  dormBuilding?: string | null;
  dormFloor?: number | null;
  dormRoom?: string | null;
  phoneTail?: string | null;
};

/**
 * A6 · 改昵称 / 常用宿舍信息（楼栋 · 楼层 · 房间号 · 手机尾号）
 * v1.31：一次请求可提交多字段；宿舍信息传空串或 null 表示清空（以前清不掉楼栋）。
 */
export async function PATCH(req: Request) {
  return withUser(async (user) => {
    const body = await readJson<Record<string, unknown>>(req);
    const patch: DormPatch = {};

    // 昵称：传了就必须非空，不允许把自己改成空名
    if (typeof body.nickname === "string" && body.nickname.trim()) patch.nickname = body.nickname.trim().slice(0, 20);
    if ("dormBuilding" in body) patch.dormBuilding = textOrNull(body.dormBuilding, 30);
    if ("dormRoom" in body) patch.dormRoom = textOrNull(body.dormRoom, 20);
    if ("dormFloor" in body) patch.dormFloor = floorOrNull(body.dormFloor);
    if ("phoneTail" in body) {
      const tail = textOrNull(body.phoneTail, 4);
      if (tail !== null && !/^\d{4}$/.test(tail)) throw Errors.invalid("手机尾号需为 4 位数字");
      patch.phoneTail = tail;
    }
    if (Object.keys(patch).length === 0) return { user: { id: user.id } };

    const [updated] = await db.update(users).set(patch).where(eq(users.id, user.id)).returning();
    return {
      user: {
        id: updated.id,
        nickname: updated.nickname,
        dormBuilding: updated.dormBuilding,
        dormFloor: updated.dormFloor,
        dormRoom: updated.dormRoom,
        phoneTail: updated.phoneTail,
      },
    };
  });
}

/** 空串 / null / 非字符串都归一成 null（= 清空），其余 trim 后截断到 max */
function textOrNull(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().slice(0, max);
  return v ? v : null;
}

/** 楼层：1–99 的整数，空值清空；越界给 400 而不是静默改值 */
function floorOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const floor = Math.trunc(n);
  if (floor < 1 || floor > 99) throw Errors.invalid("楼层请填 1–99 之间的整数");
  return floor;
}
