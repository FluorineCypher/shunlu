/**
 * 业务常量（§4）：改值只改这里。
 * 金额一律分；费率不进 DB、不进前端，只在这里。
 */

/** 服务费差价 25%：发布付 X，跑腿收 Y = round(X × 75%)，平台 fee = X − Y（A/B 通用） */
export const RUNNER_SHARE = 0.75;

export function calcRunnerRewardFen(rewardFen: number): number {
  return Math.round(rewardFen * RUNNER_SHARE);
}

/** 多单加成：批次 ≥ 3 单且同楼栋时，每单 bonus = round(Y × 5%)（平台让利） */
export const BONUS_RATE = 0.05;
export const BONUS_MIN_BATCH_SIZE = 3;

export function calcBonusFen(runnerRewardFen: number): number {
  return Math.round(runnerRewardFen * BONUS_RATE);
}

/** 赏金范围（分） */
export const REWARD_MIN_FEN = 200;
export const REWARD_MAX_FEN = 2000;

/** 信用分（DEMO-SPEC §7.7） */
export const CREDIT_INITIAL = 100;
export const CREDIT_MAX = 120;
export const CREDIT_COMPLETE_BONUS = 1;
export const CREDIT_ABANDON_PENALTY = 5;
export const CREDIT_TIMEOUT_PENALTY = 10;
export const CREDIT_MIN_ACCEPT = 60;

/** 并发上限：发布者同时 open ≤ 2；跑腿者同时履约中（accepted+picked+delivered）≤ 3 */
export const PUBLISHER_MAX_OPEN = 2;
export const RUNNER_MAX_ACTIVE = 3;

/** 信用 < 60：禁接单且并发上限强制为 1 */
export function runnerMaxActive(creditScore: number): number {
  return creditScore < CREDIT_MIN_ACCEPT ? 1 : RUNNER_MAX_ACTIVE;
}

/**
 * 捎带项（v1.3 增补）：外卖单可以捆绑 1–5 件「顺路捎带」的代买物（如一瓶可乐）。
 * 不走单独的代买单，冻结/结算并入主订单：预算进 orders.budget_fen，实付落 order_addons。
 */
export const ADDON_MAX_ITEMS = 5;
export const ADDON_MIN_BUDGET_FEN = 100; // 单件预算下限 1 元
export const ADDON_MAX_BUDGET_FEN = 20000; // 单件预算上限 200 元
export const ADDON_TOTAL_MAX_FEN = 30000; // 全部捎带项预算合计上限 300 元

/**
 * 预订单（v1.5）：发布时指定「预计送达时间」，提前下单。
 * 给跑腿者留足余量：至少提前 20 分钟；到点没送到 → 跑腿者报「餐未送达」或超时释放，信用 −10。
 */
export const SCHEDULE_MIN_LEAD_MINUTES = 20;
export const SCHEDULE_MAX_LEAD_MINUTES = 24 * 60;
export const CREDIT_UNARRIVED_PENALTY = 10;
/**
 * 预约单到点没到手，责任分两种（v1.7）：
 * - runner_late：跑腿者自己送晚了 → 扣跑腿者 10 分（CREDIT_UNARRIVED_PENALTY）
 * - vendor_late：商家/外卖骑手没送到（跑腿者去取了也取不到）→ 扣发单者 5 分，
 *   因为是他下单/约时间时没给商家与骑手留够余量。
 */
export const CREDIT_VENDOR_LATE_PENALTY = 5;

/**
 * 批次（P4）时间冲突（v1.10）：
 * 一次接多单时，「最后一个取货点取完」到「同批最早一单的送达截止」之间
 * 必须还剩下至少 5 分钟，否则第一批货必然超时。
 * 取货耗时按「多一个不同取货点 +3 分钟」估算（同取餐点一次取完，不额外计时）。
 */
export const BATCH_MIN_GAP_MINUTES = 5;
export const BATCH_PICKUP_STEP_MINUTES = 3;

/** 演示倍率候选（§4） */
export const TIME_SCALES = [1, 8, 30, 60] as const;

/** 平台账号固定 id（附录 B）：只收 fee、不进大厅、不可被切号 */
export const PLATFORM_USER_ID = 9;
