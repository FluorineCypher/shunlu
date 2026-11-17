"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, fen, patch } from "@/lib/client";
import { LoadingBlock } from "@/components/Loading";

type BatchOrder = {
  id: number;
  code: string;
  status: string;
  bizType: "food" | "buy";
  pickupPoint: string;
  dropBuilding: string;
  dropFloor: number | null;
  dropRoom: string | null;
  runnerRewardFen: number;
  earnedFen: number;
};

type Detail = {
  batch: {
    id: number;
    orderCount: number;
    expectedRewardFen: number;
    autoComplete: boolean;
    status: string;
    allDone: boolean;
    canToggleAutoComplete: boolean;
  };
  orders: BatchOrder[];
  totals: {
    orderCount: number;
    activeCount: number;
    settledCount: number;
    failedCount: number;
    expectedRewardFen: number;
    potentialBonusFen: number;
    expectedTotalFen: number;
    earnedFen: number;
    earnedBonusFen: number;
  };
  bonusEligible: boolean;
  isRunner: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  open: "待接单",
  accepted: "待取餐",
  picked: "待送达",
  delivered: "待确认",
  completed: "已完成",
  expired: "已过期",
  cancelled: "已取消",
  abnormal: "异常",
};

export default function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState<string | null>(null);
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  const load = useCallback(async (batchId: string) => {
    const res = await api<Detail & { ok: boolean }>(`/api/batches/${batchId}`);
    setData(res);
  }, []);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    load(id).catch((e: Error) => alive && setError(e.message));
    // 5 秒轮询：别的窗口确认收货 / 单子超时回收，这里要自己更新
    const timer = setInterval(() => {
      load(id).catch(() => {});
    }, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [id, load]);

  const toggleAutoComplete = async () => {
    if (!id || !data || busy) return;
    setBusy(true);
    try {
      await patch(`/api/batches/${id}`, { autoComplete: !data.batch.autoComplete });
      await load(id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <main className="px-4 py-10 text-center">
        <p className="text-xs text-[var(--c-danger)]">{error}</p>
        <Link href="/" className="mt-3 inline-block text-xs text-[var(--c-ink-3)] underline underline-offset-4">
          回大厅
        </Link>
      </main>
    );
  }
  if (!data) return <main>
    <LoadingBlock rows={2} />
  </main>;

  const { batch, totals, orders, bonusEligible } = data;
  const done = batch.allDone;

  return (
    <main className="px-4 pt-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="sl-kicker">BATCH</span>
            <span className="sl-kicker-rule" aria-hidden />
          </div>
          <h2 className="sl-hero mt-1.5">批次 #{batch.id}</h2>
        </div>
        <span className="sl-tag mt-0.5 shrink-0">{done ? "已结束" : "进行中"}</span>
      </div>

      {/* 本趟收入：接单时就能看到合计，结算后换成实际到账 */}
      <section className="sl-card mt-3 p-4">
        <div className="text-[11px] text-[var(--c-ink-3)]">{done ? "本批次实际到手" : "本批次预计到手"}</div>
        {/* 改：金额用 tabular-nums + 唯一强调色，不叠渐变/投影 */}
        <div className="sl-num mt-0.5 text-[26px] font-semibold leading-8 tracking-tight text-[var(--c-accent)]">
          ¥{fen(done ? totals.earnedFen : totals.expectedTotalFen)}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--c-ink-2)]">
          <span>
            赏金 <b className="sl-num font-medium">¥{fen(totals.expectedRewardFen)}</b>
          </span>
          {bonusEligible && totals.potentialBonusFen > 0 && (
            <span>
              · 批量加成 <b className="sl-num font-medium">¥{fen(totals.potentialBonusFen)}</b>
            </span>
          )}
          {!bonusEligible && (
            <span className="text-[var(--c-ink-3)]">· 同楼栋满 3 单方可享受批量加成</span>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-[var(--c-border-2)] pt-2 text-[11px] text-[var(--c-ink-3)]">
          <span>
            共 {totals.orderCount} 单 · 进行中 {totals.activeCount} · 已完成 {totals.settledCount}
            {totals.failedCount > 0 ? ` · 失败 ${totals.failedCount}` : ""}
          </span>
          {done && totals.earnedBonusFen > 0 && (
            <span className="sl-num">含加成 ¥{fen(totals.earnedBonusFen)}</span>
          )}
        </div>
      </section>

      {/* 送达即完成：批次专属开关（单 10 分钟自动确认，比默认 2 小时快） */}
      {batch.canToggleAutoComplete && (
        <section className="sl-card mt-2.5 flex items-center justify-between p-4">
          <div className="min-w-0 pr-3">
            <div className="text-[13px] font-medium text-[var(--c-ink)]">送达即完成</div>
            <div className="mt-0.5 text-[11px] leading-4 text-[var(--c-ink-3)]">
              {batch.autoComplete
                ? "已开启：送达后 10 分钟自动确认，无需等待发布者"
                : "已关闭：送达后需发布者确认，最长 2 小时后自动确认"}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={batch.autoComplete}
            disabled={busy}
            onClick={toggleAutoComplete}
            className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-50 ${
              batch.autoComplete
                ? "border-[var(--c-ink)] bg-[var(--c-ink)]"
                : "border-[var(--c-border)] bg-[var(--c-surface-2)]"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-[left] ${
                batch.autoComplete ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </section>
      )}

      <div className="mt-4 flex items-center justify-between">
        <span className="sl-section">逐单进度</span>
        <span className="text-[11px] text-[var(--c-ink-3)]">进入详情逐单履约</span>
      </div>

      <div className="mt-2 flex flex-col gap-2">
        {orders.map((o, i) => (
          <Link
            key={o.id}
            href={`/orders/${o.id}`}
            className="sl-card flex items-center gap-3 p-3 transition-[opacity,transform] active:scale-[0.99] active:opacity-95"
          >
            <span className="sl-num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--c-surface-2)] text-[11px] font-medium text-[var(--c-ink-2)]">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[13px] font-medium text-[var(--c-ink)]">{o.pickupPoint}</span>
                {o.bizType === "buy" && <span className="sl-tag">代买</span>}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-[var(--c-ink-3)]">
                → {o.dropBuilding}
                {o.dropFloor ? ` · ${o.dropFloor} 层` : ""}
                {o.dropRoom ? ` · ${o.dropRoom}` : ""}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="sl-num text-[13px] font-medium text-[var(--c-ink)]">
                ¥{fen(o.status === "completed" ? o.earnedFen : o.runnerRewardFen)}
              </div>
              <div className="text-[10px] text-[var(--c-ink-3)]">{STATUS_LABEL[o.status] ?? o.status}</div>
            </div>
          </Link>
        ))}
      </div>

      {done && (
        <div className="mt-4 rounded-[var(--radius)] bg-[var(--c-surface-2)] p-3 text-center">
          <p className="text-[11px] leading-5 text-[var(--c-ink-2)]">
            本批次已结束：实际到手 <b className="sl-num font-semibold text-[var(--c-ink)]">¥{fen(totals.earnedFen)}</b>
            {totals.earnedBonusFen > 0 ? `（含加成 ¥${fen(totals.earnedBonusFen)}）` : ""}
          </p>
          <Link href="/" className="sl-btn sl-btn-secondary mt-2 px-4 py-2 text-xs">
            返回大厅继续接单
          </Link>
        </div>
      )}

      <p className="mt-4 text-center text-[11px] leading-5 text-[var(--c-ink-3)]">
        批次内各订单独立判定：任一订单超时或异常，不影响其他订单继续完成。
      </p>
    </main>
  );
}
