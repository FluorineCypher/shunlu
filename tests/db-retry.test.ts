import { describe, expect, it } from "vitest";

import {
  READ_RETRY_ATTEMPTS,
  describeDbError,
  isTransientDbError,
  runWithRetry,
} from "@/server/db/retry";

/** 造一个连接类错误：postgres.js 断连时真实出现的形态 */
function connectionClosed(): Error & { code: string } {
  const err = new Error(
    "write CONNECTION_CLOSED ep-square-feather-aoj1pgr7-pooler.c-2.ap-southeast-1.aws.neon.tech:5432",
  ) as Error & { code: string };
  err.code = "CONNECTION_CLOSED";
  return err;
}

/** 计数用的假查询：按调用序号决定成功还是抛错 */
function fakeQuery(outcomes: Array<"ok" | "closed" | "unique" | "deadline">) {
  const calls: number[] = [];
  const run = async (attempt: number) => {
    calls.push(attempt);
    const outcome = outcomes[attempt - 1] ?? "ok";
    if (outcome === "closed") throw connectionClosed();
    if (outcome === "unique") {
      const err = new Error("duplicate key value violates unique constraint") as Error & {
        code: string;
      };
      err.code = "23505";
      throw err;
    }
    if (outcome === "deadline") {
      const err = new Error("数据库响应超时（handler，>20000ms）");
      err.name = "DbDeadlineError";
      throw err;
    }
    return `第 ${attempt} 次成功`;
  };
  return { calls, run };
}

/** 不真的等待：把 sleep 换成记录器 */
function recorder() {
  const waits: number[] = [];
  return { waits, sleep: async (ms: number) => void waits.push(ms) };
}

describe("isTransientDbError", () => {
  it("认 postgres.js 的 CONNECTION_CLOSED（真实线上日志形态）", () => {
    expect(isTransientDbError(connectionClosed())).toBe(true);
  });

  it("只有 message 没有 code 也认（connection closed / socket hang up）", () => {
    expect(isTransientDbError(new Error("Connection closed before full header was received"))).toBe(
      true,
    );
    expect(isTransientDbError(new Error("socket hang up"))).toBe(true);
    expect(isTransientDbError(new Error("read ECONNRESET"))).toBe(true);
  });

  it("顺着 cause 链也能认出来（驱动包一层时常见）", () => {
    const outer = new Error("failed to execute query");
    (outer as Error & { cause?: unknown }).cause = connectionClosed();
    expect(isTransientDbError(outer)).toBe(true);
  });

  it("业务错误、约束冲突、语法错一律不认", () => {
    const unique = new Error("duplicate key value violates unique constraint") as Error & {
      code: string;
    };
    unique.code = "23505";
    expect(isTransientDbError(unique)).toBe(false);

    const syntax = new Error("syntax error at or near \"selct\"") as Error & { code: string };
    syntax.code = "42601";
    expect(isTransientDbError(syntax)).toBe(false);

    const business = new Error("手慢了");
    expect(isTransientDbError(business)).toBe(false);
    expect(isTransientDbError(null)).toBe(false);
    expect(isTransientDbError("CONNECTION_CLOSED")).toBe(false);
  });

  it("自己的 20s 超时（DbDeadlineError）即使带连接类文案也不重试", () => {
    const err = new Error("write CONNECTION_CLOSED …") as Error & { code: string };
    err.name = "DbDeadlineError";
    err.code = "CONNECTION_CLOSED";
    expect(isTransientDbError(err)).toBe(false);
  });
});

describe("runWithRetry", () => {
  it("首次断连、第二次成功 → 只调 2 次，返回第二次的结果", async () => {
    const { calls, run } = fakeQuery(["closed", "ok"]);
    const { waits, sleep } = recorder();

    const result = await runWithRetry(run, { sleep });

    expect(result).toBe("第 2 次成功");
    expect(calls).toEqual([1, 2]);
    expect(waits).toEqual([120]);
  });

  it("两次都断连 → 调满 2 次后抛出最后一个错误（保持原对象身份）", async () => {
    const first = connectionClosed();
    const second = connectionClosed();
    const thrown = [first, second];
    let n = 0;
    const run = async () => {
      throw thrown[n++];
    };
    const { sleep } = recorder();

    await expect(runWithRetry(run, { sleep })).rejects.toBe(second);
    expect(n).toBe(2);
  });

  it("非连接类错误（唯一键 23505）立刻抛出，只调 1 次", async () => {
    const { calls, run } = fakeQuery(["unique"]);
    const { waits, sleep } = recorder();

    await expect(runWithRetry(run, { sleep })).rejects.toThrow(/unique constraint/);
    expect(calls).toEqual([1]);
    expect(waits).toEqual([]);
  });

  it("DbDeadlineError 不重试：预算已耗尽，再试只会更慢", async () => {
    const { calls, run } = fakeQuery(["deadline"]);
    const { sleep } = recorder();

    await expect(runWithRetry(run, { sleep })).rejects.toThrow(/数据库响应超时/);
    expect(calls).toEqual([1]);
  });

  it("attempts 决定上限：attempts=1 时连接错也只试一次", async () => {
    const { calls, run } = fakeQuery(["closed", "ok"]);
    const { sleep } = recorder();

    await expect(runWithRetry(run, { attempts: 1, sleep })).rejects.toThrow(/CONNECTION_CLOSED/);
    expect(calls).toEqual([1]);
  });

  it("attempts=3 时退避按 120 / 240 递增，成功后不再多试", async () => {
    const { calls, run } = fakeQuery(["closed", "closed", "ok"]);
    const { waits, sleep } = recorder();

    const result = await runWithRetry(run, { attempts: 3, sleep });

    expect(result).toBe("第 3 次成功");
    expect(calls).toEqual([1, 2, 3]);
    expect(waits).toEqual([120, 240]);
  });

  it("onRetry 拿到刚失败的错误与尝试序号（用来打日志）", async () => {
    const { run } = fakeQuery(["closed", "ok"]);
    const seen: Array<{ attempt: number; message: string }> = [];

    await runWithRetry(run, {
      sleep: async () => {},
      onRetry: (err, attempt) => {
        seen.push({ attempt, message: describeDbError(err) });
      },
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.attempt).toBe(1);
    expect(seen[0]?.message).toMatch(/^CONNECTION_CLOSED: write CONNECTION_CLOSED …?/);
  });

  it("backoffMs=0 时不等待（测试与压测用）", async () => {
    const { calls, run } = fakeQuery(["closed", "ok"]);
    const { waits, sleep } = recorder();

    await runWithRetry(run, { backoffMs: 0, sleep });

    expect(calls).toEqual([1, 2]);
    expect(waits).toEqual([]);
  });

  it("默认常量就是「1 次重试、120ms」", () => {
    expect(READ_RETRY_ATTEMPTS).toBe(2);
  });
});

describe("describeDbError", () => {
  it("code 优先，message 压成单行并截断", () => {
    expect(describeDbError(connectionClosed())).toMatch(
      /^CONNECTION_CLOSED: write CONNECTION_CLOSED ep-square-feather/,
    );
  });

  it("没有 code 时退回 name，普通 Error 只留 message", () => {
    expect(describeDbError(new Error("手慢了"))).toBe("Error: 手慢了");
    const biz = new Error("订单已完成") as Error & { code: string };
    biz.code = "CONFLICT";
    expect(describeDbError(biz)).toBe("CONFLICT: 订单已完成");
  });
});
