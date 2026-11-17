"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import DemoToolbar from "./DemoToolbar";
import BottomNav from "./BottomNav";

type Me = {
  user: { id: number; nickname: string; balanceFen: number; creditScore: number; isAdmin: boolean };
  counts: { active: number; published: number };
  /** v1.29：演示模式由接口下发，layout 不再读 env（否则整站无法静态化） */
  demoMode?: boolean;
};
/** 全局壳：顶栏 + 底部 Tab + 演示工具条。只取数展示，不参与业务判断 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    /**
     * v1.11 · 性能：顶栏余额/信用变化很慢，没必要跟着通知一起 3 秒轮询。
     * 通知仍 3 秒（红点要及时），资料改成 3 秒里每 5 次才取一次（≈15 秒），
     * 单页常驻请求量直接少一半；切页时（pathname 变化）照旧立即重取。
     */
    let tick = 0;
    const load = async (withMe = true) => {
      const [meRes, nRes] = await Promise.all([
        withMe ? fetch("/api/me", { cache: "no-store" }) : Promise.resolve(null),
        fetch("/api/notifications", { cache: "no-store" }),
      ]);
      if (!alive) return;
      if (meRes && meRes.ok) setMe(await meRes.json());
      else if (meRes) setMe(null);
      if (nRes.ok) setUnread((await nRes.json()).unread ?? 0);
    };
    load(true);
    const timer = setInterval(() => {
      tick += 1;
      load(tick % 5 === 0);
    }, 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [pathname]);

  // 改（v1.8，m03494）：/admin 下的电脑端后台不套手机壳——不渲染 480px 容器、顶栏与底部 Tab，
  // 让后台自己用整屏宽度排版（后台页面自己负责导航）。
  if (pathname.startsWith("/admin")) {
    return <div className="min-h-screen bg-[var(--c-bg)]" data-splash-page="">{children}</div>;
  }

  return (
    <div className="mx-auto min-h-screen max-w-[480px] pb-[calc(var(--nav-h)+env(safe-area-inset-bottom)+20px)]" data-splash-page="">
      {/* v1.35：顶栏从「贴顶通栏」改成悬浮纸胶囊（脱离顶部 8px、左右留白、999px 圆角）——
          skill §2 禁用 edge-to-edge sticky 顶栏；壳子底色交给 body 的奶油纸渐变（这里不再刷 --c-bg，否则渐变被盖平）。 */}
      <header className="sticky top-2 z-30 mx-3 rounded-full border border-[var(--paper-ink)] bg-[color-mix(in_srgb,var(--c-surface)_86%,transparent)] px-4 py-2.5 shadow-[0_1px_1px_rgba(72,56,38,0.05),0_14px_28px_-18px_rgba(72,56,38,0.35)] backdrop-blur-md">
        <div className="flex items-center justify-between">
          <Link href="/" className="sl-logo relative inline-block text-[var(--c-ink)]">
            顺路
            <span className="absolute -bottom-[2px] left-0 h-[1.5px] w-full rounded-full bg-[var(--c-accent)] opacity-55" aria-hidden />
          </Link>
          {me ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="rounded-full bg-[var(--c-surface-2)] px-2.5 py-1 text-[var(--c-ink-2)]">{me.user.nickname}</span>
              <span className="sl-num text-[var(--c-ink-3)]">信用 {me.user.creditScore}</span>
              <span className="sl-num rounded-full border border-[var(--c-border)] bg-[var(--c-surface)] px-2.5 py-1 font-medium text-[var(--c-ink)]">
                ¥{(me.user.balanceFen / 100).toFixed(2)}
              </span>
            </div>
          ) : (
            <Link href="/login" className="text-xs text-[var(--c-ink-3)] underline decoration-dotted underline-offset-2">
              未切号 · 去登录
            </Link>
          )}
        </div>
      </header>

      {children}

      {/* v1.28：图标底栏（几何图标 + 滑动药丸 + 描边重绘），高度由 --nav-h 统一控制 */}
      <BottomNav unread={unread > 0} />

      {/* 改：演示工具条只对管理员显示——录屏时用普通账号，右下角不会出现调试浮标；需要换号走 /login */}
      {me?.demoMode && me.user.isAdmin && <DemoToolbar currentId={me.user.id} />}
    </div>
  );
}
