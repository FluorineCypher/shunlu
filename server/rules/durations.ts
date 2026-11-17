/**
 * 模拟时长工具（规则 7）：所有截止时间差用模拟秒/分钟计算。
 * now() 返回的已经是模拟时间（ms），因此「模拟 20 分钟」直接加 20*60*1000 毫秒。
 */

export const MIN_MS = 60 * 1000;
export const HOUR_MS = 60 * MIN_MS;

/** 接单截止候选（模拟分钟，§4）：5 / 10 / 15 / 30 */
export const ACCEPT_DEADLINE_MINUTES = [5, 10, 15, 30] as const;
/** 送达截止：接单后 20 模拟分钟 */
export const DELIVER_DEADLINE_MINUTES = 20;
/** 自动确认：单 2 小时；批次「送达即完成」10 分钟 */
export const AUTO_CONFIRM_SINGLE_MS = 2 * HOUR_MS;
export const AUTO_CONFIRM_BATCH_MS = 10 * MIN_MS;
