"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Toast } from "antd-mobile";
import { api, fen, patch } from "@/lib/client";
import { APP_RELEASE, APP_VERSION } from "@/lib/version";
import { BusyLabel, LoadingBlock } from "@/components/Loading";

type ReviewRow = { id: number; rating: number; tags: string[]; comment: string | null; fromNickname: string; createdAt: string };
type Me = {
  user: {
    id: number;
    nickname: string;
    dormBuilding: string | null;
    /** v1.31 · 常用宿舍信息（发单时自动带入） */
    dormFloor: number | null;
    dormRoom: string | null;
    phoneTail: string | null;
    dormGender?: string | null;
    creditScore: number;
    balanceFen: number;
    isAdmin: boolean;
  };
  counts: { active: number; published: number };
  /** 跑腿口碑（M2）：收到的评价 */
  rating?: { count: number; avgRating: number; recent: ReviewRow[] };
};
type Wallet = { balanceFen: number; frozenFen: number; logs: { id: number; type: string; amountFen: number; memo: string | null; createdAt: string }[] };
type OrderRow = {
  id: number;
  status: string;
  bizType: string;
  pickupPoint: string;
  dropBuilding: string;
  rewardFen: number;
  runnerRewardFen: number;
  runnerNickname: string | null;
  isActive: boolean;
};

const LOG_LABEL: Record<string, string> = {
  freeze: "冻结",
  refund: "退回",
  income: "收入",
  fee: "服务费",
  bonus: "加成",
};

export default function MePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [tab, setTab] = useState<"published" | "accepted">("published");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [unread, setUnread] = useState(0);
  /** v1.31 · 常用宿舍信息：作为「同栋同层优先」的匹配依据，发单时自动带入 */
  const [buildingInput, setBuildingInput] = useState("");
  const [floorInput, setFloorInput] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [tailInput, setTailInput] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const load = useCallback(async () => {
    const [m, w, n] = await Promise.all([
      api<Me>("/api/me"),
      api<Wallet>("/api/wallet"),
      api<{ unread: number }>("/api/notifications"),
    ]);
    setMe(m);
    setWallet(w);
    setUnread(n.unread);
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  useEffect(() => {
    if (!me?.user) return;
    setBuildingInput(me.user.dormBuilding ?? "");
    setFloorInput(me.user.dormFloor ? String(me.user.dormFloor) : "");
    setRoomInput(me.user.dormRoom ?? "");
    setTailInput(me.user.phoneTail ?? "");
  }, [me?.user]);

  /**
   * v1.31 · 保存常用宿舍信息（楼栋 / 楼层 / 房间号 / 手机尾号）
   * 保存后发布订单会自动带入，省掉每次手填；留空即清除该项。
   */
  async function saveProfile() {
    setSavingProfile(true);
    try {
      await patch("/api/me", {
        dormBuilding: buildingInput.trim(),
        dormFloor: floorInput.trim() === "" ? null : Number(floorInput.trim()),
        dormRoom: roomInput.trim(),
        phoneTail: tailInput.trim(),
      });
      await load();
      Toast.show({ icon: "success", content: "宿舍信息已保存" });
    } catch (e) {
      Toast.show((e as Error).message);
    } finally {
      setSavingProfile(false);
    }
  }

  useEffect(() => {
    api<{ orders: OrderRow[] }>(`/api/orders?scope=${tab}`)
      .then((d) => setOrders(d.orders))
      .catch(() => setOrders([]));
  }, [tab]);

  async function markRead() {
    await api("/api/notifications", { method: "POST" });
    setUnread(0);
  }

  if (!me) return <main>
    <LoadingBlock rows={2} />
  </main>;

  const dormSummary = [
    me.user.dormBuilding,
    me.user.dormFloor ? `${me.user.dormFloor} 层` : null,
    me.user.dormRoom,
  ].filter(Boolean).join(" · ");

  return (
    <main className="px-4 pt-3">
      {/* 改：资料卡 → sl-card；余额/冻结块从灰底 → 1px 细边框块；金额 tabular-nums */}
      <div className="sl-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[15px] font-semibold text-[var(--c-ink)]">{me.user.nickname}</div>
            <div className="mt-1 text-xs text-[var(--c-ink-2)]">
              信用 {me.user.creditScore} · {dormSummary || "未设常用宿舍"}
            </div>
          </div>
          {/* 改（v1.8）：管理端只剩电脑端密码后台；手机版看板已下线并重定向 */}
          {me.user.isAdmin && (
            <Link href="/admin/console" className="sl-btn sl-btn-secondary px-3 py-1.5 text-xs">
              电脑端后台
            </Link>
          )}
        </div>

        {/* v1.31 · 常用宿舍信息：保存一次，发单时自动带入；房间号与尾号不出现在大厅 */}
        <div className="mt-3 rounded-[var(--radius)] border border-[var(--c-border-2)] p-3">
          <div className="flex items-center justify-between">
            <span className="sl-section">宿舍信息</span>
            <span className="text-[10px] text-[var(--c-ink-3)]">
              {me.user.dormGender === "female" ? "女生" : me.user.dormGender === "male" ? "男生" : "未设性别"}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11px] text-[var(--c-ink-3)]">楼栋</span>
              <input
                className="sl-field mt-1 w-full"
                value={buildingInput}
                maxLength={30}
                onChange={(e) => setBuildingInput(e.target.value)}
                placeholder="如 女寝3号楼"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-[var(--c-ink-3)]">楼层</span>
              <input
                className="sl-field mt-1 w-full"
                value={floorInput}
                inputMode="numeric"
                maxLength={2}
                onChange={(e) => setFloorInput(e.target.value.replace(/\D/g, ""))}
                placeholder="如 4"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-[var(--c-ink-3)]">房间号</span>
              <input
                className="sl-field mt-1 w-full"
                value={roomInput}
                maxLength={20}
                onChange={(e) => setRoomInput(e.target.value)}
                placeholder="如 412"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-[var(--c-ink-3)]">手机尾号</span>
              <input
                className="sl-field mt-1 w-full"
                value={tailInput}
                inputMode="numeric"
                maxLength={4}
                onChange={(e) => setTailInput(e.target.value.replace(/\D/g, ""))}
                placeholder="4 位数字"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={savingProfile}
            onClick={saveProfile}
            className="sl-btn sl-btn-primary mt-2 w-full py-2.5 text-xs disabled:opacity-50"
          >
            <BusyLabel busy={savingProfile} busyText="保存中">
              保存宿舍信息
            </BusyLabel>
          </button>
          <p className="mt-1.5 text-[11px] leading-5 text-[var(--c-ink-3)]">
            发布订单时自动带入楼栋、楼层与手机尾号；留空即清除。房间号与尾号不显示在大厅，仅对接单跑腿者可见。
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-[var(--radius)] border border-[var(--c-border-2)] p-3">
            <div className="sl-section">余额</div>
            <div className="sl-num mt-1 text-lg font-semibold text-[var(--c-ink)]">¥{fen(wallet?.balanceFen ?? me.user.balanceFen)}</div>
          </div>
          <div className="rounded-[var(--radius)] border border-[var(--c-border-2)] p-3">
            <div className="sl-section">冻结中</div>
            <div className="sl-num mt-1 text-lg font-semibold text-[var(--c-ink-2)]">¥{fen(wallet?.frozenFen)}</div>
          </div>
        </div>
        <div className="mt-2 flex gap-3 text-[11px] text-[var(--c-ink-3)]">
          <span className="sl-num">履约中 {me.counts.active}</span>
          <span className="sl-num">我发布的进行中 {me.counts.published}</span>
          <button type="button" onClick={markRead} className="ml-auto transition-colors hover:text-[var(--c-ink-2)]">
            通知 {unread > 0 ? `· ${unread} 未读` : "已读完"}
          </button>
        </div>
      </div>

      {/* M2 · 跑腿口碑（v1.9）：收到的评价条数 / 平均分 / 最近几条，一屏能看到别人怎么评价你 */}
      {me.rating && (
        <div className="sl-card mt-3 p-4">
          <div className="flex items-center justify-between">
            <div className="sl-section">跑腿口碑</div>
            <span className="sl-num text-[11px] text-[var(--c-ink-3)]">
              {me.rating.count > 0 ? `★ ${me.rating.avgRating} · ${me.rating.count} 条评价` : "还没有被评价"}
            </span>
          </div>
          {me.rating.recent.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {me.rating.recent.map((r) => (
                <li key={r.id} className="border-t border-[var(--c-border-2)] pt-2 first:border-0 first:pt-0">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="tracking-[1px] text-[var(--c-accent)]" aria-label={`${r.rating} 星`}>
                      {"★".repeat(r.rating)}
                      <span className="text-[var(--c-border)]">{"★".repeat(5 - r.rating)}</span>
                    </span>
                    <span className="text-[var(--c-ink-3)]">{r.fromNickname}</span>
                  </div>
                  {r.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.tags.map((t) => (
                        <span key={t} className="sl-tag">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  {r.comment && <p className="mt-1 text-[11px] leading-relaxed text-[var(--c-ink-2)]">{r.comment}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--c-ink-3)]">
              跑完一单后，发布者可以给你打分；分数会显示在你接单的详情页
            </p>
          )}
        </div>
      )}

      {/* 改：订单 Tab → .sl-seg 分段控件 */}
      <div className="sl-seg mt-3">
        {(["published", "accepted"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} data-active={tab === t} className="sl-seg-item">
            {t === "published" ? "我发布的" : "我接的单"}
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-col gap-2">
        {orders.length === 0 && <p className="py-8 text-center text-xs text-[var(--c-ink-3)]">还没有订单</p>}
        {orders.map((o) => (
          /* 改：订单行 → sl-card，金额强调色 + tabular-nums */
          <Link key={o.id} href={`/orders/${o.id}`} className="sl-card flex items-center justify-between p-3 text-xs transition-[opacity] active:opacity-90">
            <div>
              <div className="font-medium text-[var(--c-ink)]">
                {o.pickupPoint} → {o.dropBuilding}
              </div>
              <div className="mt-0.5 text-[var(--c-ink-3)]">
                {o.status} {o.runnerNickname ? `· 跑腿 ${o.runnerNickname}` : ""}
              </div>
            </div>
            <div className="text-right">
              {/* 改：我发布的 → 只看自己发的赏金；我接的单 → 只看实得（不再同时露出赏金） */}
              {tab === "published" ? (
                <>
                  <div className="sl-num font-semibold text-[var(--c-accent)]">¥{fen(o.rewardFen)}</div>
                  <div className="sl-num text-[10px] text-[var(--c-ink-3)]">赏金</div>
                </>
              ) : (
                <>
                  <div className="sl-num font-semibold text-[var(--c-accent)]">¥{fen(o.runnerRewardFen)}</div>
                  <div className="sl-num text-[10px] text-[var(--c-ink-3)]">实得</div>
                </>
              )}
            </div>
          </Link>
        ))}
      </div>

      {/* 改：流水卡 → sl-card；正负金额只保留「+强调色 / −墨色」，去绿色 */}
      <div className="sl-card mt-4 p-4">
        <div className="sl-section">钱包流水（append-only）</div>
        <ul className="mt-2 divide-y divide-[var(--c-border-2)]">
          {(wallet?.logs ?? []).map((l) => (
            <li key={l.id} className="flex items-center justify-between py-2 text-xs">
              <span className="text-[var(--c-ink-2)]">
                {LOG_LABEL[l.type] ?? l.type}
                {l.memo ? ` · ${l.memo}` : ""}
              </span>
              <span className={`sl-num font-medium ${l.amountFen < 0 ? "text-[var(--c-ink)]" : "text-[var(--c-accent)]"}`}>
                {l.amountFen < 0 ? "-" : "+"}¥{fen(Math.abs(l.amountFen))}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* 改：换号入口收进「我的」页脚——普通账号看不到调试浮标，从这儿去演示登录页换身份 */}
      <div className="mt-4 flex items-center justify-between px-1 pb-2 text-[11px] text-[var(--c-ink-3)]">
        <span>当前身份：{me?.user.nickname ?? "未切号"}{me?.user.isAdmin ? " · 管理员" : ""}</span>
        <Link href="/login" className="underline decoration-dotted underline-offset-2">
          切换账号
        </Link>
      </div>

      {/* v1.38：页脚版本戳——手机上滑到最底就能核对「我看到的到底是不是新版」，不用开电脑 */}
      <div className="sl-num mt-2 text-center text-[10px] text-[var(--c-ink-3)]" id="app-version">
        {APP_VERSION} · {APP_RELEASE} · 顺路演示
      </div>
    </main>
  );
}
