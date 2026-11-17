import { eq } from "drizzle-orm";
import { db } from "./db";
import { demoConfig } from "./db/schema";

/**
 * 唯一的时间来源（规则 7）：全项目禁止直接 new Date()/Date.now()，只许从这里拿。
 * 语义：模拟时间 = anchor_sim + (真实流逝) × time_scale + 手动推进。
 * - 倍率只影响未来流逝，已落库的 deadline 不重算（§4）。
 * - 手动推进 = 把 anchor_sim 往前拨。
 * - 状态只存 demo_config 表（§2.1-1 无状态红线），进程重启行为一致。
 */

type ClockConfig = { scale: number; anchorReal: number; anchorSim: number };

async function loadConfig(): Promise<ClockConfig> {
  const rows = await db.select().from(demoConfig).where(eq(demoConfig.id, 1));
  if (rows.length === 0) {
    const t = Date.now();
    await db.insert(demoConfig).values({ id: 1, timeScale: 1, anchorRealMs: t, anchorSimMs: t });
    return { scale: 1, anchorReal: t, anchorSim: t };
  }
  const r = rows[0];
  return { scale: r.timeScale, anchorReal: Number(r.anchorRealMs), anchorSim: Number(r.anchorSimMs) };
}

async function saveConfig(next: ClockConfig): Promise<void> {
  await db
    .update(demoConfig)
    .set({ timeScale: next.scale, anchorRealMs: next.anchorReal, anchorSimMs: next.anchorSim })
    .where(eq(demoConfig.id, 1));
}

/** 重置时钟到「此刻、倍率 1」（种子 / 重置用），返回模拟时间起点 ms */
export async function resetClock(scale = 1): Promise<number> {
  const t = Date.now();
  await db
    .insert(demoConfig)
    .values({ id: 1, timeScale: scale, anchorRealMs: t, anchorSimMs: t })
    .onConflictDoUpdate({
      target: demoConfig.id,
      set: { timeScale: scale, anchorRealMs: t, anchorSimMs: t },
    });
  return t;
}

/** 当前模拟时间（毫秒） */
export async function nowMs(): Promise<number> {
  const c = await loadConfig();
  return c.anchorSim + (Date.now() - c.anchorReal) * c.scale;
}

/** 当前模拟时间 */
export async function now(): Promise<Date> {
  return new Date(await nowMs());
}

/** 设置倍率（1/8/30/60）：以当前模拟时间为新锚点，已产生的偏移不丢 */
export async function setScale(scale: number): Promise<void> {
  const sim = await nowMs();
  await saveConfig({ scale, anchorReal: Date.now(), anchorSim: sim });
}

/** 手动推进：模拟时间直接拨快 advanceMs */
export async function advance(advanceMs: number): Promise<void> {
  const c = await loadConfig();
  const sim = c.anchorSim + (Date.now() - c.anchorReal) * c.scale + advanceMs;
  await saveConfig({ scale: c.scale, anchorReal: Date.now(), anchorSim: sim });
}

/** 读当前倍率（演示工具条展示用） */
export async function getScale(): Promise<number> {
  return (await loadConfig()).scale;
}
