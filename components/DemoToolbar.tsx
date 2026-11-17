"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Dialog } from "antd-mobile";
import { demoLogin } from "@/lib/client";

type Account = { id: number; nickname: string; dormBuilding: string | null; isAdmin: boolean };

const SCALES = [1, 8, 30, 60];

/**
 * 演示工具条（M1）：切号 / 倍率 / 推进 / 重置。仅 DEMO_MODE 渲染。
 * 默认收起成右下角小胶囊，避免抢占业务 UI；录屏前点开操作、开拍时收起。
 *
 * v1.12：公网访问的口令不再走 `?token=`（会把口令留在地址栏、历史记录和书签里），
 * 改成口令框输入一次 → /api/demo/login 种 httpOnly Cookie `sl_demo`，之后自动带上。
 */
export default function DemoToolbar({ currentId }: { currentId?: number }) {
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [scale, setScale] = useState<number>(1);
  const [busy, setBusy] = useState(false);
  // 公网/局域网访问时 /api/demo/* 需要演示口令：输一次换 cookie，不再往地址栏贴口令
  const [needToken, setNeedToken] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [guardError, setGuardError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/demo/accounts", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setAccounts(data.accounts ?? []);
      setNeedToken(false);
      setGuardError(null);
    } else if (res.status === 403) {
      setNeedToken(true);
      setGuardError("公网访问需验证演示口令，验证一次可保持 12 小时");
    } else {
      setGuardError("账号列表加载失败，请稍后重试");
    }
  }, []);

  // 旧链接兼容：带 ?token= 打开时先换成 cookie，再把口令从地址栏抹掉
  useEffect(() => {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("token");
    if (!fromUrl) {
      void load();
      return;
    }
    void demoLogin(fromUrl).then((r) => {
      if (r.ok) {
        url.searchParams.delete("token");
        window.history.replaceState(null, "", `${url.pathname}${url.search}`);
      } else {
        setNeedToken(true);
        setGuardError(r.error ?? "口令不正确");
      }
      void load();
    });
  }, [load]);

  async function submitToken(e: FormEvent) {
    e.preventDefault();
    const t = tokenInput.trim();
    if (!t) return;
    setBusy(true);
    const r = await demoLogin(t);
    setBusy(false);
    if (!r.ok) {
      setGuardError(r.error ?? "口令不正确");
      return;
    }
    setTokenInput("");
    await load();
  }

  async function call(url: string, body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setGuardError(d.error ?? "操作失败");
        if (res.status === 403) setNeedToken(true);
        return false;
      }
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    const ok = await Dialog.confirm({ content: "确认重置全部数据至初始种子？" });
    if (!ok) return;
    if (!(await call("/api/demo/reset"))) return;
    // 页面数据都是客户端拉的，router.refresh() 不会重新取数 —— 不整页重载就会看起来「没反应」
    window.location.reload();
  }

  /** 切号 / 倍率 / 推进之后同样整页重载：否则当前页还显示旧账号的数据 */
  async function callAndReload(url: string, body?: unknown) {
    if (await call(url, body)) window.location.reload();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-50 rounded-full bg-gray-900/85 px-3.5 py-2 text-xs font-medium text-white shadow-lg backdrop-blur active:scale-95"
      >
        演示
      </button>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50">
      <div className="mx-auto max-w-[480px] rounded-t-2xl border-t border-gray-200 bg-white/95 px-4 pb-4 pt-2 shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-gray-400">演示控制（仅演示模式可用）</span>
          <button type="button" onClick={() => setOpen(false)} className="rounded px-2 py-1 text-xs text-gray-500">
            收起
          </button>
        </div>

        {(needToken || guardError) && (
          <form onSubmit={submitToken} className="mb-2 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
            {guardError && <p>{guardError}</p>}
            <div className="mt-1.5 flex gap-1.5">
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="演示口令"
                autoComplete="current-password"
                className="min-w-0 flex-1 rounded-md border border-amber-200 bg-white px-2 py-1 text-[11px] text-gray-700"
              />
              <button
                type="submit"
                disabled={busy || !tokenInput.trim()}
                className="shrink-0 rounded-md bg-amber-600 px-2 py-1 text-[11px] font-medium text-white disabled:opacity-40"
              >
                确认
              </button>
            </div>
          </form>
        )}

        <div className="flex flex-wrap gap-1.5">
          {accounts.map((a) => {
            const active = a.id === currentId;
            return (
              <button
                key={a.id}
                type="button"
                disabled={busy}
                onClick={() => callAndReload("/api/auth/switch", { userId: a.id })}
                className={`rounded-full px-3 py-1.5 text-xs transition ${
                  active
                    ? "bg-gray-900 text-white"
                    : a.isAdmin
                      ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                      : "bg-gray-100 text-gray-700"
                }`}
              >
                {a.nickname}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="shrink-0 text-xs text-gray-400">倍率</span>
          <div className="flex rounded-lg bg-gray-100 p-0.5">
            {SCALES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setScale(s);
                  void callAndReload("/api/demo/scale", { scale: s });
                }}
                className={`rounded-md px-2.5 py-1 text-xs ${
                  scale === s ? "bg-white font-medium shadow-sm" : "text-gray-500"
                }`}
              >
                ×{s}
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs text-gray-400">推进</span>
          <button type="button" onClick={() => callAndReload("/api/demo/clock", { advanceMs: 10 * 60_000 })} className="rounded-md bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
            +10分
          </button>
          <button type="button" onClick={() => callAndReload("/api/demo/clock", { advanceMs: 60 * 60_000 })} className="rounded-md bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
            +1时
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2">
          <span className="text-[11px] text-gray-400">重置数据至初始种子</span>
          <button type="button" onClick={reset} className="rounded-md px-2 py-1 text-xs text-red-500">
            重置数据
          </button>
        </div>
      </div>
    </div>
  );
}
