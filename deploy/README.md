# 部署到阿里云 ECS（Ubuntu 22.04 / 24.04，2C2G）

Neon 就是运行时数据库，Next 进程直接连它——**没有"发布构建产物到云平台"这一步**，服务器上只是跑一个常驻进程。

本文按「一台机器跑多个应用」来组织：顺路只是第一个应用，以后加博客 / 网盘 / 备忘录，都走同一套约定，不再改脚本。

## 0. 先决条件

- 安全组放行要用的端口（现在顺路是 **TCP 3000**，0.0.0.0/0）。
- 大陆地域未备案时，域名 + 80/443 走不通；短期直接 `http://公网IP:端口`。
- 系统镜像选 **Ubuntu 24.04 LTS 纯净系统**（不要宝塔/应用镜像：常驻 MySQL 吃 400–700MB，Node 版本也不可控）。

## 1. 目录与服务约定（`deploy/deploy-app.sh` 自动遵守）

| 用途 | 路径 |
|---|---|
| 代码 | `/opt/<app>`（部署只覆盖源码，保留 node_modules / .next） |
| 配置 | `/etc/<app>/<app>.env`（chmod 600，唯一真源；应用内 `.env.local` 是它的软链） |
| 数据 | `/srv/<app>`（上传、sqlite、静态文件等要长期保留的东西） |
| 日志 | `/var/log/<app>.log`（已配 logrotate，weekly × 4，compress） |
| 服务 | systemd `<app>.service`（Restart=always，NODE_ENV=production） |

服务器上 `cat /etc/apps-layout.md` 也能看到这份约定。

## 2. 首次部署顺路

Windows 本机：

~~~powershell
scp .data\shunlu-src.tgz root@47.97.167.178:/root/
scp deploy\shunlu.env    root@47.97.167.178:/root/
~~~

服务器：

~~~bash
mkdir -p /root/src && tar -xzf /root/shunlu-src.tgz -C /root/src
bash /root/src/deploy/setup.sh
~~~

`setup.sh` = `server-init.sh`（机器初始化，幂等）+ 装环境变量 + `deploy-app.sh shunlu 3000 /root/src`。
首次约 3–6 分钟（装 Node、开 swap、pnpm install、next build）。

访问：`http://47.97.167.178:3000/`

演示口令（`DEMO_TOKEN`）现在**在页面上像密码一样输入一次**，换成 httpOnly Cookie `sl_demo`
（12 小时），此后不再需要往地址栏带 token。旧链接 `/?token=...` 仍可用：打开时自动兑换 Cookie，
并把 `token` 从地址栏抹掉（不留在历史 / 书签 / 截屏里）。

口令与后台口令分别写在对应用户的 env 里：`DEMO_TOKEN`（演示口令）、`ADMIN_PASSWORD`（`/admin/console`）。

## 3. 日常运维

~~~bash
systemctl status  shunlu        # 状态
systemctl restart shunlu        # 重启
tail -f /var/log/shunlu.log     # 日志（stdout+stderr 都在这里）
journalctl -u shunlu -n 100     # 更早的启动失败原因
~~~

改过源码后重新部署（Windows 重新打 tar → scp → 服务器）：

~~~bash
tar -xzf /root/shunlu-src.tgz -C /root/src
bash /root/src/deploy/deploy-app.sh shunlu 3000 /root/src
~~~

或者直接跑 `bash /root/src/deploy/setup.sh`（多了机器初始化的重复检查，无害）。

## 4. 以后加新应用

同一个部署器，换三个参数就行：

~~~bash
sudo bash deploy/deploy-app.sh <应用名> <端口> <源码目录>
~~~

- 环境变量放 `/root/<应用名>.env`，脚本会自动装到 `/etc/<应用名>/<应用名>.env`。
- 启动命令不是 `node scripts/start.js` 时：`START_CMD="node server.js" bash deploy/deploy-app.sh ...`
- 纯静态站点（Hugo / Astro 产物）：`SKIP_BUILD=1 bash deploy/deploy-app.sh blog 3001 /root/blog`，然后让 nginx 直接指 `/opt/blog`，不占 Node 进程。

端口规划建议（每个应用一个，脚本会检查冲突）：

| 端口 | 应用 |
|---|---|
| 3000 | 顺路（Next.js） |
| 3001 | memos（跨设备备忘录，Go 单文件，~50MB） |
| 3002 | alist / filebrowser（网盘，Go，~40MB） |
| 80 | nginx（可选，静态博客 + 统一反代，见 §6） |

2C2G 的现实：`next start` 常驻 150–260MB，`next build` 峰值 1.5–2GB（靠 swap 撑过去）。
所以**再上一个 Next 应用就会吃紧**，静态站和 Go 单文件服务才是这台机器的甜点区；真要跑两个 Next，升 4G。

## 5. 这台机器上的数据放哪

- 顺路上传的图片：`/srv/shunlu/uploads`（`STORAGE_DRIVER=local` 时）。
- 新应用的数据目录自己建在 `/srv/<app>`，别写进 `/opt/<app>`——重新部署会覆盖代码目录。

## 6. 可选：nginx 做域名反代（有备案域名再做）

未备案时 80 端口对域名不可用，这一段可以先跳过。等有备案域名：

~~~bash
apt-get install -y nginx
~~~

`/etc/nginx/sites-available/apps.conf`：

~~~nginx
server {
    listen 80;
    server_name blog.example.com;
    root /opt/blog/public;
    index index.html;
}

server {
    listen 80;
    server_name memos.example.com;
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
~~~

注意：反代**必须**传 `X-Forwarded-Proto`（上面的配置已传）。漏传时 Next.js 会按明文 socket 补成 `http`，https 页面拿到的 cookie 不带 `Secure`，浏览器会丢登录态；`APP_URL` 不是兜底开关（见 §7.5）。

## 7. 公网访问：只有 Cloudflare 隧道这一条路（已落地）

### 7.1 为什么不是 80/443 直连

阿里云对**未备案域名**做 Host 层拦截：域名解析到本机、请求打到 80 端口会被直接改写响应（403 页带
`Non-compliance ICP Filing` 和案件号，响应头 `Server: Beaver`）。表现是浏览器打不开、curl 403。

**别再试 certbot**（2026-10-21 已试三次，全部 `Type: unauthorized ... 403`）：`--nginx` / `--webroot` /
`--standalone` 都卡在同一个 HTTP-01 校验请求被拦，续签同样会失败——就算侥幸签发，路径也不可持续。
真要 80/443 直连，唯一正解是**备案**，不是改脚本。

一个坑：**在服务器上 curl 自己的公网域名得到 200 是假阳性**。那走 hairpin 回到本机，不经过阿里云的拦截层。
外部可达性必须从另一台机器 / 外部检测服务验。

### 7.2 现在的实际链路

~~~text
浏览器 --https--> Cloudflare 橙云 --Tunnel--> cloudflared(ECS) --http--> 127.0.0.1:3000
~~~

阿里云只看到一条出向的 QUIC 连接，看不到入向 Host/SNI，所以备案问题绕过；https 证书由 Cloudflare 边缘提供。

服务器上的文件：

| 文件 | 内容 |
|---|---|
| `/etc/cloudflared/config.yml` | `tunnel: 04c14c43-5535-42c6-8bf6-7f7b2b8f81d4`、`ingress: shop.omzsh.top → http://127.0.0.1:3000`、兜底 `http_status: 404` |
| `/etc/cloudflared/<UUID>.json` | 隧道凭证（`cloudflared tunnel create` 生成） |
| `/etc/systemd/system/cloudflared.service` | 开机自启，`cloudflared tunnel run` |

~~~bash
systemctl status cloudflared      # 4 条 Registered tunnel connection 才算健康
journalctl -u cloudflared -n 50
~~~

**同一个 tunnel ID 只能有一端在线**。家里那台的 cloudflared 必须停掉（否则请求被随机分到不可达的那端，
表现为时好时坏 / 521 / 524）。

### 7.3 装 cloudflared 的坑（2026-10-3 版本）

apt 源要用 `https://pkg.cloudflare.com/cloudflare-main.gpg`——它已经是 dearmor 后的二进制 keyring，
**不能再过一遍 `gpg --dearmor`**，否则出现 `NO_PUBKEY` 甚至 `Segmentation fault`。

### 7.4 502 / 521 / 524 怎么查

| 现象 | 含义 | 处置 |
|---|---|---|
| 502 | 隧道通了，但回源连不上 3000 | `systemctl status shunlu`、`curl -s localhost:3000 -o /dev/null -w '%{http_code}'` |
| 521 | Cloudflare 连不上源站（隧道不在线） | `systemctl restart cloudflared`，确认没有第二端在线 |
| 524 | 隧道在线但回源超时（100s） | 通常是 QUIC/UDP 7844 被网络中间设备静默丢弃；`/etc/cloudflared/config.yml` 加 `protocol: http2` 回落 TCP，然后 `systemctl restart cloudflared` |
| 一直转圈、无响应 | 客户端 IPv6 黑洞 / 隧道调度到远节点 | 换网络或用 `-4` 试；域名比 IP 慢属正常（隧道边缘在境外） |

### 7.5 APP_URL 与 Cookie 的 secure（已改成按实际请求协议判定）

定稿：**`APP_URL=https://shop.omzsh.top`**，但它不再单独决定 `secure`。

`lib/cookie-secure.ts` 的 `shouldSecureCookie(host, x-forwarded-proto)` 按这次请求实际走的协议判断：

| 场景 | 判定 |
|---|---|
| 隧道（Cloudflare 带 `X-Forwarded-Proto: https`） | Secure |
| `http://47.97.167.178:3000` 直连（无该头、Host 与 APP_URL 不同域） | 不 Secure（否则浏览器丢 cookie） |
| 局域网 `http://192.168.x.x:3000` 给评委看 | 不 Secure |
| `localhost` / `127.0.0.1` | 永远不 Secure |
| 同机反代但漏传 `X-Forwarded-Proto` | **不 Secure**（Next.js 会按 socket 自动补 `x-forwarded-proto: http`） |

> 为什么「漏传」不是兜底成功：Next 15 在 `node_modules/next/dist/server/base-server.js:564` 有
> `req.headers['x-forwarded-proto'] ??= isHttps ? 'https' : 'http'`，请求进来时缺这个头就会被填成
> `http`（反代到本机的 socket 是明文），于是 `shouldSecureCookie` 的第三个分支根本走不到。
> 结论：**反向代理必须传 `X-Forwarded-Proto`**，不能指望 `APP_URL` 兜底；Cloudflare 隧道与
> `deploy/nginx.conf` 都已传。

所以 **https 隧道和 IP:3000 两种访问可以同时用**，切号都不掉登录态。改了环境变量要
`systemctl restart shunlu`；改了代码要走一次 `deploy-app.sh`（会重新 build）。

### 7.6 一条命令体检公网链路

页面慢时，先用 `deploy/check-public.sh` 分清「应用/数据库慢」还是「Cloudflare 隧道慢」，再决定动哪里。只发只读 GET，不写库、不需要口令。

```bash
bash deploy/check-public.sh                 # 默认每项 12 次，本机跑
ROUNDS=20 bash deploy/check-public.sh       # 要看长尾时
COOKIE="sl_demo=...; sl_uid=11" bash deploy/check-public.sh   # 带登录态测接口
DOMAIN=https://别的域名 ORIGIN=http://127.0.0.1:3000 bash deploy/check-public.sh
```

四段对照，每段打 N 次：域名首页 `/`、源站首页 `http://47.97.167.178:3000/`、域名静态资源、源站静态资源（chunk 路径从首页 HTML 自动捞）。输出状态码分布 + 首字节/总耗时 min·p50·p90·max，最后给结论：

| 结论 | 含义 | 该动的 |
|---|---|---|
| 源站自己非 200 | 应用或数据库出错 | 看 `/var/log/shunlu.log`，按 §7.4 + HANDOFF §4.5 |
| 源站 p50 > 0.8s | 应用/数据库慢 | 同上；查 Neon 往返（92ms/RT） |
| 域名比源站慢 > 0.8s | 隧道段慢（最常见） | 见 §7.6.1 |
| max/p50 > 3 | 抖动大 | 先按 §7.6.1 切 http2 再看 |

#### 7.6.1 隧道慢怎么办（ECS 上执行，需 SSH）

1. 先确认这个 tunnel 只有一台 cloudflared 连着（同一 tunnel ID 只能一端在线，否则随机分到不可达端）：

```bash
cloudflared tunnel info 04c14c43-5535-42c6-8bf6-7f7b2b8f81d4
```

CONNECTOR 列表里应只有 ECS 一个；家里那台如果还连过，`systemctl stop cloudflared`。

2. 回源协议从 QUIC 降到 http2（QUIC 走 UDP 7844，不少中间设备静默丢包，表现就是首屏卡 100 秒后 524 或一直转圈）：

```bash
grep -q '^protocol:' /etc/cloudflared/config.yml || echo 'protocol: http2' >> /etc/cloudflared/config.yml
systemctl restart cloudflared
systemctl status cloudflared --no-pager | head -5
```

3. 回本机复测并对比 p50：

```bash
ROUNDS=20 bash deploy/check-public.sh
```

验收：域名段 p50 从 ~1.3s 降到 0.5s 以内、20 次全 200、max/p50 回落到 3 以内。

**2026-10-24 实测**（本机 → 线上，12 次）：域名首屏 TTFB p50 **1.325s** / max 4.734s，源站 p50 **0.035s** ⇒ 隧道每请求固定加价 0.67–1.3s。这是首屏 1.3–3s 的主因，与 Neon 92ms/RT 关系不大。
