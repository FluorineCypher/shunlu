"use client";

/**
 * 统一加载态零件（v1.30）。
 *
 * 背景：底栏那套「快按慢放 + 回弹」的手感被用户点名满意，于是把同一套语言普及开——
 * 按钮按压有物理反馈、等待时不再是一行 12px 静止灰字，而是会呼吸的骨架卡 + 三点跳动。
 * 参考：Emil Kowalski 的按压 scale(0.97)、antd-mobile 的 DotLoading 节奏。
 *
 * 全部只有 CSS 动画，不引第三方动画库，首屏不受影响（客户端组件但不阻塞渲染）。
 */

import type { ReactNode } from "react";

/** 行内转圈：尺寸跟字号、颜色跟 currentColor，放在任何底色的按钮里都不会冲突 */
export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`sl-spinner ${className}`} aria-hidden="true" />;
}

/** 三点跳动：用在「正在加载数据」这类需要陪伴感的小位置 */
export function Dots({ className = "" }: { className?: string }) {
  return (
    <span className={`sl-dots ${className}`} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

/**
 * 按钮忙碌文案：busy 时「转圈 + 处理中」，不忙时原样输出 children。
 * 用法：<button disabled={busy}><BusyLabel busy={busy} busyText="发布中">发布</BusyLabel></button>
 */
export function BusyLabel({
  busy,
  children,
  busyText = "处理中",
}: {
  busy: boolean;
  children: ReactNode;
  busyText?: string;
}) {
  if (!busy) return <>{children}</>;
  return (
    <>
      <Spinner />
      {busyText}
    </>
  );
}

/**
 * 整块加载占位：标题 + 副标题 + n 张卡片骨架，形状对齐列表页真实内容，避免「字闪一下再变卡片」。
 * padded={false} 用于父容器已经带了水平内边距的场景（大厅页）。
 */
export function LoadingBlock({
  rows = 3,
  label = "加载中",
  className = "",
  padded = true,
}: {
  rows?: number;
  label?: string;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={`${padded ? "px-4" : ""} pt-4 ${className}`}
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">{label}</span>
      <div className="sl-kicker">顺路 · 正在铺纸</div>
      <div className="sl-skel mt-3 h-7 w-40" />
      <div className="sl-skel mt-2.5 h-3 w-52" />
      <div className="mt-6 space-y-3.5">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="sl-paper">
            <div className="sl-paper-core p-4">
              <div className="flex items-center justify-between">
                <div className="sl-skel h-4 w-24" />
                <div className="sl-skel h-4 w-14" />
              </div>
              <div className="sl-skel mt-3.5 h-3 w-full" />
              <div className="sl-skel mt-2 h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
