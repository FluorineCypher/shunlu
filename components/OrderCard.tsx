import Link from "next/link";
import type { CSSProperties } from "react";
import { fen } from "@/lib/client";

/** 列表卡只需要这些字段：大厅与「我的订单」共用 */
export type CardOrder = {
  id: number;
  bizType: "food" | "buy" | string;
  status: string;
  pickupPoint: string;
  dropBuilding: string;
  dropFloor: number | null;
  note: string | null;
  rewardFen: number;
  runnerRewardFen: number;
  publisherNickname?: string | null;
  publisherCredit?: number | null;
  leftSec?: number | null;
  /** 捎带件数（v1.3）：外卖单顺路带的代买小件 */
  addonCount?: number | null;
  /** 预约送达时间（v1.5）：非空 = 预订单 */
  expectDeliveryAt?: string | null;
  /** v1.10：选中的锚点单同楼层 / 仅同楼栋（排序与标记用） */
  sameFloor?: boolean;
  sameBuilding?: boolean;
  /** v1.10：女生发布的单，男跑手不能接 */
  blockedByGender?: boolean;
  /** v1.10：批量时间冲突提示（不满足 5 分钟余量时置灰） */
  timeConflict?: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  open: "待接单",
  accepted: "已接单",
  picked: "已取到",
  delivered: "待确认",
  completed: "已完成",
  expired: "已过期",
  cancelled: "已取消",
  abnormal: "异常",
};

export default function OrderCard({
  order,
  href,
  selectable = false,
  selected = false,
  onToggle,
  index,
}: {
  order: CardOrder;
  href?: string;
  /** 批次接单（P4）：可勾选时整卡变成「点一下选中/取消」，不再是跳转链接 */
  selectable?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  /** v1.28：列表序号，用于 .sl-rise 入场错峰 */
  index?: number;
}) {
  const urgent = order.status === "open" && (order.leftSec ?? 99) < 120;
  // v1.28：入场错峰变量（.sl-rise 的 animation-delay = var(--i) * 45ms）
  const riseStyle = { "--i": String(index ?? 0) } as CSSProperties;

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {/* 改：彩色 tag → 中性 sl-tag（信息照旧，去掉橙/紫两色） */}
            {selectable && (
              <span
                aria-hidden
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border text-[10px] leading-none ${
                  selected
                    ? "border-[var(--c-ink)] bg-[var(--c-ink)] text-white"
                    : "border-[var(--c-border)] bg-[var(--c-surface)] text-transparent"
                }`}
              >
                ✓
              </span>
            )}
            <span className="sl-tag">{order.bizType === "buy" ? "代买" : "外卖"}</span>
            {order.addonCount ? <span className="sl-tag">捎带 {order.addonCount} 件</span> : null}
            {/* v1.10 · 同栋 / 同层醒目标记（默认只带同栋单） */}
            {order.sameFloor ? (
              <span className="sl-tag !border-[var(--c-accent)] !text-[var(--c-accent)]">同层</span>
            ) : order.sameBuilding ? (
              <span className="sl-tag !border-[var(--c-accent)] !text-[var(--c-accent)]">同栋</span>
            ) : null}
            {order.blockedByGender ? <span className="sl-tag sl-tag-warn">女生单 · 男生不可接</span> : null}
            {order.timeConflict ? <span className="sl-tag sl-tag-warn">时间余量不足</span> : null}
            {order.expectDeliveryAt ? (
              <span className="sl-tag">
                预约 {new Date(order.expectDeliveryAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            ) : null}
            <span className="truncate text-[13px] font-medium text-[var(--c-ink)]">{order.pickupPoint}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-1 text-xs text-[var(--c-ink-2)]">
            <span className="text-[var(--c-ink-3)]">→</span>
            {order.dropBuilding}
            {order.dropFloor ? ` · ${order.dropFloor} 层` : ""}
          </div>
          {order.note && (
            <div className="mt-1 line-clamp-1 text-[11px] text-[var(--c-ink-3)]">{order.note}</div>
          )}
        </div>
        <div className="shrink-0 text-right">
          {/* 改：大厅卡是「你接了能赚多少」，只看实得，不再同时露出赏金 */}
          <div className="sl-num text-[15px] font-semibold leading-6 text-[var(--c-accent)]">
            ¥{fen(order.runnerRewardFen)}
          </div>
          <div className="sl-num text-[10px] text-[var(--c-ink-3)]">实得</div>
        </div>
      </div>

      {/* 改：虚线分隔 → 1px 实线 --c-border-2；open 状态点从绿色呼吸点改为灰色静态点 */}
      <div className="mt-3 flex items-center justify-between border-t border-[var(--c-border-2)] pt-2 text-[11px] text-[var(--c-ink-3)]">
        <span className="truncate">
          {order.publisherNickname ?? "同学"}
          {typeof order.publisherCredit === "number" ? ` · 信用 ${order.publisherCredit}` : ""}
        </span>
        <span className={`flex items-center gap-1.5 ${urgent ? "text-[var(--c-danger)]" : ""}`}>
          {order.status === "open" && <span className="h-1 w-1 rounded-full bg-[var(--c-ink-3)]" />}
          {STATUS_LABEL[order.status] ?? order.status}
          {order.status === "open" && order.leftSec != null ? (
            <span className="sl-num">· {Math.ceil(order.leftSec / 60)} 分钟</span>
          ) : null}
        </span>
      </div>
    </>
  );

  if (selectable) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        style={riseStyle}
        className={`sl-rise sl-card block w-full cursor-pointer p-4 text-left transition-[opacity,transform] active:scale-[0.99] active:opacity-95 ${
          selected ? "border-[var(--c-ink)] ring-1 ring-[var(--c-ink)]" : ""
        }`}
      >
        {inner}
      </button>
    );
  }

  return (
    /* 改：sl-card（细边框+轻阴影）替代自由圆角；active 仅 0.99 缩放 + opacity */
    <Link
      href={href ?? `/orders/${order.id}`}
      style={riseStyle}
      className="sl-rise sl-card block p-4 transition-[opacity,transform] active:scale-[0.99] active:opacity-95"
    >
      {inner}
    </Link>
  );
}
