import type { ReactNode } from "react";

/** 路由级过渡容器：每次导航重新挂载，动画随之重播（见 globals.css 的 .sl-page） */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="sl-page">{children}</div>;
}
