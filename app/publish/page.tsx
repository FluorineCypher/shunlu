"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Toast, Popup } from "antd-mobile";
import { api, post, fen } from "@/lib/client";
import { BusyLabel } from "@/components/Loading";

const ACCEPT_MINUTES = [5, 10, 15, 30];

/**
 * v1.41 · 推荐卡面上限 2 单（用户 m02291 口径），实际还受剩余并发位限制：
 * 从大厅点进详情（手上 0 单）时，主单 + 这 2 单 = 3 单，才吃得到 +5% 加成；
 * 在发布页顺手接单时本来就有自己的单要取，这一批只有 2 单，永远凑不满 3 单。
 * v1.41 修复：摆出来的单数 = min(2, 剩余并发位)，不再出现「摆 2 单却只能勾 1 单」。
 */
const NEARBY_RECOMMEND_MAX = 2;

/** 同层优先（与详情页「同栋推荐」排序同一口径），再截到「这一批最多能接的单数」 */
function recommendNearby(orders: NearbyOrder[], floor: string, max: number): NearbyOrder[] {
  const f = Number(floor);
  const sameFloor = (o: NearbyOrder) => (f && o.dropFloor === f ? 0 : 1);
  return [...orders]
    .sort((a, b) => sameFloor(a) - sameFloor(b))
    .slice(0, Math.max(0, max));
}

type Me = { user: { dormBuilding: string | null; dormFloor: number | null; dormRoom: string | null; phoneTail: string | null } };

type NearbyOrder = {
  id: number;
  pickupPoint: string;
  dropFloor: number | null;
  note: string | null;
  runnerRewardFen: number;
  /** 该单若进同栋批量（≥bonusMinBatch 单）能拿到的加成（v1.32） */
  bonusFen: number;
  publisherNickname: string | null;
  addonCount: number;
  leftSec: number | null;
};

type Nearby = {
  building: string;
  slots: number;
  /** 本次还能带几单（空位）；v1.32 另给「手上已有几单进行中」用于说明 */
  active: number;
  /** 批量加成门槛：同一批同栋 ≥bonusMinBatch 单才有 */
  bonusMinBatch: number;
  totalRewardFen: number;
  orders: NearbyOrder[];
};

export default function PublishPage() {
  const router = useRouter();
  const [bizType, setBizType] = useState<"food" | "buy">("food");
  const [pickupPoint, setPickupPoint] = useState("东门外卖柜");
  const [dropBuilding, setDropBuilding] = useState("");
  const [dropFloor, setDropFloor] = useState("");
  const [dropRoom, setDropRoom] = useState("");
  const [phoneTail, setPhoneTail] = useState("");
  const [note, setNote] = useState("");
  const [itemDesc, setItemDesc] = useState("");
  /** 捎带项（v1.3）：外卖单顺路带的小件，预算与赏金一起冻结 */
  const [addons, setAddons] = useState<{ title: string; budgetYuan: string }[]>([]);
  const [rewardYuan, setRewardYuan] = useState("5");
  const [budgetYuan, setBudgetYuan] = useState("10");
  const [acceptMinutes, setAcceptMinutes] = useState(10);
  /** 预订单（v1.22）：是否预约 + 预约送达的绝对时刻（毫秒，默认 30 分钟后） */
  const [scheduleMode, setScheduleMode] = useState<"now" | "pick">("now");
  const [scheduleAtMs, setScheduleAtMs] = useState<number | null>(null);
  /** v1.23：时段面板（每次打开按「此刻」重算可选时段，不再用滚轮选到已过去的时间） */
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDay, setScheduleDay] = useState<0 | 1>(0);
  const [slotNow, setSlotNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [nearby, setNearby] = useState<Nearby | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);

  // v1.41 · 推荐卡只摆「真能一起接」的单：min(2, 剩余并发位)，默认全勾上；用户可自行取消
  const nearbyRecs = useMemo(
    () =>
      nearby
        ? recommendNearby(nearby.orders, dropFloor, Math.min(NEARBY_RECOMMEND_MAX, nearby.slots))
        : [],
    [nearby, dropFloor],
  );
  useEffect(() => {
    setPicked(nearbyRecs.map((o) => o.id));
  }, [nearbyRecs]);

  function togglePick(id: number, slots: number) {
    setPicked((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= slots) {
        Toast.show(`最多同时带 ${slots} 单`);
        return cur;
      }
      return [...cur, id];
    });
  }

  const pickedTotalFen = nearby
    ? nearby.orders.filter((o) => picked.includes(o.id)).reduce((s, o) => s + o.runnerRewardFen, 0)
    : 0;

  // v1.40 · 这一批最多 2 单，永远凑不满 3 单加成，不再算/展示 +5%（v1.32 的 pickedBonusFen 已删）

  const addonTotalFen = addons.reduce((s, a) => {
    const v = Math.round(Number(a.budgetYuan) * 100);
    return s + (Number.isFinite(v) && v > 0 ? v : 0);
  }, 0);
  const rewardFenPreview = Math.round(Number(rewardYuan) * 100);
  const totalFrozenFen = (Number.isFinite(rewardFenPreview) ? rewardFenPreview : 0) + addonTotalFen;

  function addAddon() {
    setAddons((cur) => (cur.length >= 5 ? cur : [...cur, { title: "", budgetYuan: "3" }]));
  }

  function updateAddon(idx: number, patch: Partial<{ title: string; budgetYuan: string }>) {
    setAddons((cur) => cur.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  }

  function removeAddon(idx: number) {
    setAddons((cur) => cur.filter((_, i) => i !== idx));
  }

  /** 预约时段粒度：10 分钟一档（v1.23） */
  const SLOT_STEP_MIN = 10;

  /** 毫秒 -> HH:MM */
  function hhmm(ms: number) {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  /**
   * 某一天可选的时段（v1.23，用户 m01662：以前「今天」那一列的 00–23 时全部可选，
   * 选到「今天早上」这种已经过去的点只是被悄悄顺延到明天 —— 交互上等于允许定过去的时间）。
   * 现在只生成「此刻 + 20 分钟」以后、且不超过「此刻 + 24 小时」的整 10 分钟点：
   * 过去的时刻根本不在列表里，点不到、也存不进去。
   */
  function slotList(dayOffset: 0 | 1, nowMs: number): number[] {
    const earliest = nowMs + 20 * 60_000;
    const latest = nowMs + 24 * 60 * 60_000;
    const base = new Date(nowMs);
    const dayStart = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset).getTime();
    const out: number[] = [];
    for (let t = dayStart; t < dayStart + 24 * 60 * 60_000; t += SLOT_STEP_MIN * 60_000) {
      if (t < earliest) continue;
      if (t > latest) break;
      out.push(t);
    }
    return out;
  }

  /** 打开时段面板（打开这一刻才算范围，页面开久了也不会给出过期时段） */
  function openSchedule() {
    const nowMs = Date.now();
    const todaySlots = slotList(0, nowMs);
    const target = scheduleAtMs ?? nowMs + 30 * 60_000;
    const sameDay = new Date(target).toDateString() === new Date(nowMs).toDateString();
    setSlotNow(nowMs);
    setScheduleDay(todaySlots.length === 0 ? 1 : sameDay ? 0 : 1);
    setScheduleOpen(true);
  }

  /** 点一个时段就直接定下来（不再有「确定」按钮，少一步） */
  function chooseSlot(atMs: number) {
    setScheduleMode("pick");
    setScheduleAtMs(atMs);
    setScheduleOpen(false);
  }

  /** 预约送达的绝对时刻（存毫秒；仅展示用，服务端按 now() 重新算） */
  const scheduleAt = new Date(scheduleAtMs === null ? Date.now() + 30 * 60_000 : scheduleAtMs);
  /** 距现在还有多少分钟（向上取整，避免「选 10:00 显示 09:59」） */
  const scheduleLeadMin = Math.max(0, Math.ceil((scheduleAt.getTime() - Date.now()) / 60_000));
  /** 主文案：今天 18:30 / 明天 09:15 */
  const scheduleLabel = (() => {
    const d = scheduleAt;
    const today = new Date();
    const dayDiff = Math.round(
      (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
        new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
        86_400_000,
    );
    const clock = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    if (dayDiff === 0) return `今天 ${clock}`;
    if (dayDiff === 1) return `明天 ${clock}`;
    return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, "0")} ${clock}`;
  })();
  /** 次要文案：约 1 小时 30 分钟后 */
  const scheduleRelative = (() => {
    const h = Math.floor(scheduleLeadMin / 60);
    const m = scheduleLeadMin % 60;
    if (h <= 0) return `约 ${m} 分钟后`;
    if (m === 0) return `约 ${h} 小时后`;
    return `约 ${h} 小时 ${m} 分钟后`;
  })();

  /** 时段面板里的候选（v1.23）：只在面板打开时算，关着不白算 */
  const todaySlots = scheduleOpen ? slotList(0, slotNow) : [];
  const tomorrowSlots = scheduleOpen ? slotList(1, slotNow) : [];
  const openSlots = scheduleDay === 0 ? todaySlots : tomorrowSlots;
  const earliestSlotMs = todaySlots[0] ?? tomorrowSlots[0] ?? slotNow + 20 * 60_000;

  // v1.31 · 自动带入「我的」页保存的宿舍信息，省掉每次手填
  useEffect(() => {
    api<Me>("/api/me")
      .then((d) => {
        if (d.user.dormBuilding) setDropBuilding(d.user.dormBuilding);
        if (d.user.dormFloor) setDropFloor(String(d.user.dormFloor));
        if (d.user.dormRoom) setDropRoom(d.user.dormRoom);
        if (d.user.phoneTail) setPhoneTail(d.user.phoneTail);
      })
      .catch(() => {});
  }, []);

  const loadNearby = useCallback(async (building: string) => {
    if (!building.trim()) {
      setNearby(null);
      return;
    }
    try {
      const d = await api<Nearby>(`/api/hall/nearby?building=${encodeURIComponent(building.trim())}`);
      setNearby(d);
    } catch {
      setNearby(null);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void loadNearby(dropBuilding), 300);
    return () => clearTimeout(t);
  }, [dropBuilding, loadNearby]);

  async function acceptNearby(ids: number[]) {
    if (accepting || ids.length === 0) return;
    setAccepting(true);
    try {
      await post("/api/orders/accept", ids.length === 1 ? { orderId: ids[0] } : { orderIds: ids });
      Toast.show({ icon: "success", content: `已接收 ${ids.length} 单` });
      router.push("/");
    } catch (e) {
      Toast.show((e as Error).message);
      await loadNearby(dropBuilding);
      setAccepting(false);
    }
  }

  async function submit() {
    if (!pickupPoint.trim() || !dropBuilding.trim()) {
      Toast.show("请填写取货点与送达楼栋");
      return;
    }
    // 预约单：提交时才把绝对时刻换成「距今多少分钟」（页面停久了也不会漂）；
    // v1.23：面板只给「此刻 + 20 分钟」以后的时段，万一停留太久落到 20 分钟以内，就对齐到 20 分钟，不拦人重选
    let expectDeliveryMinutes =
      scheduleMode === "pick" ? Math.round((scheduleAt.getTime() - Date.now()) / 60_000) : null;
    if (expectDeliveryMinutes !== null && expectDeliveryMinutes < 20) {
      expectDeliveryMinutes = 20;
      Toast.show("预约时间已调整为最早可选时间（20 分钟后）");
    }
    setBusy(true);
    try {
      const { order } = await post<{ order: { id: number } }>("/api/orders", {
        bizType,
        pickupPoint: pickupPoint.trim(),
        dropBuilding: dropBuilding.trim(),
        dropFloor: dropFloor ? Number(dropFloor) : null,
        dropRoom: dropRoom.trim() || null,
        phoneTail: phoneTail.trim() || null,
        note: note.trim() || null,
        itemDesc: itemDesc.trim() || null,
        rewardFen: Math.round(Number(rewardYuan) * 100),
        budgetFen: bizType === "buy" ? Math.round(Number(budgetYuan) * 100) : 0,
        addons:
          bizType === "food"
            ? addons
                .filter((a) => a.title.trim())
                .map((a) => ({ title: a.title.trim(), budgetFen: Math.round(Number(a.budgetYuan) * 100) }))
            : [],
        acceptMinutes,
        expectDeliveryMinutes,
      });
      Toast.show({ icon: "success", content: "订单已发布，赏金已冻结" });
      router.push(`/orders/${order.id}`);
    } catch (e) {
      Toast.show((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="px-4 pt-3">
      {/* v1.28：mono kicker + 中文 hero，和标题排版统一 */}
      <div className="flex items-center gap-2">
        <span className="sl-kicker">PUBLISH</span>
        <span className="sl-kicker-rule" aria-hidden />
      </div>
      <h2 className="sl-hero mt-1.5">发布顺路单</h2>
      <p className="sl-hero-sub">填写取货点与送达信息，发布后即可被同栋用户顺路接单。</p>

      {/* 改：白卡统一 sl-card（细边框+极轻阴影），不再自由圆角/大阴影 */}
      <div className="sl-card mt-3 p-4">
        {/* 改：类型切换用 .sl-seg 分段控件，去 emoji 图标（线性图标原则） */}
        <div className="sl-seg mb-4">
          {(["food", "buy"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setBizType(t)}
              data-active={bizType === t}
              className="sl-seg-item"
            >
              {t === "food" ? "代取外卖" : "代买物品"}
            </button>
          ))}
        </div>

        {/* 改：间距统一 4/8 体系（12px 一档），标签/输入框走 .sl-label/.sl-field（focus 用墨色 3px 光晕） */}
        <div className="space-y-3">
          <div>
            <label className="sl-label">取餐 / 取货点</label>
            <input className="sl-field" value={pickupPoint} onChange={(e) => setPickupPoint(e.target.value)} placeholder="如 东门外卖柜" />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="sl-label">送达楼栋</label>
              <input className="sl-field" value={dropBuilding} onChange={(e) => setDropBuilding(e.target.value)} placeholder="如 女寝3号楼" />
            </div>
            <div className="w-20">
              <label className="sl-label">楼层</label>
              <input className="sl-field" value={dropFloor} onChange={(e) => setDropFloor(e.target.value)} inputMode="numeric" placeholder="4" />
            </div>
            <div className="w-24">
              <label className="sl-label">房间号</label>
              <input className="sl-field" value={dropRoom} onChange={(e) => setDropRoom(e.target.value)} placeholder="412" />
            </div>
          </div>

          {/* 改：同楼等待卡去渐变 → .sl-soft 弱琥珀底 + 细边框；文案/勾选交互不变 */}
          {nearby && nearbyRecs.length > 0 && (
            <div className="sl-soft p-3">
              <div className="text-[13px] font-medium text-[var(--c-ink)]">
                同栋推荐 {nearbyRecs.length} 单
              </div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-[var(--c-ink-2)]">
                {nearby.building} · 同层优先，最多推荐 {nearbyRecs.length} 单一起带走。
              </div>

              <div className="mt-2.5 flex flex-col gap-1.5">
                {nearbyRecs.map((o) => {
                  const on = picked.includes(o.id);
                  const sameFloor = Number(dropFloor) > 0 && o.dropFloor === Number(dropFloor);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => togglePick(o.id, nearbyRecs.length)}
                      className={`flex items-center justify-between gap-2 rounded-[var(--radius)] px-2.5 py-2 text-left transition-colors ${
                        on ? "bg-[var(--c-surface)] border border-[var(--c-accent-border)]" : "bg-[color-mix(in_srgb,var(--c-surface)_55%,transparent)] border border-transparent"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={`flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full text-[9px] transition-colors ${
                            on ? "bg-[var(--c-accent)] text-white" : "bg-[var(--c-surface)] text-transparent ring-1 ring-[var(--c-border)]"
                          }`}
                        >
                          ✓
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-[11px] font-medium text-[var(--c-ink-2)]">
                            {o.pickupPoint}
                            {o.dropFloor ? ` → ${o.dropFloor} 层` : ""}
                            {sameFloor && <span className="ml-1 text-[9px] font-medium text-[var(--c-accent)]">同层</span>}
                          </div>
                          <div className="truncate text-[10px] text-[var(--c-ink-3)]">
                            {o.publisherNickname} 发的{o.note ? ` · ${o.note}` : ""}
                            {o.addonCount > 0 ? ` · 捎带 ${o.addonCount} 件` : ""}
                          </div>
                        </div>
                      </div>
                      <span className="sl-num shrink-0 text-xs font-medium text-[var(--c-accent)]">+¥{fen(o.runnerRewardFen)}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-2.5 flex items-center justify-between text-[11px] text-[var(--c-ink-2)]">
                <span>
                  已选 <span className="sl-num font-medium">{picked.length}</span> 单 · +¥{fen(pickedTotalFen)}
                </span>
                {nearby.slots < 1 && <span className="text-[var(--c-danger)]">同时接单已达上限</span>}
              </div>

              {/* v1.41 · 卡面只摆能一起接的单数：这一批永远凑不满 3 单加成，不再出现 +5% 诱导 */}
              <div className="mt-1 text-[10px] leading-relaxed text-[var(--c-ink-3)]">
                这一批最多 {nearbyRecs.length} 单，凑不满{" "}
                {nearby.bonusMinBatch} 单加成
                {nearby.active > 0 ? `；手上已有 ${nearby.active} 单进行中` : ""}。
              </div>

              {/* 改：主按钮 .sl-btn-primary（墨色填充、10px 圆角、按压缩放），去彩色底 */}
              <button
                type="button"
                disabled={accepting || nearby.slots < 1 || picked.length === 0}
                onClick={() => acceptNearby(picked)}
                className="sl-btn sl-btn-primary mt-2.5 w-full py-2.5 text-xs"
              >
                <BusyLabel busy={accepting} busyText="接单中">
                  {picked.length === 0
                    ? "请先选择订单"
                    : `接收 ${picked.length} 单（+¥${fen(pickedTotalFen)}）`}
                </BusyLabel>
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="sl-label">手机尾号（仅对接单跑腿者可见）</label>
              <input className="sl-field" value={phoneTail} onChange={(e) => setPhoneTail(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={4} placeholder="后四位" />
            </div>
          </div>

          {bizType === "buy" && (
            <div>
              <label className="sl-label">采购额度（元）</label>
              <input className="sl-field" value={budgetYuan} onChange={(e) => setBudgetYuan(e.target.value)} inputMode="decimal" />
              {/* v1.10 · 金额不足时跑腿者有权拒单，所以必须提前讲清「留足」 */}
              <div className="mt-2 rounded-[var(--radius)] bg-[rgba(180,83,9,0.06)] px-3 py-2 text-[11px] leading-5 text-[var(--c-ink-2)]">
                <b className="font-medium text-[var(--c-ink)]">请预留充足的采购金额</b>（含包装费、配送差价等）。
                额度不足时，跑腿者有权拒绝该订单并全额退款，不计入双方信用，建议适当留出余量。
              </div>
            </div>
          )}

          {bizType === "food" && (
            <div className="rounded-[var(--radius)] border border-[var(--c-border-2)] p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-medium text-[var(--c-ink)]">捎带清单（可选）</div>
                  <div className="mt-0.5 text-[11px] text-[var(--c-ink-3)]">
                    取货时可一并代购小件（如饮用水、纸巾等）。捎带预算与赏金一并冻结，跑腿者填写实付后随订单结算；
                    预算不足时，跑腿者可仅拒绝捎带项，外卖照常送达，预算原路退回。
                  </div>
                </div>
              </div>

              {addons.length > 0 && (
                <div className="mt-2.5 space-y-2">
                  {addons.map((a, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        className="sl-field flex-1"
                        value={a.title}
                        maxLength={20}
                        onChange={(e) => updateAddon(idx, { title: e.target.value })}
                        placeholder="如 可乐 1 瓶"
                      />
                      <div className="relative w-24">
                        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-[var(--c-ink-3)]">¥</span>
                        <input
                          className="sl-field sl-num w-full pl-5 text-right"
                          value={a.budgetYuan}
                          inputMode="decimal"
                          onChange={(e) => updateAddon(idx, { budgetYuan: e.target.value })}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAddon(idx)}
                        className="shrink-0 px-1 text-xs text-[var(--c-ink-3)] transition-colors hover:text-[var(--c-danger)]"
                        aria-label="删除这一项"
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-2.5 flex items-center justify-between">
                <button
                  type="button"
                  onClick={addAddon}
                  disabled={addons.length >= 5}
                  className="sl-btn sl-btn-secondary px-3 py-1.5 text-[11px]"
                >
                  + 添加一项
                </button>
                {addonTotalFen > 0 && (
                  <span className="sl-num text-[11px] text-[var(--c-ink-2)]">捎带预算 ¥{fen(addonTotalFen)}</span>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="sl-label">{bizType === "buy" ? "代买物品" : "备注"}</label>
            <textarea className="sl-field resize-none" rows={2} value={bizType === "buy" ? itemDesc : note} onChange={(e) => (bizType === "buy" ? setItemDesc(e.target.value) : setNote(e.target.value))} placeholder={bizType === "buy" ? "如 一杯冰美式 + 一个三明治" : "如：放门口，无需敲门"} />
          </div>

          {/* 改：快捷金额/截止按钮选中态统一墨色填充，去 per-btn 自由样式 */}
          <div>
            <label className="sl-label">赏金（元，2–20）</label>
            <div className="flex gap-2">
              {[3, 5, 8, 10].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setRewardYuan(String(v))}
                  className={`sl-btn flex-1 px-3 py-2 text-xs ${
                    Number(rewardYuan) === v ? "sl-btn-primary" : "sl-btn-secondary"
                  }`}
                >
                  ¥{v}
                </button>
              ))}
              <input className="sl-field sl-num w-20 text-center" value={rewardYuan} onChange={(e) => setRewardYuan(e.target.value)} inputMode="decimal" />
            </div>
          </div>

          {/* 改（v1.7）：送达时间改为「立即送 / 预约」+ 滚动选择具体小时与分钟，不再固定几档 */}
          <div>
            <label className="sl-label">送达时间</label>
            <div className="sl-seg">
              {(["now", "pick"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setScheduleMode(m);
                    if (m === "pick") setScheduleAtMs((cur) => cur ?? Date.now() + 30 * 60_000);
                  }}
                  data-active={scheduleMode === m}
                  className="sl-seg-item"
                >
                  {m === "now" ? "立即送" : "预约送达"}
                </button>
              ))}
            </div>

            {scheduleMode === "pick" && (
              <>
                <button
                  type="button"
                  onClick={openSchedule}
                  className="sl-card mt-2 flex w-full items-center justify-between px-3 py-3 text-left"
                >
                  <span>
                    <span className="sl-num block text-[15px] font-medium">{scheduleLabel} 送达</span>
                    <span className="mt-0.5 block text-[11px] text-[var(--c-ink-3)]">
                      {scheduleRelative} · 点击选择具体时间
                    </span>
                  </span>
                  <span className="text-xs text-[var(--c-ink-3)]">修改</span>
                </button>
                <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--c-ink-2)]">
                  若到该时间仍无人接单，订单将自动取消并全额退款。饭点、雨天建议预留 15–30 分钟余量，避免与上课、会议冲突；
                  如因外卖未送达导致超时，责任由发单方承担，请勿将时间安排得过紧。
                </p>
              </>
            )}
            {scheduleMode === "now" && (
              <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--c-ink-3)]">
                即时配送请选择「立即送」；如需提前安排请选择「预约送达」，每 10 分钟一档，已过时段不可选。
              </p>
            )}
          </div>

          {/* v1.23：预约时段面板 —— 只列出「此刻 + 20 分钟」以后的整 10 分钟点，过去的时间点不在列表里 */}
          <Popup
            visible={scheduleOpen}
            onMaskClick={() => setScheduleOpen(false)}
            bodyStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "74vh" }}
          >
            <div className="flex max-h-[74vh] flex-col pb-4">
              <div className="flex items-center justify-between px-4 pt-4">
                <span className="text-[15px] font-medium">选择送达时间</span>
                <button type="button" className="text-xs text-[var(--c-ink-3)]" onClick={() => setScheduleOpen(false)}>
                  关闭
                </button>
              </div>
              <p className="px-4 pt-1 text-[11px] leading-relaxed text-[var(--c-ink-3)]">
                最早可约 {hhmm(earliestSlotMs)}（需至少提前 20 分钟）· 最晚明天 {hhmm(slotNow + 24 * 60 * 60_000)} · 每 10 分钟一档
              </p>
              <div className="mt-2 flex gap-2 px-4">
                {([0, 1] as const).map((d) => {
                  const n = d === 0 ? todaySlots.length : tomorrowSlots.length;
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={n === 0}
                      onClick={() => setScheduleDay(d)}
                      className={`sl-btn flex-1 py-2 text-xs ${scheduleDay === d ? "sl-btn-primary" : "sl-btn-secondary"}`}
                    >
                      {d === 0 ? "今天" : "明天"}
                      {n === 0 ? "（暂无可约时段）" : `（${n} 个时段）`}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex-1 overflow-y-auto px-4">
                {openSlots.length === 0 ? (
                  <p className="py-6 text-center text-xs text-[var(--c-ink-3)]">当日暂无可约时段，请选择其他日期</p>
                ) : (
                  <div className="grid grid-cols-4 gap-1.5">
                    {openSlots.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => chooseSlot(t)}
                        className={`sl-btn sl-num py-2 text-[13px] ${scheduleAtMs === t ? "sl-btn-primary" : "sl-btn-secondary"}`}
                      >
                        {hhmm(t)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Popup>
          {scheduleMode === "now" && (
            <div>
              <label className="sl-label">接单截止</label>
              <div className="flex gap-2">
                {ACCEPT_MINUTES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setAcceptMinutes(m)}
                    className={`sl-btn flex-1 py-2 text-xs ${
                      acceptMinutes === m ? "sl-btn-primary" : "sl-btn-secondary"
                    }`}
                  >
                    {m} 分钟
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={submit}
        className="sl-btn sl-btn-primary mt-4 mb-2 w-full py-3"
      >
        <BusyLabel busy={busy} busyText="发布中">
          {`发布订单并冻结 ¥${fen(totalFrozenFen)}`}
        </BusyLabel>
      </button>
      <p className="px-2 pb-2 text-center text-[11px] leading-relaxed text-[var(--c-ink-3)]">
        完成后跑腿者获得 75%，平台收取 25% 服务费；捎带实付全额报销，未用完的预算随结算退回。
      </p>
    </main>
  );
}
