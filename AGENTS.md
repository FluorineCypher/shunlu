# AGENTS.md · 顺路 项目工作规约（给工作模型的分步执行合同）

> 版本 **v1.10**（2026-10-21，覆盖 v1.9/v1.8/v1.7/v1.6/v1.5/v1.4/v1.3/v1.2/v1.1）。本文件优先级高于任何口头/纸面计划。每完成一个 Step 必须在 `docs/PROGRESS.md` 追加一条记录。
> v1.5 增补：支持「预订单」——发布时选预约送达时间（≥20 分钟），接单截止与送达截止都等于该承诺时刻；到点未送达时跑腿者可反馈「餐未送达」（信用 −10、单回大厅、钱不动），见 §3.6。
> v1.4 增补：管理员可只读全站订单（含隐私字段用于纠纷处理）；捎带项在送达前必须逐件确认「买了/没买到」；结算只在双方都确认后动钱（§3.5）。
> v1.8 增补：**管理员账号从演示流程下线**——切号列表只留 5 个业务身份，手机版看板 `/admin` 改为 307 重定向到 `/admin/console`；电脑端后台改成 1440px 桌面栅格（KPI 四列 / 账号表 + 时钟栏 / 全宽订单表 + 状态筛选与搜索），彻底脱离手机壳（§3.8）。
> v1.7 增补：预订单「餐未送达」分责（商家/骑手没送到扣发单者，跑腿者自己送晚扣跑腿者，见 §3.6）；发布页预约时间改为滚动选到分钟；新增电脑端密码后台 `/admin/console`（`ADMIN_PASSWORD`，可改钱/信用/代取消/拨时钟/重置，见 §3.8），并把切号与重置改成整页刷新。
> v1.12 增补：**演示口令改成密码框**——公网访问只需在页面输入一次口令，服务端换成 httpOnly Cookie `sl_demo`（12h，sha256 派生，不存明文），不再靠地址栏 `?token=`；旧链接仍自动兑换并从地址栏抹掉。见 §2.1-3。
> v1.9 增补：**评价（M2）上线**——订单完成后发布者可给跑腿者打 1–5 星 + ≤3 个标签 + ≤100 字留言，一单一评、不改状态也不动钱；跑腿者口碑（平均分 / 条数 / 最近评价）出现在订单详情、`GET /api/me` 与「我的」页（§3.9）。后台快照新增**对账**字段（两条不变式差异 + 人均带单数 + 平台净收入），后台新增「对账」卡直接显示账平 / 有差异（§3.8）。
> v1.35 增补：**全站换纸感皮肤**（Editorial Luxury · 暖奶油纸张，用户 m01287，可回档：`.data/backups/shunlu-src-v1.34-pre-theme-20261025-1908.tgz`）——`app/globals.css` 末尾追加的 v1.35 覆写层（纸色 tokens / Double-Bezel 纸卡 / `.sl-paper` / 悬浮 `.sl-nav` 胶囊 / fixed 噪点层 / 纸骨架加载页）+ `components/AppShell.tsx` 悬浮纸胶囊顶栏 + `app/loading.tsx` 纸骨架；**新增一条不可协商的约束：`app/layout.tsx` 引入的 antd-mobile 全局 CSS 是未分层的（`a{color:#1677ff}`），它在层叠上永远压过 `@layer` 里的 Tailwind utilities，所以任何 `<a>` 的颜色必须靠 `app/globals.css:762-791` 的 `a{color:inherit}` + 6 条类名属性选择器兜底 —— 新增链接文字色类时要同步加一条选择器，否则链接会变蓝**；本轮是纯视觉改动，§0 的账本 / 状态机 / 隐私规则一行未动。详见 `docs/HANDOFF.md` §3.24。
> 参考文档：`PLAN.md`（v2.1 执行计划）、`DEMO-SPEC.md`（需求 v1.1）、`PLAN-FUNC.md`（功能归属）。冲突时：**AGENTS.md > PLAN.md > DEMO-SPEC.md**。
> v1.2 解决的问题：v1.1 的 12 处矛盾与缺口（逐条见附录 C），并把「账本分录表」「种子清单」写进本文件——**执行模型只读本文件就能干活，不需要跨文档拼装**。

## 0. 不可协商的规则

1. **Demo-First，不追生产级**：目标是 Windows 本机跑通演示 + 录屏，评委能在手机上看。鉴权全 Mock，不做登录页。
2. **规则只在 `server/rules/` 实现一次**。`app/` 下页面组件不许算钱、判状态、拼权限；只取数 + 调接口。
3. **金额一律整数「分」**（DB `integer`，前端最后一步才 ÷100 显示两位小数）。禁止浮点运算金额。
4. **写操作一律在事务里**；接单/批次接单用「条件 UPDATE + affected rows」判断，不用先读后写。
5. **隐私在出口过滤**：房号 `drop_room`、手机尾号 `phone_tail` 只能出现在「接单后且是接单跑腿者本人」的序列化结果里。写测试证明：发布者本人查详情也拿不到 `phone_tail`，大厅列表任何字段都不含房号。
6. **账本 append-only**：余额 = `Σ wallet_logs.amount_fen`，冻结 = 未终态订单的冻结额之和。任何时刻两条不变式必须成立（P9 对账页直接展示）：
   - 每个用户：`sum(logs) == user.balance_fen`
   - 每张订单：冻结额 = 该单所有 fail-safe 可退额（见附录 A）
7. **时间只从 `server/clock.ts` 的 `now()` 拿**（= 真实时间 + 时间倍率偏移 + 手动推进）。禁止任何地方直接 `new Date()` / `Date.now()`（ESLint 兜底）。所有截止时间差用 `server/rules/durations.ts` 的模拟秒计算。
8. **过期是惰性判定**：不依赖常驻进程/cron。每次读接口先对该用户的订单跑 `expireSweep(userId)`（小规模全表 sweep 也允许）。
9. **演示与业务接口物理分离**：`/api/demo/*` 只在 `DEMO_MODE=1` 时存在，业务代码不许 import `server/demo/*`。`server/clock.ts` 与 `server/rules/durations.ts` 属于内核，不放 `server/demo/`。
10. **不做**：真实支付、地图导航、WebSocket、App 推送、聊天、AI 识图、纠纷仲裁流程、登录注册；**批次中途追加订单本期不做**（DEMO-SPEC §8 允许追加，但排期不排）。
11. **每次改完必须自测**：`npm run build` 通过 + 本 Step「验收」断言在浏览器/接口层实测通过，并把结果写进 `docs/PROGRESS.md`。不许说“应该可以了”。

## 1. 技术栈锁定

- Next.js 15 App Router + TypeScript（strict）+ Tailwind v4 + antd-mobile v5
- Drizzle ORM + PostgreSQL（**Neon 为主库**，Windows 直连，本地/线上同构；Docker Postgres 16 仅作无网备份，schema 必须一致；驱动 `postgres.js`）
- 金额全链路 `integer` 分；仅前端展示层 ÷100
- 路由 handler 一律 `export const runtime = 'nodejs'`；禁止用 `proxy.ts` / `middleware` 写业务逻辑
- 测试：Vitest 跑 `server/rules/**` 单测；脚本测试用 `scripts/verify.ts`

## 2. 部署形态（已定：本机为主，Vercel 只做兼容备份）

**微信云托管 / Docker / 任何容器平台：2026-10-20 已明确放弃，不再做适配、不写 Dockerfile。**

| 形态 | 入口 | 定位 |
|---|---|---|
| 本机开发 | `npm run dev` | 唯一开发形态 |
| Windows 本机演示 | `npm run build && npm run start` | **主力**：录屏 + 现场答辩；评委同 WiFi 时用局域网 IP 直连，不依赖公网 |
| Vercel（可选） | `git push` → Vercel | **备胎**：远程评委 / 临时公网链接。要求是「不改一行代码就能传上去」，不要求现在部署 |

`next.config.ts` 必须同时满足：`output: 'standalone'`（本机 `npm run start` 需要）、**页面层不再写 `export const dynamic = 'force-dynamic'`**——v1.29 起页面在 build 时预渲染成静态壳，数据一律客户端取（靠 `app/loading.tsx` 全局骨架屏撑住导航空白期）；只有 route handler 和 `app/admin/page.tsx`（纯 `redirect`）保留 `force-dynamic`。

### 2.1 Vercel 兼容红线（每一行代码都要能直接上 Vercel，哪怕最终没用上）

1. **无状态**：禁止在模块级变量/内存里存任何业务状态（会话、倍率、计数器、缓存）。当前倍率只存 `demo_config` 表。进程重启后行为必须完全一致。
2. **禁止写本地磁盘**：不 `fs.writeFile`、不往 `public/` 落上传文件。所有文件走 `lib/storage.ts`，驱动由 `STORAGE_DRIVER` 切换：
   - `local`（本机演示，写入 `.data/uploads/`，经 `GET /api/files/[id]` 流出，禁止直接暴露目录）
   - `vercel-blob`（线上，需 `BLOB_READ_WRITE_TOKEN`）
3. **`/api/demo/*` 必须可鉴权**：公网可达后谁都能 `POST /api/demo/reset` 清库。校验 `Authorization: Bearer ${DEMO_TOKEN}`、`?token=` 或 httpOnly Cookie `sl_demo`（v1.12：登录页/演示工具条像密码一样输入一次口令，由 `POST /api/demo/login` 换成 12 小时 cookie，前端不再把口令塞进 localStorage 与每个请求头）；`DEMO_TOKEN` 未配置且 `NODE_ENV === 'production'` 时一律 403/503，本机未配置时放行。
4. **路由一律 `export const runtime = 'nodejs'`**：不用 Edge（`postgres.js`、`fs` 与 Edge 不兼容）。
5. **环境变量集中清单**：`DATABASE_URL`、`DEMO_MODE`、`DEMO_TOKEN`、`STORAGE_DRIVER`、`BLOB_READ_WRITE_TOKEN`、`APP_URL`、`ADMIN_PASSWORD`（电脑端调试后台的口令，空 = 后台 503 关闭，v1.7）。缺失时启动即报清晰错误，不许静默降级。
6. **不依赖 cron**：过期一律惰性判定（规则 8）。Vercel Hobby 的 cron 一天一次，本来也不够用。
7. **不依赖 `middleware.ts` / 长连接 / 本地绝对路径**。
8. **上传体积**：单张图片 ≤ 4MB（Vercel 函数请求体上限 4.5MB），前端压缩后再传。
9. **Cookie 属性必须环境自适应**：切号 cookie 固定名 `sl_uid`（演示口令 `sl_demo`、后台 `sl_console` 同口径），属性 `httpOnly: true, sameSite: 'lax', path: '/'`，`secure` 由 `lib/cookie-secure.ts` 的 `shouldSecureCookie(host, x-forwarded-proto)` 判定：**回环地址不带 Secure；有 `x-forwarded-proto` 以它为准；两者都没有时，只有 Host 与 `APP_URL` 同域且 `APP_URL` 是 https 才带**。这样同一个 `APP_URL=https://…` 下，https 隧道（带 proto 头）安全，`http://IP:3000` 与局域网演示也不会被浏览器丢 cookie（§4.3 要求两种访问并存）。**`secure: true` 硬编码会让本机 http 演示直接丢会话**，写死 `false` 又会在 Vercel 的 https 下被浏览器丢弃；也不写死 `domain`。
10. **`/api/auth/switch` 公网无门，已评估接受**：它只切演示账号、不校验 token（与本机录屏时「零摩擦切号」体验强相关）。代价是公网上任何人都能冒用任意 `sl_uid`——仅限本 Demo 的纯虚构数据，可接受。若未来接真实数据，必须加与 `DEMO_TOKEN` 相同的校验。

自查（Step 9 前跑一次）：
- `grep -rn "fs\.\|process\.cwd()" app/ server/ components/ lib/` 只应命中 `lib/storage` 的 local 实现；
- `grep -rn "new Date()\|Date.now()" app/ server/` 只应命中 `server/clock.ts`。

## 3. 定稿的领域模型

### 3.1 基底与覆盖总则

**基底**：表结构以 `DEMO-SPEC.md` §6 为基底（字段名、类型、约束照抄，不重复列）。以下为**覆盖项**，覆盖项优先：

| 对象 | 覆盖后 | 说明 |
|---|---|---|
| `users.balance` | → `balance_fen integer` | 金额分 |
| `users.frozen` | **删除** | 冻结额由「未终态订单的冻结之和」推导，不双写（规则 6） |
| `users.avatar` | → `avatar_url` | 与前端字段一致 |
| `users.is_admin` | 新增 `boolean default false` | 管理员守卫（§3.4） |
| `users.max_concurrent` | 保留 `default 3` | 与常量联动：信用 < 60 强制为 1 |
| `orders.biz_type` | 枚举 `{food, buy}` | `buy` 取代 `meal`；`express`/`secondhand` 只做 UI 灰标，不建数据 |
| `orders.carry_mode` | 固定 `'runner'` | `meetup` 只留槽位 |
| `orders.reward` | → `reward_fen`（发布者付 X） | |
| `orders.runner_reward_fen` | 新增 | Y = `round(X × 75%)`，**发布时算好落库**，前端不算 |
| `orders.budget_fen` / `actual_fen` | 新增（仅 buy，否则 0） | 采购额度 / 实付 |
| `orders.requested_budget_fen` / `budget_status` | 新增（仅 buy） | `budget_status ∈ {none, requested, agreed, abandoned}`（§3.3） |
| `orders.item_amount` | **删除** | 语义与 `budget_fen` 重叠 |
| `orders.fee_rate` | **删除** | 费率是常量 25%，不进表 |
| `orders.auto_confirm_at` | 新增 | 送达时写入 = 送达时间 + 时长（单 2h / 批次 10min） |
| `orders.expect_delivery_at` | 新增（v1.5） | 仅预订单：预约送达时刻。`accept_deadline_at` 与 `deliver_deadline_at` 都等于它；null = 即时单，行为不变 |
| `orders.linked_prev_id` | 新增 | 加价重发时指向旧单（旧单保持 expired） |
| `batches.expected_reward` | → `expected_reward_fen` | |
| `batches.auto_complete` | 保留 | 「送达即完成」开关；批次页可 PATCH 切换（v1.6，见 §3.7） |
| `wallet_logs.amount` | → `amount_fen`，**带符号** | freeze 负；refund / income / bonus / fee 正 |
| `wallet_logs.type` | `{freeze, refund, income, fee, bonus}` | `bonus` = 多单合并加成 |
| `order_events` | **新增表** | `(id, order_id, type, actor_id, payload jsonb, at)`，状态时间轴统一渲染 |
| `order_addons` | **新增表（v1.3）** | 外卖单捆绑的捎带项：`(id, order_id, title, budget_fen, actual_fen, status ∈ {pending, bought, failed})`。**不单独成单**：预算并入主单 `orders.budget_fen` 一起冻结，实付合计落 `orders.actual_fen`，确认收货时与奖励一起结算（附录 A）。`buy` 单不建捎带项 |
| `notifications` | 保留 | 红点轮询 3 秒；通知中心砍成 Toast + 红点 |
| `demo_config` | 保留 | `time_scale` / 手动推进锚点 |

### 3.2 订单状态机（终态为铁律）

| 当前 | 触发 | 下一 | 守卫 / 副作用 |
|---|---|---|---|
| open | 跑腿者接单（A2） | accepted | 事务内条件 UPDATE `WHERE id=? AND status='open'`；affected=0 → 409「手慢了」；绑 runner_id、可选 batch_id；写 order_events；`deliver_deadline_at = now() + 20min`。**v1.10 前置校验**：男跑手 × 女发布者 → 403（§3.10）；批量接单另需 5 分钟余量 |
| open | 到 `accept_deadline_at`（预订单 = 预约时刻） | expired（终态） | 全额退冻结给发布者（附录 A）；通知；文案区分「预约单到点没人接」 |
| open | 发布者取消 | cancelled（终态） | 仅发布者本人；全额退 |
| accepted | `pick`（A3） | picked | 仅接单跑腿者；写 `picked_at` |
| accepted | `unpickable`（A3） | open | 仅接单跑腿者；记 `abnormal_reason=「取不到餐」`；清 runner/batch；**不扣信用**；通知发布者 |
| accepted | `abandon`（A3） | open | 仅接单跑腿者；信用 −5；清 runner/batch；重置 accept_deadline；通知 |
| accepted | 超 `deliver_deadline_at`（预订单 = 预约时刻，不因接单而顺延） | open | 信用 −10；清 runner/batch；重置 accept_deadline；通知双方。**例外**：buy 且 `budget_status=requested` → 转 cancelled + 全额退款（§3.3） |
| picked | `deliver`（带 proof_photo） | delivered | 仅接单跑腿者；必填 proof_photo；**food 单若还有 `pending` 捎带项 → 400 拒绝**（提示先逐件确认「买了多少 / 没买到」，v1.4）；`auto_confirm_at = delivered_at + (批次 10min / 单 2h)` |
| picked | 超 `deliver_deadline_at` | abnormal（终态） | 信用 −10；全额退发布者；进 P9 异常单 |
| delivered | 发布者确认 / 到 `auto_confirm_at` | completed | 发布者本人 或 系统（标「系统自动确认」）；事务结算（§3.3、附录 A） |
| completed | 评价（A4，M2） | completed | 仅发布者可评、一单一评；写 `reviews` + 事件 `review` + 通知跑腿者；**不改 status、不动钱**；完成时信用 +1 由 `confirmDelivered` / 自动确认统一加（§3.9） |
| expired / cancelled / abnormal / completed | 任何写操作 | 拒绝 | 终态不可流转；**加价重发 = 新建 linked 订单**（复制字段、`reward = 原 + 加价`、重置 accept_deadline、`linked_prev_id` 指旧单、重新冻结），旧行保持 expired |

### 3.3 代买（buy）决策表

| 条件 | 动作 |
|---|---|
| 非 buy（food） | 走 §3.2 常规路径 |
| accepted + A3b `report`（实付 ≤ 生效额度，带实物照） | → picked；写 `actual_fen`；后续同 A 类（deliver → delivered → A4 结算） |
| accepted + A3b `request`（实付 > 生效额度） | `budget_status=requested`、`requested_budget_fen=实付`；订单保持 accepted；通知发布者 |
| requested + 发布者 `agree` | 追加冻结 `requested − budget`；`budget_fen` ← requested；`budget_status=agreed` |
| requested + 发布者 `decline` | `budget_status=none`、清 requested；跑腿者可按原额度继续买，或自行 abandon |
| requested + 无人理到 `deliver_deadline_at` | `budget_status=abandoned`；订单 → cancelled（终态）；全额退款（奖励 + 当前冻结预算）；**跑腿者不扣信用** |
| picked + 发布者 M4 `confirm`（一个事务） | 退 `budget − actual` 给发布者（refund）；报 `actual` 给跑腿者（income，垫付报销不计服务费）；清 buy 侧字段；奖励侧留到 A4 |
| picked + 发布者长期不 confirm 且到 `deliver_deadline_at` | → abnormal（终态）：全额退发布者；信用 −10；进异常单 |
| delivered + 确认（A4） | completed：跑腿者 income `Y`；平台 fee `X − Y`（含加成时：income `Y` + bonus `round(Y×5%)`，fee `X − Y − bonus`） |

> 「生效额度」= `budget_fen`（未 agreed 时就是原始 `budget_fen`）。超额度必须**先 request 再买**，跑腿者不得先斩后奏。

### 3.4 守卫角色（写路由统一顺序：status 校验 → actor 校验 → 事务内条件 UPDATE）

| 角色 | 允许 | 禁止 |
|---|---|---|
| 发布者 | cancel（open 且本人）、confirm（delivered 且本人）、review、bump（expired 且本人） | 任何跑腿动作、任何他人订单 |
| 跑腿者 | accept（open、信用 ≥ 60、并发未满、**不是女生单**）、pick / deliver / unpickable / abandon（accepted 且本人）、**unarrived**（预订单到点没送到：`vendor_late` 扣发单者 / `runner_late` 扣自己，v1.7）、**refuseBuy**（代买额度不够整单拒，v1.10）、**rejectAddons**（捎带额度不够只拒小件，v1.10） | cancel、确认收货 |
| 管理员 | **唯一入口是电脑端密码后台 `/admin/console`**（`ADMIN_PASSWORD`，不需要切号；手机版看板已下线，`/admin` 307 跳转，v1.8）。`is_admin` 保留作数据标记与 `/api/admin/*` 只读守卫：看板 + **全站订单档案（含房号 / 尾号 / 实付等隐私字段，用于纠纷处理，v1.4）**；另有**电脑端调试后台** `/admin/console`（统一口令 `ADMIN_PASSWORD`，v1.7，只给演示调试用） | 改业务状态（后台调试动作除外，见 §3.8） |
| 平台账号 | 只收 `fee`；固定 id、不进大厅、不可被切号 | 发单 / 接单 / 评价 |
| 未切号 | — | 所有业务接口 401 |

### 3.5 捎带项（`order_addons`）规则（v1.3 新增，v1.4 收紧）

| 阶段 | 规则 |
|---|---|
| 发布（food） | 可附 0–5 件捎带：`title` ≤ 20 字、单件预算 100–20000 分、合计 ≤ 30000 分；预算并入主单 `orders.budget_fen`，**一次 freeze**（`reward + Σ预算`），不产生第二张订单 |
| 取货后上报（A3c） | `POST /api/orders/[id]/addons`，仅接单跑腿者、状态 ∈ {accepted, picked}；必须**一次覆盖全部** pending 捎带项：每件填实付 > 0 或标「没买到」；实付合计落 `orders.actual_fen` |
| 送达（v1.4 收紧） | food 单还有 `pending` 捎带项 → **400 拒绝送达**，文案点名哪件没确认；不允许「直接点送达把预算全退回去」 |
| 发布者确认结算 | `reimburseFen = min(冻结预算, 实付合计)` 报销给跑腿者（income，不计服务费）；`refund = 冻结预算 − 报销` 退发布者；实付超预算时**确认即视为认可**，差额先补冻结再付（余额不足整笔失败） |
| 系统自动确认 | 跑腿者一直没上报也有兜底：自动确认前把仍 `pending` 的捎带项按 `failed` 落库并通知跑腿者，预算全额退回发布者 |
| 换人重接 | 回 open 时 `resetAddons`：所有捎带项回 `pending`、清 `orders.actual_fen` |
| 独立 buy 单 | 不建捎带项，仍走 §3.3 的 M4 找零（两条路径互不干扰） |

### 3.6 预订单（`expect_delivery_at`，v1.5 新增）

| 阶段 | 规则 |
|---|---|
| 发布 | 可选 `expectDeliveryMinutes`（= 距现在多少分钟后送达），必须 **≥ 20 分钟**、最多 24 小时；不填 = 即时单（行为完全不变）。前端提示「饭点/雨天多留 15–30 分钟余量」 |
| 接单截止 | 预订单 `accept_deadline_at = expect_delivery_at`：到点没人接 → `expired` + 全额退（文案「预约单到点还没人接单」） |
| 送达截止 | 接单时 `deliver_deadline_at = expect_delivery_at`（**不顺延**，不是「接单后 20 分钟」）；picked 超时仍走 `abnormal` + 全额退 + 信用 −10 |
| 跑腿者反馈「餐未送达」（v1.7 分责） | A3 `action=unarrived`：仅预订单、仅接单跑腿者本人，**不要求在截止之后**（到点前后觉得赶不上都可以报）；可选 `note`（≤40 字）给对方说明。责任二选一：<br>① `reason=vendor_late`（**商家/骑手没送到**）→ `abnormal_reason="外卖没送到（商家/骑手延迟）"`、扣**发布者**信用 −5（发单没留够余量）、跑腿者不扣分，事件 `vendor_late`；<br>② `reason=runner_late`（**跑腿者自己送晚**，默认）→ `abnormal_reason="餐未送达（跑腿者送晚了）"`、扣**跑腿者** −10，事件 `unarrived`。<br>两者都：回 `open`、清 runner/batch、重置接单截止、通知双方（含留言）。钱不动（仍冻结，等发布者取消或再等人接） |
| 加价重发 | `bump` 时若承诺时刻还没过就沿用；已过则降级为即时单（不带 `expect_delivery_at`） |
| 展示 | 列表/详情显示「预约 HH:MM」；详情另注「到点没人接自动取消退款 / 承诺时间，超时扣跑腿信用」 |

### 3.7 批次（P4，v1.6 新增）

一次勾选 **2–3 单同楼栋**一起带走：一次取餐、一趟送上楼。接单仍走 §3.2 的 `open → accepted`，批次只是给这几单打上同一个 `batch_id`。

| 阶段 | 规则 |
|---|---|
| 勾选 | 大厅「批量带走」进入选择模式：**≥2 单**、**必须同一栋楼**、不得超过剩余并发位（`runnerMaxActive(credit) − 手上履约中`）、重复 id 拒绝。前端按 `GET /api/hall` 返回的 `slots` 限制，服务端再校验一次 |
| 接单原子性 | `acceptBatch` 一个事务里逐单条件 UPDATE `WHERE status='open'`：任一单被抢先 → 抛 `Errors.conflict("有单被抢先了")`，**整批回滚，一单都不接住**，也不留下空批次 |
| 批次页 | `GET /api/batches/[id]`（跑腿者本人 / 批次内发布者 / 管理员）：`totals{orderCount, activeCount, settledCount, failedCount, expectedRewardFen, potentialBonusFen, expectedTotalFen, earnedFen, earnedBonusFen}` + 逐单进度 + `bonusEligible`。`earnedFen` 只算 `income`（**排除垫付报销**）+ `bonus`，退款与报销不算「这趟赚的」 |
| 送达即完成 | `PATCH /api/batches/[id] {autoComplete}`：仅接单跑腿者、仅 `active` 批次。开 → 送达后 10 分钟自动确认；关 → 单 2 小时 |
| 加成 | 同批 ≥3 单且同楼栋，每单 `bonus = round(Y × 5%)`，平台 `fee = X − Y − bonus`（`settleCompletion` 内按批判定，逐单入账） |
| 单间独立 | 批次里每单独立判定：某单超时/异常**不影响**其他单继续跑；全部终态后 `maybeCloseBatch` 置 `closed` |

### 3.8 电脑端调试后台（v1.7 新增，`/admin/console`）

给「一台电脑 + 两台手机」的演示场景用：**不切号**就能改数据。与业务接口物理分离（`/api/console/*`），不改 `server/rules/orders.ts` 的状态机。

| 项 | 规则 |
|---|---|
| 入口 | `GET /admin/console`（**桌面栅格**：顶栏 + KPI 四列 + 账号表/时钟栏两栏 + 全宽订单表，页面被 `AppShell` 排除在 480px 手机壳之外，v1.8）。旧地址 `GET /admin` → 307 重定向到这里；切号列表 `/api/demo/accounts` 不含管理员账号（只有 5 个业务身份） |
| 口令 | 统一口令 `ADMIN_PASSWORD`。**未配置 → 后台 503 关闭**，不设默认密码暗门；`DEMO_MODE ≠ 1` → 404。登录成功种 httpOnly+SameSite=Lax 的 `sl_console`（sha256 派生值，12h），`secure` 跟随请求是否 https |
| 守卫 | `/api/console/*` 一律 `requireConsole(req)`：非 DEMO_MODE → 404、无口令 → 503、cookie 不匹配 → 401 `CONSOLE_LOCKED`；**不依赖 `sl_uid`**，无需管理员登录态 |
| 可做 | 看 7 个账号余额/冻结/信用分；`money` 加钱扣钱（写 `wallet_logs type=bonus` 的调试分录，禁止扣成负数）；`credit` 调信用（clamp 0–120）；`cancelOrder` 代取消未终态订单（全额退 + 事件 `admin_cancel` + 通知双方）；`clock` 改倍率（1/8/30/60）或推进模拟时间（≤24h）；`reset` 重置回种子 |
| 不可做 | 伪造状态流转、代替发布者确认收货、改已终态订单、改账本历史（只 append） |
| 审计 | 动作都留 `wallet_logs.memo` / `order_events`，能在 P6 流水与时间里对上 |
| 「重置按钮没用」修复 | 工具条与后台 reset 之后统一 `window.location.reload()`（客户端页面不会因 `router.refresh()` 重新取数） |

### 3.9 评价（M2）规则（v1.9）

表 `reviews` 早已存在，v1.9 补齐读写与口碑聚合。**评价是完成后的独立动作**：不参与状态机、不动账本、不改信用。

| 项 | 规则 |
|---|---|
| 谁能评 | 只有**该单发布者**（`order.publisher_id === 评价人`）；跑腿者不能给自己评价，也不做跑腿者→发布者反向评价（本期简报） |
| 何时能评 | 订单 `status === 'completed'`（含系统自动确认）；未完成 → 409「订单完成后才能评价」；已有评价 → 409「这一单已经评价过了」（一单一评，不可修改/删除） |
| 字段限制 | `rating` 整数 1–5（否则 400「评分只能是 1–5 星」）；`tags` 白名单 `准时送到/态度友好/沟通顺畅/包装完好/下次还找TA`，去重后最多 3 个；`comment` trim 后最多 100 字 |
| 副作用 | 写 `reviews` 一行；`order_events.type='review'`；给跑腿者发通知「X 给了你 ★★★★★ 评价：…」；**不写 wallet_logs、不改 orders.status** |
| 口碑聚合 | `reviewSummaryOf(userId)` = `{count, avgRating, recent[]}`；`recent` 取最近 5 条并带评价人昵称；出口：详情 `order.runnerRating`、`GET /api/me` 的 `rating`、`/me` 页「跑腿口碑」卡 |
| 页面 | `GET /review/[id]`：星级按钮 + 标签 chip + 留言；非发布者 / 未完成 / 已评价时只展示原因，不给表单 |

### 3.10 v1.10 匹配与拒单规则（性别 / 时间余量 / 同栋 / 额度不足）

用户 m03824 + m03850 的七模块改造。**逐条只影响对应路径，不动无关逻辑**。

| 模块 | 规则 |
|---|---|
| 性别硬规则 | 全局硬规则：**女用户（发布者 \`dorm_gender='female'\`）发的单，男跑手一律不能接**。单接与批量接都在 `acceptOrder` / `acceptBatch` 里先过 `assertGenderAllowed`：命中 → 403「这单是女生发布的，按园区规定男生不能接」，订单不动。大厅/详情按 `publisherGender` 返回 `blockedByGender`，前端把入口置灰并显示「女生单 · 男生不可接」（服务端才是最终防线） |
| 批次时间余量 | 同一次接取的多单：「最后一个取货点取完的时间」与「同批最早一单的送达截止」之差必须 **≥ 5 分钟**（`BATCH_MIN_GAP_MINUTES`）。取货耗时估算：不同取货点每多一个 +3 分钟（`BATCH_PICKUP_STEP_MINUTES`，同取餐点一次取完不计）。不满足 → 409「同批最早一单「CODE」只剩 N 分钟就要送达，取完 M 个取货点后不足 5 分钟，请少带一单或分开接」，整批回滚。前端 `timeConflictOf` 同口径预校验，冲突时确认条按钮变「时间不够，先少选一单」 |
| 代买额度不足 | 发布页 buy 显式提示「请预留充分的采购金额」。跑腿者接单后觉得额度不够：`action=refuseBuy`（§3.3 新增行）→ 整单 `cancelled` + 托管**全额退回**发布者 + `cancel_reason="代买额度不足：…"` + 事件 `buy_refused` + 通知发布者；**跑腿者不扣信用**。已上报实付（picked）时拒绝 → 409 |
| 捎带额度不足 | 只拒小件：`action=rejectAddons` → 该单仍 `pending` 的捎带项全部置 `failed`、按 Σ预算 `refund` 退发布者、主单 `budget_fen` 同步减掉、事件 `addons_rejected` + 通知「外卖还照常送」；**外卖主单继续 accepted→picked→delivered**。没有 pending 项 → 409 |
| 大厅排序 | `GET /api/hall` 按 `accept_deadline_at ASC NULLS LAST, created_at DESC`（**即将截止的排前面**）；前端选中一单后按「同层 1 → 同栋 2 → 其他 3」重排，并按「楼栋 · 楼层」分组展开，同一楼层的多单**全部显示**、可逐单勾选（1 单走单接，≥2 单走批次） |
| 同栋优先 | `users.dorm_building` 是接单匹配依据：`/me` 页可编辑保存（`PATCH /api/me`）；大厅默认「只看同栋 · {我的楼栋}」（可一键关掉），卡片给「同栋」「同层」醒目标记；接非同栋的单（单接或批量）都要 **二次确认**「这单不在你住的那栋」。不是硬限制，只是默认筛选 + 提醒 |
| 展示口径 | 普通外卖单**不出现「代买」字样**：`bizType === 'buy'` 才显示代买 tag / 物品说明；外卖单的捎带实付标签叫「采购实付（元）」 |
| 测试住户 | 种子里新增 F（id=10 阿哲 · 男 · 男寝5号楼）与 G（id=11 小雨 · 女 · 女寝3号楼），待接单 #18（G 发、女寝 6 层 608）、#19（F 发、男寝 5 号楼 305）、#20（G 发、女寝 6 层 621），用来演示跨楼栋、同层多单与性别拦截；B 改为女（female）以便演示「女生跑手可接」 |

> 不变量未变：性别与时间校验都在**接单事务内**、条件 UPDATE 之前，失败不留半截状态。

## 4. 常量（`server/rules/constants.ts`，改值只改这里）

- 服务费差价 **25%**：发布付 X，跑腿收 Y = `round(X × 75%)`，平台 fee = `X − Y`（A/B 通用；采购额度不收服务费）
- 多单加成：批次 ≥ 3 单且同楼栋时，每单 bonus = `round(Y × 5%)`（平台让利；fee = `X − Y − bonus`）
- 赏金 200–2000 分；接单截止 5 / 10 / 15 / 30 分钟；送达截止 = 接单后 20 分钟
- 自动确认：单 2 小时；批次开启「送达即完成」后 10 分钟
- 发布者同时 open ≤ 2（accepted 后不占额度）；跑腿者同时履约中（accepted + picked + delivered）≤ 3；信用 < 60 禁接单且上限强制为 1
- 预约送达：提前 20 分钟 – 24 小时（`EXPECT_DELIVERY_MIN_MINUTES = 20`，v1.5）
- 批次时间余量（v1.10）：`BATCH_MIN_GAP_MINUTES = 5`、`BATCH_PICKUP_STEP_MINUTES = 3`（不同取货点每多一个 +3 分钟）
- 演示倍率 1 / 8 / 30 / 60；`SIM_MS = REAL_MS × scale`；倍率只影响未来流逝，**已落库 deadline 不重算**；手动推进直接拨快 now

## 5. 接口清单（薄路由 → server/rules）

| ID | 路由 | 职责 |
|---|---|---|
| A1 | `POST /api/orders` | 校验 → 冻结 → 上架（失败整体回滚） |
| A2 | `POST /api/orders/accept` | 单接 / 批量接，条件更新，失败回滚并返回「手慢了」 |
| A3 | `POST /api/orders/[id]/actions` | `pick / deliver / unpickable / abandon / cancel / bump / unarrived`（v1.5）/ `refuseBuy`（v1.10 代买拒单）/ `rejectAddons`（v1.10 拒捎带）状态守卫 |
| A3b | `POST /api/orders/[id]/buy` | `request`（超额度告知）/ `agree` / `decline` / `report`（填实付+照片）/ `confirm`（找零结算） |
| A3c | `POST /api/orders/[id]/addons` | 捎带项实付上报（仅接单跑腿者，accepted\|picked，一次覆盖全部 pending）：`items: [{id, actualFen?, failed?}]`；落 `order_addons.actual_fen` + `orders.actual_fen` |
| A4 | `POST /api/orders/[id]/confirm`、`POST /api/orders/[id]/review` | 确认收货结算 / 评价（v1.9：仅发布者、一单一评、不改状态不动钱，见 §3.9） |
| A5 | `GET /api/hall`、`/api/orders`、`/api/orders/[id]`、`/api/wallet`、`/api/notifications`、`GET /api/batches/[id]`、`PATCH /api/batches/[id]` | 全部经出口序列化器，先 expireSweep；notifications 前端轮询 3s；批次 `PATCH` 只切「送达即完成」（v1.6）；大厅按接单截止升序并带 `publisherGender/blockedByGender/myBuilding/myGender`（v1.10） |
| A6 | `GET /api/me`、`PATCH /api/me` | 资料 / 常用楼栋；GET 额外返回跑腿口碑 `rating {count, avgRating, recent[]}`（v1.9） |
| B1 | `GET /api/admin/overview` | 看板聚合 + 对账不变式检查 + 平台净收入（仅 `is_admin`；v1.8 起手机版页面入口下线，接口保留给测试/未来远程用途） |
| B3 | `GET /api/admin/orders`、`GET /api/admin/orders/[id]` | 管理员全站订单档案（含房号/尾号/实付/捎带明细；纠纷处理用，v1.4）；`?status=&q=&limit=` |
| B4 | `POST /api/console/login`、`GET /api/console/snapshot`、`POST /api/console/actions` | 电脑端调试后台（v1.7）：口令登录/退出、全局快照、`money/credit/cancelOrder/clock/reset` 五个动作；守卫见 §3.8；快照含 `reconcile`（两条不变式差异 + 人均带单数 + 平台净收入，v1.9） |
| B2 | `POST /api/demo/reset`、`POST /api/demo/clock`、`POST /api/demo/scale`、`POST /api/auth/switch` | 演示支撑，仅 `DEMO_MODE`（switch 的公网风险见 §2.1-10） |

## 6. 分步执行顺序（只看当前 Step 的「验收」）

> 演示脚本编号以 `PLAN.md` §7 的 **A–F** 为准；`DEMO-SPEC.md` §9 的编号废弃（其中「脚本 E 槽位演示」降级为大厅 Tab 灰标镜头，不单独成脚本）。

### Step 0 · 地基（S0，约 0.5 天）
建骨架、**Neon 建库**（Docker Postgres 16 只作离线备份，两者 schema 一致）、Drizzle schema + 迁移、种子脚本（附录 B）、cookie 切号（M1）、`lib/storage.ts` 双驱动骨架、`/api/demo/*` 骨架（含 `DEMO_TOKEN` 校验）、演示工具条（切号 / 倍率 / 重置）。
**验收**：两个浏览器窗口切不同账号互不影响；`/api/demo/reset` 后数据回到种子；页面无 Tailwind 与 antd-mobile 样式冲突；`npm run build && npm run start` 能起来；启动时打印本机局域网访问地址（如 `http://192.168.1.7:3000`）方便手机测；管理员 / 平台账号种子就位，`is_admin` 守卫生效（非管理员调 B1 得 403）。

### Step 1 · 规则内核单测（先于任何 UI）
只写 `server/rules/`（stateMachine、ledger、orders、accept、batch、buy、privacy、serializers）+ Vitest。
**验收**：`npm test` 全绿，覆盖：并发接单只有一人成功、批次部分被抢全回滚、过期退款、delivered 超时自动确认、代买找零（额度 1000 实付 450 → 退 550、跑腿收 450+Y）、隐私序列化；**加验**：超额度不回应 → abandoned + cancelled + 全额退款、M4 确认分录、批次加成 bonus 入账。

### Step 2 · P2a 发布 → P1 大厅 → P3 跑腿端 → P3 发布者确认（S1 闭环）
**验收（里程碑）**：两账号、无登录页、全程不碰数据库走通：A 发 5 元单 → B 筛楼栋接单（B 端才出现房号 412 与尾号）→ B 已取到 → B 拍照送达 → A 看到红点确认 → A 余额 −5、B 余额 +3.75、P6 三条流水对得上。

### Step 3 · 脚本 C / D（过期、加价重发、超时释放、信用分）
**验收**：倍率 60× 下 20 秒内见到 expired；加价重发新单出现（旧单仍 expired、新单 `linked_prev_id` 指向旧单）；接了不送超时后单回大厅、B 信用 −10、另一账号能接走。

### Step 4 · 批次 P4（S2）
勾选 2–3 单 → 批次确认页合计 → 逐单履约 → 批次结算页「本趟赚 X」；批次内某单超时不影响其他单。
**验收**：两窗口同时抢同一批 3 单，只有一个窗口全成功，另一个看到「有单被抢先了」且一单都没接住；批次含加成时「本趟赚」= Σ(Y + bonus)，且 P6 流水能对上。

### Step 5 · 代买 P2b + M4（S2.5）
发布（采购额度 + 奖励金一起冻）→ 跑腿填实付 + 拍照 → 发布者确认 → 一个事务完成：退差额给发布者、`actual + Y` 结算给跑腿者；实付超额度走「告知 → 同意」。
**验收**：脚本 E 全流程；P6 看到 冻结 13.00 → 确认后退款 5.50 → 跑腿者收入 4.50（报销）+ 2.25（奖励）→ 平台 fee 0.75（合计 1300 分，守恒）。

### Step 6 · 混合批次 F（脚本 F）
**验收**：1 个 A 类 + 2 个 B 类混带，P4 混排展示，逐单走 A3 / A3b 两条结算路径互不干扰。

### Step 7 · 补完 P5 / P6 / P7 + M2 评价（S3，M3 砍成 Toast + 红点）
### Step 8 · P9 管理端 + B1 对账（S4）
**验收**：看板出「人均带单数」；对账页两条不变式均为 0 差异；平台净收入可见。
### Step 9 · 录屏彩排 + 构建验证（S5）
**验收**：`npm run build && npm run start` 下六脚本（A–F）全部可演；重置后 10 秒内可开拍；§2.1 九条兼容自查全过；若时间允许，真部署一次 Vercel（可选，不做不减分）。

## 7. 砍功能顺序（只在 Step 2–6 延期时启用，由用户决定）

M3 → P9 降截图 → P6 只显余额 → P5 只留我发布的 → B 类降一口价（砍 M4）。
**永不砍**：P1、P3、接单原子性、结算、P2a。

## 8. 提交与汇报

- 每 Step 一个 commit：`feat(S2): batch accept all-or-nothing`
- 汇报格式固定三行：做了什么 / 怎么验证的（命令或点击路径）/ 已知缺口
- 每 Step 结束在 `docs/PROGRESS.md` 追加一条，含上述三行

## 附录 A · 账本分录表（金额单位：分，带符号）

| 场景 | 分录 |
|---|---|
| A 类发布（X=500） | 发布者 `freeze −500` |
| A 类完成结算 | 跑腿者 `income +375`（Y）；平台 `fee +125` |
| A 类过期 | 发布者 `refund +500` |
| A 类 accepted 超时回 open | 无分录（只动状态与信用） |
| A 类 picked 超时 abnormal | 发布者 `refund +500` |
| A 类 发布者取消 | 发布者 `refund +500` |
| 批次加成（每单） | 跑腿者 `bonus +round(Y×5%)`；平台 `fee = X − Y − bonus` |
| B 类发布（预算 1000 + 奖励 300） | 发布者 `freeze −1300` |
| B 类超额度同意 | 发布者 `freeze −(requested − budget)` |
| B 类 M4 确认（实付 450） | 发布者 `refund +550`；跑腿者 `income +450`（报销，不计服务费） |
| B 类 A4 结算 | 跑腿者 `income +225`（Y）；平台 `fee +75` |
| B 类超时取消 | 发布者 `refund +全部当前冻结额` |
| B 类 picked 超时 abnormal | 发布者 `refund +全部当前冻结额` |

**守恒自查**：任一订单路径上，`Σ(发布者 freeze) = Σ(refund) + Σ(跑腿者 income + bonus) + Σ(平台 fee)`。

## 附录 B · 种子清单（`npm run seed` / `/api/demo/reset` 后必须一致）

| 账号 | 用途 |
|---|---|
| A（发布者，女寝 3 号楼 4 层） | 脚本 A 发布者 |
| B（跑腿者） | 脚本 A 接单者 |
| C（跑腿者 2） | 抢单失败对照组 / 脚本 D 的另一账号 |
| D（发布者 2） | 脚本 B 的另外两条单 |
| E（发布者 3） | 脚本 E 代买发布者 |
| 管理员（`is_admin=true`） | P9 看板 |
| 平台账号（固定 id） | 收所有 `fee` |
| F（id=10 阿哲 · 男 · 男寝 5 号楼） | v1.10：跨楼栋 + 男生跑手视角（同栋优先 / 性别拦截演示） |
| G（id=11 小雨 · 女 · 女寝 3 号楼 6 层） | v1.10：同层多单 + 女生发布者 |

- food 已完成 × 8（含评价与流水，供 P5 / P6 / P9 有数据）
- buy 已完成 × 3（含 M4 找零流水）
- 3 条同取餐点（东门外卖柜）同楼栋（女寝 3 号楼 4 层）待接单 → 脚本 B 用
- 1 条 buy 待接（额度 1000 + 奖励 300）
- 1 条已被接单未送达（runner=**C**；v1.41 从 B 改成 C）→ 脚本 D 用。**B 必须空手**：B 一旦手上有一单，`/api/hall/nearby` 的 `slots = runnerMaxActive(3) − active(1) = 2`，推荐卡就只能勾 1 单、凑不到 3 单 +5% 加成（v1.41 修的正是这个观感问题）
- v1.10 追加：#18（G 发、女寝 6 层 608）、#19（F 发、男寝 5 号楼 305）、#20（G 发、女寝 6 层 621）——同层多单、跨楼栋、性别拦截都有现成数据
- `demo_config.time_scale = 1`

## 附录 C · 变更记录（v1.1 → v1.2）

1. 并发上限拆分：发布者同时 open ≤ 2；跑腿者同时履约中 ≤ 3（v1.1 的「3」与「2」自相矛盾）。
2. Step 5 验收数字修正：v1.1 写「跑腿收入 5.50」违反 25% 费率 → 改为 4.50（报销）+ 2.25（Y），并补齐平台 fee 0.75（守恒 1300 分）。
3. 完整状态表收编入 §3.2；覆盖 DEMO-SPEC §7.1 的 `expired → 加价重发 → open` 原地复活行：终态不可流转，加价重发 = 新建 linked 订单。
4. A3 动作补 `unpickable`（取不到餐 → open，记 abnormal_reason，不扣信用）。
5. `notifications` 表收编入 §3.1（红点轮询 3 秒；M3 砍成 Toast + 红点）。
6. Schema 基底与覆盖总则（§3.1）：金额全改 integer 分；删 `frozen` / `fee_rate` / `item_amount`；`biz_type ∈ {food, buy}`；orders 增 `runner_reward_fen` / `budget_fen` / `actual_fen` / `requested_budget_fen` / `budget_status` / `auto_confirm_at` / `linked_prev_id`；`avatar → avatar_url`；users 增 `is_admin`。
7. 演示脚本编号统一以 PLAN.md §7 的 A–F 为准（DEMO-SPEC §9 编号废弃）。
8. 管理员：`users.is_admin`；`/api/admin/*` 仅 admin 可调（否则 403）；种子含 1 管理员。
9. 自检 grep 补 `lib/`；`server/clock.ts`、`server/rules/durations.ts` 路径定死，clock 不属于 `server/demo/`。
10. 信用分整套沿用 DEMO-SPEC §7.7：初始 100、完成 +1（上限 120）、abandon −5、超时 −10、< 60 禁接单且强制单带。
11. 批次追加（DEMO-SPEC §8）→ 本期不做，写入 §0 不做清单。
12. 种子清单（附录 B）落定：7 账号 + 已完成订单 + 待接单 + 演示配置。
13. v1.3：外卖单可捆绑捎带项 `order_addons`（不单独成单，预算并入主单冻结，确认收货时结算）；新增 A3b 之外的上报接口 A3c。
14. v1.4：捎带项未逐件确认时禁止送达（400）；系统自动确认时把仍 pending 的捎带项按 failed 落库并全额退预算；管理员新增 `GET /api/admin/orders` 与 `/api/admin/orders/[id]`，可读含隐私字段的全站订单档案（只读）。
15. v1.5：预订单 `orders.expect_delivery_at`（提前 ≥20 分钟），接单截止与送达截止都等于承诺时刻；A3 新增 `unarrived`（跑腿者到点没送到主动反馈，信用 −10、单回大厅、钱不动）。
16. v1.6：批次（P4）落地——大厅勾选 2–3 单同楼栋一次接走（`acceptBatch` 全成功或全回滚）、批次页合计与逐单进度、`PATCH /api/batches/[id]` 切换「送达即完成」、`earnedFen` 排除垫付报销。
17. v1.7：预订单责任分责——`unarrived` 分 `vendor_late`（商家/骑手没送到，扣**发单者** −5、跑腿者不扣）与 `runner_late`（跑腿者自己送晚，扣跑腿者 −10），可附 ≤40 字留言并通知对方；发布页预约时间改为滚动选择器（0–24 小时 + 0–59 分钟，仍受 ≥20 分钟约束）；新增电脑端密码后台 `/admin/console` + `/api/console/*`（`ADMIN_PASSWORD` 守卫，可改钱/信用/代取消/拨时钟/重置，见 §3.8）；切号与重置后强制整页刷新，修掉「重置按钮没用」。
18. v1.8：管理员账号从演示流程下线（切号列表 5 个身份、`/admin` 307 → `/admin/console`）；电脑端后台改桌面栅格并脱离手机壳；`/admin/console` 增加订单状态筛选与「单号/楼栋/房号/昵称」搜索。
19. v1.9：评价（M2）落地——`server/rules/reviews.ts`（`createReview` / `reviewSummaryOf`、标签白名单 5 个、留言 ≤100 字）、`POST /api/orders/[id]/review`、`GET /review/[id]` 评价页、详情「这一单的评价」卡 + `order.runnerRating`、「我的」页「跑腿口碑」卡、`GET /api/me` 增 `rating`；一单一评、不改状态不动钱，完成 +1 信用仍由确认收货 / 系统自动确认统一加（避免重复加分）。后台快照新增 `reconcile`（两条不变式差异合计 + 已对账账号/未终态单数 + 人均带单数 + 平台净收入），`/admin/console` 新增「对账」卡显示账平 / 有差异。
20. v1.10：七模块体验改造——① 性别硬规则（女用户发的单男跑手一律不能接，单接/批量都拦）；② 批次 5 分钟余量校验（最后取货点 vs 最早送达截止，取货点 +3 分钟/个）；③ 代买额度不足时跑腿者可 `refuseBuy` 整单拒、`rejectAddons` 只拒捎带，均全额退回且不扣信用；④ 普通外卖单不再出现「代买」字样；⑤ 大厅按接单截止升序 + 选中后同层→同栋重排 + 同层多单全部展开可勾选；⑥ 楼栋资料可编辑、默认只看同栋、同栋/同层醒目标记、跨栋二次确认；⑦ 种子新增 F/G 两名住户与 #18/#19/#20 三单，B 改女。
21. v1.35：全站换纸感皮肤（暖奶油纸张 tokens + Double-Bezel 纸卡 + 悬浮纸胶囊顶栏/底栏 + fixed 噪点层 + 纸骨架加载页），顺带修四处 v1.31 遗留的选中态塌陷（赏金药丸/送达时间分段/保存按钮/「只看同栋」配色）、补回被 antd-mobile 未分层 `a{color:#1677ff}` 覆盖的链接色（`app/globals.css:762-791`，含「新增链接色类必须同步加选择器」的约束）、修大厅 chip 双亮；只动视觉层 + `app/page.tsx` / `app/publish/page.tsx` / `app/me/page.tsx` 三处样式，schema / 规则 / 接口未动；回档包 `.data/backups/shunlu-src-v1.34-pre-theme-20261025-1908.tgz`（见 `docs/HANDOFF.md` §3.24）。
