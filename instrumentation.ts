/**
 * Next.js 启动钩子：Node 运行时启动后立刻做一次环境自检（AGENTS.md §2.1-5）。
 * 缺 DATABASE_URL 等必填变量时，进程启动即报清晰错误，而不是等第一个请求。
 *
 * v1.16（m00383）：同时启动连接池 watchdog——线上出现过「池里的 socket 被静默丢弃，
 * 所有查询无限排队、全站转圈只能重启」的事故，靠它自动回收重建。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertEnv } = await import("./lib/env");
    assertEnv();
    const { startDbWatchdog } = await import("./server/db");
    startDbWatchdog();
  }
}
