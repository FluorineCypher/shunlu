import { desc, eq, sql } from "drizzle-orm";
import { reviews, users } from "@/server/db/schema";
import { Errors } from "./errors";
import { notify, recordEvent, type Executor } from "./ledger";
import { getOrder, withTx } from "./orders";

/**
 * M2 · 评价（v1.9 增补，Step 7）：
 *  - 只有「已完成」的订单、且只有发布者能评价接单跑腿者（§3.2 completed → 评价不改 status）；
 *  - 一单一评，事务内「先查后插」避免重复；
 *  - 评分 1–5 星，可选标签（最多 3 个）+ 最多 100 字留言；
 *  - 评价本身不发钱、不改状态：跑腿者「完成 +1 信用」由 confirmDelivered / 自动确认时统一加。
 */

export const REVIEW_TAGS = ["准时送到", "态度友好", "沟通顺畅", "包装完好", "下次还找TA"] as const;
export const REVIEW_TAG_MAX = 3;
export const REVIEW_COMMENT_MAX = 100;

export interface CreateReviewInput {
  orderId: number;
  fromUserId: number;
  rating: number;
  tags?: string[];
  comment?: string;
}

export interface ReviewView {
  id: number;
  orderId: number;
  rating: number;
  tags: string[];
  comment: string | null;
  fromUserId: number;
  fromNickname: string;
  toUserId: number;
  createdAt: Date;
}

function sanitizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const tag = item.trim();
    if (!(REVIEW_TAGS as readonly string[]).includes(tag)) continue;
    if (out.includes(tag)) continue;
    out.push(tag);
    if (out.length >= REVIEW_TAG_MAX) break;
  }
  return out;
}

/** A4 · 发布者评价这一单的跑腿者 */
export async function createReview(input: CreateReviewInput): Promise<ReviewView> {
  const rating = Math.round(Number(input.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) throw Errors.invalid("评分只能是 1–5 星");
  const tags = sanitizeTags(input.tags);
  const comment = (input.comment ?? "").trim().slice(0, REVIEW_COMMENT_MAX);

  return withTx(async (tx) => {
    const order = await getOrder(tx, input.orderId);
    if (order.status !== "completed") throw Errors.conflict("订单完成后才能评价");
    if (order.publisherId !== input.fromUserId) throw Errors.forbidden("只有发布者能评价这一单");
    if (!order.runnerId) throw Errors.conflict("这一单没有接单跑腿者，无法评价");

    const [existing] = await tx
      .select({ id: reviews.id })
      .from(reviews)
      .where(eq(reviews.orderId, order.id))
      .limit(1);
    if (existing) throw Errors.conflict("这一单已经评价过了");

    const [created] = await tx
      .insert(reviews)
      .values({
        orderId: order.id,
        fromUserId: input.fromUserId,
        toUserId: order.runnerId,
        rating,
        tags,
        comment: comment || null,
      })
      .returning();

    await recordEvent(tx, {
      orderId: order.id,
      type: "review",
      actorId: input.fromUserId,
      payload: { rating, tags, comment: comment || null },
    });

    const [publisher] = await tx
      .select({ nickname: users.nickname })
      .from(users)
      .where(eq(users.id, input.fromUserId))
      .limit(1);
    const stars = "★".repeat(rating) + "☆".repeat(5 - rating);
    const tail = comment ? `：${comment}` : tags.length ? `（${tags.join("、")}）` : "";
    await notify(tx, {
      userId: order.runnerId,
      orderId: order.id,
      content: `${publisher?.nickname ?? "同学"} 给了你 ${stars} 评价${tail}`,
    });

    return {
      id: created.id,
      orderId: created.orderId,
      rating: created.rating,
      tags: (created.tags ?? []) as string[],
      comment: created.comment,
      fromUserId: created.fromUserId,
      fromNickname: publisher?.nickname ?? "同学",
      toUserId: created.toUserId,
      createdAt: created.createdAt,
    };
  });
}

export interface ReviewSummary {
  count: number;
  /** 平均分（一位小数；没有评价时为 0） */
  avgRating: number;
  /** 最近收到的评价 */
  recent: ReviewView[];
}

/** 某个用户收到的评价汇总（P5 资料卡 / 详情页跑腿者口碑） */
export async function reviewSummaryOf(tx: Executor, userId: number, limit = 5): Promise<ReviewSummary> {
  // v1.11 · 性能：聚合与最近几条合并成一条 SQL（窗口函数在 LIMIT 之前算好），
  // 原来串行 2 个往返，现在 1 个；没有评价时 rows 为空 ⇒ count 自然为 0。
  const rows = await tx
    .select({
      n: sql<number>`COUNT(*) OVER ()::int`,
      avg: sql<number>`COALESCE(AVG(${reviews.rating}) OVER (), 0)::float`,
      id: reviews.id,
      orderId: reviews.orderId,
      rating: reviews.rating,
      tags: reviews.tags,
      comment: reviews.comment,
      fromUserId: reviews.fromUserId,
      fromNickname: users.nickname,
      toUserId: reviews.toUserId,
      createdAt: reviews.createdAt,
    })
    .from(reviews)
    .innerJoin(users, eq(users.id, reviews.fromUserId))
    .where(eq(reviews.toUserId, userId))
    .orderBy(desc(reviews.createdAt))
    .limit(limit);

  const count = rows[0]?.n ?? 0;
  return {
    count,
    avgRating: count > 0 ? Math.round((rows[0]?.avg ?? 0) * 10) / 10 : 0,
    recent: rows.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      rating: r.rating,
      tags: (r.tags ?? []) as string[],
      comment: r.comment,
      fromUserId: r.fromUserId,
      fromNickname: r.fromNickname,
      toUserId: r.toUserId,
      createdAt: r.createdAt,
    })),
  };
}
