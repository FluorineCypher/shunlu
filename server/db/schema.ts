import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * 领域模型（AGENTS.md §3）：基底为 DEMO-SPEC §6，以下为覆盖后的最终形态。
 * 金额一律 integer 分（规则 3）；时间一律 timestamptz，取值来自 server/clock.ts 的 now()。
 */

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  nickname: text("nickname").notNull(),
  avatarUrl: text("avatar_url"),
  dormGender: text("dorm_gender"), // male | female
  dormBuilding: text("dorm_building"), // 常用楼栋
  dormFloor: integer("dorm_floor"), // 常用楼层（v1.31：发单自动带出）
  dormRoom: text("dorm_room"), // 常用房间号（v1.31：本人资料，不下发他人）
  phoneTail: varchar("phone_tail", { length: 4 }), // 常用手机尾号（v1.31：发单自动带出）
  creditScore: integer("credit_score").notNull().default(100),
  balanceFen: integer("balance_fen").notNull().default(0),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(), // 展示用单号，如 SL-20261020-0001
    publisherId: integer("publisher_id")
      .notNull()
      .references(() => users.id),
    runnerId: integer("runner_id").references(() => users.id),
    batchId: integer("batch_id"),
    bizType: text("biz_type").notNull(), // food | buy
    carryMode: text("carry_mode").notNull().default("runner"),
    status: text("status").notNull().default("open"), // §3.2 状态机
    pickupPoint: text("pickup_point").notNull(), // 取餐/取货点（枚举+手填）
    dropBuilding: text("drop_building").notNull(),
    dropFloor: integer("drop_floor"),
    dropRoom: text("drop_room"), // 隐私：仅接单跑腿者本人可见（规则 5）
    phoneTail: varchar("phone_tail", { length: 4 }), // 隐私：同上
    note: text("note"),
    photoUrls: jsonb("photo_urls").$type<string[]>().notNull().default([]),
    itemDesc: text("item_desc"), // buy：物品描述
    rewardFen: integer("reward_fen").notNull(), // X：发布者付
    runnerRewardFen: integer("runner_reward_fen").notNull(), // Y = round(X * 75%)
    budgetFen: integer("budget_fen").notNull().default(0), // buy：采购额度
    actualFen: integer("actual_fen"), // buy：实付（M4 report 后落库）
    requestedBudgetFen: integer("requested_budget_fen"),
    budgetStatus: text("budget_status").notNull().default("none"), // none|requested|agreed|abandoned
    expectDeliveryAt: timestamp("expect_delivery_at", { withTimezone: true }), // 预订单：预约送达时间（null = 立即可送）
    acceptDeadlineAt: timestamp("accept_deadline_at", { withTimezone: true }),
    deliverDeadlineAt: timestamp("deliver_deadline_at", { withTimezone: true }),
    autoConfirmAt: timestamp("auto_confirm_at", { withTimezone: true }),
    linkedPrevId: integer("linked_prev_id"), // 加价重发指向旧单（旧单保持 expired）
    pickupPhotoUrl: text("pickup_photo_url"),
    proofPhotoUrl: text("proof_photo_url"),
    cancelReason: text("cancel_reason"),
    abnormalReason: text("abnormal_reason"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    pickedAt: timestamp("picked_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    confirmedBy: text("confirmed_by"), // publisher | system
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("orders_status_idx").on(t.status),
    index("orders_publisher_idx").on(t.publisherId),
    index("orders_runner_idx").on(t.runnerId),
    index("orders_batch_idx").on(t.batchId),
  ]
);

/**
 * 捎带项（v1.3 增补）：外卖单捆绑的 1–5 件顺路代买（如「可乐 1 瓶」）。
 * 属于主订单的子项，不单独成单；预算合计进 orders.budget_fen，实付落本表，
 * 结算时与主单一起：退未花完的预算、报销实付给跑腿者。
 */
export const orderAddons = pgTable(
  "order_addons",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id),
    title: text("title").notNull(),
    budgetFen: integer("budget_fen").notNull(),
    actualFen: integer("actual_fen"), // 跑腿上报的实付（未买/没买到为 null）
    status: text("status").notNull().default("pending"), // pending | bought | failed
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_addons_order_idx").on(t.orderId)]
);

export const batches = pgTable("batches", {
  id: serial("id").primaryKey(),
  runnerId: integer("runner_id")
    .notNull()
    .references(() => users.id),
  orderCount: integer("order_count").notNull().default(0),
  expectedRewardFen: integer("expected_reward_fen").notNull().default(0),
  autoComplete: boolean("auto_complete").notNull().default(true), // 送达即完成（10min）
  status: text("status").notNull().default("active"), // active | closed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

/** 账本 append-only（规则 6）：余额 = Σ amount_fen；带符号：freeze 负，其余正 */
export const walletLogs = pgTable(
  "wallet_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    orderId: integer("order_id").references(() => orders.id),
    type: text("type").notNull(), // freeze | refund | income | fee | bonus
    amountFen: integer("amount_fen").notNull(),
    memo: text("memo"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("wallet_logs_user_idx").on(t.userId), index("wallet_logs_order_idx").on(t.orderId)]
);

/** 状态时间轴（§3.1），前端统一渲染 */
export const orderEvents = pgTable(
  "order_events",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id),
    type: text("type").notNull(),
    actorId: integer("actor_id").references(() => users.id),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId)]
);

export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id),
  fromUserId: integer("from_user_id")
    .notNull()
    .references(() => users.id),
  toUserId: integer("to_user_id")
    .notNull()
    .references(() => users.id),
  rating: integer("rating").notNull(), // 1-5
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 红点轮询 3 秒用；M3 砍成 Toast + 红点 */
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    orderId: integer("order_id").references(() => orders.id),
    content: text("content").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId)]
);

/** 演示配置：倍率与手动推进锚点（§4；无状态红线 §2.1-1 —— 倍率只存这里） */
export const demoConfig = pgTable("demo_config", {
  id: integer("id").primaryKey(), // 恒为 1
  timeScale: integer("time_scale").notNull().default(1), // 1 | 8 | 30 | 60
  anchorRealMs: bigint("anchor_real_ms", { mode: "number" }).notNull(),
  anchorSimMs: bigint("anchor_sim_ms", { mode: "number" }).notNull(),
});
