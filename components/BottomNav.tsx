"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { IconHall, IconMe, IconPublish } from "./icons";

const TABS = [
  { href: "/", label: "大厅", Icon: IconHall },
  { href: "/publish", label: "发布", Icon: IconPublish },
  { href: "/me", label: "我的", Icon: IconMe },
];

const indexOf = (path: string) => {
  const i = TABS.findIndex((t) => (t.href === "/" ? path === "/" : path.startsWith(t.href)));
  return i < 0 ? 0 : i;
};

/**
 * v1.29 · 点下去药丸就先动。
 *
 * 原来 active 只由 usePathname() 推导：路径要等跨洲 RSC 回来才变，
 * 于是点击后 0.6–1.0 秒屏幕上一点变化都没有（实测 RSC p50 773ms）。
 * 现在点击瞬间先用本地 pending 状态切药丸，路径真正变了再据此校准。
 */
export default function BottomNav({ unread = false }: { unread?: boolean }) {
  const pathname = usePathname() ?? "/";
  const [pending, setPending] = useState<string | null>(null);
  const activeIndex = pending ? indexOf(pending) : indexOf(pathname);

  // 导航落地（pathname 变化）就清掉乐观状态
  useEffect(() => setPending(null), [pathname]);
  // 兜底：5 秒还没跳走（请求失败/被取消），别让药丸一直停在错的地方
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setPending(null), 5000);
    return () => clearTimeout(timer);
  }, [pending]);

  const style = { "--i": String(activeIndex) } as CSSProperties;

  return (
    <nav className="sl-nav" style={style} aria-label="主导航">
      <div className="sl-nav-track">
        <span className="sl-nav-pill" aria-hidden="true" />
        {TABS.map((tab, i) => {
          const active = i === activeIndex;
          const Icon = tab.Icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="sl-nav-item"
              data-active={active ? "true" : "false"}
              data-pending={pending === tab.href && pending !== pathname ? "true" : "false"}
              aria-current={active ? "page" : undefined}
              onClick={() => setPending(tab.href)}
            >
              <Icon className="sl-nav-icon" />
              <span className="sl-nav-label">{tab.label}</span>
              {tab.href === "/me" && unread ? <span className="sl-nav-dot" aria-hidden="true" /> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
