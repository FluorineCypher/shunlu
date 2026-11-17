#!/usr/bin/env bash
# 通用应用部署器：这台服务器上所有 Node 应用共用同一套目录/服务/日志约定。
# 用法：sudo bash deploy/deploy-app.sh <app> [port] [src]
#   例：sudo bash deploy/deploy-app.sh shunlu 3000 /root/src
#   例：sudo bash deploy/deploy-app.sh blog   3001 /root/blog   （静态站点配 SKIP_BUILD=1）
# 可选环境变量：
#   START_CMD     启动命令，默认 "node scripts/start.js"
#   HEALTH_PATH   健康检查路径，默认 "/"
#   SKIP_BUILD=1  跳过 pnpm install/build（纯静态站点，交给 nginx 直接托管）
set -euo pipefail

APP=${1:-}
[ -n "$APP" ] || { echo "用法：deploy-app.sh <app> [port] [src]" >&2; exit 1; }
PORT=${2:-3000}
SRC=${3:-/root/src}

ENV_FILE=/etc/$APP/$APP.env
APP_DIR=/opt/$APP
DATA_DIR=/srv/$APP
LOG=/var/log/$APP.log
START_CMD=${START_CMD:-node scripts/start.js}
HEALTH_PATH=${HEALTH_PATH:-/}

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()  { printf '    \033[1;32m✓ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m[x] %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "请用 root 运行"

say "1/5 检查 $APP"
install -d -m 700 "/etc/$APP"
if [ ! -f "$ENV_FILE" ] && [ -f "/root/$APP.env" ]; then
  install -m 600 "/root/$APP.env" "$ENV_FILE"
  ok "已把 /root/$APP.env 安装到 $ENV_FILE"
fi
[ -f "$ENV_FILE" ] || die "缺环境变量 $ENV_FILE（照 deploy/shunlu.env 准备一份放到 /root/$APP.env）"
chmod 600 "$ENV_FILE"

# 端口冲突：本应用的 unit 已在跑则允许（那是重启），否则必须空着
if ! systemctl is-active --quiet "$APP" 2>/dev/null; then
  if ss -lnt 2>/dev/null | awk -v p=":$PORT" 'index($4,p)>0 {f=1} END {exit !f}'; then
    echo "    端口占用情况：$(ss -lntp 2>/dev/null | grep ":$PORT" || true)"
    die "端口 $PORT 已被其它进程占用，换一个（3001 / 3002 …）"
  fi
fi
ok "env=$ENV_FILE port=$PORT data=$DATA_DIR"

say "2/5 同步源码 $SRC → $APP_DIR"
[ -d "$SRC" ] || die "找不到源码目录 $SRC"
install -d -m 755 "$APP_DIR" "$DATA_DIR"
rsync -a --exclude=node_modules --exclude=.next --exclude=.data --exclude=.env.local --exclude='*.log' "$SRC"/ "$APP_DIR"/
ln -sfn "$ENV_FILE" "$APP_DIR/.env.local"
ok "源码已同步（保留原有 node_modules / .next）"

say "3/5 安装依赖并构建"
if [ "${SKIP_BUILD:-0}" = "1" ]; then
  ok "SKIP_BUILD=1，跳过构建（静态站点请用 nginx 托管 $APP_DIR/out 或 dist）"
else
  [ -f "$APP_DIR/package.json" ] || die "$APP_DIR 没有 package.json；静态站点请设 SKIP_BUILD=1"
  cd "$APP_DIR"
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
  NODE_OPTIONS=--max-old-space-size=1536 pnpm build
  ok "构建完成"
fi

say "4/5 注册 systemd"
cat > "/etc/systemd/system/$APP.service" <<UNIT
[Unit]
Description=$APP
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
Environment=NODE_ENV=production
Environment=PORT=$PORT
ExecStart=/bin/bash -lc "exec $START_CMD"
Restart=always
RestartSec=3
StandardOutput=append:$LOG
StandardError=append:$LOG

[Install]
WantedBy=multi-user.target
UNIT

cat > "/etc/logrotate.d/$APP" <<ROT
$LOG {
    weekly
    rotate 4
    compress
    missingok
    notifempty
    copytruncate
}
ROT

systemctl daemon-reload
systemctl enable "$APP" >/dev/null 2>&1 || true
systemctl restart "$APP"
ok "systemd $APP.service 已启动，日志 $LOG"

say "5/5 健康检查"
code=""
for i in $(seq 1 20); do
  # curl 连不上时 -w 自己会输出 000，所以这里绝不能写 "|| echo 000"（会拼成 000000）
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 5 "http://127.0.0.1:$PORT$HEALTH_PATH" 2>/dev/null || true)
  case "$code" in 2*|3*) break ;; esac
  sleep 2
done
case "$code" in
  2*|3*) echo "    GET http://127.0.0.1:$PORT$HEALTH_PATH -> HTTP $code" ;;
  *)
    echo "    GET http://127.0.0.1:$PORT$HEALTH_PATH -> 没起来（最后一次：${code:-无响应}）"
    echo "    ---- systemctl status $APP ----"
    systemctl status "$APP" --no-pager -l 2>&1 | head -20 || true
    echo "    ---- 日志尾部 $LOG ----"
    tail -n 30 "$LOG" 2>/dev/null || echo "（日志为空）"
    echo "    ---- 端口 ----"
    ss -lntp 2>/dev/null | grep ":$PORT" || echo "（该端口没有监听）"
    EXIT_NOTE=1
  ;;
esac
if [ "${EXIT_NOTE:-0}" = "1" ]; then
  printf '\n\033[1;31m%s 部署了，但服务没在端口 %s 上响应。\033[0m\n' "$APP" "$PORT"
  printf '  手动跑一遍看报错：cd %s && NODE_ENV=production PORT=%s %s\n\n' "$APP_DIR" "$PORT" "$START_CMD"
  exit 1
fi
printf '\n\033[1;32m%s 部署完成。\033[0m\n' "$APP"
printf '  状态 systemctl status %s\n  日志 tail -f %s\n  端口 %s（安全组要放行）\n\n' "$APP" "$LOG" "$PORT"
