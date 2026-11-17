#!/usr/bin/env bash
# 顺路 · 一键部署（= 机器初始化 + 部署 shunlu 应用；幂等，可重复跑）
# 用法：sudo bash /root/src/deploy/setup.sh
# 前置：源码已解压到 /root/src；环境变量文件已放到 /root/shunlu.env
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
PORT=${PORT:-3000}
SRC_DIR=${SRC_DIR:-/root/src}
APP_DIR=${APP_DIR:-/opt/shunlu}

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m[x] %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "请用 root 运行（sudo bash deploy/setup.sh）"
[ -f "$HERE/server-init.sh" ] || die "缺 $HERE/server-init.sh（源码包不完整）"
[ -f "$HERE/deploy-app.sh" ] || die "缺 $HERE/deploy-app.sh（源码包不完整）"

say "0/3 机器初始化（系统依赖 / Node / swap / pnpm / 目录约定）"
bash "$HERE/server-init.sh"

say "1/3 准备顺路的环境变量（唯一真源 /etc/shunlu/shunlu.env）"
install -d -m 700 /etc/shunlu
if [ -f /root/shunlu.env ] && [ ! -f /etc/shunlu/shunlu.env ]; then
  install -m 600 /root/shunlu.env /etc/shunlu/shunlu.env
  echo "已把 /root/shunlu.env 安装到 /etc/shunlu/shunlu.env"
elif [ ! -f /etc/shunlu/shunlu.env ] && [ -f "$APP_DIR/.env.local" ]; then
  install -m 600 "$APP_DIR/.env.local" /etc/shunlu/shunlu.env
  echo "沿用旧的 $APP_DIR/.env.local"
fi
[ -f /etc/shunlu/shunlu.env ] || die "缺环境变量：先 scp deploy/shunlu.env 到 /root/shunlu.env"
chmod 600 /etc/shunlu/shunlu.env
grep -E '^(APP_URL|DEMO_MODE|STORAGE_DRIVER)=' /etc/shunlu/shunlu.env | sed 's/=.*/=<已设置>/'
if grep -q '^ADMIN_PASSWORD=..*' /etc/shunlu/shunlu.env; then echo "ADMIN_PASSWORD 已设置"; else echo "ADMIN_PASSWORD 未设置（后台关闭）"; fi

say "2/3 部署 shunlu 应用"
HEALTH_PATH=/api/hall bash "$HERE/deploy-app.sh" shunlu "$PORT" "$SRC_DIR"

say "3/3 完成"
IP=$(curl -fsS -m 10 https://ifconfig.me 2>/dev/null || echo '<公网IP>')
printf '\033[1;32m公网入口：http://%s:%s/?token=shunlu-demo-2026\033[0m\n' "$IP" "$PORT"
printf '安全组记得放行 TCP %s（0.0.0.0/0）。\n' "$PORT"
printf '\n常用运维：\n'
printf '  systemctl restart shunlu        # 重启\n'
printf '  tail -f /var/log/shunlu.log     # 看日志\n'
printf '  bash deploy/deploy-app.sh shunlu %s /root/src   # 改码后重新部署\n\n' "$PORT"
