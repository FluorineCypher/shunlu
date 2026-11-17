"use client";

/**
 * 演示「登录」页：Mock 鉴权，没有密码，选一个人就是那个人（AGENTS §0-1：不做登录注册）。
 * 存在的意义：调试浮标只对管理员显示，非管理员从这里换号，录屏画面里就不会有调试按钮。
 *
 * 公网访问时 /api/demo/* 需要演示口令。v1.12 起改成「像密码一样输入一次」：
 * 口令只提交给 /api/demo/login 换成 httpOnly Cookie（sl_demo，12h），不再留在地址栏/历史/书签里。
 * 旧链接 ?token=xxx 仍兼容：打开时自动兑换成 Cookie，然后把参数从地址栏抹掉。
 */

import { useCallback, useEffect, useState } from "react";
import { BusyLabel } from "@/components/Loading";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { demoLogin, post } from "@/lib/client";

type Account = { id: number; nickname: string; dormBuilding: string | null; isAdmin: boolean };

export default function LoginPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needToken, setNeedToken] = useState(false);
  const [tokenInput, setTokenInput] = useState("");

  const load = useCallback(async () => {
    const [accRes, meRes] = await Promise.all([
      fetch("/api/demo/accounts", { cache: "no-store" }),
      fetch("/api/me", { cache: "no-store" }),
    ]);
    if (accRes.status === 403) {
      setNeedToken(true);
      setError(null);
      return;
    }
    if (!accRes.ok) {
      setError("账号列表加载失败，请稍后重试");
      return;
    }
    const data = await accRes.json();
    setAccounts(data.accounts ?? []);
    setNeedToken(false);
    setError(null);
    if (meRes.ok) setCurrentId((await meRes.json()).user.id);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("token");
    if (!fromUrl) {
      load().catch(() => setError("账号列表加载失败，请稍后重试"));
      return;
    }
    demoLogin(fromUrl)
      .then((r) => {
        if (r.ok) {
          url.searchParams.delete("token");
          window.history.replaceState(null, "", `${url.pathname}${url.search}`);
        } else {
          setNeedToken(true);
          setError(r.error ?? "口令不正确");
        }
        return load();
      })
      .catch(() => setError("账号列表加载失败，请稍后重试"));
  }, [load]);

  async function submitToken(e: FormEvent) {
    e.preventDefault();
    const t = tokenInput.trim();
    if (!t) return;
    setBusy(true);
    const r = await demoLogin(t);
    setBusy(false);
    if (!r.ok) {
      setNeedToken(true);
      setError(r.error ?? "口令不正确");
      return;
    }
    setTokenInput("");
    await load().catch(() => setError("账号列表加载失败，请稍后重试"));
  }

  async function choose(id: number) {
    setBusy(true);
    try {
      await post("/api/auth/switch", { userId: id });
      router.push("/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="px-4 py-6">
      <h1 className="text-[20px] font-semibold tracking-tight text-[var(--c-ink)]">选择身份</h1>
      <p className="mt-1 text-xs text-[var(--c-ink-3)]">演示账号切换：无需密码，选择身份即可进入。管理员账号可见演示工具条。</p>

      {needToken && (
        <form onSubmit={submitToken} className="sl-card mt-4 px-4 py-3">
          <label htmlFor="demo-token" className="text-[13px] font-medium text-[var(--c-ink)]">
            演示口令
          </label>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--c-ink-3)]">
            公网访问需验证演示口令。输入一次后本机保持 12 小时，无需在地址栏携带参数。
          </p>
          <div className="mt-2 flex gap-2">
            <input
              id="demo-token"
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="请输入演示口令"
              autoComplete="current-password"
              autoFocus
              className="min-w-0 flex-1 rounded-lg border border-[var(--c-line,#e5e7eb)] bg-white px-3 py-2 text-[14px] text-[var(--c-ink)] outline-none"
            />
            <button
              type="submit"
              disabled={busy || !tokenInput.trim()}
              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[var(--c-ink,#111827)] px-3 py-2 text-[13px] font-medium text-white transition active:scale-[0.97] disabled:opacity-40"
            >
              <BusyLabel busy={busy} busyText="验证中">验证</BusyLabel>
            </button>
          </div>
        </form>
      )}

      {error && <div className="sl-soft mt-4 p-3 text-[11px] text-[var(--c-ink-2)]">{error}</div>}

      <div className="mt-4 space-y-2">
        {accounts.map((a) => {
          const active = a.id === currentId;
          return (
            <button
              key={a.id}
              type="button"
              disabled={busy}
              onClick={() => choose(a.id)}
              className={`sl-card flex w-full items-center justify-between px-4 py-3 text-left transition ${
                active ? "ring-1 ring-[var(--c-ink)]" : ""
              }`}
            >
              <span className="flex flex-col">
                <span className="text-[15px] font-medium text-[var(--c-ink)]">{a.nickname}</span>
                <span className="mt-0.5 text-[11px] text-[var(--c-ink-3)]">
                  {a.dormBuilding ?? "—"}
                  {a.isAdmin ? " · 管理员" : ""}
                </span>
              </span>
              <span className="text-[11px] text-[var(--c-ink-3)]">{active ? "当前身份" : "切换"}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-6 text-[11px] leading-relaxed text-[var(--c-ink-3)]">
        身份切换仅对当前浏览器生效，其他设备与其他浏览器各自独立。演示结束后，可在管理员工具条中重置数据以恢复到初始状态。
      </p>
    </main>
  );
}
