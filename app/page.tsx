"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog } from "antd-mobile";
import OrderCard from "@/components/OrderCard";
import { IconLayers, IconPlus } from "@/components/icons";
import { api, fen, post } from "@/lib/client";
import { BusyLabel, LoadingBlock } from "@/components/Loading";
import { BONUS_MIN_BATCH_SIZE, calcBonusFen } from "@/server/rules/constants";

type Row = {
  id: number;
  bizType: "food" | "buy";
  status: string;
  pickupPoint: string;
  dropBuilding: string;
  dropFloor: number | null;
  note: string | null;
  rewardFen: number;
  runnerRewardFen: number;
  acceptDeadlineAt: string | null;
  expectDeliveryAt?: string | null;
  publisherNickname?: string;
  publisherCredit?: number;
  publisherGender?: string | null;
  addonCount?: number | null;
  leftSec?: number | null;
  blockedByGender?: boolean;
};

type Mine = { id: number; status: string; bizType: string; dropBuilding: string; role: string };

const MINE_LABEL: Record<string, string> = {
  open: "待接",
  accepted: "已接",
  picked: "已取",
  delivered: "待确认",
};

/** v1.10 · 与后端 batchTimeConflict 同一口径：最后一个取货点取完 → 最早送达截止，至少 5 分钟 */
const PICKUP_STEP_MS = 3 * 60_000;
const MIN_GAP_MS = 5 * 60_000;

function timeConflictOf(rows: Row[], nowMs: number): string | null {
  if (rows.length < 2) return null;
  const points = new Set(rows.map((r) => r.pickupPoint.trim()));
  const lastPickupAt = nowMs + Math.max(0, points.size - 1) * PICKUP_STEP_MS;
  const deadlines = rows
    .map((r) => ({
      id: r.id,
      at: (r.expectDeliveryAt ? new Date(r.expectDeliveryAt).getTime() : nowMs + 20 * 60_000),
    }))
    .sort((a, b) => a.at - b.at);
  const gap = deadlines[0].at - lastPickupAt;
  if (gap < MIN_GAP_MS) {
    return `所选最早一单只剩 ${Math.max(0, Math.round(gap / 60_000))} 分钟就要送达，取完 ${points.size} 个取货点不够 5 分钟余量，请少选一单`;
  }
  return null;
}

export default function HallPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Row[]>([]);
  const [mine, setMine] = useState<Mine[]>([]);
  const [slots, setSlots] = useState(0);
  const [myBuilding, setMyBuilding] = useState<string>("-");
  /** v1.31 · 我在「我的」页保存的楼层，用于常驻「同栋同层优先」排序 */
  const [myFloor, setMyFloor] = useState<number | null>(null);
  const [myGender, setMyGender] = useState<string>("-");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState<string>("全部");
  /** v1.10 · 默认只看同栋（找不到自己的单时退回全部） */
  const [sameBuildingOnly, setSameBuildingOnly] = useState(true);

  /** 批次接单（P4）：勾选 ≥2 单一起带走 */
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await api<{
      orders: Row[];
      mine: Mine[];
      slots: number;
      myBuilding?: string;
      myFloor?: number | null;
      myGender?: string;
    }>("/api/hall");
    setOrders(data.orders);
    setMine(data.mine ?? []);
    setSlots(data.slots ?? 0);
    if (data.myBuilding) setMyBuilding(data.myBuilding);
    setMyFloor(typeof data.myFloor === "number" ? data.myFloor : null);
    if (data.myGender) setMyGender(data.myGender);
  }, []);

  useEffect(() => {
    let alive = true;
    load()
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    // 大厅每 5 秒刷新：过期/被接走的单要在演示里自己消失，不能靠手刷
    const timer = setInterval(() => {
      load().catch(() => {});
    }, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [load]);

  // 支持 /?building=女寝3号楼 直达某个楼栋（发布页「我自己去接」跳转过来）
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("building");
    if (fromUrl) {
      setBuilding(fromUrl);
      setSameBuildingOnly(false);
    }
  }, []);

  const buildings = useMemo(() => {
    const list = ["全部", ...Array.from(new Set(orders.map((o) => o.dropBuilding)))];
    // 从发布页「不发了，去接单」跳过来时，楼栋可能还没有单
    return list.includes(building) ? list : [...list, building];
  }, [orders, building]);

  const myBuildingNorm = myBuilding.replace(/\s+/g, "");
  const hasMyBuilding = myBuildingNorm.length > 0 && myBuildingNorm !== "-";
  const isSameBuilding = (o: Row) => hasMyBuilding && o.dropBuilding.replace(/\s+/g, "") === myBuildingNorm;

  const filtered = useMemo(() => {
    let list = building === "全部" ? orders : orders.filter((o) => o.dropBuilding === building);
    // v1.10 · 默认只带同栋单（可在筛选行关掉）
    if (sameBuildingOnly && hasMyBuilding && building === "全部") list = list.filter(isSameBuilding);
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, building, sameBuildingOnly, hasMyBuilding, myBuildingNorm]);

  /**
   * v1.31 排序（用户口径，m00386）：
   * 1) 同栋同层 → 同栋 → 其它（常驻生效，不必先选中某一单）
   * 2) 同档内保持后端顺序：即将截止的在前（accept_deadline 升序）
   */
  const shown = useMemo(() => {
    const score = (o: Row) => {
      if (!isSameBuilding(o)) return 2;
      if (myFloor !== null && o.dropFloor === myFloor) return 0;
      return 1;
    };
    return [...filtered].sort((a, b) => score(a) - score(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, myFloor, hasMyBuilding, myBuildingNorm]);

  const selectedRows = filtered.filter((o) => selected.includes(o.id));
  const selectedFen = selectedRows.reduce((s, o) => s + o.runnerRewardFen, 0);
  const selectedBuilding = selectedRows[0]?.dropBuilding ?? null;
  const nowMs = Date.now();
  const conflict = picking ? timeConflictOf(selectedRows, nowMs) : null;
  // v1.36 · 同批满 3 单才有每单 +5%，没满就直说还差几单，别让人以为勾 2 单也有加成
  const batchBonusFen =
    selectedRows.length >= BONUS_MIN_BATCH_SIZE
      ? selectedRows.reduce((s, o) => s + calcBonusFen(o.runnerRewardFen), 0)
      : 0;
  const bonusGap = Math.max(0, BONUS_MIN_BATCH_SIZE - selectedRows.length);
  // v1.37 · 并发位不足 3 时永远凑不到加成：别给「帮我凑满」这种点了没反应的按钮
  const batchCap = Math.min(slots, BONUS_MIN_BATCH_SIZE);
  const canFillMore =
    batchCap >= BONUS_MIN_BATCH_SIZE && selectedRows.length > 0 && selectedRows.length < batchCap;

    // 按「楼栋 · 楼层」分组，保证同层多单全部展开（v1.10 模块 1）
  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const o of shown) {
      const key = `${o.dropBuilding} · ${o.dropFloor ? `${o.dropFloor} 层` : "其他"}`;
      const list = map.get(key) ?? [];
      list.push(o);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [shown]);

  const toggle = (o: Row) => {
    setNote(null);
    if (o.blockedByGender) {
      setNote("该订单由女性用户发布，按园区规定男性跑手不可接单");
      return;
    }
    if (selected.includes(o.id)) {
      setSelected(selected.filter((x) => x !== o.id));
      return;
    }
    if (slots <= 0) {
      setNote("当前接单已达上限，请先完成进行中的订单");
      return;
    }
    if (selected.length >= batchCap) {
      setNote(
        batchCap < BONUS_MIN_BATCH_SIZE
          ? `本次最多带 ${batchCap} 单（已选 ${selected.length} 单），先取消一单`
          : `已选满 ${batchCap} 单，先取消一单再换`,
      );
      return;
    }
    if (selectedBuilding && selectedBuilding !== o.dropBuilding) {
      setNote("批量接单仅支持同一楼栋，请先取消已选订单");
      return;
    }
    const next = [...selectedRows, o];
    const conflictMsg = timeConflictOf(next, nowMs);
    if (conflictMsg) {
      setNote(conflictMsg);
      return;
    }
    setSelected([...selected, o.id]);
  };

  /**
   * v1.36 · 选中一单后没人想再翻列表：按当前这单的楼栋，把能一起带的单自动勾到加成门槛。
   * 复用 toggle 的全部约束（性别 / 并发位 / 同栋 / 时间余量），凑不满就老实说明原因。
   */
  const fillBonus = () => {
    const base = selectedRows[0];
    if (!base) return;
    const limit = Math.min(slots, BONUS_MIN_BATCH_SIZE);
    let picked = [...selected];
    let rows = [...selectedRows];
    for (const o of shown) {
      if (rows.length >= limit) break;
      if (picked.includes(o.id) || o.blockedByGender) continue;
      if (o.dropBuilding !== base.dropBuilding) continue;
      const next = [...rows, o];
      if (timeConflictOf(next, Date.now())) continue;
      picked = [...picked, o.id];
      rows = next;
    }
    setSelected(picked);
    setNote(
      picked.length >= BONUS_MIN_BATCH_SIZE
        ? null
        : picked.length >= slots
          ? `并发位只够带 ${picked.length} 单，加成需同一批 ${BONUS_MIN_BATCH_SIZE} 单同栋`
          : `同栋暂时凑不到 ${BONUS_MIN_BATCH_SIZE} 单，已勾上能一起带的 ${picked.length} 单`,
    );
  };

  const startPicking = () => {
    setPicking(true);
    setSelected([]);
    setNote(null);
  };
  const stopPicking = () => {
    setPicking(false);
    setSelected([]);
    setNote(null);
  };

  const grabBatch = async () => {
    if (selected.length < 1 || busy || conflict) return;
    // v1.10 · 非同栋提醒：默认只带同栋，跨栋必须二次确认
    if (hasMyBuilding && !isSameBuilding(selectedRows[0])) {
      const ok = await Dialog.confirm({
        title: "跨楼栋接单确认",
        content: `你登记的楼栋为「${myBuilding}」，所选订单位于「${selectedBuilding}」。是否继续接单？`,
        confirmText: "继续接单",
        cancelText: "取消",
      });
      if (!ok) return;
    }
    setBusy(true);
    setNote(null);
    try {
      const res = await post<{ ok: boolean; batchId: number | null; orderIds: number[] }>("/api/orders/accept", {
        orderIds: selected,
      });
      if (res.batchId) router.push(`/batches/${res.batchId}`);
      else router.push(`/orders/${res.orderIds[0]}`);
    } catch (e) {
      setNote((e as Error).message);
      setSelected([]);
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const decorate = (o: Row) => ({
    ...o,
    sameBuilding: isSameBuilding(o),
    sameFloor: isSameBuilding(o) && myFloor !== null && o.dropFloor === myFloor,
    blockedByGender: myGender === "male" && o.publisherGender === "female",
  });

  // v1.28：卡片入场错峰序号——跨分组连续编号，同屏内错开 45ms/档
  const riseOffsets: number[] = [];
  {
    let acc = 0;
    for (const [, list] of groups) {
      riseOffsets.push(acc);
      acc += list.length;
    }
  }

  return (
    <main className="px-4 pt-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="sl-kicker">HALL</span>
            <span className="sl-kicker-rule" aria-hidden />
          </div>
          <h2 className="sl-hero mt-1.5">顺路大厅</h2>
          <p className="sl-hero-sub">
            {!loading && !error && shown.length > 0 ? (
              <>
                当前 <b className="sl-num font-medium text-[var(--c-ink-2)]">{shown.length}</b> 单待接 · 同栋同层优先展示
              </>
            ) : (
              "同栋订单优先展示，可就近接单"
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
          {shown.length >= 2 && (
            <button
              type="button"
              onClick={picking ? stopPicking : startPicking}
              className="sl-mini"
              aria-pressed={picking}
            >
              <IconLayers />
              {picking ? "取消" : "一起接"}
            </button>
          )}
          <Link href="/publish" className="sl-mini" data-solid="true">
            <IconPlus />
            发单
          </Link>
        </div>
      </div>

      {picking && (
        <div className="mt-2 rounded-[var(--radius)] bg-[var(--c-surface-2)] px-3 py-2 text-[11px] leading-5 text-[var(--c-ink-2)]">
          支持将同一楼栋的 <b className="font-medium text-[var(--c-ink)]">{batchCap >= 3 ? `2–${batchCap} 单` : `${Math.max(1, batchCap)} 单`}</b>一并接单：一次取货、一趟送达；
          勾满 <b className="font-medium text-[var(--c-ink)]">{BONUS_MIN_BATCH_SIZE} 单同批</b>每单再 +5%。
          列表已按<b className="font-medium text-[var(--c-ink)]">同栋同层优先</b>排序；不同取货点之间需预留 5 分钟余量。
          当前还可接 <b className="sl-num font-medium text-[var(--c-ink)]">{slots}</b> 单。
        </div>
      )}
      {note && <p className="mt-2 text-[11px] text-[var(--c-danger)]">{note}</p>}
      {conflict && <p className="mt-2 text-[11px] text-[var(--c-danger)]">{conflict}，暂不可接单</p>}

      {mine.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="sl-section">我的进行中</span>
            <Link href="/me" className="text-[11px] text-[var(--c-ink-3)] transition-colors hover:text-[var(--c-ink-2)]">
              全部 →
            </Link>
          </div>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {mine.map((m) => (
              <Link
                key={m.id}
                href={`/orders/${m.id}`}
                className="sl-card flex shrink-0 items-center gap-2 px-3.5 py-2 text-xs transition-[opacity] active:opacity-90"
              >
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    m.role === "publisher" ? "bg-[#FBF3EA] text-[#9A6B33]" : "bg-[#EEF3EE] text-[#5F7A5F]"
                  }`}
                >
                  {m.role === "publisher" ? "我发的" : "我接的"}
                </span>
                <span className="max-w-[9rem] truncate text-[var(--c-ink-2)]">{m.dropBuilding}</span>
                <span className="text-[10px] text-[var(--c-ink-3)]">{MINE_LABEL[m.status] ?? m.status}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {hasMyBuilding && (
          <button
            type="button"
            onClick={() => {
              setSameBuildingOnly(!sameBuildingOnly);
              setBuilding("全部");
              if (picking) setSelected([]);
            }}
            data-active={sameBuildingOnly}
            className={`sl-chip shrink-0 ${
              sameBuildingOnly ? "!border-[var(--c-ink)] !bg-[var(--c-ink)] !font-medium !text-white" : ""
            }`}
          >
            只看同栋 · {myBuilding}
          </button>
        )}
        {buildings.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => {
              setBuilding(b);
              setSameBuildingOnly(false);
              if (picking) setSelected([]);
            }}
            data-active={!sameBuildingOnly && building === b}
            className={`sl-chip shrink-0 ${!sameBuildingOnly && building === b ? "!bg-[var(--c-ink)] !text-white !border-[var(--c-ink)] !font-medium" : ""}`}
          >
            {b}
          </button>
        ))}
      </div>

      {loading && <LoadingBlock rows={2} padded={false} className="mt-1" />}
      {error && <p className="py-10 text-center text-xs text-[var(--c-danger)]">{error}</p>}
      {!loading && !error && shown.length === 0 && (
        <div className="py-14 text-center">
          <p className="text-xs text-[var(--c-ink-3)]">
            {sameBuildingOnly && hasMyBuilding ? `「${myBuilding}」暂无待接订单` : "该楼栋暂无待接订单"}
          </p>
          <div className="mt-3 flex items-center justify-center gap-4">
            {sameBuildingOnly && hasMyBuilding && (
              <button type="button" onClick={() => setSameBuildingOnly(false)} className="text-xs font-medium text-[var(--c-accent)] underline underline-offset-4">
                查看全部楼栋
              </button>
            )}
            <Link href="/publish" className="text-xs font-medium text-[var(--c-accent)] underline underline-offset-4">
              发布订单
            </Link>
          </div>
        </div>
      )}

      <div className={`mt-3 flex flex-col gap-3 ${picking ? "pb-24" : "pb-2"}`}>
        {groups.map(([key, list], gi) => (
          <section key={key}>
            <div className="mb-1.5 flex items-center gap-2 px-0.5">
              <span className="text-[11px] font-medium text-[var(--c-ink-2)]">{key}</span>
              <span className="sl-num text-[10px] text-[var(--c-ink-3)]">{list.length} 单</span>
              {list.some((o) => isSameBuilding(o)) && (
                <span className="rounded-full bg-[#FBF3EA] px-1.5 py-0.5 text-[10px] font-medium text-[#9A6B33]">同栋</span>
              )}
              <span className="h-px flex-1 bg-[var(--c-border-2)]" />
            </div>
            <div className="flex flex-col gap-2.5">
              {list.map((o, i) => (
                <OrderCard
                  key={o.id}
                  index={(riseOffsets[gi] ?? 0) + i}
                  order={decorate(o)}
                  selectable={picking}
                  selected={selected.includes(o.id)}
                  onToggle={() => toggle(o)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* 批次确认条：合计与冲突提示在接之前就能看到（P4 / v1.10） */}
      {picking && (
        <div className="fixed inset-x-0 bottom-[calc(var(--nav-h)+env(safe-area-inset-bottom))] z-20 px-4">
          <div className="mx-auto max-w-[480px] rounded-[var(--radius-lg)] border border-[var(--c-border)] bg-[var(--c-surface)] p-3 shadow-[var(--shadow-2)]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--c-ink-2)]">
                已选 <b className="sl-num font-medium text-[var(--c-ink)]">{selected.length}</b> 单
                {selectedBuilding ? ` · ${selectedBuilding}` : ""}
                {selected.length === 1 && <span className="ml-1 text-[10px] text-[var(--c-ink-3)]">（单笔接单）</span>}
              </span>
              <span className="sl-num font-semibold text-[var(--c-accent)]">共 ¥{fen(selectedFen)}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
              <span className="min-w-0 truncate text-[var(--c-ink-2)]">
                {batchBonusFen > 0
                  ? `同批 ${selected.length} 单 · 每单 +5%`
                  : selected.length >= 1
                    ? canFillMore
                      ? `再带 ${bonusGap} 单，每单多赚 5%`
                      : `并发位只够带 ${batchCap} 单，本批没有加成`
                    : `勾满 ${BONUS_MIN_BATCH_SIZE} 单同批，每单多赚 5%`}
              </span>
              {batchBonusFen > 0 ? (
                <span className="sl-num shrink-0 font-medium text-[var(--c-accent)]">+¥{fen(batchBonusFen)}</span>
              ) : canFillMore ? (
                <button
                  type="button"
                  onClick={fillBonus}
                  className="shrink-0 text-[10px] font-medium text-[var(--c-accent)] underline decoration-dotted underline-offset-2"
                >
                  帮我凑满
                </button>
              ) : null}
            </div>
            <button
              type="button"
              disabled={selected.length < 1 || busy || !!conflict}
              onClick={grabBatch}
              className="sl-btn sl-btn-primary mt-2 w-full py-2.5 text-sm disabled:opacity-40"
            >
              <BusyLabel busy={busy} busyText="接单中">
                {conflict
                  ? "时间余量不足，请减少订单"
                  : selected.length < 1
                    ? "请选择订单"
                    : `接收 ${selected.length} 单`}
              </BusyLabel>
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
