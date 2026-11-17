"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, Toast } from "antd-mobile";
import { api, countdown, fen, post } from "@/lib/client";
import { mergePeerPicked, shouldApplyDefault } from "@/lib/peer-selection";
import { LoadingBlock } from "@/components/Loading";
import { BONUS_MIN_BATCH_SIZE, calcBonusFen } from "@/server/rules/constants";

type Order = {
  id: number;
  code: string | null;
  bizType: "food" | "buy";
  status: string;
  publisherId: number;
  publisherNickname: string;
  publisherCredit: number;
  runnerId: number | null;
  runnerNickname: string | null;
  /** 跑腿者口碑（M2）：收到的评价条数与平均分 */
  runnerRating?: { count: number; avgRating: number } | null;
  pickupPoint: string;
  dropBuilding: string;
  dropFloor: number | null;
  dropRoom: string | null;
  phoneTail: string | null;
  note: string | null;
  itemDesc: string | null;
  rewardFen: number;
  runnerRewardFen: number;
  budgetFen: number;
  actualFen: number | null;
  budgetStatus: string;
  requestedBudgetFen: number | null;
  expectDeliveryAt: string | null;
  canReportUnarrived: boolean;
  acceptLeftSec: number | null;
  deliverLeftSec: number | null;
  budgetStatusLabel?: string;
  canConfirm: boolean;
  canCancel: boolean;
  canConfirmBudget: boolean;
  canReview: boolean;
  abnormalReason: string | null;
  /** v1.10 · 取消原因（如「代买额度不足：…」） */
  cancelReason?: string | null;
  proofPhotoUrl: string | null;
  linkedPrevId: number | null;
  addons: Addon[];
  canReportAddons: boolean;
  settlePreview: SettlePreview | null;
  /** v1.10 · 代买额度不够可拒单 / 捎带额度不够可拒捎带 */
  canRefuseBuy?: boolean;
  canRejectAddons?: boolean;
  /** v1.10 · 性别硬规则：女生发布的单，男跑手不能接 */
  publisherGender?: string | null;
  blockedByGender?: boolean;
  /** 管理员查看他人订单时为 true（房号 / 尾号 / 实付全可见） */
  viewAsAdmin?: boolean;
};

type Event = { id: number; type: string; at: string; payload: unknown };
type ReviewView = {
  id: number;
  rating: number;
  tags: string[];
  comment: string | null;
  fromNickname: string;
  createdAt: string;
};
type Detail = { order: Order; events: Event[]; review: ReviewView | null };

/** 捎带项（v1.3）：外卖单捆绑的代买小件，和主单一起结算 */
type Addon = { id: number; title: string; budgetFen: number; actualFen: number | null; status: "pending" | "bought" | "failed" };
type SettlePreview = {
  rewardFen: number;
  addonBudgetFen: number;
  addonActualFen: number;
  refundFen: number;
  overBudgetFen: number;
  runnerTakeFen: number;
  feeFen: number;
  publisherCostFen: number;
};

type PeerOrder = {
  id: number;
  pickupPoint: string;
  dropBuilding: string;
  dropFloor: number | null;
  runnerRewardFen: number;
  rewardFen: number;
  acceptDeadlineAt: string | null;
  expectDeliveryAt: string | null;
  publisherGender?: string | null;
  blockedByGender?: boolean;
  leftSec: number | null;
  publisherNickname?: string | null;
  note?: string | null;
  addonCount?: number;
};
type Nearby = { slots: number; orders: PeerOrder[]; myBuilding?: string };

/** v1.10 · 与后端 batchTimeConflict 同口径：取完最后一个取货点 → 最早送达截止，至少留 5 分钟 */
const PICKUP_STEP_MS = 3 * 60_000;
const MIN_GAP_MS = 5 * 60_000;
function timeConflictOf(
  rows: { id: number; pickupPoint: string; expectDeliveryAt: string | null }[],
  nowValue: number,
): string | null {
  if (rows.length < 2) return null;
  const points = new Set(rows.map((r) => r.pickupPoint.trim()));
  const lastPickupAt = nowValue + Math.max(0, points.size - 1) * PICKUP_STEP_MS;
  const earliest = rows
    .map((r) => ({
      id: r.id,
      at: r.expectDeliveryAt
        ? new Date(r.expectDeliveryAt).getTime()
        : nowValue + 20 * 60_000,
    }))
    .sort((a, b) => a.at - b.at)[0];
  const gap = earliest.at - lastPickupAt;
  if (gap < MIN_GAP_MS) {
    return `最早一单只剩 ${Math.max(0, Math.round(gap / 60_000))} 分钟送达；取完 ${points.size} 个取货点后余量不足 5 分钟，请减少选择单数`;
  }
  return null;
}

const STATUS: Record<string, string> = {
  open: "待接单",
  accepted: "已接单 · 去取",
  picked: "已取到 · 在送",
  delivered: "待发布者确认",
  completed: "已完成",
  expired: "已过期",
  cancelled: "已取消",
  abnormal: "异常单",
};

const EVENT: Record<string, string> = {
  created: "发布",
  accepted: "接单",
  picked: "取到",
  delivered: "送达",
  confirmed: "确认收货",
  cancelled: "取消",
  expired: "过期",
  abnormal: "转异常",
  abandon: "放弃",
  unpickable: "取不到",
  budget_request: "申请加价",
  budget_agree: "同意加价",
  budget_decline: "不同意加价",
  budget_reported: "实付上报",
  budget_confirmed: "找零结算",
  bumped: "加价重发",
  addons_reported: "捎带实付上报",
  addons_auto_failed: "捎带自动落定",
  addons_rejected: "拒绝捎带",
  buy_refused: "拒绝代买",
  unarrived: "反馈餐未送达",
  vendor_late: "外卖没送到（发单者担责）",
  review: "评价",
};

/**
 * v1.41 · 推荐卡上限 2 单：主单 + 2 = 3 单才凑得到同栋 +5%（用户 m02306 口径）。
 * 实际摆几行还看「剩余并发位」：摆出来的必须是能勾上的，否则第二行点了只会弹「先取消一单」。
 */
const PEER_RECOMMEND_MAX = 2;

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Detail | null>(null);
  const [meId, setMeId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actualYuan, setActualYuan] = useState("");
  const [peers, setPeers] = useState<PeerOrder[]>([]);
  /**
   * v1.10 · 同楼层/同栋多单勾选（默认按剩余并发位勾好，可取消）。
   * v1.15：勾选只在单子本身变化时合并（被抢走补位 / 并发位缩水裁剪），5 秒轮询不再重置。
   */
  const [peerPicked, setPeerPicked] = useState<number[]>([]);
  /** 剩余并发位（来自 nearby），用于限制勾选数量 */
  const [peerSlots, setPeerSlots] = useState(1);
  /** v1.15 · 已经为哪张单做过默认勾选：只有换单才重新初始化，同一张单的轮询不覆盖用户选择 */
  const peerDefaultFor = useRef<number | null>(null);
  /** 我的楼栋与性别（跨栋二次确认 / 性别硬规则提示） */
  const [myBuilding, setMyBuilding] = useState<string>("-");
  const [myGender, setMyGender] = useState<string>("-");
  /** 捎带项输入：每件实付（元）或「没买到」 */
  const [addonInputs, setAddonInputs] = useState<Record<number, { yuan: string; failed: boolean }>>({});
  /** 预约单「餐没到手」的附言：告诉对方是外卖真的晚了，不是自己没留时间 */
  const [unarrivedNote, setUnarrivedNote] = useState("");
  /**
   * 平台抽佣不公开：发布者侧「跑腿者到手」默认隐藏，只在需要核对时手动打开。
   * 偏好存 localStorage，按浏览器记住，不影响服务端算钱。
   */
  const [revealRunnerTake, setRevealRunnerTake] = useState(false);
  useEffect(() => {
    setRevealRunnerTake(localStorage.getItem("sl_show_runner_take") === "1");
  }, []);
  function toggleRunnerTake() {
    const next = !revealRunnerTake;
    setRevealRunnerTake(next);
    localStorage.setItem("sl_show_runner_take", next ? "1" : "0");
  }

  const load = useCallback(async () => {
    const [detail, me] = await Promise.all([
      api<Detail>(`/api/orders/${id}`),
      api<{ user: { id: number; dormBuilding?: string | null; dormGender?: string | null } }>("/api/me"),
    ]);
    setData(detail);
    setMeId(me.user.id);
    if (me.user.dormBuilding) setMyBuilding(me.user.dormBuilding);
    if (me.user.dormGender) setMyGender(me.user.dormGender);
  }, [id]);

  useEffect(() => {
    let alive = true;
    load().catch((e: Error) => alive && setError(e.message));
    // 每 5 秒再拉一次：惰性过期/自动确认由服务端在读取时判定，轮询才能看到状态自行推进
    const timer = setInterval(() => {
      load().catch(() => {});
    }, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [load]);

  // 接单确认页：同一楼栋还有几单在等，可一起接（不占额外点击）
  //
  // v1.15 · 这里以前依赖 `openOrder` 整个对象，而详情页每 5 秒轮询都会 `setData` 一个新对象，
  // 于是每次轮询都重跑本 effect、把 `peerPicked` 覆盖成「默认前 N 单」——用户勾第三个会被弹回去。
  // 现在依赖只取稳定标量（单号/状态/发布者/楼栋/楼层），轮询不再触发重跑；勾选由
  // `mergePeerPicked` 合并：保留仍可接的、被抢走的按列表从上往下补空位，并发位缩水裁尾部。
  const openOrder = data?.order;
  const peerOrderId = openOrder?.id ?? null;
  const peerStatus = openOrder?.status ?? null;
  const peerPublisherId = openOrder?.publisherId ?? null;
  const peerBuilding = openOrder?.dropBuilding ?? null;
  const peerFloor = openOrder?.dropFloor ?? null;
  useEffect(() => {
    if (
      peerOrderId == null ||
      peerStatus !== "open" ||
      peerBuilding == null ||
      meId == null ||
      peerPublisherId === meId
    ) {
      setPeers([]);
      setPeerPicked([]);
      peerDefaultFor.current = null;
      return;
    }
    let alive = true;
    const loadPeers = async () => {
      const n = await api<Nearby>(`/api/hall/nearby?building=${encodeURIComponent(peerBuilding)}`);
      if (!alive) return;
      // v1.10 · 同楼栋的单全部列出（同层排前面，方便一眼看清）
      const candidates = n.orders
        .filter((p) => p.id !== peerOrderId)
        .sort((a, b) => {
          const sameA = a.dropFloor === peerFloor ? 0 : 1;
          const sameB = b.dropFloor === peerFloor ? 0 : 1;
          return sameA - sameB;
        });
      const capacity = Math.max(0, (n.slots ?? 1) - 1);
      // v1.41 · 卡面只摆「真能一起勾上」的单：剩余并发位不够就少摆（同层优先已在上面 sort 好）。
      // capacity === 0 ⇒ 这一批没有可加的单，peers 为空、整块不渲染。
      const recommend = candidates.slice(0, Math.min(PEER_RECOMMEND_MAX, capacity));
      setPeers(recommend);
      setPeerSlots(n.slots ?? 1);
      // v1.18 · 只有本栋确实有可接的单，才消费「首次进入」的默认勾选；
      // 否则（接口先返回空、或全被性别规则拦下）把默认勾选留到下一轮，避免永久 0 勾选。
      const initialize = shouldApplyDefault({
        alreadyInitialized: peerDefaultFor.current === peerOrderId,
        candidates: recommend,
      });
      // v1.36 · 默认勾到「加成门槛」为止：这一单 + 2 单 = 同栋 3 单，每单 +5%。
      // 并发位不够或同栋只剩一两单时按实际数量勾，不硬凑也不虚报加成。
      setPeerPicked((prev) => {
        const merged = mergePeerPicked({ prev, candidates: recommend, capacity, initialize });
        const target = Math.min(capacity, recommend.length);
        return initialize ? merged.slice(0, target) : merged;
      });
      if (recommend.some((c) => !c.blockedByGender)) peerDefaultFor.current = peerOrderId;
    };
    loadPeers().catch(() => {
      // 轮询失败保持现状：不清掉用户已经勾好的选择
    });
    // 同栋的单被别人接走时也要尽快反映到勾选里，所以这里同样 5 秒刷一次
    const timer = setInterval(() => {
      loadPeers().catch(() => {});
    }, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [peerOrderId, peerStatus, peerPublisherId, peerBuilding, peerFloor, meId]);

  async function run(fn: () => Promise<unknown>, okText?: string) {
    setBusy(true);
    try {
      await fn();
      if (okText) Toast.show({ icon: "success", content: okText });
      await load();
      router.refresh();
    } catch (e) {
      Toast.show((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deliver() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setBusy(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const up = await api<{ url: string }>("/api/upload", { method: "POST", body: form });
        await post(`/api/orders/${id}/actions`, { action: "deliver", proofPhotoUrl: up.url });
        Toast.show({ icon: "success", content: "已送达，等待发布者确认" });
        await load();
      } catch (e) {
        Toast.show((e as Error).message);
      } finally {
        setBusy(false);
      }
    };
    input.click();
  }

  async function report() {
    const cent = Math.round(Number(actualYuan) * 100);
    if (!cent) return Toast.show("请先填写实付金额");
    setBusy(true);
    try {
      const r = await post<{ order: Order }>(`/api/orders/${id}/buy`, { action: "report", actualFen: cent, photoUrl: "receipt" });
      Toast.show(
        r.order.budgetStatus === "requested" ? "实付超出预算，已通知发布者" : "已上报实付，继续送达",
      );
      await load();
    } catch (e) {
      Toast.show((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitAddons() {
    const o = data?.order;
    if (!o) return;
    try {
      const items = o.addons.map((a) => {
        const st = addonInputs[a.id];
        if (st?.failed) return { id: a.id, failed: true };
        const raw = st?.yuan ?? (a.actualFen != null ? (a.actualFen / 100).toFixed(2) : "");
        const cent = Math.round(Number(raw) * 100);
        if (!cent) throw new Error(`「${a.title}」尚未填写实付金额，未购买请勾选「没买到」`);
        return { id: a.id, actualFen: cent };
      });
      setBusy(true);
      const r = await post<{ totalActualFen: number; overBudgetFen: number }>(`/api/orders/${id}/addons`, { items });
      Toast.show(
        r.overBudgetFen > 0
          ? `已上报实付 ¥${fen(r.totalActualFen)}，超出预算 ¥${fen(r.overBudgetFen)}，发布者确认时补扣`
          : `已上报实付 ¥${fen(r.totalActualFen)}`,
      );
      await load();
    } catch (e) {
      Toast.show((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** v1.10 · 接单（可带同栋多单）；跨楼栋要二次确认 */
  async function acceptWith(peerIds: number[]) {
    const o = data?.order;
    if (!o) return;
    const sameBuilding =
      myBuilding.replace(/\s+/g, "").length > 0 &&
      myBuilding !== "-" &&
      myBuilding.replace(/\s+/g, "") === o.dropBuilding.replace(/\s+/g, "");
    if (!sameBuilding && myBuilding !== "-") {
      const ok = await Dialog.confirm({
        title: "跨楼栋接单确认",
        content: `你登记的楼栋为「${myBuilding}」，该订单位于「${o.dropBuilding}」。是否继续接单？`,
        confirmText: "还是接",
        cancelText: "再想想",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await post<{ ok: boolean; batchId: number | null; orderIds: number[] }>("/api/orders/accept", {
        orderIds: [o.id, ...peerIds],
      });
      Toast.show({ icon: "success", content: peerIds.length ? `接下了 ${peerIds.length + 1} 单` : "接单成功" });
      if (res.batchId) router.push(`/batches/${res.batchId}`);
      else await load();
    } catch (e) {
      Toast.show((e as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  }

  /** v1.10 · 代买额度不够：跑腿者拒单（整单取消、全额退回、不扣信用） */
  async function refuseBuyOrder() {
    const reason = await new Promise<string | null>((resolve) => {
      Dialog.confirm({
        title: "拒绝代买订单",
        content: (
          <div className="text-xs leading-6 text-[var(--c-ink-2)]">
            若发布时填写的采购额度明显不足，可拒绝该订单。拒绝后整单取消、托管金额全额退回发布者，<b className="text-[var(--c-ink)]">不扣你的信用分</b>。
            可补充说明原因，便于对方后续预留充足额度。
          </div>
        ),
        confirmText: "确认拒绝",
        cancelText: "再看看",
      }).then((ok) => resolve(ok ? "" : null));
    });
    if (reason === null) return;
    setBusy(true);
    try {
      const r = await post<{ refundedFen: number }>(`/api/orders/${id}/actions`, { action: "refuseBuy", reason });
      Toast.show({ icon: "success", content: `已拒绝，已退回 ¥${fen(r.refundedFen)}` });
      await load();
    } catch (e) {
      Toast.show((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** v1.10 · 捎带额度不够：只取消捎带，外卖继续送 */
  async function rejectAddonsOfOrder() {
    const ok = await Dialog.confirm({
      title: "拒绝捎带",
      content: "将仅取消捎带的小件（预算退回发布者），外卖仍照常取送；不扣除你的信用分。",
      confirmText: "拒绝捎带",
      cancelText: "再看看",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await post<{ refundedFen: number }>(`/api/orders/${id}/actions`, { action: "rejectAddons" });
      Toast.show({ icon: "success", content: `已拒绝捎带项，已退回 ¥${fen(r.refundedFen)}` });
      await load();
    } catch (e) {
      Toast.show((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <main className="px-4 py-10 text-center text-xs text-[var(--c-danger)]">{error}</main>;
  if (!data) return <main>
    <LoadingBlock rows={2} />
  </main>;

  const { order: o, events, review } = data;
  const isPublisher = meId === o.publisherId;
  const isRunner = meId === o.runnerId;
  const canAccept = o.status === "open" && !isPublisher;
  const canGrabBuy =
    o.status === "accepted" && o.bizType === "buy" && isRunner && o.budgetStatus !== "requested";
  const canReport = canGrabBuy && o.actualFen === null;
  const canBudgetConfirm = o.canConfirmBudget && isPublisher && o.actualFen !== null;
  const canRequestAgree = o.budgetStatus === "requested" && isPublisher;
  // 跑腿实得（抽佣后）只对「接单人本人」和「还能接这单的人」展示；发布者与旁观者一律看赏金
  const showRunnerTake = isRunner || canAccept;
  // 改（m02503）：捎带项没确认（既没填实付也没标没买到）时，送达与确认收货都要拦住——否则预算会被当成全退
  const pendingAddons = o.addons.filter((a) => a.status === "pending");
  const addonsBlocked = pendingAddons.length > 0;

  return (
    <main className="px-4 pt-3 pb-8">
      {/* 改：返回链接弱化为次级色，hover 微反馈 */}
      <button type="button" onClick={() => router.back()} className="text-xs text-[var(--c-ink-3)] transition-colors hover:text-[var(--c-ink-2)]">
        ← 返回
      </button>

      {/* 改（m02503）：管理员查看他人订单时标明视角，隐私字段只在这里露出 */}
      {o.viewAsAdmin && (
        <div className="sl-soft mt-2 px-3 py-2 text-[11px] leading-relaxed text-[var(--c-ink-2)]">
          管理员视图 · 含房号、手机尾号与实付明细，仅用于纠纷处理
        </div>
      )}

      {/* 改：信息卡 → sl-card；类型 tag → 中性 sl-tag */}
      <div className="sl-card mt-2 p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="sl-tag">{o.bizType === "buy" ? "代买" : "外卖"}</span>
              <span className="text-[13px] font-medium text-[var(--c-ink)]">{STATUS[o.status] ?? o.status}</span>
            </div>
            <div className="mt-2 text-sm">{o.pickupPoint}</div>
            <div className="mt-0.5 text-xs text-[var(--c-ink-2)]">
              → {o.dropBuilding}
              {o.dropFloor ? ` · ${o.dropFloor} 层` : ""}
            </div>
            {/* 改：送达信息（隐私字段）从彩色琥珀底 → sl-soft 弱琥珀块，仍然醒目但低饱和 */}
            {(o.dropRoom || o.phoneTail) && (
              <div className="sl-soft mt-2 px-2.5 py-2 text-xs text-[var(--c-ink-2)]">
                送达信息：{o.dropRoom ? `房号 ${o.dropRoom}` : ""} {o.phoneTail ? `· 尾号 ${o.phoneTail}` : ""}
              </div>
            )}
            {o.expectDeliveryAt && (
              <div className="sl-soft mt-2 px-2.5 py-2 text-xs text-[var(--c-ink-2)]">
                预约送达 {new Date(o.expectDeliveryAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                {o.status === "open" ? " 前接单，到点没人接自动取消退款" : "（承诺时间，超时会扣跑腿信用）"}
              </div>
            )}
            {o.note && <div className="mt-2 text-xs text-[var(--c-ink-2)]">备注：{o.note}</div>}
            {o.linkedPrevId != null && (
              <div className="mt-1 text-[11px] text-[var(--c-ink-3)]">由 #{o.linkedPrevId} 加价重发而来</div>
            )}
            {o.bizType === "buy" && o.itemDesc && <div className="mt-1 text-xs text-[var(--c-ink-2)]">代买：{o.itemDesc}</div>}
            {o.abnormalReason && <div className="mt-1 text-xs text-[var(--c-danger)]">{o.abnormalReason}</div>}
            {o.cancelReason && <div className="mt-1 text-xs text-[var(--c-danger)]">{o.cancelReason}</div>}
            {o.proofPhotoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={o.proofPhotoUrl} alt="送达凭证" className="mt-2 max-h-40 rounded-[var(--radius)] border border-[var(--c-border-2)] object-cover" />
            )}
          </div>
          <div className="shrink-0 text-right">
            {/* 改：跑腿视角只看「实得」，不再同时展示赏金（避免自相矛盾）；发布者视角只看赏金 */}
            {showRunnerTake ? (
              <>
                <div className="sl-num text-[17px] font-semibold leading-6 text-[var(--c-accent)]">¥{fen(o.runnerRewardFen)}</div>
                <div className="sl-num text-[10px] text-[var(--c-ink-3)]">实得</div>
              </>
            ) : (
              <>
                <div className="sl-num text-[17px] font-semibold leading-6 text-[var(--c-accent)]">¥{fen(o.rewardFen)}</div>
                <div className="sl-num text-[10px] text-[var(--c-ink-3)]">赏金</div>
              </>
            )}
            {o.bizType === "buy" && (
              <div className="sl-num mt-1 text-[10px] text-[var(--c-ink-3)]">
                额度 ¥{fen(o.budgetFen)}
                {o.actualFen != null ? ` · 实付 ¥${fen(o.actualFen)}` : ""}
              </div>
            )}
          </div>
        </div>

        {/* 改：分隔线与弱文字统一 tokens */}
        <div className="mt-3 flex items-center justify-between border-t border-[var(--c-border-2)] pt-2 text-[11px] text-[var(--c-ink-3)]">
          <span className="truncate">发布者 {o.publisherNickname} · 信用 {o.publisherCredit}</span>
          <span className="sl-num">
            {o.runnerNickname ? `跑腿 ${o.runnerNickname}` : ""}
            {o.runnerRating && o.runnerRating.count > 0 ? ` ★${o.runnerRating.avgRating}（${o.runnerRating.count}）` : ""}
            {o.status === "open" && o.acceptLeftSec != null ? ` · 剩 ${countdown(o.acceptLeftSec)}` : ""}
            {["accepted", "picked"].includes(o.status) && o.deliverLeftSec != null ? ` · 剩 ${countdown(o.deliverLeftSec)}` : ""}
          </span>
        </div>
      </div>

      {/* 捎带清单（v1.3）：外卖单顺路带的小件，和主单一起结算 */}
      {o.addons.length > 0 && (
        <div className="sl-card mt-3 p-4">
          <div className="flex items-center justify-between">
            <div className="sl-section">捎带清单</div>
            <span className="sl-num text-[11px] text-[var(--c-ink-3)]">
              预算 ¥{fen(o.budgetFen)}
              {o.actualFen != null ? ` · 实付 ¥${fen(o.actualFen)}` : ""}
            </span>
          </div>
          <ul className="mt-2 space-y-1.5">
            {o.addons.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-[var(--c-ink)]">{a.title}</span>
                <span className="sl-num shrink-0 text-[var(--c-ink-2)]">
                  {a.status === "bought" && a.actualFen != null
                    ? `实付 ¥${fen(a.actualFen)}`
                    : a.status === "failed"
                      ? "没买到 · 预算退回"
                      : `预算 ¥${fen(a.budgetFen)}`}
                </span>
              </li>
            ))}
          </ul>

          {o.canReportAddons && (
            <div className="mt-3 border-t border-[var(--c-border-2)] pt-3">
              <div className="text-[11px] leading-relaxed text-[var(--c-ink-3)]">
                买好就填真实实付；没买到点「没买到」，这件预算会退回发布者
              </div>
              <div className="mt-2 space-y-2">
                {o.addons.map((a) => {
                  const st = addonInputs[a.id] ?? {
                    yuan: a.actualFen != null ? (a.actualFen / 100).toFixed(2) : "",
                    failed: false,
                  };
                  return (
                    <div key={a.id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--c-ink-2)]">{a.title}</span>
                      {st.failed ? (
                        <span className="w-20 text-right text-[11px] text-[var(--c-ink-3)]">没买到</span>
                      ) : (
                        <input
                          className="sl-field sl-num w-20 text-right"
                          inputMode="decimal"
                          placeholder="实付"
                          value={st.yuan}
                          onChange={(e) => setAddonInputs((cur) => ({ ...cur, [a.id]: { ...st, yuan: e.target.value } }))}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => setAddonInputs((cur) => ({ ...cur, [a.id]: { ...st, failed: !st.failed } }))}
                        className={`shrink-0 text-[11px] transition-colors ${
                          st.failed ? "text-[var(--c-accent)]" : "text-[var(--c-ink-3)] hover:text-[var(--c-ink-2)]"
                        }`}
                      >
                        {st.failed ? "改回填实付" : "没买到"}
                      </button>
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={submitAddons}
                className="sl-btn sl-btn-primary mt-2.5 w-full py-2.5 text-xs"
              >
                提交捎带实付
              </button>
            </div>
          )}
        </div>
      )}

      {/* 改：加价申请条从紫底 → sl-soft（去掉第二彩色） */}
      {o.budgetStatus === "requested" && (
        <div className="sl-soft mt-3 p-3 text-xs text-[var(--c-ink-2)]">
          跑腿者申请把额度提到 ¥{fen(o.requestedBudgetFen)}
          {isPublisher && <span className="ml-1">（请选择同意或不同意）</span>}
        </div>
      )}

      {/* 结算预览（v1.3）：捎带实付报销 + 未花完预算退回，确认前先看清明细 */}
      {isPublisher && o.settlePreview && (
        <div className="sl-card mt-3 p-4 text-[11px] text-[var(--c-ink-2)]">
          <div className="sl-section">这单会怎么结算</div>
          <div className="mt-2 space-y-1">
            <div className="flex justify-between">
              <span>赏金</span>
              <span className="sl-num">¥{fen(o.settlePreview.rewardFen)}</span>
            </div>
            {o.addons.length > 0 && (
              <div className="flex justify-between">
                <span>捎带实付（预算 ¥{fen(o.settlePreview.addonBudgetFen)}）</span>
                <span className="sl-num">¥{fen(o.settlePreview.addonActualFen)}</span>
              </div>
            )}
            {o.settlePreview.refundFen > 0 && (
              <div className="flex justify-between">
                <span>预算没花完，退回你</span>
                <span className="sl-num text-[var(--c-accent)]">+¥{fen(o.settlePreview.refundFen)}</span>
              </div>
            )}
            {o.settlePreview.overBudgetFen > 0 && (
              <div className="flex justify-between">
                <span>实付超出预算，需补扣</span>
                <span className="sl-num text-[var(--c-danger)]">−¥{fen(o.settlePreview.overBudgetFen)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-[var(--c-border-2)] pt-1 text-[var(--c-ink)]">
              <span>你实际支出</span>
              <span className="sl-num">¥{fen(o.settlePreview.publisherCostFen)}</span>
            </div>
            {/* 改：平台抽佣不公开——跑腿者实得默认不展示，需要核对时手动打开（偏好按浏览器记住） */}
            {revealRunnerTake && (
              <div className="flex justify-between text-[var(--c-ink-3)]">
                <span>跑腿者到手（75% 赏金 + 实付报销）</span>
                <span className="sl-num">¥{fen(o.settlePreview.runnerTakeFen)}</span>
              </div>
            )}
            <div className="pt-0.5 text-right">
              <button
                type="button"
                onClick={toggleRunnerTake}
                className="text-[10px] text-[var(--c-ink-3)] underline decoration-dotted underline-offset-2"
              >
                {revealRunnerTake ? "隐藏跑腿者实得" : "显示跑腿者实得"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 动作区：只调接口，不判状态（状态由服务端规则再判一次） */}
      {/* 改：全部按钮走 .sl-btn 体系——主=墨底、次=细边框、危险=红字细红边；去大圆角与重阴影 */}
      <div className="mt-3 flex flex-col gap-2">
        {canAccept && (
          <div className="flex flex-col gap-2">
            {/* v1.10 · 性别硬规则：女生发布的单，男跑手不可接 */}
            {o.blockedByGender ? (
              <div className="rounded-[var(--radius)] bg-[rgba(220,38,38,0.06)] px-3 py-2.5 text-[11px] leading-5 text-[var(--c-danger)]">
                该订单由女性用户发布，按园区规定男性跑手不可接单。请另选其他订单。
              </div>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => acceptWith([])}
                className="sl-btn sl-btn-primary w-full py-3"
              >
                接这一单
              </button>
            )}

            {/* v1.34 · 照发布页「同栋待接订单」的样式；v1.41 · 摆出来的单全部默认勾上，且不超过剩余并发位 */}
            {peers.length > 0 && !o.blockedByGender && (() => {
              const picked = peers.filter((p) => peerPicked.includes(p.id));
              const all = [o, ...picked];
              const conflict = timeConflictOf(all, Date.now());
              const totalFen = all.reduce((sum, p) => sum + p.runnerRewardFen, 0);
              const bonusFen =
                all.length >= BONUS_MIN_BATCH_SIZE
                  ? all.reduce((sum, p) => sum + calcBonusFen(p.runnerRewardFen), 0)
                  : 0;
              const crossBuilding =
                myBuilding.replace(/\s+/g, "").length > 0 &&
                myBuilding !== "-" &&
                myBuilding.replace(/\s+/g, "") !== o.dropBuilding.replace(/\s+/g, "");
              const cap = Math.max(0, peerSlots - 1);
              // v1.39 · 说人话：本次这一批最多几单（这一单 + 还能勾的同栋单）
              const maxBatch = 1 + Math.min(cap, peers.length);
              const roomLeft = Math.max(0, cap - peerPicked.length);
              return (
                <div className="sl-soft p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-medium text-[var(--c-ink)]">同栋推荐 {peers.length} 单</span>
                    <span
                      className={`sl-num shrink-0 text-[10px] font-medium ${
                        maxBatch >= BONUS_MIN_BATCH_SIZE ? "text-[var(--c-accent)]" : "text-[var(--c-ink-3)]"
                      }`}
                    >
                      {maxBatch >= BONUS_MIN_BATCH_SIZE
                        ? `一起带 ${BONUS_MIN_BATCH_SIZE} 单 · 每单 +5%`
                        : `本次最多 ${maxBatch} 单 · 凑不到加成`}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] leading-relaxed text-[var(--c-ink-2)]">
                    {o.dropBuilding} · 同层优先，这次最多一起带 {maxBatch} 单。
                    {maxBatch < BONUS_MIN_BATCH_SIZE
                      ? cap < PEER_RECOMMEND_MAX
                        ? ` 你手上还有单在进行中，凑不满 ${BONUS_MIN_BATCH_SIZE} 单加成。`
                        : ` 同栋暂时没有更多待接单，凑不满 ${BONUS_MIN_BATCH_SIZE} 单加成。`
                      : ""}
                  </div>
                  <div className="mt-2.5 flex flex-col gap-1.5">
                    {peers.map((p) => {
                      const checked = peerPicked.includes(p.id);
                      const sameFloor =
                        p.dropFloor != null && o.dropFloor != null && p.dropFloor === o.dropFloor;
                      const pickable = !p.blockedByGender && (checked || peerPicked.length < cap);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          aria-pressed={checked}
                          disabled={p.blockedByGender && !checked}
                          onClick={() => {
                            if (!pickable) {
                              if (p.blockedByGender) {
                                Toast.show("该订单由女性用户发布，男性跑手不可接单");
                                return;
                              }
                              Toast.show(
                                roomLeft > 0
                                  ? `还能再勾 ${roomLeft} 单`
                                  : `这一批最多带 ${maxBatch} 单（含这一单），先取消一单`,
                              );
                              return;
                            }
                            setPeerPicked(checked ? peerPicked.filter((x) => x !== p.id) : [...peerPicked, p.id]);
                          }}
                          className={`flex w-full items-center gap-2 rounded-[var(--radius)] border px-2.5 py-2 text-left ${
                            checked
                              ? "border-[var(--c-accent-border)] bg-[var(--c-surface)]"
                              : "border-transparent bg-[color-mix(in_srgb,var(--c-surface)_55%,transparent)]"
                          } ${p.blockedByGender ? "opacity-45" : ""}`}
                        >
                          <span
                            aria-hidden
                            className={`flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full text-[9px] leading-none ${
                              checked ? "bg-[var(--c-accent)] text-white" : "text-transparent ring-1 ring-[var(--c-border)]"
                            }`}
                          >
                            ✓
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[11px] font-medium text-[var(--c-ink)]">
                              {p.pickupPoint}
                              {p.dropFloor ? ` → ${p.dropFloor} 层` : ""}
                              {sameFloor && (
                                <span className="ml-1 text-[9px] font-medium text-[var(--c-accent)]">同层</span>
                              )}
                            </span>
                            <span className="mt-0.5 block truncate text-[10px] text-[var(--c-ink-3)]">
                              {p.publisherNickname ?? "邻居"} 发的
                              {p.note ? ` · ${p.note}` : ""}
                              {(p.addonCount ?? 0) > 0 ? ` · 捎带 ${p.addonCount} 件` : ""}
                            </span>
                          </span>
                          <span className="sl-num shrink-0 text-xs font-medium text-[var(--c-accent)]">
                            +¥{fen(p.runnerRewardFen)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <span className="text-[var(--c-ink-2)]">
                      已选 {all.length} 单 · <span className="sl-num font-medium text-[var(--c-accent)]">+¥{fen(totalFen)}</span>
                    </span>
                    <span className="text-[10px] text-[var(--c-ink-3)]">
                      {bonusFen > 0
                        ? `满 ${BONUS_MIN_BATCH_SIZE} 单每单 +5%：+¥${fen(bonusFen)}`
                        : maxBatch < BONUS_MIN_BATCH_SIZE
                          ? `这一批最多 ${maxBatch} 单，凑不满 ${BONUS_MIN_BATCH_SIZE} 单加成`
                          : all.length < BONUS_MIN_BATCH_SIZE
                            ? `再勾 ${BONUS_MIN_BATCH_SIZE - all.length} 单，凑满 ${BONUS_MIN_BATCH_SIZE} 单每单 +5%`
                            : `再加同栋单也凑不满加成`}
                    </span>
                  </div>
                  {peerSlots < 1 && <p className="mt-1.5 text-[10px] text-[var(--c-danger)]">同时接单已达上限</p>}
                  {peerSlots >= 1 && peerSlots < BONUS_MIN_BATCH_SIZE && (
                    <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--c-ink-3)]">
                      手上已有 {BONUS_MIN_BATCH_SIZE - peerSlots} 单进行中，本次最多再带 {peerSlots} 单；批量加成需同一批 {BONUS_MIN_BATCH_SIZE} 单同栋，手上有单时这一批凑不满。
                    </p>
                  )}
                  {crossBuilding && (
                    <p className="mt-1.5 text-[10px] text-[var(--c-ink-3)]">
                      该订单不在你登记的楼栋（你填写的是「{myBuilding}」），接单前将再次确认
                    </p>
                  )}
                  {conflict && <p className="mt-2 text-[11px] text-[var(--c-danger)]">{conflict}，暂不可一起接单</p>}
                  <button
                    type="button"
                    disabled={busy || !!conflict}
                    onClick={() => acceptWith(peerPicked)}
                    className="sl-btn sl-btn-primary mt-2.5 w-full py-2.5 text-xs disabled:opacity-40"
                  >
                    {peerPicked.length === 0 ? "单笔接单" : `接收 ${all.length} 单（+¥${fen(totalFen)}）`}
                  </button>
                </div>
              );
            })()}          </div>
        )}
        {isPublisher && o.canCancel && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (await Dialog.confirm({ content: "取消后赏金将全额退回，是否确认？" })) run(() => post(`/api/orders/${id}/actions`, { action: "cancel" }), "已取消");
            }}
            className="sl-btn sl-btn-danger w-full py-3"
          >
            取消订单（全额退款）
          </button>
        )}

        {isRunner && o.status === "accepted" && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy} onClick={() => run(() => post(`/api/orders/${id}/actions`, { action: "pick" }), "已取到")} className="sl-btn sl-btn-primary py-3">
              我已取到
            </button>
            <button type="button" disabled={busy} onClick={() => run(() => post(`/api/orders/${id}/actions`, { action: "unpickable" }), "已退回大厅")} className="sl-btn sl-btn-secondary py-3">
              取不到餐
            </button>
            <button type="button" disabled={busy} onClick={() => run(() => post(`/api/orders/${id}/actions`, { action: "abandon" }), "已放弃")} className="sl-btn sl-btn-secondary col-span-2 py-2 text-xs">
              放弃（信用 −5）
            </button>
          </div>
        )}

        {/* v1.10 · 金额不够时的拒单权：代买整单拒 / 捎带只拒小件 */}
        {o.canRefuseBuy && (
          <button type="button" disabled={busy} onClick={refuseBuyOrder} className="sl-btn sl-btn-danger w-full py-2.5 text-xs">
            拒绝这单代买（额度不够 · 全额退回发布者）
          </button>
        )}
        {o.canRejectAddons && o.addons.some((a) => a.status === "pending") && (
          <button type="button" disabled={busy} onClick={rejectAddonsOfOrder} className="sl-btn sl-btn-danger w-full py-2.5 text-xs">
            拒绝捎带（额度不够 · 外卖照常送）
          </button>
        )}

        {canReport && (
          <div className="sl-card p-3">
            {/* v1.10 模块 3：普通外卖单不再出现「代买」字样 */}
            <div className="text-xs font-medium text-[var(--c-ink-2)]">采购实付（元）</div>
            <div className="mt-2 flex gap-2">
              <input className="sl-field sl-num flex-1" inputMode="decimal" value={actualYuan} onChange={(e) => setActualYuan(e.target.value)} placeholder="如 4.50" />
              <button type="button" disabled={busy} onClick={report} className="sl-btn sl-btn-primary px-4 text-xs">
                上报实付
              </button>
            </div>
            <p className="mt-1 text-[11px] text-[var(--c-ink-3)]">超出预算时将先征求发布者同意，请勿先行超额采购</p>
          </div>
        )}

        {canRequestAgree && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy} onClick={() => run(() => post(`/api/orders/${id}/buy`, { action: "agree" }), "已同意")} className="sl-btn sl-btn-primary py-3">
              同意加价
            </button>
            <button type="button" disabled={busy} onClick={() => run(() => post(`/api/orders/${id}/buy`, { action: "decline" }), "已拒绝")} className="sl-btn sl-btn-secondary py-3">
              不同意
            </button>
          </div>
        )}

        {isRunner && o.canReportUnarrived && (
          <div className="sl-card space-y-2 p-3">
            <div className="text-xs font-medium text-[var(--c-ink-2)]">已到预约时间仍未取到餐品？</div>
            <p className="text-[11px] leading-relaxed text-[var(--c-ink-3)]">
              请如实选择责任方：商家或外卖未送达，扣发布者信用分（未预留充足时间）；本人延迟送达，扣本人 10 信用分。
            </p>
            <input
              className="sl-field"
              value={unarrivedNote}
              maxLength={40}
              onChange={(e) => setUnarrivedNote(e.target.value)}
              placeholder="补充说明（可选），例如：商家表示还需 10 分钟"
            />
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (
                  await Dialog.confirm({
                    content:
                      "确认由商家或外卖延迟送达？订单将重新上架，本次扣除发布者 5 信用分，不扣除你的信用分。",
                  })
                )
                  run(
                    () =>
                      post(`/api/orders/${id}/actions`, {
                        action: "unarrived",
                        reason: "vendor_late",
                        note: unarrivedNote,
                      }),
                    "已反馈商家延迟送达"
                  );
              }}
              className="sl-btn sl-btn-secondary w-full py-2.5 text-xs"
            >
              商家或外卖尚未送达（本人不扣分，发布者 −5）
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (await Dialog.confirm({ content: "确认因本人原因延迟送达？将扣除 10 信用分，订单重新上架。" }))
                  run(
                    () =>
                      post(`/api/orders/${id}/actions`, {
                        action: "unarrived",
                        reason: "runner_late",
                        note: unarrivedNote,
                      }),
                    "已反馈餐未送达"
                  );
              }}
              className="sl-btn sl-btn-danger w-full py-2.5 text-xs"
            >
              本人延迟送达（扣 10 信用分）
            </button>
          </div>
        )}

        {isRunner && o.status === "picked" && (
          <>
            <button
              type="button"
              disabled={busy || addonsBlocked}
              onClick={deliver}
              className="sl-btn sl-btn-primary w-full py-3"
            >
              拍照送达
            </button>
            {/* 改（m02503）：没确认捎带就不许送达，否则结算金额会错 */}
            {addonsBlocked && (
              <p className="text-center text-[11px] leading-relaxed text-[var(--c-danger)]">
                请先确认「{pendingAddons.map((a) => a.title).join("、")}」的购买情况与实付金额，再执行送达
              </p>
            )}
          </>
        )}

        {canBudgetConfirm && (
          <button type="button" disabled={busy} onClick={() => run(() => post(`/api/orders/${id}/buy`, { action: "confirm" }), "已确认，差额已退回")} className="sl-btn sl-btn-primary w-full py-3">
            确认实付并找零
          </button>
        )}

        {isPublisher && o.canConfirm && (
          <>
            <button
              type="button"
              disabled={busy || addonsBlocked}
              onClick={() => run(() => post(`/api/orders/${id}/confirm`), "已确认收货，结算完成")}
              className="sl-btn sl-btn-primary w-full py-3"
            >
              确认收货并结算
              {o.settlePreview && o.settlePreview.refundFen > 0 ? `（退 ¥${fen(o.settlePreview.refundFen)}）` : ""}
            </button>
            {/* 改（m02503）：双方都确认后才动钱——跑腿者没上报捎带时这里给出明确原因 */}
            {addonsBlocked && (
              <p className="text-center text-[11px] leading-relaxed text-[var(--c-danger)]">
                跑腿者尚未确认「{pendingAddons.map((a) => a.title).join("、")}」的购买情况与实付金额，补齐后方可结算
              </p>
            )}
          </>
        )}

        {isPublisher && o.status === "expired" && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              const v = window.prompt("请输入加价金额（元）以重新发布", "2");
              if (!v) return;
              run(() => post(`/api/orders/${id}/actions`, { action: "bump", extraFen: Math.round(Number(v) * 100) }), "已加价重发");
            }}
            className="sl-btn sl-btn-secondary w-full py-3"
          >
            加价重发
          </button>
        )}
      </div>

      {/* M2 · 评价（v1.9）：发布者给跑腿者的评分会一直挂在订单上，双方都能看到 */}
      {review && (
        <div className="sl-card mt-3 p-4">
          <div className="flex items-center justify-between">
            <div className="sl-section">这一单的评价</div>
            <span className="text-[11px] text-[var(--c-ink-3)]">{review.fromNickname} 评</span>
          </div>
          <div className="mt-1 text-xl tracking-[2px] text-[var(--c-accent)]" aria-label={`${review.rating} 星`}>
            {"★".repeat(review.rating)}
            <span className="text-[var(--c-border)]">{"★".repeat(5 - review.rating)}</span>
          </div>
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

      {o.canReview && (
        <Link href={`/review/${o.id}`} className="sl-btn sl-btn-primary mt-3 w-full py-3">
          评价这次跑腿
        </Link>
      )}

      {/* 改：时间轴卡 → sl-card + sl-section；事件点统一中性色 */}
      <div className="sl-card mt-4 p-4">
        <div className="sl-section">时间轴</div>
        <ul className="mt-2 space-y-2">
          {events.map((e) => (
            <li key={e.id} className="flex items-center gap-2 text-xs text-[var(--c-ink-2)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--c-border)]" />
              <span className="w-16 text-[var(--c-ink)]">{EVENT[e.type] ?? e.type}</span>
              <span className="sl-num text-[var(--c-ink-3)]">{(e.at ?? "").slice(11, 16)}</span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
