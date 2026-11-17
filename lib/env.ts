/**
 * 环境变量集中清单（AGENTS.md §2.1-5）。
 * 缺失时**首次使用即报清晰错误**；进程启动时由 instrumentation.ts 调 assertEnv() 做一次总检。
 * 说明：这里刻意不在模块顶层 throw —— `next build` 会在无数据库凭据的机器上收集路由，
 * 顶层 throw 会让构建本身失败；构建应当成功，运行时缺变量才算错误。
 */

function read(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

function required(name: string): string {
  const v = read(name);
  if (!v) {
    throw new Error(
      `[env] 缺少必填环境变量 ${name}。请在 .env.local 中配置（参考 .env.example）。`
    );
  }
  return v;
}

/** 数据库连接串（Neon 或本机内嵌库） */
export function getDatabaseUrl(): string {
  return required("DATABASE_URL");
}

/** 演示模式：仅显式 "1" 时开启 /api/demo/* 与演示工具条 */
export function getDemoMode(): boolean {
  return read("DEMO_MODE") === "1";
}

/** /api/demo/* 的公网令牌；生产未配置时 demo 接口一律 403（§2.1-3） */
export function getDemoToken(): string | undefined {
  return read("DEMO_TOKEN");
}

export type StorageDriver = "local" | "vercel-blob";

export function getStorageDriver(): StorageDriver {
  const d = read("STORAGE_DRIVER") ?? "local";
  if (d !== "local" && d !== "vercel-blob") {
    throw new Error(`[env] STORAGE_DRIVER 必须是 local 或 vercel-blob，当前为 "${d}"`);
  }
  return d;
}

export function getBlobToken(): string | undefined {
  return read("BLOB_READ_WRITE_TOKEN");
}

export function getAppUrl(): string {
  return read("APP_URL") ?? "http://localhost:3000";
}

/**
 * 电脑端调试后台的密码（v1.7）。与 DEMO_TOKEN 分开：
 * - DEMO_TOKEN 给 /api/demo/*（手机端工具条），
 * - ADMIN_PASSWORD 给 /admin/console（电脑端后台，一次登录后 Cookie 记住）。
 * 未配置时后台接口一律 503，不给「默认密码」的暗门。
 */
export function getAdminPassword(): string | undefined {
  return read("ADMIN_PASSWORD");
}

/**
 * 启动自检（instrumentation.ts 调用一次）：把「缺失即报错」提前到进程启动，
 * 而不是等到第一次请求才炸。可选变量只做取值合法性校验。
 */
export function assertEnv(): void {
  getDatabaseUrl();
  const driver = getStorageDriver();
  if (driver === "vercel-blob" && !getBlobToken()) {
    throw new Error("[env] STORAGE_DRIVER=vercel-blob 时必须配置 BLOB_READ_WRITE_TOKEN");
  }
  if (process.env.NODE_ENV === "production" && getDemoMode() && !getDemoToken()) {
    console.warn(
      "[env] 警告：生产环境开启了 DEMO_MODE 但未配置 DEMO_TOKEN；本机回环访问放行，其它来源 /api/demo/* 返回 403（§2.1-3）"
    );
  }
}
