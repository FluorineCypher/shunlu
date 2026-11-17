/** 前端唯一取数入口：不在这里算钱、判状态、拼权限（规则 2） */

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    cache: "no-store",
    ...init,
    headers: init?.body instanceof FormData ? undefined : { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new ApiError(data?.error ?? `请求失败（${res.status}）`, res.status);
  return data as T;
}

export const post = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const patch = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) });

/** 演示口令 → 换 httpOnly Cookie（sl_demo，12h）；成功后 /api/demo/* 不再需要 ?token= */
export async function demoLogin(token: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/demo/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
    cache: "no-store",
  });
  if (res.ok) return { ok: true };
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return { ok: false, error: data?.error ?? `口令校验失败（${res.status}）` };
}

export function fen(v: number | null | undefined): string {
  return ((v ?? 0) / 100).toFixed(2);
}

/** 秒 → 「mm:ss」，倒计时用；剩余秒由服务端按模拟时钟算好 */
export function countdown(sec: number | null | undefined): string {
  const s = Math.max(0, Math.floor(sec ?? 0));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
