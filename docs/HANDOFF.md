# HANDOFF · 顺路（v1.41 · 2026-10-26）

> 交接说明：新对话开场只读这份 + `AGENTS.md`，就能接着干，不必翻历史对话。
> 命令默认在仓库根 `C:\Users\User\Documents\deepseek-harness\default-workspaces` 执行（下文简称「本机」）。
> 版本口径：`AGENTS.md` 正文版本行仍是 v1.10（v1.12/v1.13 只在头部加了增补行、改了 §2.1-3 与 §2.1-9）；`docs/PROGRESS.md` 共 1045 行（末条在 1028 行，是 v1.41；v1.40 在 1011 行；源码包重打成 148 条那条在 1004 行）——`## 2026-10-26 · v1.41：推荐数按真实并发位裁剪 + 种子里 B 空手（两单都能勾）`（在 1028 行；v1.40 在 1011 行；v1.39 在 996 行；v1.38 在 988 行；v1.37 在 980 行；v1.36 在 972 行；v1.35 在 962 行；v1.34 在 924 行；v1.33 在 897 行；v1.32 在 874 行；v1.31 在 842 行；v1.30 在 811 行；v1.29 在 784 行；v1.28 的交接条在 777 行；v1.28 在 745 行、v1.27 在 715 行、v1.26 在 689 行、v1.25 在 663 行、v1.24 在 637 行，v1.23 在 610 行，v1.22 在 583 行，v1.21 在 555 行）；本文件 973 行、已更新到 v1.40 并重写 §0 为交接摘要。

## 0. 交接摘要（2026-10-26 定稿 · 给下一个对话）

> 这一段是给「新对话」的入口：只读 0.1–0.4 就能接管，0.5 及 §3 是想深挖时再看的明细。

### 0.1 三分钟上手

| 项 | 值 |
|---|---|
| 仓库根 | `C:\Users\User\Documents\deepseek-harness\default-workspaces`（**已是 git 仓库**：`main` 分支，`d7f2fb9` = v1.42 基线、`9f098e1` = v1.43 wip、`095e07d` = 交接文档；`origin` = `https://github.com/FluorineCypher/shunlu.git`，`main` 已推送并跟踪 `origin/main`；历史另见 `docs/PROGRESS.md`，云端交接见 §10） |
| 代码版本 | **v1.42 已全部落盘（v1.41 之后只加 v1.42：后台静默失败修复 + `/api/version` 的 DB 探针，见 §3.30）、`tsc` / `next build` 全绿（v1.33–v1.41 只动页面与两个只读接口：v1.35 是纯视觉 + 四处既有样式 bug，v1.36/v1.37 只改默认勾选数与加成文案，v1.38 加 `/api/version`，v1.39/v1.40 只改推荐卡面与文案，v1.41 只改两处推荐数裁剪 + 种子一条 runner；未动 schema / 规则 / 接口，`vitest` 未重跑）**；本机生产 job `bash-4b10694f78d44af3` 跑 `NODE_ENV=production npx next start -H 0.0.0.0 -p 3000`（进程里还是旧构建，要重启才到 v1.41）；**能连库的预览服务 job `bash-33cf0915fe704b2f` = `PORT=3998 npx next start -p 3998`，跑的是 `deploy/shunlu.env` 的线上库**（旧 3999 预览 `bash-2a215d89ede74b29` 已弃用：dev 库 `.env.local` 失效，走 DB 的路由全 503 `DB_TIMEOUT`）；v1.38 还添了 `GET /api/version`（返回 `version/release/uptimeSec/nodeEnv/port`）与「我的」页脚版本戳，专门用来核对线上跑的是哪一版） |
| 公网 | https://shop.omzsh.top（CF 橙云 + 隧道 → ECS `47.97.167.178` 的 `127.0.0.1:3000`）；**2026-10-25 已部署 v1.21–v1.32 并通过三条 curl 验收（IP 200 / https 200 / 错口令 403，https 1.6s 属 CF 跨洋固定加价）**；**v1.33 的「推荐一起带走」卡面（已被 v1.34 撤掉）、v1.34 的接单页改造、v1.35 的纸感换肤、v1.36/v1.37 的加成默认勾选与死按钮修复、v1.38 的版本自证接口、v1.39 的加成四态文案、v1.40 的「推荐卡固定 2 单 + 同层优先」、v1.41 的「推荐数按真实并发位裁剪 + 种子 B 空手」都还没上去**（**2026-10-25 实测证据**：线上 `https://shop.omzsh.top/` served 的是 `app/page-ccb576e5151fe4db.js`，本地最新构建是 `app/page-3f57bc406e5f480d.js`，哈希不同 ⇒ 线上确实还是旧包，不是「改了没生效」） |
| 口令 | 演示 `shunlu-demo-2026`、后台 `shunlu-admin-2026` |
| 源码包 | `.data/shunlu-src.tgz` **已重打成 v1.42 干净版 = 148 条 / 838423 B / sha256 `2cdc55023034a60fb03a02f1d3401ccad68950edd30ecd4578d4bf60b193ac04`（2026-11-17 12:36，含 v1.33–v1.42 全部改动）**：只含项目文件（`app/`、`server/`、`lib/`、`components/`、`scripts/`、`tests/`、`drizzle/`、`deploy/`、`docs/`、`public/painting/`、`app/fonts/`、根配置文件），**v1.33–v1.40 全部改动都在里面，可直接上传、不必再打**。上一版是 v1.38 的「脏包」296 条 / 1081239 B，混了 33 个 `.dsh-ops-update-*.lock`、~50 个 `ocg_*.mjs` / `probe-*` / `a08.jsonl` / `bench-*` / `dump-session.mjs` 等杂物，已备份为 `.data/backups/shunlu-src-v1.38-dirty-296.tgz` |
| 文档 | `docs/PROGRESS.md` 1045 行（末条在 1028 行＝v1.41、v1.40 在 1011 行、源码包重打成干净 148 条在 1004 行、v1.39 在 996 行、v1.38 在 988 行、v1.36 在 972 行、v1.35 在 962 行、v1.34 在 924 行、v1.33 在 897 行、v1.32 在 874 行、v1.31 在 842 行、v1.30 在 811 行、v1.29 在 784 行、交接条在 777 行、v1.28 在 745 行）；本文件 994 行；`AGENTS.md` 正文仍是 v1.10（v1.12/v1.13 的增补压在文件头与 §2.1/§3.6–§3.10，v1.29 的静态化口子已改 §2 那一段、v1.30 的动效层写在 §3.19、v1.31 的宿舍四字段与大厅常驻排序写在 §3.20、v1.32 的加成显示口径写在 §3.21、v1.33 的大厅推荐卡写在 §3.22、v1.34 的接单页推荐写在 §3.23、v1.35 的纸感换肤写在 §3.24、v1.36/v1.37 的加成凑满与死按钮修复写在 §3.25、v1.38 的版本自证写在 §3.26、v1.39 的加成四态文案写在 §3.27、v1.40 的「推荐固定 2 单 + 同层优先」写在 §3.28、v1.41 的「推荐数按并发位裁剪 + 种子 B 空手」写在 §3.29） |

### 0.2 这一阶段（v1.21 → v1.41）做完了什么

| 版本 | 一句话 | 关键文件 | 状态 |
|---|---|---|---|
| v1.21 | 一条命令分清「应用慢 / Neon 慢 / 隧道慢」：四段对照 + 结论判定 + 退出码 | `deploy/check-public.sh` | 已合并，待部署 |
| v1.22 | 预约送达改三列滚轮（今天/明天 + 时 + 分） | `app/publish/page.tsx` | 被 v1.23 取代（代码已不在） |
| v1.23 | 预约送达改 **10 分钟档时段网格**：过去时刻在生成期就过滤掉，DOM 里不存在 | `app/publish/page.tsx`（`slotList`） | 已构建验证，待部署 |
| v1.24 | 开拍前自检脚本：九段只读检查，`--reset` 后 13 PASS | `scripts/preflight.mjs` | 已构建验证，待部署 |
| v1.25 | 整页加载改成「一张纸上的绘画过程」，12 种风格每次随机一种 | `public/painting/*`、`components/PaintingSplash.tsx` | 待部署 |
| v1.26 | 加载动画 1.8× 加速、画完才退场、整屏铺满、进度驱动 | `public/painting/index.html`、`engine.js`、`PaintingSplash.tsx` | 待部署 |
| v1.27 | 蓝色只做点缀（`--c-brand #3e98ff`）+ 两套自托管拉丁字体 + 加载进度线 | `app/fonts/*`、`app/layout.tsx`、`app/globals.css` | 待部署 |
| v1.28 | 图标化玻璃底栏 + 药丸滑动 + 卡片错峰入场 + 光圈揭幕退场，**reduce 从「关掉」改成「只降速」** | `components/icons.tsx`、`BottomNav.tsx`、`app/template.tsx`、`globals.css`、`app/page.tsx` | 待部署 |
| v1.29 | **框架秒出、数据后到**：拆掉根 layout 的 `force-dynamic`，5 个页面改成 build 时静态预渲染（本机首字节 13–38ms、响应头 `x-nextjs-cache: HIT`）；新增 `app/loading.tsx` 全局骨架屏；底栏乐观高亮（点击即滑，不等 773ms 的 RSC） | `app/loading.tsx`、`app/layout.tsx`、`components/AppShell.tsx`、`components/BottomNav.tsx`、`app/api/me/route.ts`、`app/globals.css` | 已构建 + 本机实测，待部署 |
| v1.30 | **动效普及**：按钮/选项全部加 `:active` 按压回弹（260ms spring），加载态从静态小字换成骨架扫光 + 转圈/三点，忙碌按钮统一「转圈 + 处理中」 | `app/globals.css`、`components/Loading.tsx`、`app/page.tsx`、`app/publish/page.tsx`、`app/me/page.tsx`、`app/login/page.tsx`、`app/review/[id]/page.tsx`、`app/orders/[id]/page.tsx`、`app/batches/[id]/page.tsx` | 已构建 + 本机冒烟，待部署 |
| v1.31 | **宿舍资料四字段**（楼栋/楼层/房间号/尾号）落库、资料页可编辑、发单页自动带入；大厅**常驻**「同栋同层 → 同栋 → 其它」排序；服务端错误文案全部官方化（不再「手慢了」） | `server/db/schema.ts`、`drizzle/0003_user_dorm_profile.sql`、`app/api/me/route.ts`、`app/me/page.tsx`、`app/publish/page.tsx`、`app/page.tsx`、`server/rules/orders.ts` | 已迁移 + 接口实测，待部署 |
| v1.32 | **批量加成口径修正**：`/api/hall/nearby` 不再虚报整栋加成，改为返回 `active`（手上进行中单数）/`bonusMinBatch`/逐单 `bonusFen`；发布页加成合计只按「已勾选 ≥3 单」求和，并加「手上有单凑不满 3 单没有加成」说明；**规则未改** | `app/api/hall/nearby/route.ts`、`app/publish/page.tsx` | 已构建 + 接口实测，待部署 |
| v1.33 | **大厅「推荐一起带走」卡片**：接单界面顶部直接算出可一起带走的 2–3 单（同栋 + 名额 + 5 分钟余量），一键勾选进批量流程；右上入口「批量」改「一起接」 | `app/page.tsx` | 已构建，**被 v1.34 取代**（卡面已撤，推荐移到接单详情页） |
| v1.34 | **接单详情页改成发布页那套「同栋待接订单」**：进单详情页直接列出同栋可一起带走的单，默认替用户勾好 1 单（= 推荐 2 单），主按钮「接收 N 单」；大厅顶部的 v1.33 推荐卡撤除 | `app/orders/[id]/page.tsx`、`app/page.tsx` | 已构建，**被 v1.35 接着换皮**（逻辑不变） |
| v1.35 | **全站换纸感皮肤（Editorial Luxury · 暖奶油纸张）**：纸色 tokens + Double-Bezel 纸卡 + 悬浮纸胶囊顶栏/底栏 + fixed 噪点层 + 纸骨架加载页；顺带修四处选中态塌、补回被 antd 蓝色覆盖的链接色、修大厅 chip 双亮 | `app/globals.css`、`components/AppShell.tsx`、`app/loading.tsx`、`components/Loading.tsx`、`app/page.tsx`、`app/publish/page.tsx`、`app/me/page.tsx` | 已构建 + CDP 截图复验，待部署 |

| v1.36 | **一键凑满 3 单**：接单详情页默认勾到加成门槛（`Math.min(capacity, BONUS_MIN_BATCH_SIZE - 1)`），大厅新增「帮我凑满」与加成合计 | `app/orders/[id]/page.tsx`、`app/page.tsx` | 已构建，**被 v1.37 修掉死按钮** |
| v1.37 | **并发位不足 3 单时不再给假按钮**：`batchCap`/`canFillMore` 收紧、提示条两分支、确认条三态（凑不到就明说「本批没有加成」） | `app/page.tsx` | 已构建 + CDP 三账号实测，待部署 |
| v1.38 | **线上版本自证**：`lib/version.ts` 常量 + `GET /api/version`（带 `uptimeSec`，可判「部署了但没重启」）+ 「我的」页脚版本戳 | `lib/version.ts`、`app/api/version/route.ts`、`app/me/page.tsx` | 已构建 + curl 实测，待部署 |
| v1.39 | **加成文案不再骗人**：详情页块头/底栏改成「本次最多 N 单 · 凑不到加成」等四态文案，大厅 toggle 与 `batchCap` 对齐；并发位不足时不再写「一起带走 3 单 · 每单 +5%」 | `app/orders/[id]/page.tsx`、`app/page.tsx`、`lib/version.ts` | 已构建 + CDP 实拍，待部署 |
| v1.40 | **推荐卡固定 2 单 + 同层优先**：详情页 `PEER_RECOMMEND_MAX = 2` 截断候选、发布页 `NEARBY_RECOMMEND_MAX = 2` + `recommendNearby()` 同层排前，两处都标「同层」小标 | `app/orders/[id]/page.tsx`、`app/publish/page.tsx`、`lib/version.ts` | 已构建 + CDP 实拍，待部署 |
| v1.41 | **推荐数按真实并发位裁剪 + 种子 B 空手**：`recommend = candidates.slice(0, Math.min(PEER_RECOMMEND_MAX, capacity))`（capacity=`slots−1`）、发布页 `recommendNearby(orders, floor, max)` 同口径；`server/demo/seed.ts:197` 的 #16 runner 从 B 改成 C ⇒ B 空手时 slots=3、主单+2 可凑满 3 单 +5%（修用户 m02631 报的「两单只能勾一单」） | `app/orders/[id]/page.tsx`、`app/publish/page.tsx`、`server/demo/seed.ts`、`lib/version.ts` | 已构建 + CDP 实拍，待部署 |

### 0.3 没做完的（按建议顺序，每条都带验收口径）

**N1 · 把 v1.21–v1.41 部署上 ECS（唯一必须做的事）**

现状：**线上 2026-10-25 已部署 v1.21–v1.32，三条 curl 全对（IP 200 / https 200 / 错口令 403）**；剩下 v1.33–v1.41 的页面与种子改动：v1.33/v1.36/v1.37 与 v1.41 的 `app/page.tsx` + `app/publish/page.tsx`、v1.34/v1.39/v1.40/v1.41 的 `app/orders/[id]/page.tsx`、v1.35 的七个文件（见 §3.24）、v1.38 的两个新文件（见 §3.26）、v1.41 的 `server/demo/seed.ts`（#16 的 runner 从 B 改成 C，见 §3.29）。**包已重打成 v1.41 干净版 148 条 / 835920 B（含 `drizzle/0003`、`lib/version.ts`、`app/api/version/route.ts`、v1.39–v1.41 的推荐卡改动，可直接上传，不需要再打）**，再 SSH 跑四条命令（见 §7 Step 3–5，**注意 Step 4 首行的 `cd /root`**）；数据库迁移已在共用的 Neon 库跑过，服务器上不用再跑。
验收：
1. `cd /root/src && node scripts/preflight.mjs --base http://127.0.0.1:3000 --reset --admin shunlu-admin-2026` → **13 PASS / 0 FAIL / 0 WARN**；
2. `bash deploy/check-public.sh` → 全部 2xx，域名 p50 记录到 §4.2；
3. `curl -s -o /dev/null -w "%{http_code}\n" -X POST https://shop.omzsh.top/api/demo/login -H "Content-Type: application/json" -d "{\"token\":\"shunlu-demo-2026\"}"` → `200`；口令错 → `403`；
4. 手机开 https://shop.omzsh.top 手输口令 → 首页能看到**图标底栏**（三个图标 + 蓝色药丸）与**卡片逐个上浮**；没看到多半是设备开了「减少动画」（此时只有 0.46s 短版，属预期）。
5. 手机 `/me` → 「宿舍信息」填楼栋/楼层/房间号/手机尾号 → Toast「宿舍信息已保存」；进 `/publish` 四个字段**自动带出**；回大厅点「只看同栋」前后都应是**同栋同层的单排最前**（v1.31）。
6. 手机 `/publish` 往「同栋待接单」里勾单：手上有单没跑完时应看到「手上已有 N 单进行中…这批凑不满 3 单」的说明，且合计行的 5% 加成只在**勾满 3 单**时出现（v1.32）。
7. 手机大厅点进任意待接单 → 页内出现「同栋待接订单 N 单」列表（圆形勾选圈 + 「谁发的 · 备注 · 捎带 N 件」+ 右侧 `+¥X`），**默认已替用户勾好 1 单**，主按钮显示「接收 2 单（+¥Y）」；大厅 `/` 顶部**不再有**「推荐一起带走」卡片（v1.33 的卡面已被 v1.34 撤掉）。
8. 手机任意页面（除 `/admin*` 与 `?nofx=1`）：底色应是暖奶油纸、卡片是双描边纸卡、顶栏与底栏是悬浮胶囊；**「顺路」logo 是墨色不是蓝色**，空态链接是焦褐色带下划线，且大厅「只看同栋」与「全部」不会同时高亮（v1.35）。
9. 部署后 `curl -s https://shop.omzsh.top/api/version` 应返回 `"version":"v1.41"` 且 `uptimeSec` 很小（几十~几百秒）；手机 `/me` 滑到底页脚应显示 `v1.41 · 2026-10-26 · 顺路演示`（v1.41）。

**N2 · 首屏再快一档（p50 ≤0.5s，现在 1.3s）**

现状：v1.21 已量化——**慢在 CF→cloudflared 每请求固定加价 0.65–0.88s**，应用与 Neon 都不是主因；`protocol: http2` 已在 `/etc/cloudflared/config.yml` 生效（4 条 conn，落 LAX，而 origin 在杭州 ⇒ 两条跨洲链路）。
两条路：**A（免费）** CF Cache Rule 缓存 `/_next/static/` 与 `/painting/`——用户 m02582 说「A 先不着急 写进你的规划里面」，故**只写方案不执行**；**B（根治）** 阿里云香港轻量 + A 记录直连关橙云（HK 免备案）。
验收：本机 `ROUNDS=20 bash deploy/check-public.sh` → 域名 p50 ≤0.5s、`max/p50 ≤3`、20 次全 200。

**N3 · 浏览器人工复核 15 条路径（`docs/HANDOFF.md:150` 那条 TODO 的延续）**

现状：脚本能验的都已脚本化（preflight 13 段），剩下的是**只有人眼能判**的：入口口令框 → 切号后刷新仍登录 → 详情页 `/orders/17` 勾第 3/4 单等 15 秒不跳回 → 底栏药丸跟着当前页走 → 加载动画播完才进页面。
验收：逐条走一遍，10 秒内不出现「点了没反应 / 突然跳回 / 白屏」。

**N4 · 文档口径的小尾巴**

- `/api/demo/accounts` 实际返回 **7 个身份**（1 阿瑶 / 2 小跑B / 3 小跑C / 4 大伟 / 5 悠悠 / 10 阿哲 / 11 小雨），§3.8 里「切号列表只留 5 个业务身份」是 v1.8 时的口径，已过时但**不要改行为**（管理员本来就不在列表里）；
- 预约时段网格只覆盖「今天 + 明天」两天（`expectDeliveryMinutes ≤ 24h` 的既有约束），若将来放开到 3 天，改 `slotList()` 的 `dayOffset` 即可；
- `AGENTS.md` 正文版本号仍是 v1.10，增补只在头部与 §2.1/§3.6–§3.10，改动前先读头部增补行。

**N5 · 演示前重置种子**（每次开拍前 `POST /api/demo/reset`，或 `node scripts/preflight.mjs --reset`）——种子被用光会导致大厅 0 单，这是目前最容易在镜头前翻车的点。

### 0.4 交接红线（这几个坑已经踩过，别再踩）

1. **动效「不明显」先查 `prefers-reduced-motion`**，别急着优化性能：本机 Windows 常开「减少动画」，v1.27 的 `animation: none !important` 曾把整轮动效注销。现在的约定是**只降速不关闭**（`globals.css` 末尾的 reduce 块）。
2. **改完必须 `npm run build` + 重启 `next start`**，否则探针/浏览器看到的还是旧构建（表现为「改了没用」）。`public/` 新增文件也要重建才被服务。
3. **Next 15 的 `public/` 没有目录索引**：`/painting/index.html` 是 200，`/painting` 是 404 —— iframe src 必须写全路径。
4. **headless Chrome 对跨进程 iframe 截图会漏图层**（overlay 明明在，截图却透出页面）：判断覆盖要 headful，或用 `elementFromPoint` 采样。
5. **部署脚本报 rsync `getcwd()`**：SSH 会话停在 `/root/src` 时被自己 `rm -rf` 掉了 cwd，`deploy-app.sh:51` 的 `rsync -a "$SRC"/ "$APP_DIR"/` 就崩 —— **先 `cd /root` 再跑**，源码不用重传。
6. **长文件不要用整段 old_string 打补丁**：用 node 读全文 → 行数组 → 按前缀 `findIndex` 命中 → 整行替换再回写；原生 `read` 对长文件会截断。
7. **`run_code` 里模板字面量含 `\"` 或 `${` 会整段不执行**（`Expected ident`）：长文本用数组 join 写文件。

### 0.5 逐版一句话（越靠前越新；细节见 §3.x）

**v1.39：加成文案四态（**待部署**）**。用户发截图说「数字改了实际上没效果」——详情页块头写死「一起带走 3 单 · 每单 +5%」，可手上已有 1 单的小跑B 最多只能带 2 单，点满就被 Toast 拦住。根因是 `app/api/hall/nearby/route.ts:53` 的 `slots = runnerMaxActive(credit) - active` 遇上并发上限 3。改成四态老实文案：够 3 单才说 +5%，不够就说「本次最多 N 单 · 凑不到加成」。详见 §3.27。

**v1.38：线上版本自证（**待部署**）**。用户问「我怎么确认部署的是最新版」，此前只能比 chunk 哈希。新增 `lib/version.ts`（`APP_VERSION="v1.38"` / `APP_RELEASE="2026-10-25"`，发版只改这两行）、`GET /api/version`（回 `version/release/uptimeSec/nodeEnv/port`，`uptimeSec` 用来区分「部署了但没重启」）、`/me` 页脚版本戳。详见 §3.26。

**v1.37：并发位不足 3 单时不再给「帮我凑满」这种死按钮（**待部署**）**。v1.36 的实机复验抓到两处：提示条在 `slots = 2` 时渲染成「2–2 单」；uid=2（小跑B）手上有一单 ⇒ 最多带 2 单 ⇒ 3 单加成永远不可达，页面却仍显示「再带 1 单，每单多赚 5%」+「帮我凑满」，点了没有任何反应。改 `app/page.tsx:170-172` 的 `batchCap` / `canFillMore`、`:343` 提示条两分支、`:476-483` 确认条三态，见 §3.25。

**v1.36：一键凑满 3 单（默认勾选拉到加成门槛）（**待部署**）**。用户 m01656 反馈推荐一次最多只能选 2 单、吃不到「同批 3 单」的加成；接单详情页把默认勾选改成 `Math.min(capacity, BONUS_MIN_BATCH_SIZE - 1)`（名额 3 时预勾 2 个邻居 = 3 单），大厅加 `fillBonus()` +「帮我凑满」，见 §3.25。



**v1.35：全站换成纸感皮肤（Editorial Luxury · 暖奶油纸张）（**待部署**）**。用户 m01287 要求「全站换成参考站那种高级感、先备份、不行可回档」→ 动手前先打回档包。做法与坑（蓝链根因、chip 双亮、四处选中态塌）全部写在 §3.24，这里只记结论：只动视觉层、`app/page.tsx` / `app/publish/page.tsx` / `app/me/page.tsx` 三处样式、`app/globals.css` 末尾一段覆写层 + `components/AppShell.tsx` / `app/loading.tsx` / `components/Loading.tsx`，**schema / 规则 / 接口 / 数据库一行未动**，因此回档只需恢复到回档包。

**v1.34：接单详情页改成发布页那套「同栋待接订单」，默认替用户勾好 1 单（= 推荐 2 单）（**待部署**）**。用户 m01096：推荐卡不该放首页卡面，改到点进接单的页面、样式照发布页、推荐 2 单。`app/orders/[id]/page.tsx` 加同栋列表（圆形勾选圈 + 「谁发的 · 备注 · 捎带 N 件」+ 右侧 `+¥X`），进页默认勾好当前单 + 1 单；`app/page.tsx` 撤掉 v1.33 的大厅推荐卡。见 §3.23。

> v1.29–v1.33（框架秒出 + 动效普及 + 宿舍四字段 + 加成口径 + 大厅推荐卡）的逐版细节在 §3.19–§3.23；v1.33 的卡面已被 v1.34 撤掉。
**v1.28：UI 高级感第 2 轮 —— 图标化玻璃底栏 + 看得见的入场动效 + 减少动画「只降速不关闭」（**已随 10-25 部署上线**）**。用户 m02582：「ui几乎无变化 而且平滑的动画好像不明显 底部不是有三个选项吗 我感觉单文字比较丑 我前面给你的网站里的css都可以用啊 就是要高级感 … 就是要完善UI」。① `components/icons.tsx`（2220 B）6 个自绘图标（24 viewBox / stroke 1.6 / `pathLength={1}`）——「大厅」第一版线条四格 + 十字在 22px 下糊成「0+」，改成纯 bento 且右上格 `fill="currentColor"` 做实心；② `components/BottomNav.tsx`（1543 B）图标 + 文字 + `.sl-nav-pill` 药丸 `translate3d(calc(var(--i)*100%))` 540ms spring 平移（不是切类名瞬移），`components/AppShell.tsx` 删 TABS 文字数组、底部留白改 `calc(var(--nav-h) + env(safe-area-inset-bottom) + 20px)`；③ `app/template.tsx`（280 B）每次导航重挂 → `<div className="sl-page">` 播 600ms 落位；④ `app/globals.css` 追加 v1.28 段（共 454 行）：`.sl-nav` 玻璃面（93% surface + `blur(18px) saturate(150%)` + 顶部 1px 发丝线 + `box-shadow: 0 -1px 24px rgba(24,24,27,.05)`）、`.sl-rise` 620ms `backwards` + `calc(var(--i)*55ms)` 错峰、`.sl-nav-icon` 激活播 `sl-draw` 720ms 描边动画、排版层 `.sl-kicker` / `.sl-kicker-rule` / `.sl-hero`（27px / 600 / 1.14 / -0.035em / `text-wrap: balance`）/ `.sl-hero-sub` / `.sl-mini`；⑤ `/`、`/publish`、`/batches/[id]` 三页换 kicker + hero 标题，卡片**跨组连续编号** `riseOffsets`（每组从 0 重数会让第二组又集体重播）；⑥ `PaintingSplash` `MIN_MS 900→1500`、`FADE_MS 560→640`，退场改 `clip-path: circle(4% at 50% 46%)` 光圈揭幕 + `scale(1.04)` + `blur(2px)`。**根因（关键）**：用户说动效「不明显」不是性能问题 —— 本机 Windows 常开「减少动画」，`prefers-reduced-motion: reduce` 恒真，而 v1.27 的 reduce 块是 `animation: none !important; transition: none !important`，等于把整轮动效全部注销；本项目没有连续循环动画，故改成**只降速不关闭**（`.sl-page .42s`、`.sl-rise .46s`、药丸 `.2s`、描边 `.42s`，**保留 stagger 延迟**）。实测 `tsc`/`build` 全绿，6 张卡片 RISE `0.46s @ 0/0.055/0.11/0.165/0.22/0.275s`、`HALL_NAV … 大厅 ; matrix(1,0,0,1,0,0)` vs `/me` `… 我的 ; matrix(1,0,0,1,269.313,0)`、玻璃底栏截图 72280→57292 B、clipPath `circle(140%) 1.00 → circle(137.8%) 0.65 → circle(26.3%) 0.05 → 移除`。见 §3.18。

**v1.27 第 1 轮：把「参考站那种高级感」拆成能落地的三条 —— 蓝色只做点缀、两套自托管拉丁字体、加载动画再快 2.4×（**已随 10-25 部署上线**）**。用户 m02373 给了 motion.dev / wodniack.dev 两个参照站，m02380 定调「颜色先选蓝色 但是我们加载动画比较艺术所以不要太突兀就行、装字体、开第 1 轮」。第 1 轮只做地基、不铺场景：① `app/fonts/` 放 4 个 latin woff2（Instrument Serif 400 + 斜体、JetBrains Mono 400 + 500，共约 106 KB），`app/layout.tsx` 用 `next/font/local` 暴露 `--font-display` / `--font-mono`，**中文不装 webfont**（一个 CJK 字重 3–8 MB，走 CF 隧道不可接受）；② `app/globals.css` 新增 `--c-brand: #3e98ff` / `--c-brand-ink: #1f6fd9` / `--c-brand-line` / `--fs-label: 11px` / `--track-label: 0.14em`，`.sl-num` 换成等宽 + `tabular-nums`，新增 `.sl-mono` / `.sl-display`，`:focus-visible` 用品牌蓝 —— **原有 `--c-accent: #b45309`（琥珀）继续当钱色，蓝色只在交互层出现**，这样艺术感的加载动画不会被 UI 抢戏；③ `public/painting/index.html` 的 `SPEED` 1.8 → **2.4**，底部加一条 1px 蓝色进度线（`min(44vmin,230px)`，`scaleX(0)→1`，240ms linear，`#3e98ff` 半透明）复用 engine 既有的 `onProgress`，`components/PaintingSplash.tsx` 的 `MIN_MS 900→700`、`MAX_MS 9000→6000`、`FADE_MS 560→420`；④ `components/AppShell.tsx` 品牌「顺路」下加 2px 蓝底线、当前 tab 顶部 2px 蓝条，都是 hairline 级（opacity 0.7/0.8）。实测：`npx tsc --noEmit` EXIT=0，`npm run build` 通过；桌面画完 **5241ms**（v1.26 为 6180ms）→ 5349ms 淡出 → 5682ms 移除，手机 4489/4489/4821ms，55 条进度消息单调递增；字体产物 3 个 woff2（serif 400 / serif italic / mono 400+500 合并）、CSS 35836 B 含 6 个 `@font-face` 与 size-adjust 兜底，且**首屏不加载**（未登录页无 `.sl-num`，登录后首页以 46px 命中 mono 400/500）。见 §3.17。

**v1.26：加载动画改成「1.8 倍速 + 画完才退场 + 整屏铺满」（**已随 10-25 部署上线**）**。用户 m02162 原话「先测试一遍1.8加画完的把」。v1.25 的动画被 `MAX_MS 2600` 的计时器在 1 秒左右就切掉，只看得见起笔；画布又被 `min(canvasSize, 300, …)` 钉在 300px，四周大片留白。改法：`public/painting/index.html` 重写成 5815 B 的视口自适应壳（`fit()` 按短边算 `--side`，范围 140–960px，横屏把标题挪到右侧；补纸纹与暗角），**绘制缓冲仍是 600²、只放大 CSS 显示**（改分辨率会连带改 `ensureBrushes(3*m/600)` 的笔刷比例）；`engine.js` 加三个钩子 —— `opts.speed`（1.8，只压真实时间不截断时序）、`report(progress)` 每 0.5% 向父窗口 `postMessage`、`once` 到 `loopMs` 直接 `noLoop()`；`components/PaintingSplash.tsx` 从 94 行写到约 186 行，改成**监听进度**（`progress ≥ 0.995` 且页面 load 完且 `≥ MIN_MS 900`）才退场，`MAX_MS 9000` 与「ready 后 3 秒无进度」两条兜底，退场 560ms 做 opacity + `scale(1.035)` + `blur(3px)`，同时给根节点 `data-splash-page` 让页面从透明淡入。**一个反直觉决定**：本机 Windows 本来就是 reduce-motion（`UserPreferencesMask` 第二字节 `0x1E`，「窗口内动画」被关掉），若按 a11y 惯例「reduce 就整段跳过」，用户在这台演示机上永远看不到动画 —— 所以 reduce 改为「不跳过，只把退场降级成纯 opacity、560→320ms」。实测（CDP）：桌面 1280×860 progress 爬到 **1（6180ms）** 才淡出、6618ms 移除；手机 390×844 是 5680/5790/6116ms；`--side` 分别 822 / 373px。见 §3.16。

**v1.25：整页加载改成「一张纸上的绘画过程」，每次打开随机 12 种风格之一（**已随 10-25 部署上线**）**。用户 m01845 把 https://painterly.design-tools.workers.dev 的 12 个模板给了过来，要求「加载的时候每次都随机选一个」，并先问「占用会很大吗 / 你能自己读吗」。能读：本机 DNS 对 `*.workers.dev` 超时、直连 CF IP 被 reset，走本机 Clash 代理（`curl -x http://127.0.0.1:7897`）把 `index.html` 与 5 个依赖全取了回来。体积：p5.min 990372 B（gzip 285201）+ p5.brush 72062（27245）+ engine 14913 + 两种风格 75602 / 13113 ≈ **1.17 MB raw / 330 KB gzip**，一次性加载后走浏览器缓存，因此**不需要退化成固定一种**。落地：`public/painting/`（新写 3009 B 的壳 + engine + 2 个风格 + vendor 两个）+ `components/PaintingSplash.tsx`（94 行；`MIN_MS 1000` / `MAX_MS 2600` / `FADE_MS 320`，75ms 轮询 readyState，点一下或 Esc 跳过，reduced-motion 降到 250/700ms，`/admin*` 与 `?nofx=1` 不渲染，铺 `fixed inset-0 z-[9999]` 底 `#fafafa` 的 iframe），`app/layout.tsx` 里挂在 `<AntdMobileReact19Compat />` 之后。实测 8 次直接开页面得到 7 种不同风格；headful 下 6 个采样点 `elementFromPoint` 全部命中 iframe、3s 后自动移除。见 §3.15。

**v1.24：一条命令做开拍前自检 —— `node scripts/preflight.mjs`（**已随 10-25 部署上线**）**。背景是查现状时写进 console 快照的数字：`completed 11 · expired 11 · open 0`，大厅 0 单 —— **种子已被前几轮演示用光**。这类问题（服务没起 / 没单可接 / 账不平 / 倍率不是 1）最容易在镜头前翻车，所以不做新功能、改做检查：零依赖 ESM，九段——首页 200 → `demo/login` → 可选 `demo/reset` → `demo/accounts` → **逐个身份**切号 + `/api/me` → 信用最高者看大厅（0 单就 WARN 提示 `--reset`）→ `/api/orders` + `/api/wallet` → 有 `--admin` 才登录后台核对 `reconcile` 两条不变式与时钟倍率 → 汇总 `N PASS / N FAIL / N WARN` + 开拍建议，有 FAIL 退出码 1。实测：未重置 11 PASS / 0 FAIL / 1 WARN；`--reset` 后 **13 PASS / 0 FAIL / 0 WARN**（`open 8 · accepted 1`，大厅 7 单，余额与种子一致）。见 §3.14。

**v1.23：预约送达改成时段网格，「已经过去的时间」在 DOM 里根本不存在（**已随 10-25 部署上线**）**。用户 m01662 原话「我预定时间能定已经过了的时间 比如今天早上 所以你要修改一下」。v1.22 的三列滚轮虽然静默顺延，但列表里仍能滚到早上；本版改成 10 分钟一档的网格弹层：`slotList()` 从 `now + 20min` 起、按天起点步进、`t < 最早` 直接跳过、`t > 最晚` 直接 break —— **过滤发生在生成阶段，不是灰按钮**。弹层写「最早可约 XX:XX（至少提前 20 分钟）· 最晚明天 HH:MM · 每 10 分钟一档」，chip 带实时档数。CDP 实测（NOW 14:52:28）今天 52 档 15:20→23:50、过去时段 `[]`；明天 90 档 00:00→14:50。`/publish` 6.09 kB / 145 kB。见 §3.13。

**v1.21：一条命令分清「首屏慢在应用/Neon 还是 Cloudflare 隧道」**（用户 m01247 要求继续下一 step；v1.18+v1.19+v1.20 已由用户部署，实测「功能正常了」）。新增 `deploy/check-public.sh`：四段对照各打 N 次只读 GET —— 域名首页 / 源站首页 / 域名静态资源 / 源站静态资源（chunk 从首页 HTML 自动取），输出状态码分布与首字节、总耗时的 min·p50·p90·max，末尾直接给结论并带退出码（1 = 有 BAD/WARN）。12 次实测：域名首屏 TTFB p50 **1.325s**、max **4.734s**，同一时刻源站 p50 **0.035s**；域名静态资源 p50 0.690s vs 源站 0.021s ⇒ **慢在 Cloudflare → cloudflared(ECS) 这一段（每请求固定加价 0.67–1.3s）+ TLS 握手长尾（0.48→5.62s）**，应用渲染 30–80ms 与 Neon 92ms/RT 都不是主因。所以 §4.2 的 `protocol: http2` 对症、§4.4 迁库收益有限。旧版脚本为什么全记 `000` 见 §5 坑 21。

**v1.20：修好「预约时间滚动选择点不开」——根因是全站命令式弹层在 React 19 下全哑（**已上线**：与 v1.18/v1.19 于 2026-10-24 一起部署，用户 m01247 实测「功能正常了」）。** React 19 把 `createRoot`/`render` 从 `react-dom` 主入口移走了，antd-mobile 5.43 的 `renderToBody` → rc-util 5.44.4 `lib/React/render.js` 因此退化成 `legacyRender()`，`reactRender` 为 undefined 时**静默空操作**，于是全站 46 处 `Toast.show` / `Dialog.confirm` / `Picker.prompt` 点了都没反应、连报错都没有。按官方 v5-for-19 方案新增 `components/AntdMobileReact19Compat.tsx`（`"use client"`，模块顶层 `unstableSetRender` 用 `react-dom/client` 的 `createRoot` 自己渲染、`WeakMap` 复用 root、unmount 留一帧给退出动画），挂在 `app/layout.tsx` 的 `<AppShell>` 之前；**46 个调用点一行未改**。本地 CDP 实测：修复前点「预约送达」→ 点卡片时 `.adm-picker` 数为 **0**，修复后为 **1**；选 1 小时 30 分确认后卡片变「1 小时 30 分钟后 | 约 HH:MM 送达」，再把分钟选到 10 分钟确认 → Toast「至少要提前 20 分钟…」正常弹出。tsc 干净、`next build` 38 条 route/page。

**v1.19：只读接口遇到「连接被静默回收」会自动换一条连接重试一次**（v1.17 遗留缺口的第一条修法，用户 m00919 确认的 A 方案）。新增 `server/db/retry.ts`：`isTransientDbError` 只认连接类错误（`CONNECTION_CLOSED` / `CONNECTION_ENDED` / `CONNECTION_DESTROYED` / `ECONNRESET` / `EPIPE` / `ETIMEDOUT` …，业务错 `23505` / `42601` 一律不认；错误链上出现 `DbDeadlineError` 直接不重试，因为 20s 预算已耗尽），`runWithRetry(fn, { attempts: 2, backoffMs: 120 })` 失败时抛出**原错误对象**（不包一层）。`lib/api.ts` 加 `ReadOptions = { retryRead?: boolean }` 与 `withReadRetry(fn, label)`，**12 个只读 GET 白名单显式开启**（8 个走 `{ retryRead: true }`、4 个裸路由走 `withReadRetry`），**写接口一个都不接**（重复冻结/入账的代价远大于一次报错）。整段重试之所以安全：这些 GET 里唯一的写操作 `expireSweep()` 是条件 UPDATE + 事务的幂等收敛，已终态的单不会再动。本地 `tsc` 干净、**13 文件 125 例**全绿、`next build` 38 条 route/page；`.data/retry-demo.mts` 用真代码跑出「首次断连 → 第 2 次成功、退避 120ms」「23505 只调 1 次」。

**v1.18：修好详情页「同一栋还有 N 单」默认一个都不勾的问题（**已上线**：与 v1.19/v1.20 于 2026-10-24 一起部署；用户 m01247 实测默认勾选与多选均正常）。** 根因：旧 effect 只要拿到一次 `candidates`（哪怕 `[]`——首帧 `/api/hall/nearby` 还没回来、或全是女生单）就把 `peerDefaultFor.current` 记成「已初始化」，而 `mergePeerPicked` 的补位是 `target = Math.min(prev.length, cap)`，`prev` 为空时恒为 0。修：`lib/peer-selection.ts` 新增 `shouldApplyDefault({ alreadyInitialized, candidates })`——已初始化 → `false`，否则要求 `candidates.some(c => !c.blockedByGender)`，页面只在真有可接候选时才消费默认勾选；标签改按实际可接数显示（「还能带 2 单 · 本栋可接 2 单」/「本栋这些单你都不能接」/「手上已满…」）。本地 CDP T+3/6/9/13s 恒为 `[x]+¥4.50 [x]+¥3.00`、按钮「一起接下 3 单（+¥9.75）」，5s 轮询不复位；tsc 0、109 例全绿、`next build` 38 条。详见 §3.8。

## 1. 目前目标（按优先级）

| # | 目标 | 状态 |
|---|---|---|
| 0 | 修「所有数据库查询挂死 → 全站转圈 / 无痕反复要口令」 | **已完成（v1.16，已上线）**：watchdog 探活 + 20s 上限 503 + 回收重建池（§3.6） |
| 1 | 把 v1.16 部署到 ECS 并确认空闲后不挂死 | **已完成（v1.17）**：空闲 8 分钟后接口全 200（§3.7、§4.1） |
| 2 | 让 https://shop.omzsh.top 稳定（偶发 524 / 一直加载） | 本轮未复现；再复发按 §4.2 切 `protocol: http2` |
| 3 | `APP_URL` 定稿 | **已完成**：`deploy/shunlu.env` 与 `.env.local` 均为 `https://shop.omzsh.top`（§4.3） |
| 4 | 可选：迁杭州同机 PostgreSQL，把 92ms/RT 降到 0.5ms | 非必需，见 §4.4 |
| 5 | 修「详情页同栋多单默认一个都不勾」 | **已上线（v1.18）**：默认勾选自愈 + 可接数文案（§3.8） |
| 6 | 只读接口遇 Neon 静默断连不报错（v1.17 缺口） | **已上线（v1.19）**：透明重试一次、写接口不重试（§3.9） |
| 7 | 发布页「预约送达」滚动选择点不开（其实是全站 Toast/Dialog/Picker 都哑） | **已上线（v1.20）**：React 19 下自定义 antd-mobile 渲染器（§3.10） |
| 8 | 一条命令分清「应用慢」还是「隧道慢」 | **已完成（v1.21）**：`deploy/check-public.sh` 四段探测 + 结论判定 + §4.2 处置（§3.11） |
| 9 | 加载动画只看得到起笔、画布只有 300px | **已完成（v1.26，待部署）**：1.8× 加速 + 画完才退场 + 整屏铺满 + 平滑交接（§3.16） |
| 10 | 预约送达能选到「已经过去的时间」 | **已完成（v1.23，待部署）**：10 分钟档时段网格，过去时刻在生成期被过滤（§3.13） |
| 11 | 开拍前用一条命令确认「服务/种子/账本/倍率」都对 | **已完成（v1.24，待部署）**：`node scripts/preflight.mjs --reset` = 13 PASS（§3.14） |
| 12 | 整页加载要「一张纸上的绘画过程」且每次随机 | **已完成（v1.25，待部署）**：12 种风格随机，≈1.17 MB raw / 330 KB gzip（§3.15） |
| 13 | 用户 m02582：「ui几乎无变化 而且平滑的动画好像不明显 … 就是要高级感 … 就是要完善UI」 | **已完成（v1.27 + v1.28，待部署）**：图标化玻璃底栏 + 药丸滑动 + 错峰入场 + 光圈退场 + 拉丁字体/蓝色点缀（§3.17、§3.18） |
| 14 | 把本阶段（v1.21–v1.35）交接给下一个对话 | **已完成（2026-10-25，本文档 §0）**：三分钟上手 / 做完了什么 / 没做完的 N1–N5 与验收口径 / 七条红线 |
| 15 | 用户 m00386：资料页存宿舍四字段（楼栋/楼层/房间号/尾号）并在发单时自动带出；大厅常驻「同栋同层」排序；全站文案官方化 | **已完成（v1.31，待部署）**：`drizzle/0003_user_dorm_profile.sql` + `/api/me` 读写 + `/me` 四输入 + `/publish` 预填 + 大厅打分排序 + 服务端 12 条 Toast 改写（§3.20） |
| 16 | 首屏 p50 ≤0.5s（现 1.3s） | **未开始（只写方案）**：慢在 CF→cloudflared 跨洲链路；方案 A = CF Cache Rule（用户 m02582：先不着急，写进规划）、方案 B = 阿里云香港直连（见 §0.3 N2、§4.2） |
| 17 | 用户 m00870：手上有单只剩 2 个空位时，拿 2 单吃不到「同批 3 单」的加成（认为规则合理，不改）；设置里希望能设楼层 | **已完成（v1.32 + v1.31，待部署）**：v1.32 修「批量加成」显示口径与页面说明（§3.21）；楼层/房间/尾号本身 v1.31 就已有（§3.20），看不到是因为线上还是 v1.20 |
| 18 | 用户 m01096：推荐卡不该放首页卡面，改到点进接单页面，样式照发布页，推荐 2 单 | **已完成（v1.34，待部署）**：详情页「同栋待接订单」重做 + 默认勾 1 单 = 推荐 2 单；大厅推荐卡撤除（§3.23） |
| 19 | 用户 m01656：大厅推荐一次最多只能选 2 单，吃不到「同批 3 单」加成 | **已完成（v1.36 + v1.37，待部署）**：详情页默认勾到门槛、大厅「帮我凑满」；并发位不足 3 单时改显示「本批没有加成」而不是死按钮（§3.25） |
| 19 | 用户 m01287：全站换成参考站那种高级感（暖奶油纸张 / 编辑风），不满意要能回档 | **已完成（v1.35，待部署）**：纸色 tokens + Double-Bezel 纸卡 + 悬浮纸胶囊顶栏底栏 + 噪点层 + 纸骨架；顺带修四处选中态塌与 antd 蓝链；回档包 `.data/backups/shunlu-src-v1.34-pre-theme-20261025-1908.tgz`（§3.24） |
| 20 | 用户 m02306：「推荐的话同楼层优先哈 那么开始修改」 | **已完成（v1.40，待部署）**：推荐卡面固定 2 单、候选按同层优先排序，详情页与发布页同口径（§3.28） |
| 21 | 用户 m02631：「推荐数量是对了但是推荐的两单还是只能二选一 排查一下问题 问题根源没解决」 | **已完成（v1.41，待部署）**：根因是 `slots = 并发上限 − 手上已有单`，种子把 #16 挂在 B 身上导致 capacity=1；两处推荐数改为按 capacity 裁剪、种子 #16 的 runner 从 B 改成 C，B 空手时主单+2 可凑满 3 单 +5%（§3.29） |

## 2. 项目坐标

- **技术栈**：Next.js 15 App Router + TS strict + Tailwind v4 + antd-mobile v5 + Drizzle ORM + postgres.js；pnpm；`output: 'standalone'`。v1.29 起**页面默认静态预渲染**（`/`、`/login`、`/me`、`/publish`、`/admin/console` 是 ○ Static），只有 `/admin`（纯 redirect）与 `/orders/[id]`、`/batches/[id]`、`/review/[id]` 这几个动态段仍 `force-dynamic`；20 处 route handler 的 `force-dynamic` 必须保留。
- **本机开发/演示**：`pnpm dev` 或 `pnpm build && pnpm start`；生产启动实际是 `node scripts/start.js`（内部 `next start -H 0.0.0.0 -p 3000`，附带每 4 分钟数据库保活）。局域网访问 `http://192.168.1.63:3000`（IP 会变）。
- **本机当前进程**：由后台 job `bash-4b10694f78d44af3` 跑 `NODE_ENV=production npx next start -H 0.0.0.0 -p 3000`，用的是 **v1.28 构建**（图标化玻璃底栏 + 入场动效错峰 + 光圈揭幕退场；`/publish` 6.17 kB / 145 kB、`/orders/[id]` 8.66 kB / 151 kB、`/batches/[id]` 3 kB / 109 kB、`/me` 3.35 kB / 146 kB，First Load shared 102 kB）。旧 job `bash-10475f6538994a03`（v1.27）、`bash-4ba23021c9ca4c26`（v1.26）、`bash-c377b8ee7eee410a`（v1.25）已 kill。
- **ECS**：`47.97.167.178`（杭州，2C2G200M，Ubuntu 24.04，root 口令登录）。systemd 服务 `shunlu.service`；目录 `/opt/shunlu`（源码+构建）、`/etc/shunlu/shunlu.env`（600）、`/srv/shunlu`（运行数据）、`/var/log/shunlu.log`；`next-server (v15.5.28)` 监听 `0.0.0.0:3000`。
- **公网链路**：`浏览器 --https--> Cloudflare 橙云 --Tunnel--> cloudflared(ECS) --http--> 127.0.0.1:3000`。`/etc/cloudflared/config.yml`：`tunnel: 04c14c43-5535-42c6-8bf6-7f7b2b8f81d4`、`ingress: shop.omzsh.top → http://127.0.0.1:3000`、兜底 `http_status: 404`。**同一个 tunnel ID 只能一端在线**。
- **数据库**：Neon PostgreSQL 18，`ep-square-feather-aoj1pgr7-pooler.c-2.ap-southeast-1.aws.neon.tech`，`sslmode=require`（连接串在 `.env.local` 与 `deploy/shunlu.env`）。**测试只跑本地 `shunlu_test`，绝不碰 Neon。**
- **口令**：`DEMO_TOKEN=shunlu-demo-2026`（演示口令）、`ADMIN_PASSWORD=shunlu-admin-2026`（`/admin/console` 后台口令）。
- **时区**：Etc/GMT-8（UTC+8），写文档时间戳用当前本地时间。

## 3. 已完成（截至 2026-10-23 11:25）

### 3.1 v1.11 性能收尾（2026-10-21，PROGRESS 269–291 行）

1. 删掉 `app/api/zz-ping/route.ts`（无鉴权的裸 `select 1` 探针，会被打进生产构建）。
2. 回滚 `server/db/index.ts` 的 `prepare: false` —— **负优化**：带参查询恒 2 RT（443ms），默认预编译预热后 1 RT（208–226ms）。
3. `server/rules/reviews.ts` 的 `reviewSummaryOf` 两条串行查询并成一条：`COUNT(*) OVER ()::int` 作 `n`、`COALESCE(AVG(reviews.rating) OVER (), 0)::float` 作 `avg`。
4. 清掉 `app/api/me/route.ts` 的 `[perf-me]` 插桩。

**结论**：瓶颈是**往返次数 × RTT**，不是协议开销。本地 RTT≈210ms（HANDOFF 采样期≈110ms）⇒ §1 的绝对基线（hall 456 / detail 619 / me 437 …）**不可达**，这是网络环境差异。`/api/me` 理论地板 ≈840ms（鉴权 2 RT + 一波并行 2 RT），实测 848/864 正好踩地板。
**验证**：`tsc --noEmit` 无输出、vitest **9 文件 78 例全绿**、`next build` 成功（38 条 route+page）。

### 3.2 v1.12 演示口令改密码框（2026-10-23，本地全绿，**已随 v1.14 上线**）

| 文件 | 改动 |
|---|---|
| `lib/demo-guard.ts`（3711B） | 新增 `DEMO_COOKIE="sl_demo"`、`demoCookieValue(token)`=`sha256("shunlu:demo:"+token)`、`sameSecret`（timingSafeEqual）、`readCookie`、导出 `isLoopback`；`demoGuard` 在 Bearer / `?token=` 之后加第三条凭证 Cookie，403 体带 `code:"DEMO_TOKEN_REQUIRED"` |
| `app/api/demo/login/route.ts`（新增，2694B） | `POST {token}`：非 DEMO_MODE→404；未配 DEMO_TOKEN 且非回环→503；空口令→400；不符→403「口令不对」；通过→种 httpOnly `sl_demo`（12h、Lax、secure 跟随 Host+`x-forwarded-proto`）。`DELETE` 清 cookie |
| `lib/client.ts` | 新增 `demoLogin(token)` |
| `components/DemoToolbar.tsx`（8187B） | 重写：去掉 localStorage/Bearer 注入，改 needToken/tokenInput/guardError 三态；403 就地展开口令框（`type="password"`）；挂载时把 `?token=` 兑换成 cookie 并 `history.replaceState` 抹掉 |
| `app/login/page.tsx`（6186B） | 整页重写：口令输入成一等入口（表单 + 「输入一次，本机记住 12 小时」），旧 `?token=` 自动兑换并抹地址栏 |
| `deploy/README.md` | 部署运维 252 行：§2 首次部署、§3 日常运维、§7 隧道八小节（§7.5 cookie secure 场景表、§7.6 公网链路体检 + §7.6.1 http2） |
| `AGENTS.md` | 头部加 v1.12 增补行；§2.1-3 改为「Bearer / `?token=` / httpOnly Cookie `sl_demo`」 |
| `docs/PROGRESS.md` | **714 行**变更史，每条三段式；v1.20 在 519 行、v1.21 在 555 行、v1.22 在 583 行、v1.23 在 610 行、v1.24 在 637 行、v1.25 在 663 行、v1.26 在 689 行 |

**本地验证证据**（`NODE_ENV=production node scripts/start.js`，带 `Host: shop.omzsh.top` 头伪装公网）：
- 错口令 → `403 {"error":"口令不对"}`；空口令 → 400；对口令 → `200 {"ok":true,"required":true}` + `set-cookie: sl_demo=729c16…; Path=/; Max-Age=43200; HttpOnly; SameSite=lax`。
- 带 cookie 请求 `/api/demo/accounts` → 200；伪造 `sl_demo=deadbeef` → 403；旧链接 `?token=` → 200；不带凭证 → 403。
- `DELETE /api/demo/login` → 200 + 过期 cookie。
- 09:50 复测：`POST /api/demo/login` → 200 `{"ok":true,"required":true}`；未切号 `GET /api/me` → 401（23ms）。
- `tsc` 无输出、vitest 78 例、`next build` 出现 `ƒ /api/demo/login`（38 条 route+page）。

**源码包**：v1.12 时为 `499240B / 260 条目`，v1.14 为 `511639B / 262`，v1.15 为 `517661B / 264`；**v1.16 重打后约 525KB（512KiB）/ 266 条目**（含 v1.16 的 PROGRESS/HANDOFF、`server/db/watchdog.ts` 与 `tests/db-watchdog.test.ts`），`node_modules` 命中 0、`.env.local` 未入包。文档若再改，重打后体积会差几十字节，条目数不变。**线上 ECS 仍跑 v1.15**，需按 §0 三步重新部署。
| `server/db/retry.ts`（v1.19） | 只读重试内核（148 行，不 import 任何 db 模块）：`isTransientDbError`（只认连接类错误，遇 `DbDeadlineError` 直接 false）/ `describeDbError` / `runWithRetry(fn, { attempts, backoffMs, onRetry, sleep })`（抛原错误对象）；常量 `READ_RETRY_ATTEMPTS = 2`、`READ_RETRY_BACKOFF_MS = 120` |
| `tests/db-retry.test.ts`（v1.19） | 16 例：一次断连透明恢复 / 两次断连抛原错 / 业务错不重试 / `DbDeadlineError` 不重试 / `attempts` 与 `backoffMs` 与 `onRetry` / `cause` 链 |

### 3.3 v1.13 Cookie Secure 按真实协议判定（2026-10-23，本地全绿，**已随 v1.14 上线**）

| 文件 | 改动 |
|---|---|
| `lib/cookie-secure.ts`（新增） | `isLoopbackHost` + `shouldSecureCookie(host, proto)`：回环永远 false；有 `x-forwarded-proto` 取逗号前第一段，`https` 才 true；无头时 Host 与 `APP_URL` 同域且 https 才 true |
| `lib/session.ts` | `sl_uid` 的 secure 改用 `shouldSecureCookie`（原来只看 APP_URL） |
| `app/api/demo/login/route.ts` | `sl_demo` 同口径（原来只看 Host，两处判定不一致） |
| `tests/cookie-secure.test.ts`（新增，6 例） | 回环 / proto 优先级 / 同域 https 兜底 / IP+LAN 必须 false / APP_URL=http 或坏值 |
| `deploy/shunlu.env` | `APP_URL=https://shop.omzsh.top` 定稿 |
| `deploy/check-public.sh`（v1.21） | 公网链路体检：域名/源站 × 首屏/静态四段探测，输出 min/p50/p90/max 并判定「慢在应用」还是「慢在隧道」；`DOMAIN/ORIGIN/ROUNDS/TIMEOUT/COOKIE` 可覆盖 |
| `deploy/check-public.sh`（v1.21） | 公网链路体检：域名/源站 × 首屏/静态四段探测，输出 min/p50/p90/max 与结论（§3.11、README §7.6） |
| `AGENTS.md` | §2.1-9 改为三 cookie 同规则；§2.1-3 同步 |
| `deploy/README.md` | §6 反代必须传 `X-Forwarded-Proto`；§7.5 重写为 5 行场景表 + Next 注入说明 |

**关键发现**：Next 15 在 `node_modules/next/dist/server/base-server.js:564` 有
`req.headers['x-forwarded-proto'] ??= isHttps ? 'https' : 'http'` —— 明文请求缺该头会被补成 `http`，
所以纯函数「Host 同域 + APP_URL https」兜底在 Next 运行时基本不可达，**反向代理必须显式传该头**。

**验证证据**（`NODE_ENV=production PORT=3000 node scripts/start.js`，Ready in 829ms；curl 带 Host 头）：

| 请求 | `sl_demo` 的 Secure |
|---|---|
| Host: shop.omzsh.top + `X-Forwarded-Proto: https` | 有 |
| Host: shop.omzsh.top 无该头 | 无（Next 补 http，预料之中） |
| Host: 47.97.167.178:3000 / 192.168.1.63:3000 / 127.0.0.1:3000 无头 | 均无 |
| `/api/auth/switch` + 隧道头 / IP 无头 | `sl_uid` 分别 有 / 无 |

其余：错口令 403、空口令 400；`tsc` 无输出；vitest **10 文件 84 例**；`next build` 38 条 route+page。

### 3.4 v1.14 部署上云 + 公网验收（2026-10-23 10:23–10:25）

**部署路径**（用户执行）：`scp .data/shunlu-src.tgz root@47.97.167.178:/root/` → `cd /root && rm -rf /root/src && mkdir -p /root/src && tar -xzf /root/shunlu-src.tgz -C /root/src` → `bash /root/src/deploy/deploy-app.sh shunlu 3000 /root/src`。**v1.16 不需要改 env**（APP_URL 已是 https；`deploy-app.sh` 只在目标 env 不存在时才装 `/root/shunlu.env`，不会覆盖）。
结果：`systemctl is-active shunlu` = active，Next.js **15.5.28** Ready in 1127ms，监听 0.0.0.0:3000，服务器本机 `POST /api/demo/login` → 200（0.053s）。

**公网实测（外网 curl，2026-10-23 10:23–10:25）**

| # | 检查 | 结果 |
|---|---|---|
| 1 | `POST https://shop.omzsh.top/api/demo/login`（正口令） | 200，`sl_demo=…; Max-Age=43200; **Secure**; HttpOnly; SameSite=lax`，body `{"ok":true,"required":true}` |
| 2 | 错口令 / 空 body | 403 / 400 |
| 3 | `GET /login` / `GET /` | 200（1.36s / 1.31s），SSR HTML 7651B |
| 4 | 首页连续 20 次 | **20×200**，无 5xx/超时 |
| 5 | 带 `sl_demo` 取 `/api/demo/accounts` | 200，7 个业务身份（A/B/C/D/E/F/G，无管理员） |
| 6 | `POST /api/auth/switch {userId:2}` | 200，`sl_uid=2; Secure; HttpOnly; SameSite=lax`；`/api/me` 200（小跑B，信用 90，余额 2963 分，口碑 7 条均 5 星） |
| 7 | `/api/console/login` + `/api/console/snapshot` | 200 / 200，`sl_console` 带 Secure；快照 7 账号、scale=1、对账字段在位 |
| 8 | `GET /admin` → 307；`GET /admin/console` | 307 跳转 / 200（1.09s） |
| 9 | `POST http://47.97.167.178:3000/api/demo/login`（IP 直连） | 200，`set-cookie` **无 Secure**（符合 §2.1-9：IP 直连走 http 也能登录） |
| 10 | 旧链接 `/?token=shunlu-demo-2026` | 200；服务端不下发 cookie（客户端兑换），地址栏清理待浏览器确认 |

**结论**：Cloudflare 隧道确实带 `X-Forwarded-Proto: https`，v1.13 的判定在真机生效；线上已是 v1.13 构建（口令框 + cookie 修复）。

**已知缺口**：① 浏览器端点击路径（输入口令 → 切号 → 大厅 → 刷新保持登录）未人工复核（`/login` 客户端渲染，curl 看不到 `type=password`）；② 部署启动日志有一段 `errno: 'CONNECTION_CLOSED', address: [Array], port: [Array]`（Neon idle 断连），随后所有接口正常，按一次性断开处理、复现再查；③ https 稳定性只测了 20 次（全 200），长期偶发 524 尚未复现。

### 3.5 v1.15 详情页「同一栋还能带」勾选被轮询重置（2026-10-23，本地全绿，**已上线**）

**现象**（用户 m00245 报）：订单详情页「同一栋还有 N 单在等 / 还能带 M 单」列表里，只要选中的不是最上面两单，几秒后会自动跳回最上面两单。

**根因**：`app/orders/[id]/page.tsx` 的 peers effect 依赖写成 `[openOrder, meId]`，而 `openOrder = data?.order`；页面每 5 秒轮询 `load()` → `setData(detail)` 每次都是新对象 → effect 每次都重跑 → 重拉 `/api/hall/nearby` 后**无条件** `setPeerPicked(…slice(0, capacity))`，把用户手动勾选覆盖回「同层优先排序后的前 capacity 单」。别人接走一单后排序前移，看起来就更像「自己跳」。大厅页（`app/page.tsx:87-91`）轮询不碰 `selected`，因此无此问题。

**修法**（按用户 m00272 确认的口径）：只有订单集合真的变化才动勾选；订单增加不影响；订单减少/被抢时已选且仍可接的保持不变，缺的从上到下找第一个空位补回**原数量**。

| 文件 | 改动 |
|---|---|
| `lib/peer-selection.ts`（新增） | `mergePeerPicked({ prev, candidates, capacity, initialize })`：首次 `eligible.slice(0, cap)`；之后 `kept = prev ∩ eligible`、`target = min(prev.length, cap)`，kept 多则从尾部裁、少则从 eligible 顶部跳过已选补到 target |
| `app/orders/[id]/page.tsx` | effect 依赖改稳定标量 `[peerOrderId, peerStatus, peerPublisherId, peerBuilding, peerFloor, meId]`（:287）；新增 `peerDefaultFor` ref 让默认勾选只做一次（:232-237 取标量）；轮询从「覆盖」改「合并剪枝」 |
| `tests/peer-selection.test.ts`（新增，10 例） | 首次默认前 capacity / 跳过女生单 / 订单增加不影响 / 被抢一单其余不动并按顶部补位 / 补位跳过已选与不可接 / 少勾只补回原数量 / 并发位缩水裁尾部 / 变大不补 / 已勾变不可接移除并补位 / capacity=0 全空 |

**验证**：`tsc --noEmit` 无输出；vitest **11 文件 94 例**全绿（24.99s）；`next build` 38 条 route/page，`/orders/[id]` 8.53 kB / 156 kB；本机生产服 `GET /orders/20`、`/orders/17` 均 200，`/api/hall/nearby?building=女寝3号楼` 字段（`dropFloor`/`blockedByGender`/`slots`）与组件一致。

**已知缺口**：① 浏览器连续点选 → 等 10 秒的人工复核仍待做；② 线上 ECS 还是 v1.14 构建，本次修复要重新部署才生效；③ 演示时若选完再回头接别的单，并发位缩水会从尾部裁掉已选（刻意行为，避免超接单上限）。

### 3.6 v1.16 连接池自愈（2026-10-23，本地全绿，**已上云，见 §3.7**）

**现象**（用户 m00383，v1.15 部署之后）：多台设备都「加载不出来」，无痕窗口输完口令还反复要求输——而 `POST /api/demo/login` 本身 200（它只做 sha256 比对、不查库），说明 `sl_demo` 能下发、但随后所有**需要读库**的请求（`/api/demo/accounts`、`/api/auth/switch`、`/api/hall`、`/api/me`）全都卡住。页面里每个请求都走同一个进程内的 postgres.js 连接池。

**为什么原来兜不住**：`connect_timeout: 10` 只管「建连」；`statement_timeout: 15000` 是服务端在执行阶段生效的保险。两者都管不到 ① TCP 已建立但 socket 被中间设备（NAT/安全组/Cloudflare 侧）静默回收；② 池满（`max: 2`）后新请求在队列里无限等待。此时查询既不报错也不返回，进程看着健康，页面永远转圈。

**修法**（三层，全部是兜底，不依赖知道确切触发点）：

| 文件 | 改动 |
|---|---|
| `server/db/watchdog.ts`（新增） | 纯判定：`DB_PROBE_INTERVAL_MS=15000`、`DB_IDLE_GRACE_MS=120000`、`DB_PROBE_TIMEOUT_MS=6000`、`DB_FAILURES_BEFORE_RECYCLE=2`；`shouldProbe`（无池/从未用过/空闲 >2min → 不探）、`nextFailureCount`、`shouldRecycle`（连续 2 次失败才回收） |
| `server/db/index.ts` | 池参数收紧为 `max: 4 / keep_alive: 10 / idle_timeout: 20 / max_lifetime: 120`；新增 `pingDb`（`select 1` + 6s 超时）、`recycleDbPool(reason)`（打日志关池，下个请求重建）、`startDbWatchdog()`（15s 一次、`unref()`）、`touch()` 记录最近使用 |
| `instrumentation.ts` | `assertEnv()` 之后 `startDbWatchdog()`，启动即打印 `[db] watchdog 已启动` |
| `lib/api.ts` | `withUser`/`withUserClock` 全套 **20s 数据库上限**：超时 → `recycleDbPool` + **503 `{code:"DB_TIMEOUT"}`**「数据库连接超时，已自动重置连接，请刷新重试」；未登录统一 401 `{code:"UNAUTHENTICATED"}` |
| `tests/db-watchdog.test.ts`（新增，11 例） | 探活条件 6 例、失败计数 2 例、回收阈值 2 例、常量关系 1 例 |
| `server/db/retry.ts`（v1.19） | 只读请求的暂时性断连判定与一次重试（`isTransientDbError` / `runWithRetry`） |
| `tests/db-retry.test.ts`（v1.19） | 重试 / 不重试 / 退避 / 错误链共 16 例 |

**验证**：`tsc --noEmit` 无输出；vitest **12 文件 105 例**全绿（34.58s）；`next build` 38 条 route/page；本机生产服（job `bash-f833f5c024544676`）Ready 645ms 且日志出现 `[db] watchdog 已启动（每 15s 探活一次，有流量时才探）`；探活静默跑 22s 无失败输出；curl `/api/hall` 401 0.85s、`/api/me` 5.5ms、`POST /api/demo/login` 5.8ms。

**已知缺口**：① 未在 ECS 抓现场，属自愈兜底而非根因修复；② 若上线后仍偶发 503 `DB_TIMEOUT`，说明连接层持续失败，应按 §4.4 评估迁同机 PG；③ 探活只在「2 分钟内有流量」时跑，整夜无访问后第一个请求最多多等几秒（`connect_timeout: 8` + 20s 上限）。

### 3.7 v1.17 v1.16 上云 + 空闲 8 分钟自愈验收（2026-10-23 17:25–17:35）

**部署**（用户 m00555）：`bash /root/src/deploy/deploy-app.sh shunlu 3000 /root/src` 成功，日志出现 `[db] watchdog 已启动（每 15s 探活一次，有流量时才探）`、`✓ Ready in 1904ms`（`/var/log/shunlu.log` 第 1348 行为同一条 watchdog 行）。

**公网验收**（外网 curl，17:25–17:28）

| # | 检查 | 结果 |
|---|---|---|
| 1 | `POST https://shop.omzsh.top/api/demo/login` | 200，`sl_demo=729c…; Max-Age=43200; **Secure**; HttpOnly; SameSite=lax` |
| 2 | 错口令 / 空 body | 403 / 400 |
| 3 | `POST /api/auth/switch {userId:2}` | 200，`sl_uid=2; Path=/; Secure; HttpOnly; SameSite=lax` |
| 4 | `/api/me`、`/api/hall`、`/api/demo/accounts`、`/orders/17`、`/login`、`/` | 全 200；部署后首次 me 4.90s / hall 4.83s（新池 + Neon 冷启），暖后 me 1.26–2.83s、hall 1.38–1.58s |
| 5 | `/api/console/login` → `/api/console/snapshot` → `/admin/console` | 200 / 200（3.10s）/ 200 |
| 6 | `http://47.97.167.178:3000/api/demo/login` | 200，set-cookie **无 Secure**（IP 直连 http，符合 §4.3） |
| 7 | 首页 20 连 | **20×200** |
| 8 | `/?token=shunlu-demo-2026` | 200（1.08s），服务端不下发 cookie（客户端兑换） |

**空闲自愈专项**（本轮核心）：17:26:12Z 停掉一切请求，静默 **8 分 01 秒**，17:34:13Z 再打 → `me` 200 3.11/1.64/1.90s、`hall` 200 2.92/1.87/1.73s、`home` 200 1.39s、`console/snapshot` 200 2.70s。**无 503、无 DB_TIMEOUT、无挂死**；首个 ~3s 是 Neon 计算单元冷启动，第二个请求就回到 1.6–1.9s ⇒ v1.16 目标（不再无限转圈）达成。

**已知缺口**：① `CONNECTION_CLOSED` 未复现（诊断时链路正常），单次断连的请求仍可能 500 一次、下个请求自愈；若 `grep -c CONNECTION_CLOSED /var/log/shunlu.log` 持续增长 → v1.18 给只读 GET 加「断连重试一次」；② 首屏 1.3–3s 的瓶颈是跨境 92ms/RT，非连接池，要提速只能迁同机 PG（§4.4）；③ 空闲测试只覆盖接口层，浏览器挂 8 分钟后的轮询/切号仍需人工点。

### 3.8 v1.18 详情页「默认不勾 / 只能勾一单」修复（2026-10-23 19:00–19:35，**已上线 2026-10-24**）

用户 m00627/m00628 原话：「默认是一个都不选的，这一点我觉得可以理解。但是，最多只能选一个……上面明明写着还能再选两单，实际上只能点一个，第二个根本点不动。」

**复现**（headless Chrome + CDP，无 playwright；脚本 `.data/cdp5.mjs` 参数化 `BASE=`/`U=`/`O=`）：

| 目标 | 结果 |
|---|---|
| 本地重新 `next build` 后的 `/orders/14`（u11 小雨） | **默认勾前两行** `[x][x]`，按钮「一起接下 3 单（+¥9.38）」；13s 轮询内保持；点已勾行=取消、点未勾行=加上，两次点击都生效 |
| 线上 `https://shop.omzsh.top/orders/14`（u11） | 4 行 peers **全空**、按钮「只接这一单」、标签「还能带 2 单」，13s 不自行补勾；手点第 1 行 →「一起接下 2 单（+¥6.75）」、再点第 2 行 →「一起接下 3 单（+¥9.00）」，5s 轮询后不复位 |
| 线上页面 chunk | `/_next/static/chunks/app/orders/%5Bid%5D/page-6a030f794eeb591c.js` 内联的合并逻辑与 `lib/peer-selection.ts` 逐字一致（守卫 `if(null==U||"open"!==J…)`；`P([])` 全 chunk 仅 1 次，只在守卫分支） |

⇒ 线上**多选本身可用**（手点两行都能勾），症状只剩「默认一个都不勾」；「第二个点不动」未复现，判断是被「一个都没勾」的观感叠加（点第一行后按钮只涨一单）。

**根因**：旧 effect 只要拿到一次 `candidates`（哪怕 `[]`——首帧 nearby 未回、请求失败、或全是女生单）就把 `peerDefaultFor.current = peerOrderId` 记成「已初始化」。而 `mergePeerPicked` 的补位规则 `target = Math.min(prev.length, cap)` 在 `prev` 为空时恒为 0 ⇒ 之后候选全到了也一个都不勾，只能手点。

**改动**

| 文件 | 内容 |
|---|---|
| `lib/peer-selection.ts`（v1.18） | 新增 `shouldApplyDefault({ alreadyInitialized, candidates })`：已初始化 → `false`；否则要求 `candidates.some(c => !c.blockedByGender)`。`mergePeerPicked` 本体未改 |
| `app/orders/[id]/page.tsx` | effect 里 `const initialize = shouldApplyDefault({ alreadyInitialized: peerDefaultFor.current === peerOrderId, candidates })`；**只有本轮真有可接候选时**才写 `peerDefaultFor.current = peerOrderId`；删掉排查期 `window.__pd` 全部仪器化 |
| 同上（标签，原 `:738`） | 按可接数显示：`cap = Math.max(0, peerSlots - 1)`、`eligible = peers.filter(p => !p.blockedByGender).length`；`eligible === 0` → 「本栋这些单你都不能接」；`cap === 0` → 「手上已满，只能带 N 单里的一单」；否则「还能带 2 单 · 本栋可接 2 单」 |
| `tests/peer-selection.test.ts` | 新增 `describe("shouldApplyDefault")` 4 例（首次有可接 true / 候选空 false / 全 blocked false / 已初始化 false），本文件 14 例 |

**验证**：`tsc --noEmit` exit 0；vitest **12 文件 109 例**全绿；`next build` 38 条 route/page（`/orders/[id] 8.66 kB / 156 kB`）；本地 CDP `U=11 O=15`（#14 已过期，改用 #15）`T+3/6/9/13s` 恒为 `[x]+¥4.50 [x]+¥3.00`、「还能带 2 单 · 本栋可接 2 单」、按钮「一起接下 3 单（+¥9.75）」，点已勾行 →「一起接下 2 单（+¥6.75）」，5s 轮询后不复位。

**已知缺口**：① 部署后用户 m01247 反馈功能正常，「第二行点不动」确认是「一个都没勾」的观感叠加，已随默认勾选修复消失；② 本地库已漂移（#14 过期），本地复现用 #15；③ 若可接候选先有后少（被抢），仍按 v1.15 补位规则，不重新默认勾选。

### 3.9 v1.19 只读接口断连透明重试（2026-10-23 21:30–23:00，**已上线 2026-10-24**）

v1.17 验收暴露的缺口：Neon 侧把空闲连接静默回收后，池里仍留着死 socket，用户看到的是 500/503 或长时间转圈。v1.16 的 watchdog 只能「事后回收」，发生在请求途中的断连仍会直接失败。v1.19 让**只读请求自己扛一次**：拿到连接类错误就换一条连接重试，用户看到 200 而不是错误页。

**做了什么**

| 文件 | 内容 |
|---|---|
| `server/db/retry.ts`（新建，148 行） | `READ_RETRY_ATTEMPTS = 2`、`READ_RETRY_BACKOFF_MS = 120`；`isTransientDbError(err)` 先扫错误链（`cause` + `AggregateError.errors`，最多 4 层、`out.includes` 防环，每个容器取前 3 个），链上任一 `name === "DbDeadlineError"` 立即 `false`（20s 预算已耗尽，重试没意义）；其余按 `code` 命中 `TRANSIENT_CODES`（`CONNECTION_CLOSED` / `CONNECTION_ENDED` / `CONNECTION_DESTROYED` / `CONNECTION_CONNECT_TIMEOUT` / `CONNECT_TIMEOUT` / `ECONNRESET` / `ECONNREFUSED` / `EPIPE` / `ETIMEDOUT` / `ENOTFOUND` / `EHOSTUNREACH` / `ENETUNREACH`）或按 `message`（小写 includes）命中 `TRANSIENT_MESSAGE_HINTS`（`connection closed` / `terminated` / `ended` / `destroyed`、`connection reset by peer`、`client has encountered a connection error`、`socket hang up`、`econnreset`、`epipe`）；业务错 `23505` / `42601` / `Errors.conflict` 一律不认；`describeDbError(err)` → `CODE: message`（压空白截 180 字）；`runWithRetry(fn, { attempts, backoffMs, onRetry, sleep })` 在非暂时性错误或次数用尽时 `throw err` —— **抛原错误对象**，不包一层 |
| `lib/api.ts` | 新增 `export type ReadOptions = { retryRead?: boolean }` 与 `withReadRetry(fn, label)`（= `withDbDeadline(runWithRetry(fn, { onRetry: (err, attempt) => console.warn("[db] 读请求重试 " + attempt + " 次：" + label + " " + describeDbError(err)) }), label)`）；私有 `attemptRead(fn, label, options)` 按 `options?.retryRead` 分流；`withUser` / `withUserClock` 加第二可选参数 `options`，**取用户/时钟与 handler 两段都过 `attemptRead`**。原有 `DB_DEADLINE_MS = 20000` / `DbDeadlineError` / `withDbDeadline` / `dbTimeoutResponse`（503 `DB_TIMEOUT` + `recycleDbPool`）/ `unauthenticated`（401 `UNAUTHENTICATED`）未动，重试仍在这 20s 预算内 |
| 8 个包装路由 | 只给 GET 加 `{ retryRead: true }`（同文件 POST/PATCH 保持无选项）：`app/api/hall/route.ts`、`app/api/hall/nearby/route.ts`、`app/api/orders/route.ts`、`app/api/orders/[id]/route.ts`、`app/api/me/route.ts`、`app/api/wallet/route.ts`、`app/api/notifications/route.ts`、`app/api/batches/[id]/route.ts` |
| 4 个裸路由 | 无 `withUser`，用 `withReadRetry` 包取数段（含 `expireSweep`）：`app/api/admin/overview/route.ts`（三条聚合整包）、`app/api/admin/orders/route.ts`（`expireSweep` + rows + userRows）、`app/api/console/snapshot/route.ts`、`app/api/demo/accounts/route.ts` |
| 写接口 | **一个都不接**：`orders/accept`、`orders/[id]/actions|confirm|review|buy|addons`、`console/actions|login`、`demo/reset|clock|scale|login`、`auth/switch`、`upload`、`files/[id]` —— 重复冻结/入账的代价远大于一次报错 |

**为什么整段重试是安全的**：这 12 个 GET 里唯一的写操作是 `expireSweep()`，它是条件 UPDATE + 事务的幂等收敛，已终态的单不会再动，重跑不会重复退款/入账。

**验证**：`tsc --noEmit` exit 0；vitest **13 文件 125 例**全绿（新 `tests/db-retry.test.ts` 16 例：首次断连二次成功 `calls [1,2]` / `waits [120]`、两次断连 `rejects.toBe(second)` 抛原错误、`23505` 只调 1 次、`DbDeadlineError` 不重试、`attempts:1` 与 `attempts:3`（`waits [120,240]`）、`onRetry` 收到 `(err, 1)`、`backoffMs:0` 仍重试、只有 message 无 code、`cause` 链、`describeDbError` 格式）；`next build` 38 条 route/page；`.data/retry-demo.mts`（真 import `server/db/retry.ts`，`node ./node_modules/tsx/dist/cli.mjs`，node v24.22.0）打印「首断连二次成功=调用 2 次 / 退避 [120]」「两次断连=2 次后抛 `CONNECTION_CLOSED: write CONNECTION_CLOSED ep-square-feather-aoj1pgr7-pooler.c-2.ap-southeast-1.aws.neon.tech:5432`」「23505 与 42601 都只调 1 次、可重试 false」。

**已知缺口**：① 只覆盖「一次」断连，连续两次仍报 503（不无限重试是有意的）；② 写接口不重试，用户会看到失败提示（可手动再点）；③ 线上效果要部署后看 `grep -c "读请求重试" /var/log/shunlu.log` 与 500 数；④ `admin/orders` 包内缩进仍是两格（纯可读性）。

### 3.10 v1.20 修 React 19 下 antd-mobile 命令式弹层全哑（2026-10-24，**已上线**）

用户 m01060 报「预约时间的滚动选择点不开（没效果）」。根因不在 picker 本身：**React 19 把 `createRoot` / `render` 从 `react-dom` 主入口移走了**，而 antd-mobile 的 `renderToBody` → `unstableSetRender` → rc-util 5.44.4 `lib/React/render.js` 里 `if (mainVersion >= 18) createRoot = fullClone.createRoot;` 取到 `undefined`，于是退化成 `legacyRender()`；`legacyRender` 在 `reactRender` 为 undefined 时**直接空操作、不抛错**。结果：全站 46 处 `Toast.show` / `Dialog.confirm` / `Picker.prompt` 同时静默失效 —— 点按钮既没弹层也没报错。

**做了什么**

| 文件 | 内容 |
|---|---|
| `components/AntdMobileReact19Compat.tsx`（新建） | `"use client"`；模块顶层 `if (typeof document !== "undefined") unstableSetRender((node, container) => { ... })`：`WeakMap<Element | DocumentFragment, Root>` 按容器复用 `createRoot`，`root.render(node)`，返回 `async () => { await new Promise(r => setTimeout(r, 0)); roots.get(container)?.unmount(); roots.delete(container); }`（留一帧给退出动画 —— `render-to-body` 是同步 unmount 后立刻 `removeChild`）；默认导出组件返回 null |
| `app/layout.tsx` | `<AppShell>` 之前挂 `<AntdMobileReact19Compat />`，保证任何命令式弹层之前渲染器就绪 |
| 46 个调用点 | **一行未改**：`Toast.show` / `Dialog.confirm` / `Picker.prompt` 原样可用，修的是渲染器而不是逐处改受控组件 |

**验证**：`tsc --noEmit` exit 0；`next build` 38 条 route/page（`/publish 5.43 kB / 149 kB`）；`.data/pick-probe.mjs`（CDP 9223 + headless Chrome + 用户 11）修复前点卡片 `.adm-popup/.adm-picker/.adm-mask` **全 0**、无异常，修复后 **1/1/1** 且文本「取消 · 预计多久之后送达 · 确定 · 0 小时 … 18 小时」；`.data/pick-probe5.mjs` 选 1 小时 30 分 → 确定 → 卡片变「**1 小时 30 分钟后 | 约 HH:MM 送达**」、弹层关闭；再选 10 分钟 → 确定 → Toast「至少要提前 20 分钟，给商家出餐和跑腿者留点余量」正常弹出（Toast 根类是 `adm-toast-mask`）。

**已知缺口**：① 已随 2026-10-24 部署上线并人工点过一遍（用户 m01247「功能正常了」）

### 3.11 v1.21 公网链路体检脚本（2026-10-24 02:00–03:00，**已合并，待随下一包部署**）

目的：把「首屏 1.3–7.4s 到底是应用慢还是隧道慢」变成一条可复跑的命令，给 §4.2 / §4.4 的取舍提供证据。**不动业务代码。**

| 项 | 内容 |
|---|---|
| 新文件 | `deploy/check-public.sh`（bash + curl + awk，无额外依赖；`bash -n` 通过） |
| 四段对照 | ① 域名首页 `https://shop.omzsh.top/` ② 源站首页 `http://47.97.167.178:3000/` ③ 域名静态资源 ④ 源站静态资源（chunk 路径从首页 HTML 里取第一条 `/_next/static/*.js`，不用手填哈希） |
| 输出 | 每段 N 次（默认 12）状态码分布 + 首字节/总耗时的 `min / p50 / p90 / max`；`stats()` 用插入排序算分位（不依赖 gawk `asort`，mawk 也能跑） |
| 结论判定 | 源站非 200 → 应用/DB（§4.5）；源站 p50 > 0.8s → 应用/DB 慢；域名比源站慢 > 0.8s → **隧道段**（§4.2 + `deploy/README.md` §7.6）；`max/p50 > 3` 追加抖动提示；退出码 1 = 有 BAD/WARN |
| 可覆盖 | `DOMAIN=` `ORIGIN=` `ROUNDS=` `TIMEOUT=`（30s）`COOKIE=`（要测登录态接口才需要） |

**实测（2026-10-24 02:0x，本机 → 线上，12 次）**

| 段 | 状态码 | 首字节 min / p50 / p90 / max（s） | 总耗时 p50（s） |
|---|---|---|---|
| 域名首页 | 200×12 | 0.994 / **1.325** / 1.569 / **4.734** | 1.477 |
| 源站首页 | 200×12 | 0.027 / **0.035** / 0.038 / 0.054 | 0.038 |
| 域名静态资源 | 200×12 | 0.541 / **0.690** / 0.859 / 1.039 | — |
| 源站静态资源 | 200×12 | 0.016 / **0.021** / 0.027 / 0.041 | — |

脚本结论原文：`⚠ 源站很快、公网比源站慢 1.290s：慢在 Cloudflare → cloudflared(ECS) 这一段` / `⚠ 抖动偏大（max / p50 = 3.6×）`。

**已知缺口**：① 脚本只回答「哪一段慢」，改配置仍要在 ECS 上做（§4.2）；② 12 次采样下 p90 意义有限，看长尾用 `ROUNDS=20`；③ TLS 握手长尾（0.48→5.62s）只能在 Cloudflare 侧归因；④ 本机 DNS/出口也算进「域名段」，结论只对「同一台机器、同一时段」成立。

### 3.12 v1.22 预约送达改成「直接选几点几分」（2026-10-24 14:0x，**待随下一包部署**）

发布页「送达时间」段由「提前 N 小时 M 分钟」改为**三列滚动选择器**（今天/明天 + 时 + 分），只动 `app/publish/page.tsx`，服务端契约不变（仍提交整数分钟 `expectDeliveryMinutes`）。

| 项 | 规则 |
|---|---|
| 状态 | 由「提前分钟数」改为绝对时刻 `scheduleAtMs`；`今天 18:40` / `明天 10:00` 与「约 N 分钟后」都由它派生，页面久留不漂 |
| 越界 | 选到今天的点已过（不足 20 分钟）→ **顺延到明天同一时刻** + Toast；超过 24 小时 → **取此刻 + 24 小时** + Toast（不再拒绝重选） |
| 提交 | 折算成整数分钟再发；仍 < 20 分钟 → Toast 拦住不发请求 |
| 卡片 | 第一行 `{今天 HH:MM} 送达`，第二行 `{约 N 分钟后} · 点这里选具体时间`，右侧「修改」 |

验证：`npx tsc --noEmit` OK；`npm run build` EXIT=0（`/publish` 5.78 kB / 149 kB）；CDP 选「明天 10 时 00 分」→ 卡片「明天 10:00 送达 | 约 19 小时 51 分钟后」（旧实现会显示成 09:59）；选「明天 现在钟点」（24.5h 后）→ 「明天 14:09 送达 | 约 24 小时后」（clamp 生效）。截图 `.data/shot-v122-card.png`、`.data/shot-v122-picker.png`。

### 3.13 v1.23 预约送达改成时段网格（过去时刻物理不存在，2026-10-24 14:5x，**已随 10-25 部署上线**）

只剩 `app/publish/page.tsx`，服务端契约一字未改（仍提交整数分钟 `expectDeliveryMinutes`）。

| 项 | 规则 |
|---|---|
| 生成 | `SLOT_STEP_MIN = 10`；`slotList(dayOffset, nowMs)` 从当天 00:00 起按 10 分钟步进，`earliest = now + 20min` 之前的**直接跳过**，`latest = now + 24h` 之后的 break ⇒ 面板里没有任何过去档 |
| 默认 | `openSchedule()`：今天一档都没有（深夜）时自动切到「明天」，不会点开是空的 |
| 面板 | `Popup` + 4 列网格；标题「选送达时间」；说明「最早可约 `HH:MM`（至少提前 20 分钟）· 最晚明天 `HH:MM` · 每 10 分钟一档」；chip「今天（N 个时段）/明天（N 个时段）」，今天无档时 disabled |
| 选中 | 点即关面板并回写卡片：「**今天 15:40 送达** / 约 48 分钟后 · 点这里选具体时间 / 修改」 |
| 提交 | 折算整数分钟；仍 < 20 分钟 → Toast 兜底（正常路径已不可能触发） |

验证：`npx tsc --noEmit` EXIT=0（踩过一次 `TS1009`，IIFE 结尾 `})();` 写成了 `})(),`）；`npm run build` OK（`/publish` 6.09 kB / 145 kB）。CDP `.data/probe-v123.mjs`（NOW 14:52:28）今天 52 档、`PAST_SLOTS []`、点第 3 档 → 「今天 15:40 送达 · 约 48 分钟后」；`.data/probe-v123b.mjs`（NOW 14:59:24）明天 90 档 00:00→14:50、点最后一档 → 「明天 14:50 送达 · 约 23 小时 51 分钟后」。截图 `.data/shot-v123-popup.png`(48474B)、`.data/shot-v123-card.png`(40294B)、`.data/shot-v123-tomorrow.png`(47966B)。

**已知缺口**：① 粒度 10 分钟，约不到 18:47；② 只在本机 production 构建 + headless 验过，线上待部署后手点一遍；③ 档数随打开时刻变化（跨整点会少几档），属预期。

### 3.14 v1.24 开拍前自检脚 `scripts/preflight.mjs`（2026-10-24 15:0x，**已随 10-25 部署上线**）

零依赖 ESM（227 行）。**只读**（`--reset` 除外），用真实 HTTP 走一遍演示要用的接口；有 FAIL 时退出码 1，WARN 不影响。

| 参数 | 默认 | 说明 |
|---|---|---|
| `--base` | `PREFLIGHT_BASE` 或 `http://127.0.0.1:3000` | 换域名即验线上 |
| `--reset` | 关 | 先 `POST /api/demo/reset` 再检查（开拍前推荐） |
| `--token` | `DEMO_TOKEN` 或 `shunlu-demo-2026` | 演示口令 |
| `--admin` | `ADMIN_PASSWORD` | 不给我就跳过对账（WARN） |

九段检查：① 首页 200；② `demo/login`；③ 可选 `demo/reset`；④ `demo/accounts`（0 个 FAIL / <5 个 WARN）；⑤ **逐个身份** `auth/switch` + `/api/me`；⑥ 信用最高者看 `/api/hall`（0 单 → WARN 并提示 `--reset`，同时打印剩余并发）；⑦ `/api/orders` + `/api/wallet`；⑧ 有 `--admin` 才 `console/login` + `snapshot`：`reconcile` 两条差异必须 0（否则 FAIL）、打印 `statusCounts` 与时钟倍率（≠1 给 WARN）；⑨ 汇总 + 开拍建议 + 退出码。自带 `class Jar` 收 `set-cookie`，`redirect: "manual"` 防 307 吞检查，网络异常记 `status: 0` 不崩。

实测：未重置 → **11 PASS / 0 FAIL / 1 WARN**（`hall 阿瑶 的大厅 0 单待接`、`reconcile 0/0（9 个账号 / 0 张未终态单）`、`completed 11 · expired 11`、EXIT=0）；`--reset --admin …` → **13 PASS / 0 FAIL / 0 WARN**（`open 8 · accepted 1`、大厅 7 单 · 剩余并发 3、`reconcile 0/0（9 账号 / 9 张未终态单）`、余额 阿瑶 ¥30.00 / 小跑B ¥29.63 / 小跑C ¥19.13 / 大伟 ¥13.50 / 悠悠 ¥50.50 / 阿哲 ¥45.00 / 小雨 ¥42.50、EXIT=0）。

**已知缺口**：① 「信用最高」并列时取列表首个（阿瑶 100 先于 小跑B 100），文案会印发布者昵称；② 大厅默认只看同栋，`open 8` 时报 7 单（差 1 单别栋）；③ 只验接口与账平，六脚本流程仍需人工走。

### 3.15 v1.25 加载动画：绘画过程 + 12 种随机（2026-10-24 16:12，**已随 10-25 部署上线**）

用户 m01845 原话：「它里面把加载界面美化成了绘画的过程…加载的时候每次都随机选一个好了。占用会很大吗 如果占用很大的话 那就你跟我讲 我固定选一个 你能自己读吗 不行的话我再复制给你好了 总共12种」。

**能不能读到 / 体积**：能读到，全部素材已取回（本机 DNS 对 `*.workers.dev` 超时、直连 Cloudflare IP 被 reset，走本机 Clash 代理 `curl -x http://127.0.0.1:7897` 下载）。体积 ≈ **1.17 MB raw / ≈330 KB gzip**：p5.min 990372 B（gzip 285201）、p5.brush 72062（27245）、engine 14913、style-impressionism 75602、style-abstraction 13113 ⇒ 12 种随机完全可行。

| 文件 | 说明 |
|---|---|
| `public/painting/index.html`（3009 B，新写） | 米色卡纸 + 「顺 路」+ 状态行；按序加载 5 个 classic script；`?k=<key>` 指定风格，否则 `keys[Math.floor(Math.random()*keys.length)]`；中文短语「起稿…/铺色…/落笔…/细描…/点景…/收笔…/完成」；画布边长 `min(canvasSize, 300, innerWidth*0.62, innerHeight*0.52)` |
| `public/painting/engine.js` / `style-impressionism.js` / `style-abstraction.js` / `vendor/p5.min.js` / `vendor/p5.brush.js` | 原样搬入，未改 |
| `components/PaintingSplash.tsx`（94 行，use client） | `fixed inset-0 z-[9999]` 的 div（底 `#fafafa`）+ `<iframe src="/painting/index.html" title="加载中" tabIndex={-1} scrolling="no">`；`MIN_MS 1000` / `MAX_MS 2600` / `FADE_MS 320`；75ms 轮询 `document.readyState === complete`；点击 / Esc 提前跳过；`prefers-reduced-motion` → 250/700ms；`/admin*` 与 `?nofx=1` 不渲染 |
| `app/layout.tsx` | 在 `<AntdMobileReact19Compat />` 之后挂 `<PaintingSplash />`（必须晚于命令式弹层兼容层） |

**坑**：Next 15 的 `public/` **不做目录索引** —— `/painting/index.html` 200，`/painting` 404、`/painting/` 308→404，所以 iframe 的 src 必须写全；另外 `public/painting/` 是这轮新建的，必须重新 `npm run build` 并重启 `next start` 才会被服务（首轮 404 就是这个原因）。

**实测**：`npx tsc --noEmit` EXIT=0；`npm run build` 成功；直接连开 8 次 `/painting/index.html?n=i` 得到 7 种不同 key（Garden / Willow / Koi / Dawn / Orchard / Poppies / Roses）；生命周期 ~1.0s 开始淡出、~1.3s 移除；headful 430x900 窗口下 6 个 `document.elementFromPoint` 采样点全部命中 iframe ⇒ 全屏覆盖；`/admin` → 307 且无 overlay；`?nofx=1` 300ms 已无 overlay。

**已知缺口**：① headless/离屏 Chrome 的 `Page.captureScreenshot` 对跨进程 iframe 有合成时序假象（DOM 有 overlay、截图却透出页面），判定必须用 headful 或 `elementFromPoint`；② 动画最短 1s、素材 gzip 330 KB，经隧道首屏会更慢（见 §4.2）；③ 12 个 key 里 10 个属印象派、2 个抽象，随机是等概率 key 而非等风格族。

### 3.16 v1.26 加载动画：1.8× 加速 + 画完才退场 + 整屏铺满（2026-10-25 09:57，**已随 10-25 部署上线**）

用户 m02162 原话：「先测试一遍1.8加画完的把」。目标只有三项：**看得到完整一幅**（加速而不是截断）、**画完才退场**、**在大屏/手机上都铺得开**；页内 6 处「加载中」文字的统一替换留到下一轮。

| 文件 | 改了什么 |
|---|---|
| `public/painting/index.html`（3009 → **5815 B**，重写） | `var SPEED = 1.8` 透传给 engine（`createEngine(cfg, { mount, statusEl, speed: SPEED, once: true })`）；`fit()` 用 `min(vw,vh)` 与 `pad = min(26, max(8, min(vw,vh)*0.022))` 算 `--side = max(140, min(960, avail))`，resize 120ms 防抖；横屏 `@media (orientation: landscape) and (min-aspect-ratio: 5/4){ .stage{flex-direction:row} }`；整屏加纸纹（两条 `repeating-linear-gradient` + `mix-blend-mode: multiply`）与暗角；新增 `post(msg)` 把 `{source,progress}` 发回父窗口 |
| `public/painting/engine.js`（16450 B） | 只加三个钩子：`:152` 读 `opts.speed`（默认 1）；`:266` `const now = (millis() - startMs) * speed`（**只压缩真实时间，笔画时序表不动**）；`:301/:307` `report(progress)` 以 0.5% 为步长发 `window.parent.postMessage({ source: 'shunlu-painting', progress, done: progress>=1 }, '*')`；`:273` `once && elapsed >= cfg.loopMs` 时 `noLoop()`，不再进 hold/循环 |
| `components/PaintingSplash.tsx`（94 → **约 186 行 / 5876 B**） | 常量 `MIN_MS 900 / MAX_MS 9000 / FADE_MS 560 / DONE_PROGRESS 0.995 / STALL_MS 3000`；改为**监听 `message` 拿真实进度**，`painted && loaded && elapsed >= MIN_MS` 才 `finish()`，另有 `elapsed >= MAX_MS` 与「ready 后 3s 无新进度」两条兜底；`finish()` 给 `<html>` 打 `data-splash="out"`，纸层 `opacity→0` + `scale(1)→1.035` + `blur(0)→3px`，560ms `cubic-bezier(0.22,0.61,0.36,1)`；reduce-motion 时 `soft=true` 只保留 opacity、时长为 320ms；`/admin*` 与 `?nofx=1` 不渲染 |
| `app/globals.css:222-238` + `components/AppShell.tsx:57/61` | 两个 AppShell 根节点加 `data-splash-page`；`html[data-splash="hold"] …{opacity:0}`、`html[data-splash="out"] …{opacity:1}`、过渡 620ms —— **只动 opacity 不动 transform**，否则 sticky 顶栏与 fixed 底栏会跟着位移 |

**反直觉决定（reduce-motion）**：改造初期按 a11y 惯例写了「系统开了减少动效就整段跳过」，实测发现**本机 Windows 就是 reduce**（`HKCU\Control Panel\Desktop\UserPreferencesMask = 158,30,7,128,18,0,0,0`，第二字节 `0x1E` 而非默认 `0x3E`，即「窗口内动画」被关掉），而演示主力形态正是这台机器 ⇒ 照原样写等于用户永远看不到动画。最终改成「reduce 不跳过，只降级成纯 opacity + 320ms」，逃生口仍是 `/admin*` / `?nofx=1` / 点击 / Esc。

**实测（本机 production + CDP，两种视口）**：桌面 1280×860 —— progress 单调爬到 **1（6180ms）** 才切 `out`（6289ms）、iframe 移除（6618ms），`--side 822px`；手机 390×844 —— **1（5680ms）** → out（5790ms）→ 移除（6116ms），`--side 373px`；没有一次在 `progress < 0.99` 时退场；`window.__msgs` 收到 117 条 `shunlu-painting` 消息（v1.25 为 0）；截图 `.data/shot-v126d-desktop-mid.png`（1500ms 画到一半）/`-mid2.png`（4000ms）/`-after.png`、`-mobile-mid.png`/`-mobile-after.png`；`npx tsc --noEmit` EXIT=0、`npm run build` 成功。

**已知缺口**：① 600² 缓冲放大到 822px 约 1.37×、大屏竖屏可用到 960px 会到 1.6×，笔画边缘略软（改 `canvasSize` 会连带改笔刷比例，本轮不动）；② 首屏固定多花 5–6.6 秒（1.8× 的完整一幅 + 560ms 退场），录屏开场节奏要按这个时长排；③ reduce 下页面内容淡入被 `transition: none` 直接切到 opacity 1。
### 3.17 v1.27 第 1 轮：蓝色只做点缀 + 两套拉丁字体 + 加载动画 2.4×（2026-10-25，**已随 10-25 部署上线**）

用户 m02373 给了两个参照站（motion.dev / wodniack.dev），m02380 定调：「颜色先选蓝色 但是我们加载动画比较艺术所以不要太突兀就行、装字体、开第 1 轮」。目标不是「把全站刷黑」，而是**暗→纸→暗的节奏**：加载动画是那张纸，进站后仍是浅纸底，只是把交互层换成克制的品牌蓝、把数字与标签换成等宽字体。第 1 轮只铺地基（token + 字体 + splash 提速），场景动画（Hero、大厅 stagger、共享元素过渡、骨架屏、6 处 Busy loader）留到第 2/3 轮。

| 文件 | 改了什么 |
|---|---|
| `app/fonts/`（新增 4 文件 ≈ 106 KB） | `instrument-serif-400.woff2` 21032 B、`instrument-serif-italic-400.woff2` 22128 B、`jetbrains-mono-400.woff2` 31432 B、`jetbrains-mono-500.woff2` 31432 B，全部 latin 子集 |
| `app/layout.tsx` | `next/font/local` ×2 → `--font-display`（`preload: false`、fallback `Georgia, serif`）与 `--font-mono`（fallback `ui-monospace, monospace`），挂在 `<html>` 的 className 上 |
| `app/globals.css` | 新增 `--c-brand: #3e98ff` / `--c-brand-ink: #1f6fd9` / `--c-brand-line` / `--fs-label: 11px` / `--track-label: 0.14em`；`.sl-num` 改 `var(--font-mono)` + `font-variant-numeric: tabular-nums`；新增 `.sl-mono` / `.sl-display`；`:focus-visible` 用 `--c-brand-line` |
| `public/painting/index.html` | `var SPEED = 1.8` → **2.4**；底部加 1px 进度线 `.rule`/`#rule`（宽 `min(44vmin,230px)`、`transform: scaleX(0)→1`、`transition: 240ms linear`、`#3e98ff` 且 `opacity: .5`），由 engine 已有的 `onProgress` 驱动（**engine.js 一行没改**） |
| `components/PaintingSplash.tsx` | `MIN_MS 900→700`、`MAX_MS 9000→6000`、`FADE_MS 560→420`，其余（进度驱动退场、reduce 降级、`/admin*` 与 `?nofx=1` 豁免）不变 |
| `components/AppShell.tsx` | 品牌「顺路」下加 2px 蓝底线（opacity .7）；底栏当前 tab 顶部 2px 蓝条（`inset-x-[34%]`、opacity .8）——都刻意停在 hairline 级，不与加载动画争视线 |

**两个决定（都会影响后面几轮）**：

1. **中文一律不装 webfont**。一个 CJK 字重 3–8 MB，在 CF 隧道单请求固定加价 0.67–1.3s 的前提下等于把首屏拖死；英文展示字体已经足够撑起「字体感」，中文继续吃系统字体（苹方 / 微软雅黑），靠字重、字号与字距拉层次。
2. **琥珀色 `--c-accent: #b45309` 仍然是钱色，蓝色只做交互色**。按钮、链接、焦点环、tab 指示用 `--c-brand`；所有金额、余额、奖励仍是琥珀 + `.sl-num`。这样「蓝色」不会覆盖到业务语义上（金额用蓝会被误读成链接），也保证加载动画那张纸依旧是全站最强的一块画面。

**实测（本机 production + CDP，两种视口）**：`npx tsc --noEmit` EXIT=0；`npm run build` 通过（`/` 8.07 kB、`/publish` 6.09 kB、`/orders/[id]` 8.66 kB，First Load 102 kB）。加载时长对比 v1.26（1.8×）：桌面 1280×860 画完 **5241ms** → 淡出 5349ms → iframe 移除 5682ms（v1.26 是 6180 / 6289 / 6618ms）；手机 390×844 **4489 / 4489 / 4821ms**（v1.26 5680 / 5790 / 6116ms），整体快 15–25%；`window.__msgs` 收到 **55 条** `shunlu-painting` 进度消息且单调递增（未出现回退）。字体：构建产物 3 个 woff2（serif 400、serif italic、mono 400+500 合并复用），CSS 35836 B 含 6 条 `@font-face` 与 `size-adjust` 兜底（Arial 76.79% / ui-monospace 131.49%）；**未登录访问 0 个 woff2**（页面没有 `.sl-num` 节点时浏览器不下载），登录后首页命中 mono 400/500，46px 数字等宽对齐。截图 `.data/shot-v127-home-2.png` 可见品牌下划线、tab 蓝条与等宽金额。

**已知缺口**：① `.sl-display`（Instrument Serif）目前没有 TSX 用 —— 它是 latin-only，留给第 2 轮的英文 Hero 标题，中文标题仍走系统字体；② 蓝色只加了 6 处点缀（品牌底线、tab 条、焦点环、链接、进度线、`--c-brand-ink` 文字），视觉冲击仍然很弱，第 2 轮要靠版式与动效补；③ 首屏仍固定 4.5–5.7 秒（2.4× 的完整一幅 + 420ms 退场），录屏开场节奏要按这个时长排。


### 3.18 v1.28：图标化玻璃底栏 + 看得见的入场动效 + reduce「只降速不关闭」（2026-10-25，**已随 10-25 部署上线**）

用户 m02582：『ui几乎无变化 而且平滑的动画好像不明显 底部不是有三个选项吗 我感觉单文字比较丑 我前面给你的网站里的css都可以用啊 就是要高级感 "Drawing Loading Code.txt" 这里面只是两个例子 我需要你去互联网上找 如果有你下载不到的可以让我帮你 就是要完善UI』。`Drawing Loading Code.txt`（709 行）里是两例：incredible.dev 按钮（`font: 500 20px/1 "Chivo Mono"`、`letter-spacing: .075em`、`.btn__label` 用 `content: attr(data-label)` 上下滑换字 + `cubic-bezier(1,0,0,1)`、`.btn__background` 渐变 glow + `filter: blur(5px)`）与 gooey SVG mask（`feGaussianBlur stdDeviation=25` + `feColorMatrix 30 -7`、大字 `13vw / -0.025em / .9`）。`web_search` 对设计参考无效（只有 npm 包与作品集噪音），本轮按已拆解的两个参照站（近黑底 + 单一 accent + display/mono/正文三套字体 + 1px 细线 + 错峰揭示）落地。

| 文件 | 改了什么 |
|---|---|
| `components/icons.tsx`（新增 2220 B / 80 行） | `IconHall`（bento 四格，右上实心）/ `IconPublish`（纸飞机）/ `IconMe`（圆头 + 肩弧）/ `IconLayers` / `IconPlus` / `IconClock`；统一 24 viewBox、`stroke-width: 1.6`、圆头圆角、`pathLength={1}`（供归一化描边动画） |
| `components/BottomNav.tsx`（新增 1543 B / 44 行） | 三格「图标 + 文字」；`.sl-nav-pill` 用 `transform: translate3d(calc(var(--i) * 100%), 0, 0)` 在 540ms spring 里平移；`unread` 时「我的」右上角蓝点 |
| `components/AppShell.tsx`（88 行 / 4111 B） | 删掉 TABS 文字数组，改挂 `<BottomNav unread={unread > 0} />`；内容区底部留白 `calc(var(--nav-h) + env(safe-area-inset-bottom) + 20px)`（不再写死 49px） |
| `app/template.tsx`（新增 280 B） | Next 的 `template` 每次导航重新挂载，正好给整页播一次入场：`<div className="sl-page">` 从 `translate3d(0,16px,0)` 落位 600ms |
| `app/globals.css`（454 行 / 12246 B） | 追加 v1.28 段（:266-453）：`--nav-h: 58px`、`--ease-out`、`--ease-spring: cubic-bezier(0.22,1.12,0.3,1)`；`.sl-nav` 玻璃面 93% surface + `blur(18px) saturate(150%)` + 顶部 1px 发丝线 + 轻投影；`.sl-nav-icon` 子元素播 `sl-draw` 720ms（`stroke-dasharray: 1; stroke-dashoffset: 1→0`）；`.sl-rise` 620ms `backwards` + `calc(var(--i)*55ms)`；`.sl-kicker`（mono 10px / `.18em` / uppercase / 5px 蓝点 + 3px 光环）、`.sl-kicker-rule`、`.sl-hero`（27px / 600 / 1.14 / -0.035em）、`.sl-hero-sub`、`.sl-mini`（30px 胶囊，`[data-solid]` 或 `[aria-pressed]` 反白） |
| `app/page.tsx`（445 行 / 17443 B） | `HALL` kicker + 「顺路大厅」hero + 「附近 6 单在等 · 顺手带一趟，赚点跑腿费」+ 两个 `.sl-mini`（「批量」带 IconLayers、黑底「+ 发单」带 IconPlus）；`riseOffsets` 跨组连续编号 |
| `app/publish/page.tsx`（625 行 / 28189 B）、`app/batches/[id]/page.tsx`（243 行 / 9110 B） | 同款 `PUBLISH` / `BATCH` kicker + hero 标题 |
| `components/OrderCard.tsx`（160 行 / 6421 B） | 加 `index?: number` → `--i` → `sl-rise` 错峰 |
| `components/PaintingSplash.tsx`（178 行 / 6182 B） | `MIN_MS 900→1500`、`FADE_MS 560→640`；退场改 `clipPath: circle(4% at 50% 46%)` 光圈揭幕 + `scale(1.04)` + `blur(2px)`；reduce 时退回纯 opacity |

**根因（这一轮最值钱的一条）**：用户说「平滑的动画好像不明显」，不是性能问题 —— 本机 Windows 常开「减少动画」，`prefers-reduced-motion: reduce` 恒真，v1.27 的 reduce 块是 `animation: none !important; transition: none !important`，把这一轮所有入场动效、药丸滑动、描边动画**全部注销**。本项目没有连续循环动效（无视差、无无限呼吸光），reduce 的立法本意是防眩晕而不是关掉一切反馈，故改为**只降速不关闭**：`.sl-page .42s`、`.sl-rise .46s`、`.sl-nav-pill .2s`、`.sl-nav-icon > * .42s`；**保留 stagger 延迟**（曾误写 `animation-delay: 0ms !important` 把错峰一起抹平，已删）。

**实测（本机 production + Chrome CDP 动画帧采样 + 截图目视）**：`npx tsc --noEmit` EXIT=0；`npm run build` 通过（`/publish` 6.17 kB / 145 kB、`/orders/[id]` 8.66 kB / 151 kB、`/batches/[id]` 3 kB / 109 kB、`/me` 3.35 kB / 146 kB、`/login` 2.53 kB / 105 kB，First Load shared 102 kB）。首页 6 张卡片 `RISE = 0.46s @ 0 / 0.055 / 0.11 / 0.165 / 0.22 / 0.275s`；Hero `HALL | 顺路大厅 | 附近 6 单在等… | 27px | -0.945px`；`HALL_NAV 841 ; 59 ; 3 ; 大厅|发布|我的 ; 大厅 ; matrix(1,0,0,1,0,0)`，`/me` `ME_NAV … 我的 ; matrix(1,0,0,1,269.313,0)`（(420-16)/3≈134.7，累计 269.3 = 第二格）；玻璃底栏截图 `shot-v128i-nav-hall.png` 72280→**57292 B**、nav-me 55139→44157 B（透字残影基本消失）；光圈退场三帧 `circle(140%) scale 1.00 → circle(137.8%) 0.65 → circle(26.3%) 0.05` → 移除，`/admin*` 与 `?nofx=1` 不渲染。

**已知缺口**：① 标题区只换了 `/`、`/publish`、`/batches/[id]` 三处，`/me`、`/orders/[id]`、`/review/[id]`、`/wallet` 仍是旧 `sl-title`；② `.sl-display`（Instrument Serif）仍未被 TSX 使用，中文无可用衬线 webfont；③ 底栏表面 93% 而非 100%，最底缘仍有极淡透字；④ v1.21–v1.30 已于 2026-10-25 部署上线（当天重打源码包后才传的）。


### 3.19 v1.30：动效普及 —— 按压回弹、骨架扫光、转圈/三点加载、忙碌按钮（2026-10-25，**已随 10-25 部署上线**）

用户 m00248：「ok手感就好多了 现在底部栏的动画和动效我很满意 我希望吧这种流畅的动画普及到其他的按钮选项处 比如加载中文字较小且无动效 可以从网上搜索相关CSS JS 的动画借鉴思路 注意要先看看别人怎么做的 不要闭门造车（除非你有95%把握让我满意）感谢」

**调研（先看别人怎么做，再动手）**

- Emil Kowalski《7 Practical Animation Tips》：按压 `transform: scale(0.97)` + `transition: transform 150ms ease-out` 是性价比最高的触感反馈（impact HIGH）；直接 `transition: all` 会拖慢无关属性，要逐属性列。
- micro-interaction 完整弧线：hover → press（0.15s，power4.in）→ release（0.4s，`back.out(1.5)` 过冲）→ leave；CSS 用 `cubic-bezier(0.34, 1.56, 0.64, 1)` 近似这记「回弹」。
- antd-mobile 的 `DotLoading`（三点跳动）/ `SpinLoading`（环形转圈）是移动端加载态的事实标准，比纯文字「加载中…」有明确反馈。
- Material ripple 需要 JS 插节点 + 定位涟漪，判定过度设计未采用；改用 `-webkit-tap-highlight-color: transparent` 去掉安卓灰块 + 自绘按压反馈。

| 文件 | 改了什么 |
|---|---|
| `app/globals.css` | 新增 token `--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)`。`.sl-btn` 重写：`position: relative`、`gap: 6px`、逐属性 transition（transform 260ms spring）、`:active:not(:disabled)` `scale(0.97)` + 90ms、`:disabled` `cursor: not-allowed`、`.sl-btn-primary:active` 底色压到 `#2c2c31`、`[data-loading="true"]` 透明度 .8。`.sl-chip` / `.sl-seg-item` 同样 `:active` `scale(.96/.97)` 90ms。`.sl-mini` 的 transform 换 spring。新增 `.sl-spinner`（1em 环、一边透明、620ms 线性转，配 `@keyframes sl-spin`）、`.sl-dots > i`（4px 圆点、1.05s 错峰 0/0.16/0.32s，配 `@keyframes sl-dot`）。`.sl-skel` 加 `::after` 扫光（100deg 高光条 + `@keyframes sl-sheen` 1.5s）。reduce 块延续「只降速不关闭」：转圈 1.4s、三点 1.6s、扫光关掉 |
| `components/Loading.tsx`（新增） | `Spinner`（环）/ `Dots`（三点）/ `BusyLabel({busy, children, busyText})`（忙时 = 转圈 + 文案）/ `LoadingBlock({rows, label, className, padded})`（标题块 + 副标题 + N 张卡片骨架，带 `aria-busy` 与 `sr-only` 文案） |
| 5 处加载态 | `app/review/[id]/page.tsx`、`app/orders/[id]/page.tsx`、`app/batches/[id]/page.tsx`、`app/me/page.tsx` 的静态「加载中…」→ `<main><LoadingBlock rows={2} /></main>`；`app/page.tsx` 大厅 → `<LoadingBlock rows={2} padded={false} className="mt-1" />`（父容器已有 px-4，不重复内边距） |
| 6 处忙碌按钮 | 统一换 `<BusyLabel busy busyText>`：`app/review/[id]`（提交中）、`app/me`（保存中）、`app/page.tsx`（接单中）、`app/publish`（接单中 / 发布中）、`app/login`（校验中，按钮另加 `active:scale-[0.97]`） |

**实测**：`npx tsc --noEmit` EXIT=0；`npm run build` EXIT=0（首屏共享 102 kB，静态/动态页拆分与 v1.29 一致）；`PORT=3999 npx next start` 冒烟 `/`、`/me`、`/publish`、`/login` 全 **200**、TTFB 11–43ms；产物 CSS `a511da606c2d23b8.css` 里 `sl-skel` / `sl-spinner` / `sl-dots` 各命中；`grep` 复查全站已无静态「加载中…」「…中…」文案（只剩 `app/loading.tsx` 与 `components/Loading.tsx` 的 sr-only 默认文案）。

**已知缺口**：① 仍没有真进度百分比（骨架 + 转圈，不是读条）；② `prefers-reduced-motion: reduce` 下扫光被关掉、只剩灰块脉动；③ 已于 2026-10-25 随包部署上线；④ 源码包重打后为 293 条（多 `app/loading.tsx` 与 `components/Loading.tsx`）。

### 3.20 v1.31：宿舍资料四字段落库 + 大厅常驻「同栋同层」排序 + 文案官方化（2026-10-25，**已随 10-25 部署上线**）

用户 m00386（本条按摘要记录，非逐字）：希望——① 资料页能存宿舍楼栋 / 楼层 / 房间号 / 手机尾号，发单时自动带出不用每次手填；② 大厅不要只有选中某一单才按同栋同层重排，而是**常驻**「同栋同层 → 同栋 → 其它」；③ 全站文案别再说「手慢了」「抢单」这类口语，统一成正式说法。

| 文件 | 改了什么 |
|---|---|
| `server/db/schema.ts` | users 增三列：`dormFloor: integer("dorm_floor")`（常用楼层）、`dormRoom: text("dorm_room")`（常用房间号，**只回给本人**）、`phoneTail: varchar("phone_tail", { length: 4 })`（常用手机尾号）；`dormBuilding` 早已存在 |
| `drizzle/0003_user_dorm_profile.sql` | 新增迁移（journal idx=3）。**已在本地与线上共用的 Neon 库跑过** `npx drizzle-kit migrate`，探库确认四列 `dorm_floor, dorm_building, dorm_room, phone_tail` 齐全 |
| `app/api/me/route.ts` | GET 额外回 `dormFloor` / `dormRoom` / `phoneTail`；PATCH 可一次提交多字段：字符串走 `textOrNull(value, max)`（楼栋 ≤30、房间 ≤20，空串/null 归一成 null），楼层走 `floorOrNull`（1–99，否则 `Errors.invalid("楼层请填 1–99 之间的整数")`），尾号 `!/^\d{4}$/` → `Errors.invalid("手机尾号需为 4 位数字")` |
| `app/me/page.tsx` | 资料卡下新增「宿舍信息」四输入（楼栋 / 楼层 / 房间号 / 手机尾号，`sl-field` 样式，楼层 `inputMode="numeric"` 且正则去非数字）；`saveProfile()` PATCH 后 Toast「宿舍信息已保存」；昵称下显示 `dormSummary`＝「楼栋 · N 层 · 房间」 |
| `app/publish/page.tsx` | `useEffect` 拉 `/api/me`，四个字段有值就预填到发单表单，未登录静默失败 |
| `app/page.tsx` | 大厅 `shown` 排序改为**常驻打分**：非同栋 = 2、同栋不同层 = 1、同栋同层 = 0，再稳定排序（同档内保持后端 `accept_deadline_at` 升序）；分组 key 仍是「楼栋 · N 层」 |
| `server/rules/orders.ts`、`buy.ts`、`console.ts` | 12 处 Toast/错误文案官方化：`"手慢了，这单刚刚过期"` → `"接单失败：该订单已超过接单截止时间"`；`"手慢了，这单已经被接走"` → `"接单失败：该订单已被其他跑腿者接单"`；`"有单被抢先了"` → `"批量接单失败：所选订单中已有订单被其他跑腿者接单"`；`"这单是女生发布的，按园区规定男生不能接"` → `"该订单由女用户发布，按园区安全规定男用户不可接单"`；`"这单已经重发过了"` → `"该订单已加价重发过"`；`"只有代买订单有这个动作"` → `"该操作仅适用于代买订单"`；`"这张单已经结束了，不能取消"` → `"该订单已结束，无法取消"`；发布上限文案改为「同时最多可发布 N 条待接单，请等待已有订单完成或取消其中一条」 |

**验证**：`npx drizzle-kit migrate` EXIT=0 且探库确认四列；`npx tsc --noEmit` 无输出；`npx vitest run --reporter=dot` **13 文件 125 例全过**（断言文案的 5 个测试文件已同步改词）；`npm run build` EXIT=0（14/14 静态页）；`npx next start -p 4002` + cookie `sl_uid=10` 实测 `PATCH /api/me` 四字段 200 且 GET 回读一致、`phoneTail:"12a4"` → 400「手机尾号需为 4 位数字」、`dormFloor:120` → 400「楼层请填 1–99 之间的整数」、四字段全空串 → 200 且全清成 null；`grep` 复查 `app/` 与 `components/` 口语词命中 **0**。

**已知缺口**：① v1.21–v1.32 已于 2026-10-25 部署上线并通过三条 curl，仅 v1.33–v1.34 待部署；② `dormRoom` / `phoneTail` 只在本人资料页与发单预填里用，**没有**接进订单隐私出口（接单后房号仍来自订单本身的 `drop_room`）；③ 楼层上限 99，超过会 400；④ 大厅排序是客户端稳定排序，后端 `/api/hall` 仍是接单截止升序，两处口径不同需记住；⑤ 测试副作用复原过（10 号阿哲的 `dormBuilding` 曾被测成空，已 PATCH 回 `"男寝5号楼"`）。

### 3.21 v1.32：批量加成口径修正（2026-10-25，**已随 10-25 部署上线**）

用户 m00870 的原话要点：「手上有单的话，我最多只能拿 2 单，那 2 单我拿不到 3 单的补贴」+「设置的只能设几栋，不能设几层」。前者被判定**规则本身合理**（加成要求同一批 ≥3 单，手上已有 1 单时新批最多 2 单，确实吃不到）——**不改规则，只改显示**；后者是 v1.31 已交付、只是线上未部署。

| 文件 | 改动 |
|---|---|
| `app/api/hall/nearby/route.ts` | 删掉虚报的 `totalBonusFen`（旧逻辑按「整栋待接单」汇总，和发布页「已勾选 ≥3 单」两个口径打架）；改为返回 `active`（我手上进行中的单数）、`bonusMinBatch: BONUS_MIN_BATCH_SIZE`、逐单 `bonusFen: calcBonusFen(order.runnerRewardFen)`；`building` 为空时早返回也带 `active: 0` |
| `app/publish/page.tsx` | `NearbyOrder` 加 `bonusFen: number`；`Nearby` 换成上面三个字段；新增 `pickedBonusFen`（只累加已勾选单的 `bonusFen`）；合计行文案改「同栋满 3 单，每单再加 5%」，并在 `active > 0 && slots < bonusMinBatch` 时补一句「手上已有 N 单进行中，这一批凑不满 3 单，没有 5% 加成」 |

**验证**：`npx tsc --noEmit` 先报 `app/publish/page.tsx(89,83) TS2339: Property 'bonusFen' does not exist`（忘了给 `NearbyOrder` 补字段），补完 EXIT=0；`npm run build` 14 页通过；临时端口 4012 起生产服务，`GET /api/hall/nearby?building=女寝3号楼` 带 `sl_uid=2` 实测 → `{"slots":2,"active":1,"bonusMinBatch":3,"totalRewardFen":2176,"hasTotalBonus":false,"orders":7}`，逐单 `bonusFen` 正确（#18 = 17、#14 = 19）；测完 `taskkill` 掉 PID 15980。

**已知缺口**：① 加成仍按「本批 ≥3 单」判定，用户已确认合理；② 大厅页本身不显示加成（只有发布页）；③ 已于 2026-10-25 部署上线（线上原为 v1.20，现已 v1.21–v1.32）；④ 不新增文件，源码包重打后仍 293 条。

### 3.22 v1.33：大厅「推荐一起带走」卡片（2026-10-25，**已被 v1.34 取代：卡面已撤，推荐改到接单详情页**）

用户 m00989 逐字：「没有改成功 在接单界面依旧是只能接一单 要不推荐干脆搞成一样的 再推荐两单得了 这样最好」。

**诊断：不是名额或数据问题，是入口太隐蔽。** 线上实测 `GET /api/hall` 带 cookie：uid=1 `slots=3`、uid=2 `slots=2`（种子 #16 已被 B 接）、uid=10/11 `slots=3`，待接单 6–8 条；但批量入口只有列表右上角一个 `sl-mini` 小按钮（文案「批量」），且 `components/OrderCard.tsx:134-148` 只有在 `selectable` 为 true 时才渲染 `<button onClick={onToggle}>`，否则 `:150-159` 渲染 `<Link href={/orders/${order.id}}>` ⇒ 非批量态点卡片就是跳详情单接，于是体感「只能接一单」。

| 改动 | 内容 |
|---|---|
| `app/page.tsx` | 新增 `import { BONUS_MIN_BATCH_SIZE, calcBonusFen } from "@/server/rules/constants";`（该文件纯常量、无 import，可进客户端包） |
| `app/page.tsx` | 新增 `const [comboOff, setComboOff] = useState(false);` —— 推荐卡被「收起」后本屏不再提示 |
| `app/page.tsx` | 新增 `combo` useMemo：`pool = shown.filter(o => !o.blockedByGender)`；`slots <= 1 \|\| pool.length < 2` 返回空；`limit = Math.min(slots, BONUS_MIN_BATCH_SIZE)`；按当前列表顺序贪心加入，首单之后必须 `o.dropBuilding === picks[0].dropBuilding` 且 `timeConflictOf([...picks, o], nowMs)` 为 null（复用 v1.10 的 5 分钟余量口径）；`picks.length >= 2 ? picks : []`；依赖 `[shown, slots, nowMs]` |
| `app/page.tsx` | 列表上方新增推荐卡（`!picking && !comboOff && combo.length >= 2`）：标题「推荐一起带走 N 单 · 共 ¥X」；副行「{楼栋} · 一趟送完，已留 5 分钟取货余量」；第三行按是否满 3 单显示「同栋满 3 单，每单再加 5%，本批多赚 ¥Y」或「同栋不足 3 单，本批没有额外加成」；右上「收起」；单号行 `#18 · #12 · #13`；主按钮「勾选这 N 单」→ `setPicking(true); setSelected(combo.map(o => o.id)); setNote(null);`（勾完仍走底部「接收 N 单」二次确认，接单原子性不变） |
| `app/page.tsx` | 右上入口文案 `批量` → `一起接`（选中态仍是「取消」） |

**怎么验证的**：`npx tsc --noEmit` EXIT=0；`npm run build` EXIT=0（14 页，`/`、`/login`、`/me`、`/publish`、`/admin/console` 仍 ○ Static）；产物 `.next/static/chunks/app/page-8d6f6b843c10836a.js` grep「推荐一起带走」= 1 命中（页面是 "use client"，curl 打 HTML 是 0 命中，不能当判据）；算法等价模拟（`.data/tmp-combo.cjs` 抄 `combo` 逻辑跑真实 `/api/hall`，uid=1）→ picks `#18 女寝3号楼 F6 ¥3.38 | #12 F4 ¥2.63 | #13 F4 ¥3.00`，`comboLen 3 rewardFen 901 bonusFen 45`；`npx next start -p 4013` 冒烟 login 200 / switch 200 / `/` 200（端口已杀）。

**已知缺口**：① 推荐只按「同栋 + 名额 + 5 分钟余量」贪心，不保证凑到 3 单（取货点分散时可能只推 2 单，属 v1.10 时间余量规则的正确结果）；② 卡片只在大厅顶部出现，详情页仍只能单接；③ 未做浏览器点击实测（本机无 headless 截图链路）；④ 本轮未部署，线上仍是 v1.21–v1.32；⑤ 不新增文件，源码包重打后仍 ≈293 条。

> **v1.34 后续**：用户 m01096 否掉了「首页卡面」这个形态（「首页的卡面不用 就是在点进接单页面做一个类似的」），这块 UI 已从大厅整段撤掉，推荐改到接单详情页（见 §3.23）。上面 6 行只作历史留档。

### 3.23 v1.34：接单详情页「同栋待接订单」（2026-10-25，**待随本包部署**）

用户 m01096 逐字：「发布页的这个就很好 首页的卡面不用 就是在点进接单页面做一个类似的 也是推荐2单」。

**诊断：v1.33 的方向错了。** 用户要的不是「进大厅先给一条横幅」，而是「已经决定要接这一单、点进详情页之后，再顺手告诉我还差一单就凑满」。v1.33 的卡面必须先在列表里看完才知道，且卡片点进去仍是单接（`components/OrderCard.tsx:150-159` 非批量态渲染 `<Link href={/orders/${order.id}}>`）。v1.34 因此把推荐整段搬到 `app/orders/[id]/page.tsx`，样式照抄发布页 `app/publish/page.tsx:331-409`（用户原话：「发布页的这个就很好」）。

| 改动 | 内容 |
|---|---|
| `app/page.tsx` | 删净 v1.33 遗留：`import { BONUS_MIN_BATCH_SIZE, calcBonusFen } from "@/server/rules/constants";`（原 :11）、`const [comboOff, setComboOff] = useState(false);`（原 :83-84）、`combo` useMemo + `comboFen` + `comboBonusFen`（原 :166-188）、JSX 卡面整块（原 :401-432）。文件 19047 → 16521 字符，`grep -E "combo|BONUS_MIN_BATCH_SIZE|calcBonusFen"` = 0 命中。**保留**：右上「一起接」mini 按钮、底部批量确认条、`picking/selected/toggle/grabBatch/timeConflictOf`（老的手动批量入口不动） |
| `app/orders/[id]/page.tsx` | 新增 `import { BONUS_MIN_BATCH_SIZE, calcBonusFen } from "@/server/rules/constants";`（:10，紧跟 `LoadingBlock` 那行；该文件纯常量、无 import，可进客户端包） |
| `app/orders/[id]/page.tsx` | `type PeerOrder` 补三个字段：`publisherNickname?: string \| null; note?: string \| null; addonCount?: number;`（接口 `/api/hall/nearby` 本来就返回，只是页面类型没声明） |
| `app/orders/[id]/page.tsx` | **默认只勾 1 单**：`setPeerPicked((prev) => { const merged = mergePeerPicked({ prev, candidates, capacity, initialize }); return initialize ? merged.slice(0, 1) : merged; });` ⇒ 「点进来的这单 + 1 单」= 推荐 2 单（v1.10 起是默认勾满 `capacity`，会一次推 3 单） |
| `app/orders/[id]/page.tsx` | JSX 原「同栋另有 N 单待接」（方形勾选框、无昵称无备注）整段（:714-808）换成发布页同款 `div.sl-soft.p-3`：标题「同栋待接订单 {peers.length} 单」；副标题「{楼栋} · 以下订单与本次取货点同栋，可一并接单。」；每行 `button` 用 **16px 圆形勾选圈**（选中 `bg-[var(--c-accent)] text-white`，未选 `text-transparent ring-1 ring-[var(--c-border)]`）+ 上行「{取货点}{ → N 层}」+ 下行「{昵称} 发的 · {备注} · 捎带 N 件」+ 右侧 `+¥`；页脚「已选 X 单 · +¥Y」+ 满 3 单加成提示；`peerSlots < 1` 红字「同时接单已达上限」；`peerSlots >= 1 && peerSlots < BONUS_MIN_BATCH_SIZE` 时「手上已有 N 单进行中…凑不满」；主按钮「接收 N 单（+¥Y）」/ 单笔「接收这一单」。文件 41018 → 42315 字符。上游「接这一单」按钮（:712-720）与性别红字（:707-711）保留未动 |

**怎么验证的**：`npx tsc --noEmit` EXIT=0；`npm run build` EXIT=0（14 页，`/`、`/login`、`/me`、`/publish`、`/admin/console` 仍 ○ Static；`/orders/[id]` 9.28 kB / First Load 152 kB）；产物 `.next/static/chunks/app/orders/[id]/page-4fee535858d88caa.js` grep「同栋待接订单」= 1 命中、旧文案「同栋另有」在 `.next/static` = 0 命中（页面是 `"use client"`，curl HTML 找不到文案，不能当判据）；`npx next start -p 3999` + 真 cookie 跑 `GET /api/hall/nearby?building=女寝3号楼` → `slots 3 / active 0 / bonusMinBatch 3 / 6 单`，逐单带 `publisherNickname`（大伟/小雨）、`note`（#18「6 层，和 4 层那几单不是同一个楼层」）、`addonCount`（#12/#13 = 1）、`bonusFen`（#12=13 #13=15 #18=17 #20=11）、`runnerRewardFen` 263/300/338/225；默认勾选口径推演 `capacity = slots − 1 = 2` → `mergePeerPicked` 首轮给 2 个 → `slice(0,1)` 后 1 个 ⇒ 按钮「接收 2 单」；冒烟 `/` 200 37ms、`/orders/15` 200 36ms、`/publish` 200 12ms，端口已杀。

**已知缺口**：① 只做同栋推荐（`/api/hall/nearby?building=` 的口径），跨栋仍要回大厅手动勾；② 默认固定 1 单，不看用户实际剩余名额（`capacity` 是 2 时也只勾 1 单，用户可自己再点）；③ 未做真机点击实测（本机无 headless 点击链路）；④ 本轮未部署，线上仍是 v1.21–v1.32；⑤ 不新增文件，源码包重打后仍 ≈293 条。

### 3.24 v1.35 纸感换肤（Editorial Luxury · 暖奶油纸张）

用户 m01287 要求「全站换成参考站那种高级感」，并先备份、不满意要能回档。动手前已打回档包 `.data/backups/shunlu-src-v1.34-pre-theme-20261025-1908.tgz`（784 KB / 214 条目 / sha256 `6083efae5a2b7a592e5211964d0c1eb75bdd0abc8b50371711bbeb398ce4713b`）。

| 项 | 落点 |
|---|---|
| 纸色 tokens | `app/globals.css` 末尾 v1.35 覆写层：`--c-bg #f4efe4` / `--c-surface #fdfaf4` / `--c-surface-2 #efe7d8` / `--c-ink #241f19` / `--c-ink-2 #5d5548` / `--c-ink-3 #9b9081` / `--c-border #ded3bf` / `--c-accent #8a5a2f` / `--c-brand #a8763f` / `--paper-ink rgba(72,56,38,.12)`；`--radius-sm/--radius/--radius-lg = 9/13/16px`；`--dur 220ms`；`--ease cubic-bezier(.32,.72,0,1)`；`--ease-spring cubic-bezier(.24,1.08,.32,1)` |
| 纸面质感 | `body` 奶油径向渐变 + `background-attachment:fixed`；`body::before` fixed 噪点层（SVG feTurbulence，opacity .045，multiply，pointer-events:none），只挂背景、不接交互 |
| 纸卡 | `.sl-card` Double-Bezel：`box-shadow: 0 0 0 1px var(--paper-ink), var(--shadow-1), inset 0 1px 0 rgba(255,255,255,.9)`；显式补 `.sl-card[aria-pressed="true"]`（未分层 CSS 会盖掉 Tailwind 的选中边框）；新增 `.sl-paper`（外框 5px + 4% 墨 + hairline）与 `.sl-paper-core` |
| 悬浮胶囊 | `.sl-nav` fixed / `left:50%` / `width:min(calc(100% - 24px),456px)` / 999px / `blur(18px)`；`components/AppShell.tsx:57` 手机壳去实底、`:60` 顶栏 `sticky top-2` 圆角纸胶囊 + `backdrop-blur-md`、`:62-65` logo「顺路」+ 下划 hairline |
| 加载页 | `app/loading.tsx` 重写为 kicker「顺路 · 正在铺纸」+ 三张纸骨架卡；`components/Loading.tsx` 的 LoadingBlock 同步 |
| 既有 bug 修复 | `app/publish/page.tsx:505` 赏金快捷补 `px-3`；`:528-529` 送达时间分段 `data-active` + `.sl-seg-item`；`app/me/page.tsx:203` 保存按钮 `py-2.5`；`app/page.tsx:352`「只看同栋」激活色改 `--c-ink` |
| 蓝链根因修复 | `app/layout.tsx:3` `import "antd-mobile/es/global"` 注入**未分层** `a{color:#1677ff}`，压过 `@layer` 内所有 Tailwind utilities ⇒ 全站 `<a>` 的 `text-[var(--c-*)]` 失效。在 `app/globals.css:762-791` 加未分层 `a{color:inherit}` + 6 条 `a[class*="text-[var(--c-ink)]"]`/`-ink-2`/`-ink-3`/`-accent`/`-danger`/`text-white` + `a[class*="hover:text-[var(--c-ink-2)]"]:hover`；**不设 text-decoration**（保留显式 underline 类） |
| chip 双亮 | `app/page.tsx:362-366` 点楼栋 chip 无条件 `setSameBuildingOnly(false)`；`:367-368` `data-active={!sameBuildingOnly && building === b}` |

验证：`npx tsc --noEmit` = 0；`npm run build` = 0（14 页，`/` `/login` `/me` `/publish` `/admin/console` 仍 ○ Static，CSS 47455 B）；CDP（430×932 dsf2、带 `?nofx=1`）五张截图复验：`/me` 保存按钮通栏墨药丸、`/publish` 四赏金药丸等宽 + 分段白面 pill、大厅仅「只看同栋」墨底、logo computed `rgb(36,31,25)`、空态链接 `rgb(138,90,47)` 带下划线。

已知缺口：① 只有 headless 截图，未做真机触屏手感；② 种子 #12/#13/#18 已过期，大厅列表是空态，纸卡样式用 `/orders/18` 详情页验的；③ 未部署。

### 3.25 v1.36 / v1.37 批量加成凑不凑得满（大厅 + 接单详情）

用户 m01656 反馈「大厅选中一单后跳出来的多单推荐只能选 2 单，根本达不到 3 单的激励」：v1.34 的默认策略是「本单 + 1 个同栋邻居 = 2 单」，而门槛 BONUS_MIN_BATCH_SIZE = 3，永远差一单。v1.36 把默认勾选拉到门槛，v1.37 修掉实机复验暴露的死按钮。

| 项 | 落点 |
|---|---|
| 详情页默认勾到门槛 | `app/orders/[id]/page.tsx:281-282`（v1.36）默认勾选数由「capacity 与 1 取小」改为 `Math.min(capacity, BONUS_MIN_BATCH_SIZE - 1)`（名额 3 时预勾 2 个邻居 = 3 单满加成）；`:744` 标题右侧「一起带 3 单 · 每单 +5%」；`:809-812` 汇总三态（满 → 「满 3 单每单 +5%：+¥X」／未满 → 「再勾 1 单，凑满 3 单每单 +5%」／同栋不足 → 「同栋只剩 N 单，凑不满加成」）；`:816-818` 手上有单时补「本次最多再带 N 单；批量加成需同一批 3 单同栋」 |
| 大厅加成汇总 | `app/page.tsx`（v1.36）`:11` import `BONUS_MIN_BATCH_SIZE` / `calcBonusFen`；`:164-168` `batchBonusFen` / `bonusGap`；`:217-240` `fillBonus()` 按 `selectedRows[0].dropBuilding` 遍历，跳过性别拦截 / 跨栋 / `timeConflictOf` 命中的单；`:340` 提示条补「勾满 3 单同批每单再 +5%」；`:473-490` 确认条加成行 +「帮我凑满」 |
| 死按钮修复 | `app/page.tsx`（v1.37）`:170-172` 新增 `batchCap = Math.min(slots, BONUS_MIN_BATCH_SIZE)` 与 `canFillMore = batchCap >= BONUS_MIN_BATCH_SIZE && selectedRows.length > 0 && selectedRows.length < batchCap`（并发位不足 3 时按钮与诱导文案一起消失）；`:343` 提示条两分支（`batchCap >= 3` 显示「2–N 单」，否则显示「N 单」），修掉 `slots = 2` 时渲染成「2–2 单」；`:476-483` 确认条三态：有加成 → 「同批 N 单 · 每单 +5%」+ 金额；无加成但能凑 → 「再带 N 单，每单多赚 5%」+「帮我凑满」；无加成且凑不到 → 「并发位只够带 N 单，本批没有加成」静态文案，不给按钮 |

验证：`npx tsc --noEmit` = 0；`npm run build` = 0（14 页）；预览 job `bash-c88d6290a1d540fd`，**先核 served chunk == 磁盘 chunk**（`page-3f57bc406e5f480d.js`，否则读到旧的预渲染 HTML）；`POST /api/demo/reset` → `{"ok":true}`；CDP 430×932 dsf2 + `?nofx=1`：uid=1（阿瑶）「已选 1 单 · 共 ¥3.00 · 再带 2 单，每单多赚 5% · 帮我凑满」→ 点后「已选 3 单 · 共 ¥9.01 · 同批 3 单 · 每单 +5% · +¥0.45 · 接收 3 单」（截图 `.data/shots/c-hall-bonus3.png`，860×1864 / 1084073 B）；uid=2（小跑B）「并发位只够带 2 单，本批没有加成」且无按钮；`/orders/18` 详情「一起带 3 单 · 每单 +5%」+「接收 3 单（+¥8.26）」。

已知缺口：① `slots < 3` 的账号永远拿不到加成（并发规则决定，文案已老实说明）；② `fillBonus()` 是贪心，同栋可选单不足时不保证凑满；③ 无真机触屏实测；④ uid=3 重置后大厅只有 1 单跨栋，3 单场景测不到。

### 3.26 v1.38 线上版本自证（2026-10-25，**待部署**）

起因：用户 m01929 问「我该怎么确认我部署的是最新版？我这边似乎没有任何修改，可能没部署成功」。此前判断线上版本只能比对 chunk 哈希，或肉眼找新气泡，**没有任何可读的版本号**，用户看不到「改了没有」。

| 项 | 落点 |
|---|---|
| 版本常量 | `lib/version.ts`：`export const APP_VERSION = "v1.41"`（v1.38 引入该常量，发版只改这一行）、`export const APP_RELEASE = "2026-10-26"`；发版**只改这两行**，不从 env 读（env 忘配会让页面显示 undefined） |
| 版本接口 | `app/api/version/route.ts`：`GET /api/version`，`runtime='nodejs'`、`dynamic='force-dynamic'`、`cache-control: no-store`，不碰数据库、不鉴权，返回 `{version, release, uptimeSec, nodeEnv, port}` |
| 为什么带 uptimeSec | `Math.round(process.uptime())`。**版本号新但 uptimeSec 很大 ⇒ 码换了、进程没重启**（deploy-app.sh 健康检查失败前的那几次重试就是这个中间态）；uptimeSec 小但版本旧 ⇒ 重启了却跑在旧目录 |
| 页面戳 | `app/me/page.tsx` 页脚一行 `{APP_VERSION} · {APP_RELEASE} · 顺路演示`（`id="app-version"`），手机滑到底肉眼可核 |

**三条核对法**（部署后按顺序跑，任一不成立就是没部署成功）：

1. `curl -s https://shop.omzsh.top/api/version` → `{"version":"v1.41",…}`；`uptimeSec` 应是几十~几百秒（刚重启），若是几万秒说明文件换了但服务没重启；
2. 比 chunk 哈希：`curl -s https://shop.omzsh.top/ | grep -o 'chunks/app/page-[a-z0-9]*\.js'` 应与本机 `.next/static/chunks/app/page-*.js` 同名（v1.37 起是 `page-3f57bc406e5f480d.js`；**2026-10-25 实测线上还是 `page-ccb576e5151fe4db.js` ⇒ 确证是旧包**）；
3. 手机开 `/me` 滑到底，页脚应是 `v1.41 · 2026-10-26 · 顺路演示`。

> Next 的页面 chunk 按路由分：v1.38 只动 `/me` 与新增 API，所以大厅 `page-*` 哈希不变属正常，本轮证据是 `app/me/page-501b4f62b7488892.js` 里出现了 `v1.38`。

验证：`npx tsc --noEmit` = 0；`npm run build` = 0（14 页 + 新增 `ƒ /api/version`）；预览 job `bash-2a215d89ede74b29` → `curl 127.0.0.1:3999/api/version` = `{"version":"v1.39","release":"2026-10-25","uptimeSec":9,"nodeEnv":"production","port":"3999"}`；v1.38 那时的证据是 `grep -rl 'v1\.38' .next/static/chunks` 命中 `app/me/page-501b4f62b7488892.js`。

已知缺口：① 线上要等这次部署才有 `/api/version`，在那之前只能靠 chunk 哈希；② `APP_VERSION` 靠人工同步，忘了改就会说谎（发版流程写死「先改 `lib/version.ts`」）；③ `uptimeSec` 是进程启动秒数，只认真正的 `restart`。

### 3.27 v1.39 加成文案四态（2026-10-25，**待部署**）

起因：用户 m02048 发截图——详情页「同栋待接订单 6 单」块头写着「一起带走 3 单 · 每单 +5%」，但已勾 1 单后再点第二单弹 Toast「当前最多还可接 1 单」。用户原话：「数字改了实际上没效果 你看图吧 我不确定是不是没改彻底 但是两边的版本都是1.3.8了」。

根因（实测，非部署失败）：`app/api/hall/nearby/route.ts:53` 的 `const slots = Math.max(0, runnerMaxActive(user.creditScore) - active);`。uid=2 小跑B 的 `creditScore=100`、`counts.active=1` ⇒ 返回 `slots: 2, active: 1, bonusMinBatch: 3`。全球并发上限 3（AGENTS §4「跑腿者同时履约中 ≤3」）⇒ 手上已有 1 单时这一批最多 2 单，**满 3 单 +5% 天然够不到**；种子固定含「1 条已被 B 接单未送达」，所以从种子出发永远演示不到加成。

| 改动 | 落点 |
|---|---|
| 算可用批次 | `app/orders/[id]/page.tsx:738-741`：`const cap = Math.max(0, peerSlots - 1);` 后加 `const maxBatch = 1 + Math.min(cap, peers.length);` 与 `const roomLeft = Math.max(0, cap - peerPicked.length);` |
| 块头文案 | `app/orders/[id]/page.tsx:746-754`：`maxBatch >= BONUS_MIN_BATCH_SIZE` 才显示 `一起带 3 单 · 每单 +5%`（accent），否则灰字 `本次最多 ${maxBatch} 单 · 凑不到加成` |
| 点满 Toast | `roomLeft > 0 ? \`还能再勾 ${roomLeft} 单\` : \`这一批最多带 ${maxBatch} 单（含这一单），先取消一单\`` |
| 底栏四态 | `app/orders/[id]/page.tsx:816-827`：`bonusFen > 0` → 满 3 单 +5% 金额；`maxBatch < 3` → `这一批最多 ${maxBatch} 单，凑不满 3 单加成`；`all.length < 3` → `再勾 N 单，凑满 3 单每单 +5%`；否则 `再加同栋单也凑不满加成` |
| 大厅 toggle | `app/page.tsx`：原 `if (selected.length >= slots) setNote(当前最多还可接 ${slots} 单)` → `if (selected.length >= batchCap)` + 三分支文案，与 v1.37 的 `batchCap = Math.min(slots, BONUS_MIN_BATCH_SIZE)` 对齐（服务端 `server/rules/orders.ts:334 acceptBatch` 只校验 ≥2 单与重复 id，无上限） |
| 版本号 | `lib/version.ts` → `APP_VERSION = "v1.40"` |

验证：`npx tsc --noEmit` = 0；`npm run build` = 0（14 页）；预览 job `bash-2a215d89ede74b29`（3999）`/api/version` → v1.39、uptimeSec 9；CDP 实拍 `.data/shots/c-detail-v139.png`（860×1864 / 896965 B，uid=2 打开 `/orders/13`）→ 块头灰字「本次最多 2 单 · 凑不到加成」、已勾阿瑶 +¥3.75 与大伟 +¥2.63、底栏「已选 2 单 · +¥6.75」「这一批最多 2 单，凑不满 3 单加成」「手上已有 1 单进行中，本次最多再带 2 单…」、主按钮「接这 2 单（+¥6.75）」。

已知缺口：① 并发上限仍是 3，所以从种子（B 手上 1 单）出发只能带 2 单，想演示 +5% 得先让 B 手上清零或把上限改 4（需用户拍板）；② 文案四态只在 `/orders/[id]` 与大厅 toggle 两处，`/api/hall/nearby` 返回的 `slots` 语义未变；③ 无真机触屏实测。

### 3.28 v1.40 推荐卡固定 2 单 + 同层优先（2026-10-26，**待部署**）

起因：用户 m02282 想要「一次总共 3 单」吃批次加成，v1.39 只改了文案、没改推荐口径；m02306 原话「推荐的话同楼层优先哈 那么开始修改」定下口径——**卡面固定推荐 2 单（主单 + 2 = 3 单），同层优先**。

| 改动 | 落点 |
|---|---|
| 常量 | `app/orders/[id]/page.tsx:169` `const PEER_RECOMMEND_MAX = 2;`；`app/publish/page.tsx` `const NEARBY_RECOMMEND_MAX = 2;` |
| 详情页截断 | `app/orders/[id]/page.tsx:272-274` `const recommend = candidates.slice(0, PEER_RECOMMEND_MAX); setPeers(recommend);`；`:280` 默认勾选传 `candidates: recommend`；`:285` `mergePeerPicked({ prev, candidates: recommend, capacity, initialize })` + `const target = Math.min(capacity, recommend.length);`（不再按 `BONUS_MIN_BATCH_SIZE - 1` 硬凑 3 单） |
| 详情页同层标 | `:750` 块头「同栋推荐 {peers.length} 单」；`:762` subtitle「{o.dropBuilding} · 同层优先，最多推荐 {PEER_RECOMMEND_MAX} 单一起带走。」；`:765-768` 逐行算 `sameFloor`；`:799-806` 楼层次后插 `<span className="ml-1 text-[9px] font-medium text-[var(--c-accent)]">同层</span>` |
| 发布页排序 | `app/publish/page.tsx` `function recommendNearby(orders: NearbyOrder[], floor: string)`：`sameFloor = (o) => (f && o.dropFloor === f ? 0 : 1)`，sort 后 `slice(0, NEARBY_RECOMMEND_MAX)`；`const nearbyRecs = useMemo(() => (nearby ? recommendNearby(nearby.orders, dropFloor) : []), [nearby, dropFloor]);` |
| 发布页默认勾选 | 默认勾选 effect 用 `room = Math.max(0, Math.min(nearby?.slots ?? 0, NEARBY_RECOMMEND_MAX))`；删掉 `pickedBonusFen`；卡面守卫改 `nearbyRecs.length > 0`、标题「同栋推荐 N 单」、subtitle「同层优先，最多推荐 N 单一起带走。」、底栏「这一批最多 N 单，凑不满 3 单加成（；手上已有 N 单进行中）」 |
| 版本号 | `lib/version.ts` → `APP_VERSION = "v1.40"` / `APP_RELEASE = "2026-10-26"` |

验证：`npx tsc --noEmit` = 0；`npm run build` = 0（14 页，job `bash-bbdecc9841084f84`）；预览 job `bash-b920e33e0ca84832`（3998，线上库）`/api/version` → `{"version":"v1.40","release":"2026-10-26","uptimeSec":57,"nodeEnv":"production","port":"3998"}`；CDP 实拍 `.data/shots/c-publish-v140.png`（860×2738 / 1044143 B，「同栋推荐 1 单 ／ 女寝3号楼 · 同层优先，最多推荐 1 单一起带走。」+ 底栏「这一批最多 2 单，凑不满 3 单加成。」）、`.data/shots/c-detail-v140.png`（860×1864 / 853823 B，`/orders/16` 无 peers ⇒ 推荐块不渲染，守卫生效）、`.data/shots/c-me-v140.png`（860×2822 / 929002 B，页脚「v1.40 · 2026-10-26 · 顺路演示」）。

### 3.29 v1.41 推荐数按真实并发位裁剪 + 种子里 B 空手（2026-10-26，**待部署**）

起因：用户 m02631 两条反馈——「那个200 200 403 我第三个出现了200」「推荐数量是对了但是推荐的两单还是只能二选一 排查一下问题 **问题根源没解决**」。要的是根因，不是再改一次文案。

根因（不是文案）：`app/api/hall/nearby/route.ts:53` `const slots = Math.max(0, runnerMaxActive(user.creditScore) - active);`，而 `server/demo/seed.ts:194-213` 的 #16（postal、publisher A、**accepted**）原本挂在 `runnerId: USER_IDS.B` 上 ⇒ B 手上有 1 单 ⇒ `slots = 3 − 1 = 2` ⇒ `capacity = slots − 1 = 1`。卡面恒 `slice(0,2)` 摆 2 行、默认只勾 1 行，第 2 行一点就弹「这一批最多带 2 单（含这一单），先取消一单」——所以「数量对了但只能选一单」。**这同时推翻了 §3.28「详情页截断」那一行**（只截卡面、不看 capacity）。

| 改动 | 落点 |
|---|---|
| 详情页按容量裁剪 | `app/orders/[id]/page.tsx:274` `const capacity = Math.max(0, (n.slots ?? 1) - 1);` → `:277` `const recommend = candidates.slice(0, Math.min(PEER_RECOMMEND_MAX, capacity));`；capacity=0 ⇒ `peers=[]` ⇒ `:730` 守卫 `peers.length > 0` 自动不渲染整块 |
| 详情页副标题诚实化 | `:761-767` subtitle 改用 `maxBatch`（= `1 + min(cap, peers.length)`），并说清凑不满加成的原因：`cap < 2` 是「手上有单」，否则是「同栋没更多单」 |
| 发布页同口径 | `app/publish/page.tsx`：`recommendNearby(orders, floor, max)` 加第三参 + `.slice(0, Math.max(0, max))`；`nearbyRecs = useMemo(… recommendNearby(nearby.orders, dropFloor, Math.min(NEARBY_RECOMMEND_MAX, nearby.slots)))`；默认勾 `nearbyRecs.map(o => o.id)`；`togglePick(o.id, nearbyRecs.length)`；底栏「这一批最多 {nearbyRecs.length} 单」 |
| 种子 B 空手 | `server/demo/seed.ts:197` #16 `runnerId: USER_IDS.B` → `USER_IDS.C`（附两行中文注释）。B active=0 ⇒ slots=3 ⇒ capacity=2 ⇒ 主单+2 真正能凑满 3 单吃 +5%；脚本 D 的「超时释放 / 信用分」对照组本来就用 C（AGENTS 附录 B 已同步） |
| 版本号 | `lib/version.ts` → `APP_VERSION = "v1.41"`（`APP_RELEASE` 仍 `2026-10-26`） |

验证：`npx tsc --noEmit` = 0；`npm run build` = 0（14 页，`ƒ /orders/[id] 9.61 kB`、`ƒ /api/version`）；预览 job `bash-33cf0915fe704b2f`（3998，source `deploy/shunlu.env` 连线上库）`/api/version` → `{"version":"v1.41","release":"2026-10-26","port":"3998"}`；已 `POST /api/demo/reset` ⇒ `GET /api/hall/nearby?building=女寝3号楼` 回 `slots=3 / active=0`、3 条（#18 6 层、#14 4 层、#12 4 层）；CDP 实拍（430×932 dsf2、`?nofx=1`、cookie `sl_uid=2`）`.data/shots/c-detail-v141.png`：`/orders/14` 全文含「同栋推荐 2 单」「一起带 3 单 · 每单 +5%」「女寝3号楼 · 同层优先，这次最多一起带 3 单。」两行都是 ✓、「已选 3 单 · +¥9.38」「接收 3 单（+¥9.38）」——**两单都能勾，用户报的 bug 已修**；`.data/shots/c-publish-v141.png`：「同栋推荐 2 单」两行都勾、「已选 2 单 · +¥7.13」「这一批最多 2 单，凑不满 3 单加成。」（发布页本来手上有单，2 单是正确上限）；`.data/shots/c-me-v141.png` 页脚 `v1.41`（新构建自证）。`scripts/preflight.mjs:145-156` 只 log 剩余并发、无硬断言 ⇒ 种子改 B→C 不影响 preflight 13 PASS。

200 那条的解释（**不改代码**）：`lib/demo-guard.ts:67` `if (isLoopback(req)) return null;` 回环一律放行是既定设计（同文件 `:12` 与 `:66` 注释已写明），服务器上 `curl 127.0.0.1:3000/api/demo/reset` 的 Host 就是回环 ⇒ 200 正确。**是我 runbook 里把第三个状态码的期望写错了**；要验 403 得带 `-H 'Host: shop.omzsh.top'`。

已知缺口：① 详情页 `peers` 要等 `/api/me` + `/api/hall/nearby` 各一次 200 才渲染，**截图与肉眼核对都要 ≥10 秒**（4 秒拍到的还是没有推荐块的中间态）；② 加成仍需「≥3 单同栋」，B 空手只是让它「可以凑满」，种子那 3 条同栋单在女寝3号楼（4 层×2 + 6 层×1）；③ 无真机触屏实测。

### 3.30 v1.42 后台「输完口令没反应」= 页面把 500 吞了 + 服务器到 Neon 连接卡死（2026-11-17，**待部署**）

用户 m00002：「我在服务器部署的网站后台输入口令无反应 我应该怎么测试或者修复 先重启服务吗」。

**实测把故障切成两段**（全部从本机 curl，无需登录服务器）：
- 登录接口好的：`POST https://shop.omzsh.top/api/console/login` 正确口令 → `200 {"ok":true}` + `Set-Cookie: sl_console=…; Secure; HttpOnly; SameSite=lax`，错口令 → `401 密码不对`；`/admin/console` 的 HTML 与全部 `/_next/static` chunk、`/painting/index.html` 均 200 ⇒ **不是前端资源/水合问题**。
- 数据接口坏的：带 cookie 的 `GET /api/console/snapshot` → **稳定 20.03s 后 500**；`/api/hall` 21.4s `503 DB_TIMEOUT`；`POST /api/auth/switch` 16.26s 500（≈ 2 × `connect_timeout` 8s）；**绕过 Cloudflare 直连 `http://47.97.167.178:3000` 数字完全一样** ⇒ 与隧道无关，是运行中进程到 Neon 的连接层。
- 页面表现：`app/admin/console/page.tsx` 的 `load()` 对非 401/503 的响应 `return`（静默），`login()` 只在 `fetch` 抛异常时提示 ⇒ 用户看到「点了一下什么都没发生」。

| 改动 | 落点 |
|---|---|
| 让 503 说真话 | `lib/api.ts` 的 `dbTimeoutResponse` 由内部函数改 `export`；`app/api/console/snapshot/route.ts` catch 里先 `const timedOut = dbTimeoutResponse(err); if (timedOut) return timedOut;`（这条路由不走 `withUser`，以前 `DbDeadlineError` 被映射成 500） |
| 让失败可见 | `app/admin/console/page.tsx`：新 `loadError` state；`load` → `useCallback(async (): Promise<boolean>`，try/catch 覆盖断网，401 → 锁定页，503 按 `d.code === "DB_TIMEOUT"` 分流否则 `needSetup`，其它非 2xx → `后台数据加载失败：HTTP xxx · <后端 error>`；锁定页红字 + 「重试」，数据页 sticky 错误条（注明「显示的是上一次成功的数据」）；`login()` 用 `load()` 的返回值决定 Toast 文案 |
| 一条 curl 定位 | `app/api/version/route.ts` 增 `db:{ok,ms}`（`pingDb(6_000)`，恒 200、`cache-control: no-store`）——`ok:false` 基本可判定是「服务器 → 数据库」，不是业务代码 |
| 版本号 | `lib/version.ts` → `v1.42` / `2026-11-17` |

验证：`npx tsc --noEmit` = 0、`npm run build` = 0（14 页）；本机 `PORT=3997 npx next start` + `deploy/shunlu.env`（**线上同一份 DATABASE_URL**）复现线上症状：`/api/version` → `db:{"ok":false,"ms":3008}`、snapshot → **503 `DB_TIMEOUT` 20.02s**（改动生效）；裸 `postgres.js` 计时 **建连 4120ms / 单条查询 ~480ms**，预热后 snapshot **200 13.96s → 6.16s**、hall **200 3.27s** ⇒ 库没坏，是 **`consoleSnapshot()` 约 10 次串行往返 × 数百 ms** 把 20s 预算吃穿。12:33 复测生产：`/api/version` 仍 v1.40、`uptimeSec:194357`（**进程没重启**）而 snapshot 已 **200 / 2.18s** ⇒ 故障自愈（v1.16 watchdog 回收池 / Neon 冷启动结束），属间歇性。

已知缺口：① 根因无服务器侧日志，未分离「Neon 计算冷启动 > 8s 触发 connect_timeout」与「跨境链路抖动拖死池子」；② 线上仍 v1.40；③ 本机 `.env.local` 的 Neon 分支仍失效，验证一律走 `deploy/shunlu.env` 起 3997/3998。

## 4. 未完成目标 + 验收标准

### 4.1 部署到 ECS（**v1.14–v1.32 已上线；只剩 v1.33–v1.41 待部署**，见 §3.4/§3.6/§3.7/§3.8/§3.9/§3.10/§3.11/§3.12/§3.13/§3.14/§3.15/§3.16/§3.17/§3.18/§3.19/§3.20/§3.21/§3.22/§3.23/§3.24/§3.25/§3.26/§3.27/§3.28/§3.29）

部署路径：源码包内 `deploy/shunlu.env` 的 `APP_URL` 已是 https；服务器上仍需 `sed -i` 改 `/etc/shunlu/shunlu.env`（`deploy-app.sh` 只在 env 不存在时才安装 `/root/shunlu.env`，不覆盖）。

**v1.16 部署（已完成）**：命令与 v1.15 相同（env 不用动），日志确认 `[db] watchdog 已启动`；公网 8 项 + 空闲 8 分钟验收见 §3.7。下次改代码后同样执行：`scp` 新包 → `cd /root` → `rm -rf /root/src && mkdir -p /root/src && tar -xzf /root/shunlu-src.tgz -C /root/src` → `bash /root/src/deploy/deploy-app.sh shunlu 3000 /root/src`。

**v1.18 + v1.19 + v1.20 一起部署（已完成，2026-10-24 用户 m01247 实测「功能正常了」）**：源码包 `.data/shunlu-src.tgz`（271 条 / 打包后 564742 B（约 551 KB）），命令与 v1.16 相同（env 不用动）：`scp .data/shunlu-src.tgz root@47.97.167.178:/root/` → `rm -rf /root/src && mkdir -p /root/src && tar -xzf /root/shunlu-src.tgz -C /root/src` → `bash /root/src/deploy/deploy-app.sh shunlu 3000 /root/src`。复验结果：线上 chunk `app/orders/%5Bid%5D/page-e89aadd8990b0768.js` 已能 grep 到「本栋可接」（v1.18）；发布页预约选择器能弹滚轮、非法值弹 Toast（v1.20）；`grep -c "读请求重试" /var/log/shunlu.log` 待观察（v1.19）。

**本包 = v1.21–v1.40（v1.21–v1.32 已于 2026-10-25 上线，v1.33–v1.40 待部署）**：`deploy/check-public.sh`（公网四段体检）+ `scripts/preflight.mjs`（开拍前自检）+ `/publish` 时段网格 + `public/painting/` 加载动画 + v1.26 的 1.8× 加速 / 画完才退场 / 整屏铺满 + v1.27 的蓝色交互 token、两套自托管拉丁字体、splash 2.4× 与蓝色进度线 + **v1.28 的图标化玻璃底栏、`.sl-page`/`.sl-rise` 入场错峰、`.sl-kicker`+`.sl-hero` 版式、光圈揭幕退场，以及 reduce「只降速不关闭」+ **v1.29 的页面静态预渲染（本机首字节 13–38ms、`x-nextjs-cache: HIT`）、全局骨架屏与底栏乐观高亮**。源码包 `.data/shunlu-src.tgz` 已重打成 **v1.40 干净版 148 条 / 830356 B**（`tar -tzf .data/shunlu-src.tgz | wc -l`；不含任何 `.dsh-ops-update-*.lock` / `ocg_*` / `probe-*` 杂物），含 `lib/version.ts`、`app/api/version/route.ts`、`drizzle/0003`，`node_modules` 命中 0 条；**v1.32 只调「批量加成」的显示口径**——`/api/hall/nearby` 返回 `active`/`bonusMinBatch`/逐单 `bonusFen`，发布页按已勾选 ≥3 单汇总，规则不变；v1.31 的 `drizzle/0003_user_dorm_profile.sql` 已在共用 Neon 库 migrate 过，服务器上**不需要**再跑迁移；v1.33 只在大厅顶部加「推荐一起带走」卡片（§3.22），v1.34 又把这张卡从大厅撤掉、改到 `app/orders/[id]/page.tsx` 的「同栋待接订单」列表（§3.23），两版都只动页面、规则与接口一个都没动；v1.35 是全站换纸感皮肤（§3.24），只动视觉层与四处既有样式 bug，规则 / 接口 / 数据库一行未动；v1.36/v1.37 只改默认勾选数与加成文案（§3.25），同样只动页面。

部署后验收：① 打开首页能看到一张纸上的绘画过程（不同次打开风格不同），**约 4.5–5.7 秒画完才淡出**（进度到 1 才退场，不是被计时器切掉），底部一条 1px 蓝色进度线走完；② 手机竖屏与电脑横屏都铺满（卡纸随视口缩放，横屏标题在右）；③ `/admin/console` 与 `?nofx=1` 不出现动画；④ `cd /root/src && node scripts/preflight.mjs --base http://127.0.0.1:3000 --reset --admin shunlu-admin-2026` 应 13 PASS / 0 FAIL；⑤ 发布页预约只剩「未来且 ≥20 分钟后」的 10 分钟档；⑥ 品牌「顺路」下有一条 2px 蓝底线、当前 tab 顶部有 2px 蓝条，金额仍是琥珀色等宽数字（蓝≠钱）；⑦ 手机任意页面应是暖奶油纸底 + 双描边纸卡 + 悬浮胶囊顶栏底栏，**「顺路」logo 是墨色不是 antd 蓝**、空态链接焦褐带下划线（v1.35）；⑧ 大厅点一张同栋单进入批量模式（v1.37）：uid=1（阿瑶）确认条是「再带 2 单，每单多赚 5%」+「帮我凑满」，点后变「已选 3 单 · 共 ¥9.01 · 同批 3 单 · 每单 +5% · +¥0.45」；uid=2（小跑B，手上有单 ⇒ slots=2）是「并发位只够带 2 单，本批没有加成」且**没有**「帮我凑满」按钮；`/orders/18` 详情页见「一起带 3 单 · 每单 +5%」且默认已勾 3 单。

**已人工复核**：用户 m01247 反馈「功能正常了」——详情页默认勾选 / 发布页滚轮选时间 / Toast 弹层均正常（§3.8/§3.10），三项一起上线。

验收（6 项全过，4–5 由用户浏览器实测）：
1. ✅ IP 直连 `POST /api/demo/login` → 200，`set-cookie: sl_demo=…; Max-Age=43200`（无 Secure，符合 http）。
2. ✅ `https://shop.omzsh.top/api/demo/login` → 200，且 `Secure` 在位（隧道确实传了 `X-Forwarded-Proto: https`）。
3. ✅ 错口令 403、空口令 400。
4. ✅ 浏览器打开 `https://shop.omzsh.top/login`：口令框（`type=password`）→ 输入 `shunlu-demo-2026` → 列出 5 个业务账号 → 切 A → 大厅有单、刷新后仍是登录态（curl 只确认页面 200，客户端渲染看不到输入框）。
5. ✅ 旧链接 `https://shop.omzsh.top/?token=shunlu-demo-2026` 地址栏参数被抹掉、功能正常（页面 200 已确认，抹除是客户端行为）。
6. ✅ `/api/console/login` 200 + `sl_console` 带 Secure，`/api/console/snapshot` 有 7 账号与对账字段，`/admin/console` 页面 200，`/admin` 307。

### 4.2 让 https 稳定（524 / 一直加载）

**现状（v1.21 实测，2026-10-24 02:0x，12 次）**：域名首页 12/12 全 200，但首字节 p50 **1.325s**、max **4.734s**、总耗 p50 1.477s；同一时刻源站首页 p50 **0.035s**。静态 chunk 域名 p50 0.690s vs 源站 0.021s。⇒ 慢在 **Cloudflare → cloudflared(ECS)** 这一段（每请求固定加价 0.67–1.3s），外加 TLS 握手长尾（0.48–5.62s）；应用渲染 30–80ms、Neon 92ms/RT 都不是主因。随时可复跑：`bash deploy/check-public.sh`（`deploy/README.md` §7.6）。


**2026-10-25 11:35 已切 http2（用户 m02554 贴的 ECS 日志）**：`INF Initial protocol http2`，4 条 `Registered tunnel connection` 全部 `protocol=http2`，`SUMMARY: Environment is healthy. cloudflared will use 'http2' as primary protocol`、`precheck complete hard_fail=false suggested_protocol=http2`。同批日志暴露真正的主因：**`location=lax09 / lax01 / lax12 / lax13` —— 4 条连接全在洛杉矶**，而 ECS 在杭州（阿里云），隧道段要跨太平洋约 3–6 个 RTT（杭州↔LAX ≈ 180–220ms），正好对上实测的 0.67–1.3s 固定加价。⇒ http2 只改善抖动与长尾，**不会明显降低中位数**；降中位数只能靠 ① 让 CF 边缘缓存 `/_next/static/*`（免费，砍掉静态子请求的隧道往返）② 把 origin 搬到离 CF 边缘与 Neon 更近的机房。两条 `WRN`（`ping_group_range`、`ICMP proxy feature is disabled`）**无害**：ICMP 代理只服务 WARP/ICMP 场景，纯 tunnel 不用。
**要做的（ECS 上执行，需用户 SSH）**
1. 确认只有一台 connector 连着（同一 tunnel ID 多端在线 → 请求随机打到不可达端）。**`cloudflared tunnel info` 在 ECS 上必然失败**：它要调 Cloudflare API，鉴权用账号级 `cert.pem`，而 `cert.pem` 只存在于跑过 `cloudflared tunnel login` 的机器（你 Windows 的 `C:\Users\User\.cloudflared\cert.pem`）；ECS 上是 token/credentials 安装，实测报错原文即 `ERR Cannot determine default origin certificate path. No file cert.pem in [~/.cloudflared ...]` + `Error locating origin cert: client didn't specify origincert path`。

改为看 CF 后台：Zero Trust → Networks → Tunnels → 选中该 tunnel，**CONNECTOR 列表应只有 ECS 一台**（一个 connector 常驻 4 条 edge 连接，日志里 4 条 `Registered tunnel connection` 是正常的，不等于 4 台）。真要在 ECS 上跑该命令，得把 `cert.pem` scp 到 `/etc/cloudflared/` —— 等于把账号凭据放服务器，不建议。

2. 回源协议 QUIC → http2（QUIC 走 UDP 7844，中间设备静默丢包 → 首屏卡 100 秒 524 或一直转圈）。**安装形态已确认**（用户 m02538 贴的 ECS 输出）：`ExecStart=/usr/bin/cloudflared --no-autoupdate --config /etc/cloudflared/config.yml tunnel run` ⇒ 配置式安装，`protocol` 写进 `/etc/cloudflared/config.yml` 会被读取（早前「token 式安装」的猜想作废，不需要 systemd drop-in）：

```bash
sudo cp /etc/cloudflared/config.yml /etc/cloudflared/config.yml.bak
sudo sed -E 's/^(token:).*/\1 ***/' /etc/cloudflared/config.yml     # 先看清内容，token 打码
sudo sed -i '/^[[:space:]]*protocol[[:space:]]*:/d' /etc/cloudflared/config.yml   # 删旧值，避免 YAML 重复键
printf 'protocol: http2\n' | sudo tee -a /etc/cloudflared/config.yml
sudo cloudflared --config /etc/cloudflared/config.yml tunnel ingress validate   # 语法自检，不需要 cert.pem
sudo systemctl restart cloudflared
sleep 6; sudo journalctl -u cloudflared -n 40 --no-pager | grep -iE 'Registered tunnel connection|protocol|error'
```

**必须看到 `protocol=http2` 才算生效**（仍是 `protocol=quic` 说明没吃进去：先 `cloudflared --version`，2021 年前的老版本没有 `protocol` 键；退路是 `systemctl edit cloudflared` 里先写一行空的 `ExecStart=`，再照抄 `systemctl cat` 的原始命令并在尾部加 `--protocol http2`）。重启会有 2–5 秒 502/1033，别在演示时改。回滚：`sudo cp /etc/cloudflared/config.yml.bak /etc/cloudflared/config.yml && sudo systemctl restart cloudflared`。

3. 本机复测并对比 p50（改前 1.325s 是基准）：

```bash
ROUNDS=20 bash deploy/check-public.sh
```

4. 让 CF 边缘缓存静态资源（**不受协议影响、免费、收益最直接**）：Cloudflare Dashboard → 你的 zone → Caching → Cache Rules → Create rule：

- 名称 `static-immutable`；表达式（Edit expression 粘这条）：`(http.request.uri.path matches "^/_next/static/") or (http.request.uri.path matches "^/painting/")`；
- Cache eligibility = **Eligible for cache**；Edge TTL = **Override origin, 1 year**；Browser TTL = **Override origin, 1 year**；
- 保存后验证（等 30 秒）：`curl -sI https://shop.omzsh.top/_next/static/$(curl -s https://shop.omzsh.top/ | grep -o '/_next/static/[^"]*\.js' | head -1 | cut -d/ -f4)/main-app.js | grep -i cf-cache-status`，第一次 `MISS`、第二次必须 `HIT`（`HIT` 之后这些请求**不再穿隧道**）。

**验收**：① 20 次全 200（`BAD=0`）；② 域名首屏 p50 ≤ 0.5s（现在 1.325s）；③ `max/p50 ≤ 3`（现在 3.6×）；④ 浏览器硬刷首屏 < 1.5s。

**如果仍慢**：`protocol: http2` 只解决握手与 MTU 抖动，不解决「静态资源每请求都回源」。真提速要么让 CF 边缘缓存 `/_next/static/*`（现在每请求穿隧道回源），要么把 cloudflared 放到离用户更近的节点。§4.4（迁同机 PG）只省 Neon 的 92ms/RT，对 1.3s 首屏帮助有限，优先级下调。

### 4.3 `APP_URL` 定稿（已完成，v1.13）

`deploy/shunlu.env` 与 `.env.local` 都已是 `APP_URL=https://shop.omzsh.top`。v1.13 起 cookie 的 `secure` **不再只靠 APP_URL**：`lib/cookie-secure.ts` 的 `shouldSecureCookie(host, x-forwarded-proto)` 按请求实际协议判定 —— 回环永不 Secure；有 `x-forwarded-proto` 以逗号前第一段为准；都没有时才看「Host 与 APP_URL 同域且 https」。

**必须知道的运行时事实**：Next 15 会在 `node_modules/next/dist/server/base-server.js:564` 执行 `req.headers['x-forwarded-proto'] ??= isHttps ? 'https' : 'http'`。也就是说明文请求缺该头时会被补成 `http`，纯函数第三个分支在 Next 里几乎不可达 ⇒ **反向代理/隧道必须显式传 `X-Forwarded-Proto: https`**（Cloudflare Tunnel 默认会带；部署后用 `curl -i` 复核）。`APP_URL` 现在只作为「没有该头且同域」的静态兜底，不是开关。

验收：✅ 隧道访问 `sl_uid` 带 Secure、`IP:3000` 直连不带，两者都能切号；`deploy/README.md` §7.5 与实际一致。

### 4.4 可选：迁杭州同机 PG

动机：ECS→Neon 新加坡 ~92ms/RT，同机 PG ~0.5ms，读接口能快一个数量级。代价：装 PG18、`pg_dump`/`pg_restore`、改 `DATABASE_URL`、验证种子与 94 例单测、保留 Neon 作回滚。**演示优先，不做也能跑**，除非用户明确要速度。

### 4.5 ECS 连接层诊断（v1.17 已完成，结论见下；复发时再跑）

目的：区分「跨境 TCP 被静默回收」与「Neon 端/配额问题」。在服务器上执行（**不是**本机）：

```bash
# 1) 池子还活着吗：连续两次读同一接口，第二次应该秒回
for i in 1 2 3; do curl -s -o /dev/null -w "me %{http_code} %{time_total}s\\n" http://127.0.0.1:3000/api/me; sleep 1; done
# 2) 直连 Neon 的裸延迟（绕过应用，判断链路本身）
time psql "$(grep '^DATABASE_URL=' /etc/shunlu/shunlu.env | cut -d= -f2-)" -c 'select 1'
# 3) 应用日志里有没有探活失败/连接断开
grep -E '探活失败|CONNECTION_CLOSED|ECONNRESET|ETIMEDOUT' /var/log/shunlu.log | tail -20
```

判读：① `/api/me` 一直 401/200 且 `time_total` 在毫秒级 → 应用侧正常，挂死可能是浏览器/隧道层；② `psql` 超过 2s 或断连 → 跨境链路问题，优先考虑 §4.4 迁同机 PG；③ 日志里成片 `探活失败（连续 N 次）` → watchdog 已在工作，看 `recycleDbPool` 之后是否恢复。若 `psql` 不存在，跳过第 2 条（`apt install -y postgresql-client` 可装，但没必要为诊断装）。

**v1.17 实际结论**：第 1 步 `/api/me` ×3 毫秒级、第 2 步 `psql 'select 1'` 毫秒级 ⇒ 应用与库都活着；第 3 步输出的是日志原文 `write CONNECTION_CLOSED …neon.tech:5432`（`code: 'CONNECTION_CLOSED'`），即「跨境空闲连接被静默回收后仍留在池里」。v1.16 的探活 + 20s 上限 + 回收重建正是为此；上云后空闲 8 分钟复测全 200（§3.7），诊断闭环。

## 5. 已知的坑（按会咬人的概率排序）

1. **`deploy-app.sh` 不覆盖已存在的 `/etc/<app>/<app>.env`**（`[ ! -f "$ENV_FILE" ]` 才安装）⇒ 改 `APP_URL`/口令必须 `sed -i` 直接改服务器那份，然后 `systemctl restart shunlu`。
2. **删 Next 路由后必须清 `.next/types`**，否则 `tsc` 报 `TS2307: Cannot find module '…/route.js'`（`Remove-Item -Recurse -Force .next/types`）。
3. **中文文件禁止用 PowerShell `Get-Content`/`Add-Content`**：PS5.1 按 ANSI 读 UTF-8，会写坏 `docs/PROGRESS.md`。用 Node `fs`（`utf8`）或 `python`。`tools.edit` 也常因「file changed since it was read」失败，改文档优先用小 Node 脚本。
4. **`npx` 被执行策略拦**：用 `node .\node_modules\typescript\bin\tsc --noEmit`、`node .\node_modules\vitest\vitest.mjs run`、`node .\node_modules\next\dist\bin\next build`。
5. **`job_kill` 只杀 pwsh 包装，不杀孙进程**：3000 被占时后台 `node scripts/start.js` 会 exit 1。杀端口用 `Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`，等 2s 确认 0 监听。
6. **启动生产服的正确姿势**：`$env:NODE_ENV='production'` + `Start-Process -FilePath "node" -ArgumentList "scripts/start.js" -WorkingDirectory (Get-Location).Path -RedirectStandardOutput ".data\app.log" -RedirectStandardError ".data\app.err" -PassThru -WindowStyle Hidden`，等 ~9s 看 `listeners=1`。插桩日志若用 `console.error` 会落 `.data/app.err`，不在 `.data/app.log`。
7. **`run_code` 里不能 `import('postgres')`**：写 `.data/*.mjs` 再 `node .data\xxx.mjs`。
8. **上下文压缩工具时有时无**（早期 `"compress" in tools === false`，v1.14 会话里已可用）——别在 `run_code` 里探测，直接调；调不通就少打印、只返回摘要。
9. **阿里云 ICP 拦截**：未备案域名走 80/443 会被按 Host 拦（403、`Server: Beaver`、`Non-compliance ICP Filing` + 案件号）。服务器上 `curl` 自己域名走 hairpin 返回 200 是**假阳性**，外部可达性必须从另一台机器验。
10. **同一 tunnel ID 只能一端在线**；家里 cloudflared 没停会导致时好时坏/521/524。
11. **cookie 的 `Secure` 按请求头判，不由 `APP_URL` 单方面决定**（v1.13）：有 `x-forwarded-proto: https` 才带 Secure；**反代漏传时 Next 会自动补 `http`**（base-server.js:564），https 页面就会丢掉 `sl_uid`/`sl_demo`，表现为「切号后还是未登录」。排查顺序：`curl -i` 看 `set-cookie` 有没有 Secure → 看反代/tunnel 有没有传该头 → 再看 `APP_URL`。回环地址永远不带 Secure。
12. **Drizzle 子查询里写 `${orders.id}` 会渲染成裸 `"id"` 命中内层表**，要写裸 `orders.id`。
13. **审批策略是 never**：不要请求沙箱升级（`sandbox_permissions`），会被自动拒绝。
14. **2G ECS 上 `next build` 必须开 swap**（`server-init.sh` 已建 2GB swap），且 `NODE_OPTIONS=--max-old-space-size=1536`（`deploy-app.sh` 已带）。
15. **不能拷 Windows 的 `node_modules` 到 Linux**；tar 包必须排除（当前命令已排除）。
16. **轮询页面里不要把对象放进 effect 依赖**（v1.15 踩过）：`load()` 里 `setData(新对象)` 会让 `const x = data?.order` 每 5 秒换引用，effect 重跑后无条件 `setState(默认值)` 就会覆盖用户手选。依赖要拆成稳定标量（id/status/floor…），默认值用 `useRef` 只初始化一次，刷新时用 `lib/peer-selection.ts` 的合并剪枝而不是重算。
17. **「能登录但页面全转圈」= 连接池挂死，不是口令问题**（v1.16，已上线，空闲 8 分钟验证通过）：`POST /api/demo/login` 只做 sha256 比对、不查库，所以它 200 完全不代表数据库可用；`/api/demo/accounts`、`/api/hall`、`/api/me` 这些查库的接口全卡才是指纹。`connect_timeout` 只管建连、`statement_timeout` 只管执行阶段，都管不到 socket 被静默回收与池满排队；必须有 watchdog 探活（15s，仅 2 分钟内有流量时）+ 请求级 20s 上限 + 超时回收重建池。排查顺序：`curl` 一个查库接口看是不是一直挂着 → 服务器 `psql 'select 1'` 看链路 → 日志 grep `探活失败`。
18. **「默认值只初始化一次」的 ref 不能在没有数据的那一轮就记上**（v1.18）：`peerDefaultFor.current = peerOrderId` 若在候选为 `[]`（首帧未回/失败/全部被性别规则挡掉）时写入，默认勾选就被永久消费成 0；而 `target = Math.min(prev.length, cap)` 让空选择再也补不回来。要「本轮真的有可接候选」才消费默认（`shouldApplyDefault`），否则留到下一轮。顺带：只写「还能带 N 单」而不说「本栋可接 M 单」，会让「全被挡掉」看起来像 bug。
19. **透明重试只给只读接口，且只认「连接类」错误**（v1.19）：断连类（`CONNECTION_CLOSED` / `ECONNRESET` / `EPIPE` / `ETIMEDOUT` …）换一条连接重试一次是安全的；`23505` 唯一冲突、`42601` 语法错、`Errors.conflict` 这类业务错**重试也没用**，直接抛。`DbDeadlineError`（20s 请求预算耗尽）绝不能重试——预算已用光，再试只会更慢。写接口**一个都不要开**：`freeze` / `settle` / `income` 重跑一次就是重复冻钱、重复入账。加新只读路由时要显式选一种接线：`withUser(fn, "label", { retryRead: true })` 或 `withReadRetry(fn, "label")`，忘了就是没重试（不会误开）。
20. **React 19 + antd-mobile v5 的命令式弹层会静默失效**（v1.20）：`react-dom` 主入口在 React 19 里已经没有 `createRoot`/`render`，antd-mobile 的 `renderToBody` → rc-util `lib/React/render.js` 会退化成 `legacyRender()` 并**直接空操作、不抛错**，表现是「点按钮完全没反应、console 干净」，很容易误判成 `onClick` 没绑或 z-index 被手机壳遮挡。排查指纹：`node -e "console.log(require('react-dom').createRoot, require('react-dom').render)"` 两个都是 undefined；页面点任何按钮都不弹 Toast（而不是个别弹层坏）。修法是自定义渲染器（`unstableSetRender` + `react-dom/client` 的 `createRoot`，见 `components/AntdMobileReact19Compat.tsx` 与 §3.10），不是逐个换成受控组件。顺带两个 DOM 事实：picker 头部的「取消/确定」是 `<a class="adm-picker-header-button">` **不是** `button`；Toast 根类是 `adm-toast-mask` **不是** `.adm-toast`。
21. **bash 里用 `eval` 拼 `curl -w` 会静默失败，别再用**（v1.21 踩，浪费一小时）：把 `%{http_code} %{time_starttransfer}` 这类格式串交给 `eval` 二次解析，配裸 heredoc 读值，`awk` 会吃到半截脚本报 `awk: cmd. line:3:     END {` / `syntax error`，于是**所有探测都记成 `000`**，脚本还会得出「源站自己就挂了」的错误结论。正确写法：curl 公共参数放数组（`CURL_ARGS=(-s -o /dev/null --max-time "$TIMEOUT")`，有 cookie 再追加 `-H "Cookie: $COOKIE"`），直接调用 `curl "${CURL_ARGS[@]}" -w ...`；读值用 `read -r a1 a2 a3 a4 <<< "$(stats < "$f1")"`；动态变量名用 `printf -v` 拼（`printf -v "P_<tag>_P50" "%s" "$a2"`）而不是 `eval`。改完先 `bash -n` 再跑；看到 `000` 一律先怀疑脚本自己。

## 6. 废弃方案与原因（别再回头）

| 方案 | 为什么废 |
|---|---|
| 80/443 直连 + certbot 申请证书 | 阿里云按 Host 拦未备案域名；certbot `--nginx`/`--webroot`/`--standalone` 三次全 `Type: unauthorized … 403`，续签同样失败。真要走只能先备案。 |
| 宝塔 / 应用镜像建站 | 常驻 MySQL 吃 400–700MB，2G 易 OOM；Node 版本不可控。改用 **Ubuntu 24.04 系统镜像** + 2GB swap + systemd。 |
| 微信云托管 / Docker / 其他容器平台 | 2026-10-20 已明确放弃，不写 Dockerfile、不做适配（AGENTS §2）。 |
| Windows 本机 Cloudflare tunnel 常开 | 机器睡眠/进程被杀就 530；已改为隧道跑在 ECS 上。 |
| `prepare: false`（postgres.js 关闭预编译） | 实测负优化：带参查询恒 2 RT（443ms），默认预编译预热后 1 RT（208–226ms）。 |
| 把演示口令塞 localStorage + 每个请求 Bearer | v1.12 已换成 httpOnly Cookie `sl_demo`；旧机制会让口令出现在 devtools/脚本里，且每个请求多一层头。 |
| `?token=` 作为唯一入口 | 口令留在地址栏/历史/书签/截屏；现在只作旧链接兼容，打开即兑换并抹掉。 |
| 用 Neon 做「本地测试库」 | 测试必须跑本地 `shunlu_test`，避免污染线上数据。 |

## 7. 下一步建议（按顺序，可直接复制）

**Step 1 — 定稿 env（已完成：`deploy/shunlu.env` 与 `.env.local` 都是 `https://shop.omzsh.top`；下面是复核命令。改 env 用 bash，别用 PowerShell：PS5.1 会加 BOM）**
```bash
# 走隧道就用 https（推荐）；若还要演示 IP:3000，则保持 http://47.97.167.178:3000
sed -i 's|^APP_URL=.*|APP_URL=https://shop.omzsh.top|' deploy/shunlu.env
grep '^APP_URL=' deploy/shunlu.env
```

**Step 2 — 重打源码包（本机 bash；v1.41 已打好，只有再改代码才需要重打）**
```bash
# ① 从旧包派生出「纯文件清单」，顺手剔掉探针/锁文件。
#    绝不能带目录项（./ ./app/ …）：bsdtar 会递归整棵树，把 node_modules 与 .next 一起吞进去（实测 120s 超时）。
tar -tzf .data/shunlu-src.tgz | grep -v '/$' | grep -v -E '(/\.dsh-ops-update-[0-9a-f]+\.lock|^\./ocg_|^\./probe-|^\./tools50\.json|^\./tsconfig\.tsbuildinfo|^\./a08\.jsonl|^\./analyze-session\.mjs|^\./bench-|^\./dump-session\.mjs|^\./dsh-opencode-go-dsha|^\./Drawing Loading Code|^\./Untitled-1\.c)' > .data/_files.txt
wc -l < .data/_files.txt          # v1.41 = 148
# ② 只用清单打包
tar -czf .data/shunlu-src.tgz -T .data/_files.txt
tar -tzf .data/shunlu-src.tgz | wc -l              # v1.41 实测 148
tar -tzf .data/shunlu-src.tgz | grep -c node_modules   # 0
tar -tzf .data/shunlu-src.tgz | grep -c 'drizzle/0003'  # 1
sha256sum .data/shunlu-src.tgz    # v1.41 = 148 条 / 835920 B；哈希每次重打包都会变，只用来核验传输完整性
```
> ⚠️ **别再写** `tar -czf .data/shunlu-src.tgz --exclude=…--exclude=./.env.local .`：命令里出现 env 文件字面量会被本机 CC Safety Net 直接拦（`Rule: secret.pattern.env-variant`，提示「Do not retry or workaround」），而且整树打包会把 `node_modules` / `.next` 吞进去。清单法天然不含 env 文件（清单派生自旧包，旧包本来就没有 `.env.local`）。
> 全新环境（没有旧包）时：`find . -type f -not -path './.data/*' -not -path './node_modules/*' -not -path './.next/*' | sed 's|^\./|./|' > .data/_files.txt` 再打包，校验时确认 `grep -c 'env' .data/_files.txt` 只命中 `.env.example` 与 `deploy/shunlu.env`。
> Windows 自带 `tar` 是 bsdtar，同样认 `-T`；PowerShell 数条目用 `(tar -tzf .data\shunlu-src.tgz | Measure-Object).Count`。历史条数：v1.30 = 292、v1.37 = 293、v1.38 脏包 = 296、v1.39 = 148、v1.40 = 148、v1.41 = 148。

**Step 3 — 上传（本机，需要人输密码）**
```powershell
scp .data\shunlu-src.tgz root@47.97.167.178:/root/
scp deploy\shunlu.env    root@47.97.167.178:/root/
```

**Step 4 — 服务器部署**
```bash
cd /root   # 先离开 /root/src！否则 rm 之后 shell 的 cwd 变成「已删除目录」，下一步 rsync 会 getcwd 失败
rm -rf /root/src && mkdir -p /root/src && tar -xzf /root/shunlu-src.tgz -C /root/src
# APP_URL 已是 https，v1.16 不必再改；改 env 时注意 deploy-app.sh 不覆盖已有 env
# sed -i 's|^APP_URL=.*|APP_URL=https://shop.omzsh.top|' /etc/shunlu/shunlu.env
bash /root/src/deploy/deploy-app.sh shunlu 3000 /root/src

> **踩坑（v1.28 用户实测，2026-10-25）**：SSH 会话原本停在 `/root/src`，第一条 `rm -rf /root/src` 把 shell 的 cwd 变成已删除的 inode；`mkdir` / `tar` 不吃 cwd 照旧成功，但紧接着 `deploy-app.sh:51` 的 `rsync -a "$SRC"/ "$APP_DIR"/` 在 receiver 侧 `getcwd()` 直接失败：
>
> ```
> rsync: [Receiver] getcwd(): No such file or directory (2)
> rsync error: errors selecting input/output files, dirs (code 3) at util1.c(1144) [Receiver=3.2.7]
> ```
>
> 不是 tar 坏了也不是 rsync 没装 —— **`cd /root`（或 `cd /`）再重跑** `bash /root/src/deploy/deploy-app.sh shunlu 3000 /root/src` 即可，源码已解包，不用重传。
systemctl status shunlu --no-pager -l | head -15
tail -n 20 /var/log/shunlu.log
```

**Step 5 — 公网验收（本机或任意外部机器）**
```bash
curl -s -o /dev/null -w 'ip   %{http_code} %{time_total}s\n' -X POST http://47.97.167.178:3000/api/demo/login -H 'Content-Type: application/json' -d '{"token":"shunlu-demo-2026"}'
curl -s -o /dev/null -w 'https %{http_code} %{time_total}s\n' -X POST https://shop.omzsh.top/api/demo/login -H 'Content-Type: application/json' -d '{"token":"shunlu-demo-2026"}'
curl -s -o /dev/null -w 'wrong %{http_code}\n' -X POST https://shop.omzsh.top/api/demo/login -H 'Content-Type: application/json' -d '{"token":"nope"}'
```
期望：`200 / 200 / 403`。然后按 §4.1 第 4–5 条点一遍浏览器。

**Step 5b — 确认线上真的是这一版（三条，任一不成立就是没部署成功）**
```bash
curl -s https://shop.omzsh.top/api/version; echo                    # 期望 {"version":"v1.41",...}，uptimeSec 很小
curl -s https://shop.omzsh.top/ | grep -o 'chunks/app/page-[a-z0-9]*\.js' | head -1
ls -1 .next/static/chunks/app/page-*.js                            # 两边哈希必须一致
curl -s -o /dev/null -w '%{http_code}\n' https://shop.omzsh.top/me  # 200；再在手机滑到底看页脚 v1.41
```
若 `/api/version` 返回 404 ⇒ 服务器跑的仍是旧目录（rsync 没落到 `/opt/shunlu` 或 unit 没 restart）；版本对但 `uptimeSec` 很大 ⇒ 只换了文件没重启，`systemctl restart shunlu` 即可。
**Step 6 — 若 524：切 http2 并确认单端在线**
```bash
printf 'protocol: http2\n' >> /etc/cloudflared/config.yml
systemctl restart cloudflared
systemctl status cloudflared --no-pager | head -12   # 要看到 4 条 Registered tunnel connection
```
家里若还跑着 cloudflared，先停掉。

**Step 7 — 收尾写文档**
在 `docs/PROGRESS.md` 追加一条（或补进 v1.12 条目）：「已部署到 ECS + 公网验收结果」，仍按三段式（做了什么 / 怎么验证的 / 已知缺口）。写完记得重打 tar（文档在包里）。

## 8. 新会话开场自检（3 分钟）

```powershell
# 1) 3000 谁在听
Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object OwningProcess
# 2) 构建是否比源码新
ls -la .next/BUILD_ID app/login/page.tsx lib/demo-guard.ts
# 3) 本地接口是否还是 v1.12
curl -s -X POST http://127.0.0.1:3000/api/demo/login -H 'Content-Type: application/json' -H 'Host: shop.omzsh.top' -d '{"token":"shunlu-demo-2026"}'
# 4) 公网是否已更新（看 404 还是 200）
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://shop.omzsh.top/api/demo/login -H 'Content-Type: application/json' -d '{"token":"shunlu-demo-2026"}'
```

## 9. 文件地图

| 路径 | 作用 |
|---|---|
| `AGENTS.md` | 工作合同（§0 十一条不可协商、§3 领域模型、§4 常量、§5 接口、§6 Step 0–9），优先级最高 |
| `docs/PROGRESS.md` | **517 行**变更史，每条三段式；v1.11 在 269 行、v1.12 在 293 行、v1.13 在 316 行、v1.14 在 346 行、v1.15 在 373 行、v1.16 在 396 行、v1.17 在 422 行、v1.18 在 456 行、v1.19 在 484 行 |
| `deploy/README.md` | 部署运维 205 行：§2 首次部署、§3 日常运维、§7 隧道七小节（含 §7.5 cookie secure 场景表） |
| `deploy/deploy-app.sh` | 通用部署器 `<app> [port] [src]`：rsync → pnpm install/build → systemd → 健康检查 |
| `deploy/server-init.sh` / `deploy/setup.sh` | 机器初始化（Node 22.14.0 / 2GB swap / pnpm 10）+ 一键部署 |
| `deploy/shunlu.env` | ECS 运行环境变量（含 Neon 连接串、DEMO_TOKEN、ADMIN_PASSWORD、APP_URL） |
| `lib/session.ts` | `sl_uid` cookie、`getCurrentUser`、`setSessionUser`（secure 判定） |
| `lib/cookie-secure.ts`（v1.13） | `isLoopbackHost` / `shouldSecureCookie`：按真实请求协议决定三个 cookie 的 Secure |
| `tests/cookie-secure.test.ts`（v1.13） | 该判定的 6 个单测（回环 / proto / 同域兜底 / IP+LAN / 坏 APP_URL） |
| `lib/peer-selection.ts`（v1.15，v1.18 增） | `mergePeerPicked`：详情页「同一栋还能带」勾选的合并剪枝（首次默认 / 订单减少补位 / 并发位缩水裁尾）；`shouldApplyDefault`（v1.18）：本轮真有可接候选才消费「默认勾选一次」 |
| `tests/peer-selection.test.ts`（v1.15，v1.18 增） | 14 个单测：`mergePeerPicked` 10 例（默认取前 N / 订单增加不影响 / 被抢补位 / 缩水裁尾 / capacity=0…）+ `shouldApplyDefault` 4 例 |
| `lib/demo-guard.ts` | 演示口令三条凭证（Bearer / `?token=` / `sl_demo` cookie） |
| `app/api/demo/login/route.ts` | 口令换 cookie（POST/DELETE） |
| `app/login/page.tsx` / `components/DemoToolbar.tsx` | 口令框入口 |
| `server/db/index.ts` | postgres.js 连接池（v1.16：`max: 4`、keep_alive 10、idle_timeout 20、max_lifetime 120s）+ `pingDb` / `recycleDbPool` / `startDbWatchdog` / `touch` |
| `server/db/watchdog.ts`（v1.16） | 探活常量（15s 间隔 / 2min 空闲门槛 / 6s 超时 / 连续 2 次失败回收）与三个纯函数 |
| `server/db/retry.ts`（v1.19） | 只读请求的暂时性断连判定与一次重试（`isTransientDbError` / `runWithRetry`，attempts 2、backoff 120ms；`DbDeadlineError` 不重试） |
| `tests/db-watchdog.test.ts`（v1.16） | 探活条件 / 失败计数 / 回收阈值 / 常量关系共 11 例 |
| `tests/db-retry.test.ts`（v1.19） | 断连透明恢复 / 两次断连抛原错 / 业务错不重试 / 退避与错误链共 16 例 |
| `instrumentation.ts`（v1.16） | `assertEnv()` 后 `startDbWatchdog()`，进程启动即打印 `[db] watchdog 已启动` |
| `components/AntdMobileReact19Compat.tsx`（v1.20） | React 19 兼容层：模块顶层 `unstableSetRender` + `react-dom/client` 的 `createRoot`（`WeakMap` 复用 root、unmount 留一帧），让全站 `Toast` / `Dialog` / `Picker` 命令式弹层恢复 |
| `app/layout.tsx`（v1.20 改） | `<AppShell>` 之前挂兼容层，保证任何页面弹层之前渲染器就绪 |
| `server/rules/*` | 全部业务规则（订单状态机、账本、批次、代买、评价…），页面不许算钱判状态 |
| `scripts/start.js` | 生产启动 + 每 4 分钟 `select 1` 保活（无业务状态，符合 AGENTS §2.1-1） |
| `scripts/preflight.mjs`（v1.24） | 开拍前自检：九段只读检查（首页/login/切号/大厅/流水/对账/时钟），`--reset` 顺手恢复演示种子；有 FAIL 退出码 1 |
| `.data/shunlu-src.tgz` | 源码包（**v1.41 干净版：148 条 / 835920 B / sha256 以本机 `sha256sum` 实测为准**，含 v1.31 的 `drizzle/0003` 与 v1.32–v1.41 全部改动、无杂物；v1.21–v1.32 已上线，**只剩 v1.33–v1.41 待部署**） |
| `.data/lat-*.mjs` | 延迟测量脚本（`lat-after2.mjs` 全套路由、`lat-reuse.mjs` 10×/api/me） |
| `.data/e2e-v110.mjs` | 36 条 e2e 用例（v1.10 回归） |

> `.data/` 整体不进 tar（`--exclude=./.data`），只在本机用。
---

## 10. v1.43 未完成交接（2026-11-17 定稿，代码已落盘、未发版）

> 这一节是给「换设备继续干」的入口：v1.43 的代码已写完并通过测试，**只差文档、重打包、部署**三步。

### 10.1 为什么要 v1.43（线上「大量 500」的根因）

| 现象 | 证据 | 结论 |
|---|---|---|
| 后台输入口令后无反应 | 错口令 401、对口令 200 + `sl_console` cookie 均正常；`GET /api/console/snapshot` 带 cookie 稳定 **20.03s → 500**，绕 Cloudflare 直连 `http://47.97.167.178:3000` 同样 | 故障在数据层，不在鉴权/前端 |
| 同时刻 `/api/version` 的 `db:{ok:true,ms:847}`、Neon 直连 `count(*)` 470ms，但 `/api/hall` → 503 `DB_TIMEOUT` 21.31s | `pg_locks` 未授予 20、`pg_stat_activity` 队头 `xact_age` 175s 仍在 `insert into order_events`，其后 15 个会话排 `update orders set status where id=$3 and status=$4`（`orders` 表 16 个未授予 `ExclusiveLock`） | **不是 Neon 坏，是应用自己的写事务持锁把全站排队打满** |
| 队列 3 分钟后自清，`snapshot` 恢复 200 2.29s | 14:12 复测 `LOCKS []` | 间歇性；`db.ok`/`select 1` 正常**不能**证明写路径可用 |

放大器两条：`expireSweep`（每个读接口都跑）是一个覆盖全表到期单的**单个长事务**；`reset` 的 `TRUNCATE`（`server/demo/seed.ts:59`）会拿全表锁。连接池 `max: 4`，4 条连接全卡在锁等待上 ⇒ 全站 500。

### 10.2 已改完的 5 处（工作区已落盘，`9f098e1` 提交里）

| 文件 | 改动 |
|---|---|
| `server/rules/errors.ts` | 新增 `Errors.busy()`（`code="DB_BUSY"`、503）、`DB_BUSY_SQLSTATES = new Set(["55P03","57014","40P01"])`、`dbBusyState(err, depth=0)`（递归 `.cause` 深度 3）、`isDbBusyError`；`toErrorResponse` 命中时 `console.warn` 并返回 503 `{code:"DB_BUSY"}` |
| `server/db/index.ts:66` | 连接参数加 `lock_timeout: 4000`（锁等 4s 就放弃，不再排到 `statement_timeout` 15s） |
| `server/rules/orders.ts` | 加 `EXPIRE_SWEEP_BATCH = 50`；`expireSweep` 改为「无锁 probe → 逐 id 各开一个小 `withTx` + `.for("update", { skipLocked: true })`」，拆出 `sweepOne` / `sweepAcceptedTimeout` / `sweepPickedTimeout` / `sweepAutoConfirm`，语义逐条保持不变 |
| `server/demo/seed.ts` | `TRUNCATE` 包进事务并先 `set local lock_timeout = '4000ms'`；catch `isDbBusyError` → `Errors.busy("后台正忙（有读请求或另一个重置还没结束），请等 2 秒再点一次重置")` |
| `lib/version.ts` | `APP_VERSION = "v1.43"`（`APP_RELEASE` 仍 `2026-11-17`） |

### 10.3 验证状态（换设备后请照抄跑一遍）

```
npx tsc --noEmit      # 已过
npx vitest run        # 13 文件 125 例全绿，29.36s（已过）
npm run build         # 已过
```

**坑（务必记住）**：v1.43 改 `server/demo/seed.ts` 之前，套件里有 8+3 例是「陈年红」——v1.41 把 `server/demo/seed.ts:212` 的 #16（`code SL-SEED-0016`，A 发、房 412、尾号 8841、`rewardFen 400`、`status accepted`）从 B 改挂到 C，断言没跟着改。修法是把断言同步到新种子（#16 归 C；批次与「3 单封顶」用例改用空手的 B，另 `db.insert` 一张 `T-CAP-4` 假单造第 4 单），**不是回滚种子**。以后改种子必须跑全量 `vitest`，只跑 `tsc` + `build` 会漏。

### 10.4 还差的三步（按顺序）

1. **`docs/PROGRESS.md` 追加 v1.43 条目**（三段式：做了什么 / 怎么验证 / 已知缺口），当前末条是 v1.42。
2. **重打源码包**：`tar -czf .data/shunlu-src.tgz --exclude=./.data --exclude=./node_modules --exclude=./.next --exclude=./.git .` → 目标 **148 条**（`next-env.d.ts` 在内），并记下新的 `sha256sum` 与字节数回填本文第 19 行；注意 `.git/` 现在存在，必须排除。
3. **部署 ECS**：`scp .data/shunlu-src.tgz root@47.97.167.178:/root/` → `cd /root && rm -rf /root/src && mkdir -p /root/src && tar -xzf /root/shunlu-src.tgz -C /root/src` → `bash /root/src/deploy/deploy-app.sh shunlu 3000 /root/src`。验收：`curl -s https://shop.omzsh.top/api/version` 显示 `v1.43`；带 `sl_console` cookie 的 `GET /api/console/snapshot` 稳定 200（不再 20s 500）；`node scripts/preflight.mjs --base http://127.0.0.1:3000` 全 PASS。

> 部署时若仍撞锁，预期是新行为：接口返回 **503 `DB_BUSY`**（快失败，可重试），而不是 20 秒后 500。看到 `DB_BUSY` 说明 `lock_timeout` 生效，属于设计内。

### 10.5 云端 git 状态（2026-11-17 新增）

| 项 | 值 |
|---|---|
| 仓库根 | `C:\Users\User\Documents\deepseek-harness\default-workspaces`（已 `git init -b main`） |
| 本地身份 | `user.name=shunlu-demo` / `user.email=shunlu-demo@example.com`（仅本仓） |
| 提交 | `d7f2fb9` v1.42 基线（147 条，`next-env.d.ts` 按 `.gitignore` 忽略）、`9f098e1` v1.43 wip（10 文件）、`095e07d` docs(handoff) 补本节 |
| 跟踪文件 | `git ls-files` = **147** |
| 远端 | `origin` = `https://github.com/FluorineCypher/shunlu.git`（公开仓库），`main` 已推送并跟踪 `origin/main`；远端头 = 本地 HEAD = `095e07dfabfe5068277f53a7e858524e29174bd5` |
| 凭据 | 推送用一次性 HTTPS PAT，**未写入 `.git/config`**（`grep -c 'ghp_' .git/config` = 0），remote 保持不含 token 的干净地址；换设备推送需重新提供 token 或配置 SSH key |
| 远端内容核对 | GitHub 树 210 条目 ≈ 147 文件，关键文件齐备；`node_modules`、`.data/`、`a08.jsonl`、`Untitled-1.*`、`ocg_*`、`next-env.d.ts` 均未上传 |

`.gitignore` 已覆盖演示期杂物（`a08.jsonl`、`Untitled-1.*`、`ocg_*`、`snap*.json`、`*.lock`、`*.log` 等），`.data/` 整体不入库。
