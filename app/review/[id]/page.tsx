"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Toast } from "antd-mobile";
import { api, post, fen } from "@/lib/client";
import { BusyLabel, LoadingBlock } from "@/components/Loading";

/**
 * M2 · 评价页（v1.9，Step 7）：发布者在订单完成后给跑腿者打分。
 * 一单一评；标签最多 3 个；留言最多 100 字。评价不改状态、不发钱（只写 reviews + 事件 + 通知）。
 */

const TAGS = ["准时送到", "态度友好", "沟通顺畅", "包装完好", "下次还找TA"] as const;

type Order = {
  id: number;
  code: string;
  status: string;
  publisherId: number;
  pickupPoint: string;
  dropBuilding: string;
  rewardFen: number;
  runnerRewardFen: number;
  runnerNickname: string | null;
};

type Review = {
  id: number;
  rating: number;
  tags: string[];
  comment: string | null;
  createdAt: string;
};

type Detail = { order: Order; review: Review | null };

function Stars({ value, size = "text-2xl" }: { value: number; size?: string }) {
  return (
    <span className={`${size} tracking-[2px] text-[var(--c-accent)]`} aria-label={`${value} 星`}>
      {"★".repeat(value)}
      <span className="text-[var(--c-border)]">{"★".repeat(5 - value)}</span>
    </span>
  );
}

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Detail | null>(null);
  const [meId, setMeId] = useState<number | null>(null);
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [detail, me] = await Promise.all([
      api<Detail>(`/api/orders/${id}`),
      api<{ user: { id: number } }>("/api/me"),
    ]);
    setData(detail);
    setMeId(me.user.id);
  }, [id]);

  useEffect(() => {
    load().catch((e: Error) => setError(e.message));
  }, [load]);

  function toggleTag(tag: string) {
    setTags((cur) => {
      if (cur.includes(tag)) return cur.filter((t) => t !== tag);
      if (cur.length >= 3) {
        Toast.show({ content: "最多选 3 个标签" });
        return cur;
      }
      return [...cur, tag];
    });
  }

  async function submit() {
    if (rating < 1) return Toast.show({ content: "先点几颗星" });
    setBusy(true);
    try {
      await post(`/api/orders/${id}/review`, { rating, tags, comment });
      Toast.show({ icon: "success", content: "评价已提交" });
      router.replace(`/orders/${id}`);
    } catch (e) {
      Toast.show({ content: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <main className="px-4 py-10 text-center text-xs text-[var(--c-danger)]">
        {error}
        <div className="mt-3">
          <Link href={`/orders/${id}`} className="text-[var(--c-accent)] underline decoration-dotted">
            回到订单
          </Link>
        </div>
      </main>
    );
  }
  if (!data) return <main>
    <LoadingBlock rows={2} />
  </main>;

  const { order, review } = data;
  const isPublisher = meId === order.publisherId;

  // 已评价 / 不是发布者 / 还没完成 —— 三种情况都只展示结果，不给表单
  const blocked =
    review !== null
      ? "该订单已完成评价"
      : !isPublisher
        ? "仅发布者可评价该订单"
        : order.status !== "completed"
          ? "订单完成后方可评价"
          : null;

  return (
    <main className="px-4 pt-3 pb-6">
      <div className="sl-card p-4">
        <div className="sl-section">评价这一单</div>
        <div className="mt-1 text-sm text-[var(--c-ink)]">
          {order.pickupPoint} → {order.dropBuilding}
        </div>
        <div className="mt-0.5 text-[11px] text-[var(--c-ink-3)]">
          {order.code} · 跑腿者 {order.runnerNickname ?? "—"} · 赏金 ¥{fen(order.rewardFen)}
        </div>
      </div>

      {blocked ? (
        <div className="sl-card mt-3 p-4">
          <p className="text-xs text-[var(--c-ink-2)]">{blocked}</p>
          {review && (
            <div className="mt-3">
              <Stars value={review.rating} size="text-lg" />
              {review.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {review.tags.map((t) => (
                    <span key={t} className="sl-tag">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {review.comment && <p className="mt-2 text-xs leading-relaxed text-[var(--c-ink-2)]">{review.comment}</p>}
            </div>
          )}
          <Link href={`/orders/${id}`} className="sl-btn sl-btn-secondary mt-4 w-full py-2.5 text-xs">
            回到订单
          </Link>
        </div>
      ) : (
        <>
          <div className="sl-card mt-3 p-4">
            <div className="sl-label">跑腿者表现</div>
            <div className="mt-2 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`${n} 星`}
                  onClick={() => setRating(n)}
                  className={`text-3xl leading-none transition-colors ${
                    n <= rating ? "text-[var(--c-accent)]" : "text-[var(--c-border)]"
                  }`}
                >
                  ★
                </button>
              ))}
              <span className="ml-2 text-[11px] text-[var(--c-ink-3)]">
                {rating === 0 ? "点星星打分" : ["", "很差", "一般", "还不错", "很好", "超预期"][rating]}
              </span>
            </div>

            <div className="sl-label mt-4">标签（最多 3 个）</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TAGS.map((t) => (
                <button key={t} type="button" onClick={() => toggleTag(t)} className="sl-chip" data-active={tags.includes(t)}>
                  {t}
                </button>
              ))}
            </div>

            <div className="sl-label mt-4">评价内容（选填）</div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 100))}
              rows={3}
              maxLength={100}
              placeholder="例如：雨天仍准时送达，包装完好无损"
              className="sl-field mt-2 w-full resize-none"
            />
            <div className="mt-1 text-right text-[10px] text-[var(--c-ink-3)]">{comment.length}/100</div>

            <button type="button" disabled={busy || rating < 1} onClick={submit} className="sl-btn sl-btn-primary mt-2 w-full py-3">
              <BusyLabel busy={busy} busyText="提交中">
                提交评价
              </BusyLabel>
            </button>
            <p className="mt-2 text-center text-[10px] leading-relaxed text-[var(--c-ink-3)]">
              评价将通知跑腿者，不影响结算金额；信用分已在结算完成时 +1
            </p>
          </div>
        </>
      )}
    </main>
  );
}
