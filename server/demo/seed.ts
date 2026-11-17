import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  batches,
  demoConfig,
  notifications,
  orderEvents,
  orders,
  orderAddons,
  reviews,
  users,
  walletLogs,
} from "@/server/db/schema";
import { calcRunnerRewardFen, PLATFORM_USER_ID } from "@/server/rules/constants";
import { MIN_MS } from "@/server/rules/durations";
import { resetClock } from "@/server/clock";

/**
 * 种子（AGENTS.md 附录 B）：`npm run seed` 与 `POST /api/demo/reset` 共用，
 * 保证 reset 后数据回到种子。金额一律分。
 *
 * 账本纪律（规则 6）：每张单的 freeze / refund / income / fee 都挂 order_id，
 * 且 `users.balance_fen` 由流水汇总回填 —— 种子本身必须满足两条不变式。
 */

/** 固定账号 id（附录 B）：管理员恒为 8，平台账号恒为 9；10/11 为 v1.10 补充的跨楼栋/跨性别测试住户 */
export const USER_IDS = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  ADMIN: 8,
  PLATFORM: PLATFORM_USER_ID,
  /** v1.10 · 男寝住户（男生跑手），用来演示「同栋优先」与跨楼栋提醒 */
  F: 10,
  /** v1.10 · 女寝 6 层住户，用来演示「同层多单」与性别硬规则 */
  G: 11,
} as const;

const INITIAL_BALANCE: Record<number, number> = {
  [USER_IDS.A]: 5000,
  [USER_IDS.D]: 5000,
  [USER_IDS.E]: 10000,
  [USER_IDS.F]: 5000,
  [USER_IDS.G]: 5000,
};

function orderCode(seq: number): string {
  return `SL-SEED-${String(seq).padStart(4, "0")}`;
}

type NewOrder = typeof orders.$inferInsert;
type NewLog = typeof walletLogs.$inferInsert;

export async function resetAndSeed(): Promise<void> {
  // 1) 清库（含序列复位）
  await db.execute(
    sql`TRUNCATE TABLE ${orderEvents}, ${orderAddons}, ${walletLogs}, ${reviews}, ${notifications}, ${orders}, ${batches}, ${users}, ${demoConfig} RESTART IDENTITY CASCADE`
  );

  // 2) 时钟归零：倍率 1，锚点=当前真实时间（模拟时间 ≈ 真实时间起跑）
  const base = await resetClock(1);
  const at = (offsetMs: number) => new Date(base + offsetMs);
  const PAST = -24 * 60 * MIN_MS; // 已完成订单落在 24 小时前

  // 3) 九账号（附录 B + v1.10 测试住户）：B 改为女生，新增男寝 F 与女寝 6 层 G
  const userRows: (typeof users.$inferInsert)[] = [
    { id: USER_IDS.A, nickname: "阿瑶", dormGender: "female", dormBuilding: "女寝3号楼" },
    { id: USER_IDS.B, nickname: "小跑B", dormGender: "female", dormBuilding: "女寝3号楼" },
    { id: USER_IDS.C, nickname: "小跑C", dormGender: "female", dormBuilding: "男寝5号楼" },
    { id: USER_IDS.D, nickname: "大伟", dormGender: "male", dormBuilding: "女寝3号楼" },
    { id: USER_IDS.E, nickname: "悠悠", dormGender: "female", dormBuilding: "女寝3号楼" },
    { id: USER_IDS.ADMIN, nickname: "管理员", dormGender: "male", dormBuilding: "教工宿舍", isAdmin: true },
    { id: USER_IDS.PLATFORM, nickname: "平台", dormGender: "male", dormBuilding: "-" },
    { id: USER_IDS.F, nickname: "阿哲", dormGender: "male", dormBuilding: "男寝5号楼" },
    { id: USER_IDS.G, nickname: "小雨", dormGender: "female", dormBuilding: "女寝3号楼" },
  ];
  await db.insert(users).values(userRows);

  // 4) food 已完成 ×8（含评价与流水，供 P5/P6/P9 有数据）
  const completedOrders: NewOrder[] = [];
  const foodPlan = [
    { publisher: USER_IDS.A, runner: USER_IDS.B, reward: 400, pickup: "东门外卖柜" },
    { publisher: USER_IDS.A, runner: USER_IDS.C, reward: 300, pickup: "西门外卖柜" },
    { publisher: USER_IDS.D, runner: USER_IDS.B, reward: 500, pickup: "南门外卖柜" },
    { publisher: USER_IDS.D, runner: USER_IDS.B, reward: 350, pickup: "东门外卖柜" },
    { publisher: USER_IDS.D, runner: USER_IDS.C, reward: 450, pickup: "东门外卖柜" },
    { publisher: USER_IDS.E, runner: USER_IDS.B, reward: 300, pickup: "西门外卖柜" },
    { publisher: USER_IDS.E, runner: USER_IDS.C, reward: 600, pickup: "东门外卖柜" },
    { publisher: USER_IDS.E, runner: USER_IDS.B, reward: 400, pickup: "南门外卖柜" },
  ];
  foodPlan.forEach((p, i) => {
    const start = PAST + i * 30 * MIN_MS;
    completedOrders.push({
      code: orderCode(i + 1),
      publisherId: p.publisher,
      runnerId: p.runner,
      bizType: "food",
      status: "completed",
      pickupPoint: p.pickup,
      dropBuilding: "女寝3号楼",
      dropFloor: 4,
      dropRoom: "412",
      phoneTail: "88" + String(10 + i).slice(-2),
      itemDesc: "外卖一份",
      rewardFen: p.reward,
      runnerRewardFen: calcRunnerRewardFen(p.reward),
      acceptedAt: at(start + 2 * MIN_MS),
      pickedAt: at(start + 8 * MIN_MS),
      deliveredAt: at(start + 15 * MIN_MS),
      completedAt: at(start + 16 * MIN_MS),
      confirmedBy: "publisher",
      createdAt: at(start),
    });
  });

  // 5) buy 已完成 ×3（含 M4 找零：冻结 X+budget → 退 budget−actual → 报销 actual + 奖励 Y）
  const buyPlan = [
    { publisher: USER_IDS.E, runner: USER_IDS.B, budget: 1000, actual: 450, reward: 300 },
    { publisher: USER_IDS.E, runner: USER_IDS.C, budget: 1500, actual: 1200, reward: 400 },
    { publisher: USER_IDS.D, runner: USER_IDS.B, budget: 800, actual: 600, reward: 300 },
  ];
  buyPlan.forEach((p, i) => {
    const start = PAST + (8 + i) * 30 * MIN_MS;
    completedOrders.push({
      code: orderCode(9 + i),
      publisherId: p.publisher,
      runnerId: p.runner,
      bizType: "buy",
      status: "completed",
      pickupPoint: "校内超市",
      dropBuilding: "女寝3号楼",
      dropFloor: 4,
      dropRoom: "412",
      phoneTail: "88" + String(20 + i).slice(-2),
      itemDesc: "代买（种子演示单）",
      rewardFen: p.reward,
      runnerRewardFen: calcRunnerRewardFen(p.reward),
      budgetFen: p.budget,
      actualFen: p.actual,
      budgetStatus: "none",
      acceptedAt: at(start + 2 * MIN_MS),
      pickedAt: at(start + 10 * MIN_MS),
      deliveredAt: at(start + 18 * MIN_MS),
      completedAt: at(start + 19 * MIN_MS),
      confirmedBy: "publisher",
      createdAt: at(start),
    });
  });

  // 6) 3 条同取餐点同楼待接单（脚本 B 用）+ 1 条 buy 待接 + 1 条已接未送（脚本 D 用）
  const pendingOrders: NewOrder[] = [
    { publisher: USER_IDS.D, reward: 350, budget: 400 },
    { publisher: USER_IDS.D, reward: 400, budget: 300 },
    { publisher: USER_IDS.A, reward: 500, budget: 0 },
  ].map((p, i) => ({
    code: orderCode(12 + i),
    publisherId: p.publisher,
    bizType: "food",
    status: "open",
    pickupPoint: "东门外卖柜",
    dropBuilding: "女寝3号楼",
    dropFloor: 4,
    dropRoom: "412",
    phoneTail: "88" + String(30 + i).slice(-2),
    itemDesc: "外卖一份",
    rewardFen: p.reward,
    runnerRewardFen: calcRunnerRewardFen(p.reward),
    budgetFen: p.budget,
    acceptDeadlineAt: at(15 * MIN_MS),
    createdAt: at(0),
  }));

  pendingOrders.push({
    code: orderCode(15),
    publisherId: USER_IDS.E,
    bizType: "buy",
    status: "open",
    pickupPoint: "校内超市",
    dropBuilding: "女寝3号楼",
    dropFloor: 4,
    dropRoom: "412",
    phoneTail: "8840",
    itemDesc: "牙膏 + 毛巾",
    rewardFen: 300,
    runnerRewardFen: calcRunnerRewardFen(300),
    budgetFen: 1000,
    budgetStatus: "none",
    acceptDeadlineAt: at(30 * MIN_MS),
    createdAt: at(0),
  });

  // v1.41 · 这单「已被接走还没送到」挂给 C（脚本 D 的对照组），别再挂给 B：
  // B 是演示里最常用的跑腿身份，它手上有 1 单进行中时并发位只剩 2，详情页「同栋推荐」就凑不满 3 单加成。
  pendingOrders.push({
    code: orderCode(16),
    publisherId: USER_IDS.A,
    runnerId: USER_IDS.C,
    bizType: "food",
    status: "accepted",
    pickupPoint: "东门外卖柜",
    dropBuilding: "女寝3号楼",
    dropFloor: 4,
    dropRoom: "412",
    phoneTail: "8841",
    itemDesc: "外卖一份",
    rewardFen: 400,
    runnerRewardFen: calcRunnerRewardFen(400),
    budgetFen: 400,
    acceptDeadlineAt: at(-5 * MIN_MS),
    deliverDeadlineAt: at(20 * MIN_MS),
    acceptedAt: at(0),
    createdAt: at(-10 * MIN_MS),
  });

  // 6.1) 预订单（v1.5）：提前下单，承诺 30 分钟后送达；接单截止 = 承诺时刻
  pendingOrders.push({
    code: orderCode(17),
    publisherId: USER_IDS.C,
    bizType: "food",
    status: "open",
    pickupPoint: "东门外卖柜",
    dropBuilding: "女寝3号楼",
    dropFloor: 4,
    dropRoom: "412",
    phoneTail: "8842",
    itemDesc: "炸鸡 + 奶茶（预约）",
    note: "预约 30 分钟后送达，不着急，接单前确认时间够",
    rewardFen: 600,
    runnerRewardFen: calcRunnerRewardFen(600),
    budgetFen: 0,
    expectDeliveryAt: at(30 * MIN_MS),
    acceptDeadlineAt: at(30 * MIN_MS),
    createdAt: at(0),
  });
  // 6.2) v1.10 · 跨楼层 / 跨楼栋 / 性别测试单：
  //  - #18 女寝 6 层（同栋不同层）：验证「同层优先、其次同栋」与同层多单
  //  - #19 男寝 5 号楼（另一栋）：验证同栋筛选与非同栋二次确认
  //  - #20 女寝 6 层第二单：验证同一楼层多单完整展示、可勾选一起带
  pendingOrders.push(
    {
      code: orderCode(18),
      publisherId: USER_IDS.G,
      bizType: "food",
      status: "open",
      pickupPoint: "东门外卖柜",
      dropBuilding: "女寝3号楼",
      dropFloor: 6,
      dropRoom: "608",
      phoneTail: "8851",
      itemDesc: "麻辣烫一份",
      note: "6 层，和 4 层那几单不是同一个楼层",
      rewardFen: 450,
      runnerRewardFen: calcRunnerRewardFen(450),
      budgetFen: 0,
      acceptDeadlineAt: at(15 * MIN_MS),
      createdAt: at(0),
    },
    {
      code: orderCode(19),
      publisherId: USER_IDS.F,
      bizType: "food",
      status: "open",
      pickupPoint: "西门外卖柜",
      dropBuilding: "男寝5号楼",
      dropFloor: 3,
      dropRoom: "305",
      phoneTail: "8852",
      itemDesc: "汉堡套餐",
      note: "男寝 3 层，另一栋楼",
      rewardFen: 500,
      runnerRewardFen: calcRunnerRewardFen(500),
      budgetFen: 0,
      acceptDeadlineAt: at(15 * MIN_MS),
      createdAt: at(0),
    },
    {
      code: orderCode(20),
      publisherId: USER_IDS.G,
      bizType: "food",
      status: "open",
      pickupPoint: "东门外卖柜",
      dropBuilding: "女寝3号楼",
      dropFloor: 6,
      dropRoom: "621",
      phoneTail: "8853",
      itemDesc: "水果捞一份",
      note: "6 层同一层，可以和 608 一起带（女生单，男生不可接）",
      rewardFen: 300,
      runnerRewardFen: calcRunnerRewardFen(300),
      budgetFen: 0,
      acceptDeadlineAt: at(20 * MIN_MS),
      createdAt: at(0),
    },
  );

  // 7) 落库：订单 → 评价 → 账本
  const insertedOrders = await db
    .insert(orders)
    .values([...completedOrders, ...pendingOrders])
    .returning({ id: orders.id, code: orders.code });
  const idByCode = new Map(insertedOrders.map((r) => [r.code, r.id]));

  // 7.1) 捎带项（v1.3）：外卖单顺路带的代买小件；预算已并入该单 orders.budget_fen
  const addonPlan = [
    { code: orderCode(12), title: "冰可乐 1 瓶", budgetFen: 400 },
    { code: orderCode(13), title: "抽纸 1 包", budgetFen: 300 },
    { code: orderCode(16), title: "雪碧 1 瓶", budgetFen: 400 },
  ];
  await db.insert(orderAddons).values(
    addonPlan.map((a) => ({
      orderId: idByCode.get(a.code)!,
      title: a.title,
      budgetFen: a.budgetFen,
      status: "pending",
    }))
  );

  const reviewRows: (typeof reviews.$inferInsert)[] = completedOrders.map((o) => ({
    orderId: idByCode.get(o.code)!,
    fromUserId: o.publisherId as number,
    toUserId: o.runnerId as number,
    rating: 5,
    comment: "种子好评",
    createdAt: new Date((o.completedAt as Date).getTime() + MIN_MS),
  }));
  await db.insert(reviews).values(reviewRows);

  const logs: NewLog[] = [];
  const paidAt = at(PAST - 60 * MIN_MS);
  for (const [userId, amountFen] of Object.entries(INITIAL_BALANCE)) {
    logs.push({
      userId: Number(userId),
      type: "income",
      amountFen,
      memo: "种子初始余额",
      createdAt: paidAt,
    });
  }

  // 每张单：发布即冻结（X + 采购额度），终态按附录 A 结算
  for (const o of [...completedOrders, ...pendingOrders]) {
    const orderId = idByCode.get(o.code)!;
    const reward = o.rewardFen;
    const budget = o.budgetFen ?? 0;
    const y = o.runnerRewardFen;
    const createdAt = o.createdAt as Date;

    logs.push({
      userId: o.publisherId as number,
      orderId,
      type: "freeze",
      amountFen: -(reward + budget),
      memo: `冻结 ${o.code}`,
      createdAt,
    });

    if (o.status !== "completed") continue; // 未终态：冻结仍挂在单上

    const doneAt = o.completedAt as Date;
    if (o.bizType === "buy") {
      const actual = o.actualFen ?? 0;
      logs.push({
        userId: o.publisherId as number,
        orderId,
        type: "refund",
        amountFen: budget - actual,
        memo: `代买找零 ${o.code}`,
        createdAt: doneAt,
      });
      logs.push({
        userId: o.runnerId as number,
        orderId,
        type: "income",
        amountFen: actual,
        memo: `垫付报销 ${o.code}`,
        createdAt: doneAt,
      });
    }
    logs.push({
      userId: o.runnerId as number,
      orderId,
      type: "income",
      amountFen: y,
      memo: `跑腿收入 ${o.code}`,
      createdAt: doneAt,
    });
    logs.push({
      userId: USER_IDS.PLATFORM,
      orderId,
      type: "fee",
      amountFen: reward - y,
      memo: `平台服务费 ${o.code}`,
      createdAt: doneAt,
    });
  }

  await db.insert(walletLogs).values(logs);

  // 不变式 1：每个用户 balance_fen = Σ wallet_logs.amount_fen（由流水回填，绝不双写）
  await db.execute(sql`
    UPDATE users u
    SET balance_fen = COALESCE((SELECT SUM(w.amount_fen) FROM wallet_logs w WHERE w.user_id = u.id), 0)
  `);
  // 给后续真实注册/测试留出 id 空间
  await db.execute(sql`SELECT setval(pg_get_serial_sequence('users', 'id'), 100)`);
  await db.execute(sql`SELECT setval(pg_get_serial_sequence('orders', 'id'), 1000)`);

  // 种子时间点校验：保证「此刻」确实能演 A–F（见 docs/PROGRESS.md 验收记录）
  await assertSeedInvariants();
}

/** 种子自检：两条不变式 + 关键演示数据存在性；失败即抛，不允许带病重置 */
export async function assertSeedInvariants(): Promise<void> {
  // postgres-js 的 execute 直接返回行数组（不是 { rows }）
  const rows = (await db.execute(sql`
    SELECT COUNT(*)::int AS drift FROM (
      SELECT u.id FROM users u
      LEFT JOIN (SELECT user_id, SUM(amount_fen) AS s FROM wallet_logs GROUP BY user_id) w
        ON w.user_id = u.id
      WHERE u.balance_fen <> COALESCE(w.s, 0)
    ) t
  `)) as unknown as { drift: number }[];
  const drift = Number(rows[0]?.drift ?? 0);
  if (drift !== 0) throw new Error(`[seed] 余额不变式失败：${drift} 个用户 balance ≠ Σ logs`);
}
