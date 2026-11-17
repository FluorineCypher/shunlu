"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Toast } from "antd-mobile";
import { fen } from "@/lib/client";

/**
 * 电脑端调试后台（v1.7 引入，v1.8 适配 desktop · 用户 m03188 / m03192 / m03494）。
 *
 * 场景：一台电脑 + 两台手机。电脑端用统一密码进后台，不切号就能：
 *   改钱 / 改信用 / 代取消订单 / 拨时钟 / 重置数据。
 * 手机端继续用演示账号走正常业务（切号列表里已不含管理员账号）。
 *
 * v1.8 排版说明：本页被 AppShell 排除在手机壳之外，自己用 1440px 栅格：
 *   KPI 一行四列 → 账号表 + 右侧时钟/重置两栏 → 全宽订单表。
 */

type ConsoleUser = {
  id: number;
  nickname: string;
  dormBuilding: string | null;
  creditScore: number;
  balanceFen: number;
  frozenFen: number;
  isAdmin: boolean;
};

type ConsoleOrder = {
  id: number;
  code: string;
  status: string;
  bizType: string;
  dropBuilding: string;
  dropRoom: string | null;
  rewardFen: number;
  budgetFen: number;
  publisherId: number;
  runnerId: number | null;
  publisherNickname: string | null;
  runnerNickname: string | null;
  createdAt: string;
};

type Snapshot = {
  clock: { simNow: number; scale: number };
  users: ConsoleUser[];
  orders: ConsoleOrder[];
  statusCounts: Record<string, number>;
  platformFeeFen: number;
  pendingAddonCount: number;
  reconcile: {
    userDriftFen: number;
    orderDriftFen: number;
    checkedUsers: number;
    checkedOpenOrders: number;
    completedOrders: number;
    distinctRunners: number;
    avgOrdersPerRunner: number;
  };
};

const STATUS_TEXT: Record<string, string> = {
  open: "待接",
  accepted: "已接",
  picked: "已取",
  delivered: "待确认",
  completed: "已完成",
  expired: "已过期",
  cancelled: "已取消",
  abnormal: "异常",
};

const STATUS_TONE: Record<string, string> = {
  open: "sl-tag",
  accepted: "sl-tag",
  picked: "sl-tag",
  delivered: "sl-tag-warn",
  completed: "sl-tag",
  expired: "sl-tag",
  cancelled: "sl-tag",
  abnormal: "sl-tag-warn",
};

const TERMINAL = ["completed", "expired", "cancelled", "abnormal"];

function clockText(ms: number) {
  const d = new Date(ms);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(
    d.getHours()
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function shortTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(
    d.getHours()
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function ConsolePage() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [locked, setLocked] = useState(false);
  const [needSetup, setNeedSetup] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [moneyInput, setMoneyInput] = useState<Record<number, string>>({});
  const [creditInput, setCreditInput] = useState<Record<number, string>>({});
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  /** v1.42：加载失败要**看得见**。以前非 401/503 的响应直接 return，界面一动不动 */
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<boolean> => {
    let res: Response;
    try {
      res = await fetch("/api/console/snapshot", { cache: "no-store" });
    } catch {
      setLoadError("请求没发出去：网络断开或被浏览器拦了。请检查网络后按「重试」。");
      return false;
    }
    if (res.status === 401) {
      setLocked(true);
      setLoadError(null);
      return false;
    }
    if (res.status === 503) {
      const d = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      // 503 有两个来源：没配 ADMIN_PASSWORD（后台未启用）与数据库 20s 超时（DB_TIMEOUT）
      if (d.code === "DB_TIMEOUT") {
        setLoadError(d.error ?? "数据库连接超时，请稍后按「重试」。");
        return false;
      }
      setNeedSetup(d.error ?? "后台未启用");
      return false;
    }
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      setLoadError(`后台数据加载失败：HTTP ${res.status}${d.error ? ` · ${d.error}` : ""}`);
      return false;
    }
    const data = (await res.json()) as Snapshot;
    setSnap(data);
    setLocked(false);
    setNeedSetup(null);
    setLoadError(null);
    return true;
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load]);

  async function login() {
    setBusy(true);
    try {
      const res = await fetch("/api/console/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        Toast.show(d.error ?? "登录失败");
        return;
      }
      setPassword("");
      // 口令对了但数据拉不到时，绝不能再弹「已进入后台」——那正是「输完没反应」的一半
      const ok = await load();
      if (ok) Toast.show({ icon: "success", content: "已进入后台" });
      else Toast.show("口令已通过，但后台数据没加载出来（原因见页面红字）");
    } catch {
      Toast.show("网络异常：登录请求没发出去，请重试");
    } finally {
      setBusy(false);
    }
  }

  async function act(body: Record<string, unknown>, okText?: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/console/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        Toast.show(d.error ?? "操作失败");
        return false;
      }
      if (okText) Toast.show({ icon: "success", content: okText });
      await load();
      return true;
    } finally {
      setBusy(false);
    }
  }

  const orders = useMemo(() => {
    const list = snap?.orders ?? [];
    const q = query.trim().toLowerCase();
    return list.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (!q) return true;
      return [o.code, o.dropBuilding, o.dropRoom ?? "", o.publisherNickname ?? "", o.runnerNickname ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [snap, statusFilter, query]);

  if (needSetup) {
    return (
      <main className="mx-auto flex min-h-screen max-w-[560px] flex-col justify-center px-8">
        <h1 className="text-xl font-semibold">调试后台未启用</h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--c-ink-2)]">{needSetup}</p>
        <pre className="mt-4 rounded-lg bg-[var(--c-surface-2)] p-3 text-xs">ADMIN_PASSWORD=shunlu-admin-2026</pre>
      </main>
    );
  }

  if (locked || !snap) {
    return (
      <main className="flex min-h-screen items-center justify-center px-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-8">
            <p className="text-[13px] font-medium tracking-tight text-[var(--c-ink-3)]">顺路 · SHUNLU</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">调试后台</h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--c-ink-2)]">
              仅供电脑端使用：可调整余额与信用分、代取消订单、调整模拟时钟。手机端请继续使用演示账号走业务流程，无需在此登录。
            </p>
          </div>
          <label className="sl-label" htmlFor="console-password">
            后台密码（ADMIN_PASSWORD）
          </label>
          <input
            id="console-password"
            className="sl-field mt-1.5"
            type="password"
            value={password}
            autoFocus
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
            placeholder="••••••••"
          />
          <button type="button" disabled={busy || !password} onClick={login} className="sl-btn sl-btn-primary mt-3 w-full py-2.5">
            进入后台
          </button>
          {loadError && (
            <div className="mt-3 rounded-xl border border-[var(--c-danger,#d4380d)]/30 bg-[var(--c-surface-2)] p-3 text-xs leading-relaxed text-[var(--c-ink-2)]">
              <p className="font-medium text-[var(--c-ink)]">{loadError}</p>
              <button
                type="button"
                className="sl-btn sl-btn-secondary mt-2 px-3 py-1.5 text-xs"
                onClick={() => void load()}
              >
                重试
              </button>
            </div>
          )}
          <p className="mt-6 text-[11px] leading-relaxed text-[var(--c-ink-3)]">
            口令在 <code>.env.local</code> 的 <code>ADMIN_PASSWORD</code>；改完重启即失效旧会话。手机端入口：
            <Link href="/login" className="ml-1 underline decoration-dotted underline-offset-2">
              选一个身份
            </Link>
          </p>
        </div>
      </main>
    );
  }

  const totalBalance = snap.users.reduce((s, u) => s + u.balanceFen, 0);
  const totalFrozen = snap.users.reduce((s, u) => s + u.frozenFen, 0);
  const activeOrders =
    (snap.statusCounts.open ?? 0) + (snap.statusCounts.accepted ?? 0) + (snap.statusCounts.picked ?? 0) + (snap.statusCounts.delivered ?? 0);

  return (
    <div className="min-h-screen bg-[var(--c-bg)]">
      {loadError && (
        <div className="sticky top-0 z-40 border-b border-[var(--c-border)] bg-[var(--c-surface-2)] px-8 py-2 text-xs text-[var(--c-ink-2)]">
          <span className="font-medium text-[var(--c-ink)]">{loadError}</span>
          <span className="ml-2 opacity-70">（页面显示的是上一次成功的数据）</span>
          <button type="button" className="sl-btn sl-btn-secondary ml-3 px-2.5 py-1 text-xs" onClick={() => void load()}>
            重试
          </button>
        </div>
      )}
      {/* 顶栏：电脑端常驻，显示模拟时间/倍率/平台收入 */}
      <header className="sticky top-0 z-30 border-b border-[var(--c-border)] bg-[color-mix(in_srgb,var(--c-surface)_92%,transparent)] backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-4 px-8">
          <div className="flex items-baseline gap-2">
            <span className="text-[17px] font-semibold tracking-tight">顺路</span>
            <span className="text-[13px] text-[var(--c-ink-2)]">调试后台</span>
            <span className="sl-tag sl-num">电脑端</span>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs">
            <span className="sl-tag sl-num">模拟时间 {clockText(snap.clock.simNow)}</span>
            <span className="sl-tag sl-num">倍率 ×{snap.clock.scale}</span>
            <span className="sl-tag sl-num">平台服务费 ¥{fen(snap.platformFeeFen)}</span>
            <button type="button" className="sl-btn sl-btn-secondary px-3 py-1.5 text-xs" onClick={() => void load()}>
              刷新
            </button>
            <button
              type="button"
              className="sl-btn sl-btn-secondary px-3 py-1.5 text-xs"
              onClick={async () => {
                await fetch("/api/console/login", { method: "DELETE" });
                setSnap(null);
                setLocked(true);
              }}
            >
              退出
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-8 py-6">
        {/* KPI 四列 */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "模拟时间", value: clockText(snap.clock.simNow), hint: `倍率 ×${snap.clock.scale} · 5 秒自动刷新` },
            {
              label: "账号",
              value: `${snap.users.length} 个`,
              hint: `余额合计 ¥${fen(totalBalance)} · 冻结 ¥${fen(totalFrozen)}`,
            },
            {
              label: "进行中的单",
              value: `${activeOrders} 单`,
              hint: `待接 ${snap.statusCounts.open ?? 0} · 已接 ${snap.statusCounts.accepted ?? 0} · 已取 ${
                snap.statusCounts.picked ?? 0
              } · 待确认 ${snap.statusCounts.delivered ?? 0}`,
            },
            {
              label: "平台服务费",
              value: `¥${fen(snap.platformFeeFen)}`,
              hint: snap.pendingAddonCount > 0 ? `待确认捎带 ${snap.pendingAddonCount} 件` : "无待确认捎带",
            },
          ].map((k) => (
            <div key={k.label} className="sl-card px-4 py-3.5">
              <p className="text-[11px] font-medium tracking-wide text-[var(--c-ink-3)]">{k.label}</p>
              <p className="sl-num mt-1.5 text-[19px] font-semibold tracking-tight">{k.value}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--c-ink-3)]">{k.hint}</p>
            </div>
          ))}
        </section>

        {/* 账号表 + 右侧时钟面板 */}
        <section className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_336px]">
          <div className="sl-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--c-border-2)] px-4 py-3">
              <h2 className="text-sm font-medium">账号（{snap.users.length}）</h2>
              <span className="text-[11px] text-[var(--c-ink-3)]">余额可改；冻结额由未终态订单推导，不可直接改</span>
            </div>
            <table className="w-full text-[13px]">
              <thead className="bg-[var(--c-surface-2)] text-[11px] text-[var(--c-ink-3)]">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">账号</th>
                  <th className="px-4 py-2 text-left font-medium">楼栋</th>
                  <th className="px-4 py-2 text-right font-medium">余额</th>
                  <th className="px-4 py-2 text-right font-medium">冻结</th>
                  <th className="px-4 py-2 text-center font-medium">信用分</th>
                  <th className="px-4 py-2 text-left font-medium">加钱 / 扣钱（元）</th>
                </tr>
              </thead>
              <tbody>
                {snap.users.map((u) => (
                  <tr key={u.id} className="border-t border-[var(--c-border-2)] hover:bg-[var(--c-surface-2)]/50">
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{u.nickname}</span>
                      <span className="ml-1.5 text-[11px] text-[var(--c-ink-3)]">#{u.id}</span>
                      {u.isAdmin && <span className="sl-tag ml-1.5">管理员</span>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[var(--c-ink-2)]">{u.dormBuilding ?? "-"}</td>
                    <td className="sl-num px-4 py-2.5 text-right">¥{fen(u.balanceFen)}</td>
                    <td className="sl-num px-4 py-2.5 text-right text-[var(--c-ink-3)]">¥{fen(u.frozenFen)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-center gap-1">
                        <input
                          className="sl-field sl-num w-14 px-2 py-1 text-center text-xs"
                          value={creditInput[u.id] ?? String(u.creditScore)}
                          onChange={(e) => setCreditInput((c) => ({ ...c, [u.id]: e.target.value }))}
                        />
                        <button
                          type="button"
                          disabled={busy}
                          className="sl-btn sl-btn-secondary px-2 py-1 text-[11px]"
                          onClick={() =>
                            act(
                              { action: "credit", userId: u.id, creditScore: Number(creditInput[u.id] ?? u.creditScore) },
                              "信用分已更新"
                            )
                          }
                        >
                          存
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1">
                        <input
                          className="sl-field sl-num w-20 px-2 py-1 text-xs"
                          placeholder="如 5"
                          value={moneyInput[u.id] ?? ""}
                          onChange={(e) => setMoneyInput((c) => ({ ...c, [u.id]: e.target.value }))}
                        />
                        <button
                          type="button"
                          disabled={busy}
                          className="sl-btn sl-btn-primary px-2 py-1 text-[11px]"
                          onClick={async () => {
                            const yuan = Number(moneyInput[u.id]);
                            if (!Number.isFinite(yuan) || yuan === 0) return Toast.show("请输入非零金额");
                            if (await act({ action: "money", userId: u.id, deltaFen: Math.round(yuan * 100) }, "余额已调整"))
                              setMoneyInput((c) => ({ ...c, [u.id]: "" }));
                          }}
                        >
                          加
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          className="sl-btn sl-btn-secondary px-2 py-1 text-[11px]"
                          onClick={async () => {
                            const yuan = Number(moneyInput[u.id]);
                            if (!Number.isFinite(yuan) || yuan === 0) return Toast.show("请输入非零金额");
                            if (await act({ action: "money", userId: u.id, deltaFen: -Math.round(yuan * 100) }, "余额已调整"))
                              setMoneyInput((c) => ({ ...c, [u.id]: "" }));
                          }}
                        >
                          扣
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-4">
            <div className="sl-card p-4">
              <h2 className="text-sm font-medium">时钟</h2>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--c-ink-3)]">
                倍率只影响之后流逝的时间，已落库的截止时间不重算；推进等于直接把 now 拨快。
              </p>
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {[1, 8, 30, 60].map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={busy}
                    onClick={() => act({ action: "clock", scale: s }, `倍率 ×${s}`)}
                    className={`sl-btn px-2 py-1.5 text-xs ${snap.clock.scale === s ? "sl-btn-primary" : "sl-btn-secondary"}`}
                  >
                    ×{s}
                  </button>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {[5, 10, 30, 60].map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={busy}
                    onClick={() => act({ action: "clock", advanceMs: m * 60_000 }, `推进 ${m} 分钟`)}
                    className="sl-btn sl-btn-secondary px-2 py-1.5 text-xs"
                  >
                    +{m} 分
                  </button>
                ))}
              </div>
            </div>

            {/* P9 对账（v1.9 / Step 8）：两条账本不变式必须都是 0 差异 */}
            <div className="sl-card p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">对账</h2>
                <span
                  className={`sl-tag sl-num ${
                    snap.reconcile.userDriftFen === 0 && snap.reconcile.orderDriftFen === 0 ? "" : "sl-tag-warn"
                  }`}
                >
                  {snap.reconcile.userDriftFen === 0 && snap.reconcile.orderDriftFen === 0 ? "账平" : "有差异"}
                </span>
              </div>
              <dl className="mt-2 space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <dt className="text-[var(--c-ink-3)]">① 余额 = Σ流水（{snap.reconcile.checkedUsers} 个账号）</dt>
                  <dd
                    className={`sl-num font-medium ${
                      snap.reconcile.userDriftFen === 0 ? "text-[var(--c-ink)]" : "text-[var(--c-danger)]"
                    }`}
                  >
                    差异 ¥{fen(snap.reconcile.userDriftFen)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-[var(--c-ink-3)]">② 冻结 = 可退额（{snap.reconcile.checkedOpenOrders} 张未终态）</dt>
                  <dd
                    className={`sl-num font-medium ${
                      snap.reconcile.orderDriftFen === 0 ? "text-[var(--c-ink)]" : "text-[var(--c-danger)]"
                    }`}
                  >
                    差异 ¥{fen(snap.reconcile.orderDriftFen)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-[var(--c-ink-3)]">人均带单数</dt>
                  <dd className="sl-num font-medium">
                    {snap.reconcile.avgOrdersPerRunner} 单
                    <span className="ml-1 text-[10px] font-normal text-[var(--c-ink-3)]">
                      {snap.reconcile.completedOrders} 单 / {snap.reconcile.distinctRunners} 人
                    </span>
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-[var(--c-ink-3)]">平台净收入（服务费）</dt>
                  <dd className="sl-num font-medium">¥{fen(snap.platformFeeFen)}</dd>
                </div>
              </dl>
            </div>

            <div className="sl-card p-4">
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--c-ink-3)]">
                重置将清空订单、流水与通知，并恢复初始种子数据（7 个账号、17 笔订单、时间倍率 1）；手机端刷新后即可开始演示。
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (!window.confirm("确认重置全部数据至初始种子？当前所有演示改动将丢失。")) return;
                  await act({ action: "reset" }, "已重置至初始种子");
                }}
                className="sl-btn sl-btn-danger mt-3 w-full py-2 text-xs"
              >
                重置全部数据
              </button>
            </div>

            <div className="sl-card px-4 py-3 text-[11px] leading-relaxed text-[var(--c-ink-3)]">
              手机端切号走 <Link href="/login" className="underline decoration-dotted underline-offset-2">/login</Link>
              （不含管理员账号）。这里的每个动作都留痕：改钱进 <code>wallet_logs</code>，取消订单进{" "}
              <code>order_events</code>。
            </div>
          </div>
        </section>

        {/* 订单表（全宽） */}
        <section className="sl-card mt-4 overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-[var(--c-border-2)] px-4 py-3">
            <h2 className="text-sm font-medium">最近订单（{orders.length} / {snap.orders.length}）</h2>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`sl-tag sl-num ${statusFilter === "all" ? "font-medium ring-1 ring-[var(--c-ink)]" : ""}`}
              >
                全部 {snap.orders.length}
              </button>
              {Object.entries(STATUS_TEXT).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setStatusFilter(k)}
                  className={`sl-tag sl-num ${statusFilter === k ? "font-medium ring-1 ring-[var(--c-ink)]" : ""}`}
                >
                  {label} {snap.statusCounts[k] ?? 0}
                </button>
              ))}
              {snap.pendingAddonCount > 0 && (
                <span className="sl-tag sl-tag-warn sl-num">待确认捎带 {snap.pendingAddonCount}</span>
              )}
            </div>
            <input
              className="sl-field ml-auto w-56 px-3 py-1.5 text-xs"
              placeholder="搜单号 / 楼栋 / 房号 / 昵称"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <table className="w-full text-[13px]">
            <thead className="bg-[var(--c-surface-2)] text-[11px] text-[var(--c-ink-3)]">
              <tr>
                <th className="px-4 py-2 text-left font-medium">订单</th>
                <th className="px-4 py-2 text-left font-medium">状态</th>
                <th className="px-4 py-2 text-left font-medium">类型</th>
                <th className="px-4 py-2 text-left font-medium">目的地</th>
                <th className="px-4 py-2 text-left font-medium">发布 → 接单</th>
                <th className="px-4 py-2 text-right font-medium">赏金 / 预算</th>
                <th className="px-4 py-2 text-left font-medium">下单时间</th>
                <th className="px-4 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-[var(--c-border-2)] hover:bg-[var(--c-surface-2)]/50">
                  <td className="px-4 py-2.5">
                    <Link href={`/orders/${o.id}`} className="font-medium underline-offset-2 hover:underline">
                      #{o.id}
                    </Link>
                    <span className="ml-1.5 text-[11px] text-[var(--c-ink-3)]">{o.code}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`${STATUS_TONE[o.status] ?? "sl-tag"} px-2 py-0.5 text-[11px]`}>
                      {STATUS_TEXT[o.status] ?? o.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-[var(--c-ink-2)]">{o.bizType === "buy" ? "代买" : "外卖"}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--c-ink-2)]">
                    {o.dropBuilding}
                    {o.dropRoom ? ` · ${o.dropRoom}` : ""}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {o.publisherNickname ?? o.publisherId} → {o.runnerNickname ?? "—"}
                  </td>
                  <td className="sl-num px-4 py-2.5 text-right text-xs">
                    ¥{fen(o.rewardFen)}
                    {o.budgetFen > 0 && <span className="text-[var(--c-ink-3)]"> / ¥{fen(o.budgetFen)}</span>}
                  </td>
                  <td className="sl-num px-4 py-2.5 text-xs text-[var(--c-ink-3)]">{shortTime(o.createdAt)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {!TERMINAL.includes(o.status) ? (
                      <button
                        type="button"
                        disabled={busy}
                        className="sl-btn sl-btn-danger px-2.5 py-1 text-[11px]"
                        onClick={async () => {
                          const reason = window.prompt("取消原因（可留空）", "纠纷处理");
                          if (reason === null) return;
                          await act({ action: "cancelOrder", orderId: o.id, reason }, "已取消并退款");
                        }}
                      >
                        取消并退款
                      </button>
                    ) : (
                      <span className="text-[11px] text-[var(--c-ink-3)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-xs text-[var(--c-ink-3)]">
                    没有符合条件的订单
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <p className="mt-4 pb-6 text-[11px] leading-relaxed text-[var(--c-ink-3)]">
          口令在 <code>.env.local</code> 的 <code>ADMIN_PASSWORD</code>，改完重启服务后旧会话自动失效。管理员的旧看板地址{" "}
          <code>/admin</code> 已重定向到本页。
        </p>
      </main>
    </div>
  );
}
