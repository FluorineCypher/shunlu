"use client";

import type { SVGProps } from "react";

/** 几何线性图标：24 栅格 / 1.6 描边 / 直角处圆角，统一走 currentColor */
type Props = SVGProps<SVGSVGElement>;

const base = (props: Props) => ({
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...props,
});

/** 大厅：bento 四格，右上角实心，读作「一格一单的流」 */
export function IconHall(props: Props) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="3.5" width="6.6" height="6.6" rx="1.9" pathLength={1} />
      <rect x="13.9" y="3.5" width="6.6" height="6.6" rx="1.9" fill="currentColor" stroke="none" />
      <rect x="3.5" y="13.9" width="6.6" height="6.6" rx="1.9" pathLength={1} />
      <rect x="13.9" y="13.9" width="6.6" height="6.6" rx="1.9" pathLength={1} />
    </svg>
  );
}

/** 发布：纸飞机，指向右上 */
export function IconPublish(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M20.6 3.4 3.6 9.9l6.9 3.4 3.4 6.9z" pathLength={1} />
      <path d="M20.6 3.4 10.5 13.3" pathLength={1} />
    </svg>
  );
}

/** 我的：头 + 肩弧 */
export function IconMe(props: Props) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="8" r="3.5" pathLength={1} />
      <path d="M4.9 20.4c0-3.9 3.2-6.3 7.1-6.3s7.1 2.4 7.1 6.3" pathLength={1} />
    </svg>
  );
}

/** 批量：层叠 */
export function IconLayers(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.6 3.6 8 12 12.4 20.4 8z" pathLength={1} />
      <path d="M3.6 12.4 12 16.8l8.4-4.4" pathLength={1} />
      <path d="M3.6 16.6 12 21l8.4-4.4" pathLength={1} />
    </svg>
  );
}

export function IconPlus(props: Props) {
  return (
    <svg {...base(props)}>
      <path d="M12 5.2v13.6M5.2 12h13.6" pathLength={1} />
    </svg>
  );
}

/** 时钟：预约 / 截止（页面里当装饰用） */
export function IconClock(props: Props) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.4" pathLength={1} />
      <path d="M12 7.6V12l3.1 2" pathLength={1} />
    </svg>
  );
}
