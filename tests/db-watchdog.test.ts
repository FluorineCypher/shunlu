import { describe, expect, it } from "vitest";
import {
  DB_FAILURES_BEFORE_RECYCLE,
  DB_IDLE_GRACE_MS,
  DB_PROBE_INTERVAL_MS,
  nextFailureCount,
  shouldProbe,
  shouldRecycle,
} from "@/server/db/watchdog";

/**
 * v1.16（m00383）：连接池 watchdog 的判定逻辑。
 * 线上事故是「池里 socket 被静默丢弃 → 查询无限排队 → 全站转圈」，
 * 探活必须满足：有池、最近有流量、连续失败才回收。
 */

describe("shouldProbe", () => {
  it("池还没建就不探（交给首个请求去建连）", () => {
    expect(shouldProbe({ hasPool: false, lastUsedAt: 1_000, now: 2_000 })).toBe(false);
  });

  it("本进程还没查过库就不探", () => {
    expect(shouldProbe({ hasPool: true, lastUsedAt: 0, now: DB_IDLE_GRACE_MS })).toBe(false);
  });

  it("刚刚有请求 → 探", () => {
    expect(shouldProbe({ hasPool: true, lastUsedAt: 10_000, now: 10_000 + 1_000 })).toBe(true);
  });

  it("空闲超过宽限期 → 不探（不整夜唤醒 Neon）", () => {
    expect(shouldProbe({ hasPool: true, lastUsedAt: 1_000, now: 1_000 + DB_IDLE_GRACE_MS + 1 })).toBe(false);
  });

  it("刚好卡在宽限期边界 → 仍然探", () => {
    expect(shouldProbe({ hasPool: true, lastUsedAt: 1_000, now: 1_000 + DB_IDLE_GRACE_MS })).toBe(true);
  });

  it("可以自定义宽限期", () => {
    expect(shouldProbe({ hasPool: true, lastUsedAt: 0 + 1, now: 2_000, idleGraceMs: 500 })).toBe(false);
    expect(shouldProbe({ hasPool: true, lastUsedAt: 1_900, now: 2_000, idleGraceMs: 500 })).toBe(true);
  });
});

describe("nextFailureCount", () => {
  it("成功清零", () => {
    expect(nextFailureCount(0, true)).toBe(0);
    expect(nextFailureCount(5, true)).toBe(0);
  });

  it("失败累加", () => {
    expect(nextFailureCount(0, false)).toBe(1);
    expect(nextFailureCount(1, false)).toBe(2);
  });
});

describe("shouldRecycle", () => {
  it("偶发一次失败不砸池", () => {
    expect(shouldRecycle(0)).toBe(false);
    expect(shouldRecycle(DB_FAILURES_BEFORE_RECYCLE - 1)).toBe(false);
  });

  it("连续失败到阈值才回收", () => {
    expect(shouldRecycle(DB_FAILURES_BEFORE_RECYCLE)).toBe(true);
    expect(shouldRecycle(DB_FAILURES_BEFORE_RECYCLE + 1)).toBe(true);
  });
});

describe("常量", () => {
  it("探活间隔不至于把 Neon 计算单元一直钉醒", () => {
    expect(DB_PROBE_INTERVAL_MS).toBeGreaterThanOrEqual(10_000);
    expect(DB_IDLE_GRACE_MS).toBeGreaterThan(DB_PROBE_INTERVAL_MS);
  });
});
