"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/** 最短展示时长：再快也让人看清「起稿」这一笔 */
const MIN_MS = 1500;
/** 最长兜底：iframe 没起来 / WebGL 挂了 / 进度卡住，到点就让路 */
const MAX_MS = 6000;
/** 纸层退场：光圈收束（clip-path）+ opacity + 轻微缩放一起走完 */
const FADE_MS = 640;
/** 画到多少算「画完」——最后一笔落定、文案切到「完成」 */
const DONE_PROGRESS = 0.995;
/** ready 之后进度这么久没动，就认为画不动了 */
const STALL_MS = 3000;

type Phase = "in" | "out" | "done";

type PaintingMessage = {
  source?: string;
  ready?: boolean;
  progress?: number;
};

/**
 * 首屏揭幕：一整页「绘画过程」，画完再让页面出场（v1.26）。
 *
 * - 1.8x 加速由 iframe 内部的 engine 负责（stroke 时序表不动，画完仍是完整一幅）；
 * - 退场时机不再靠固定计时器，而是等 iframe 回报 progress ≈ 1，避免半幅画被切掉；
 * - 退场时纸层淡出 + 轻微放大 + 3px 失焦，同时给 <html> 打 data-splash="out"，
 *   页面内容用它淡入，两边 560ms / 620ms 重叠，不留白屏也不硬切；
 * - /admin* 与 ?nofx=1 不挂载；点击或 Esc 可直接跳过；
 * - 系统开了「减少动效」时**不跳过**（本机 Windows 演示环境就是 reduce），
 *   只把退场降级成纯 opacity 淡出（去掉放大/模糊）并把时长压到 320ms。
 */
export default function PaintingSplash() {
  const pathname = usePathname();
  const skip = pathname.startsWith("/admin");
  const [phase, setPhase] = useState<Phase>("in");
  /** 系统「减少动效」：退场只做透明度，不做放大/模糊 */
  const [soft, setSoft] = useState(false);
  const progressRef = useRef(0);
  const readyRef = useRef(false);
  const doneRef = useRef(false);
  const finishRef = useRef<(() => void) | null>(null);

  const skipNow = useCallback(() => {
    finishRef.current?.();
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const clearFlag = () => {
      if (html.dataset.splash) delete html.dataset.splash;
    };

    const noFx =
      skip || new URLSearchParams(window.location.search).has("nofx");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fadeMs = reduced ? 480 : FADE_MS;
    setSoft(reduced);

    if (noFx) {
      setPhase("done");
      clearFlag();
      return clearFlag;
    }

    const started = performance.now();
    let lastProgressAt = started;
    let lastProgress = 0;
    let tickTimer: number | undefined;
    let fadeTimer: number | undefined;

    doneRef.current = false;
    progressRef.current = 0;
    readyRef.current = false;
    html.dataset.splash = "hold";

    const finish = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      if (tickTimer !== undefined) window.clearTimeout(tickTimer);
      tickTimer = undefined;
      html.dataset.splash = "out";
      setPhase("out");
      fadeTimer = window.setTimeout(() => {
        setPhase("done");
        clearFlag();
      }, fadeMs);
    };
    finishRef.current = finish;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as PaintingMessage | null;
      if (!data || data.source !== "shunlu-painting") return;
      if (data.ready) readyRef.current = true;
      if (typeof data.progress === "number") {
        progressRef.current = data.progress;
        if (data.progress !== lastProgress) {
          lastProgress = data.progress;
          lastProgressAt = performance.now();
        }
      }
    };
    window.addEventListener("message", onMessage);

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);

    const tick = () => {
      const elapsed = performance.now() - started;
      const painted = progressRef.current >= DONE_PROGRESS;
      const loaded = document.readyState === "complete";
      if (elapsed >= MAX_MS) {
        finish();
        return;
      }
      if (painted && loaded && elapsed >= MIN_MS) {
        // 画完了：等页面也进入 complete，再开始退场，接缝最小
        finish();
        return;
      }
      if (
        readyRef.current &&
        elapsed >= MIN_MS &&
        performance.now() - lastProgressAt > STALL_MS
      ) {
        finish();
        return;
      }
      tickTimer = window.setTimeout(tick, 80);
    };
    tickTimer = window.setTimeout(tick, 60);

    return () => {
      if (tickTimer !== undefined) window.clearTimeout(tickTimer);
      if (fadeTimer !== undefined) window.clearTimeout(fadeTimer);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("keydown", onKey);
      finishRef.current = null;
    };
  }, [skip]);

  if (phase === "done") return null;

  const out = phase === "out";
  const fadeMs = soft ? 480 : FADE_MS;

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[9999]"
      onClick={skipNow}
      style={{
        backgroundColor: "#f6f1e7",
        opacity: out ? 0 : 1,
        // v1.28：退场从中心收成光圈（clip-path），纸层看起来是被「收走」而不是淡掉
        clipPath: out ? "circle(4% at 50% 46%)" : "circle(140% at 50% 46%)",
        transform: out && !soft ? "scale(1.04)" : "none",
        filter: out && !soft ? "blur(2px)" : "none",
        transition: soft
          ? `opacity ${fadeMs}ms cubic-bezier(0.22, 0.61, 0.36, 1), clip-path ${fadeMs}ms cubic-bezier(0.65, 0, 0.35, 1)`
          : `opacity ${fadeMs}ms cubic-bezier(0.33, 0, 0.2, 1), clip-path ${fadeMs}ms cubic-bezier(0.65, 0, 0.35, 1), transform ${fadeMs}ms cubic-bezier(0.33, 0, 0.2, 1), filter ${fadeMs}ms cubic-bezier(0.33, 0, 0.2, 1)`,
        pointerEvents: out ? "none" : "auto",
        willChange: "opacity, clip-path, transform, filter",
      }}
    >
      <iframe
        src="/painting/index.html"
        title="正在准备"
        className="h-full w-full border-0"
      />
    </div>
  );
}
