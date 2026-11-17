#!/usr/bin/env bash
# 这台服务器的一次性初始化（幂等，可重复跑）。所有应用共用这个基础环境。
# 用法：sudo bash deploy/server-init.sh
# 内容：系统依赖 → Node 22 → 2GB swap → pnpm 10（不用 corepack）→ 目录约定
set -euo pipefail

NODE_VER=${NODE_VER:-v22.14.0}
PNPM_MAJOR=${PNPM_MAJOR:-10}
SWAP_SIZE=${SWAP_SIZE:-2G}

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()  { printf '    \033[1;32m✓ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m[x] %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "请用 root 运行：sudo bash deploy/server-init.sh"

say "1/5 系统依赖"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl xz-utils build-essential rsync >/dev/null
ok "apt 依赖就绪（含 rsync，供增量部署用）"

say "2/5 Node.js（需要 >= 20）"
need_node=1
if command -v node >/dev/null 2>&1; then
  cur="$(node -v)"; major=${cur#v}; major=${major%%.*}
  if [ "$major" -ge 20 ]; then need_node=0; ok "已有 Node $cur"; fi
fi
if [ "$need_node" -eq 1 ]; then
  arch="$(uname -m)"
  case "$arch" in
    x86_64) a=x64 ;;
    aarch64) a=arm64 ;;
    *) die "不支持的架构 $arch" ;;
  esac
  url="https://npmmirror.com/mirrors/node/$NODE_VER/node-$NODE_VER-linux-$a.tar.xz"
  echo "    下载 $url"
  curl -fsSL "$url" -o /tmp/node.tar.xz || die "Node 下载失败；可换版本重试：NODE_VER=v20.19.0 bash deploy/server-init.sh"
  mkdir -p /usr/local/lib/nodejs
  tar -xJf /tmp/node.tar.xz -C /usr/local/lib/nodejs
  for b in node npm npx corepack; do
    if [ -e "/usr/local/lib/nodejs/node-$NODE_VER-linux-$a/bin/$b" ]; then
      ln -sf "/usr/local/lib/nodejs/node-$NODE_VER-linux-$a/bin/$b" "/usr/local/bin/$b"
    fi
  done
  hash -r
  ok "Node $(node -v) 已就位"
fi

say "3/5 swap（2G 内存跑 next build 必须，否则被 OOM Kill）"
if swapon --show 2>/dev/null | grep -q .; then
  ok "已有 swap：$(swapon --show=NAME --noheadings | tr '\n' ' ')"
else
  fallocate -l "$SWAP_SIZE" /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ok "$SWAP_SIZE swap 已启用（已写入 /etc/fstab，重启后自动挂载）"
fi

say "4/5 pnpm（固定 $PNPM_MAJOR.x，绕开 corepack 拉到损坏版本的坑）"
# node 是软链时，npm 的全局 bin 落在 node 的真实安装目录（如
# /usr/local/lib/nodejs/node-v22.14.0-linux-x64/bin），这个目录不在 PATH 里，
# 所以 npm 装完必须把 pnpm 链回 /usr/local/bin，否则 command -v pnpm 永远找不到。
NODE_REAL_BIN="$(dirname "$(readlink -f "$(command -v node)")")"
link_pnpm() {
  for _b in pnpm pnpx; do
    if [ -x "$NODE_REAL_BIN/$_b" ]; then
      ln -sfn "$NODE_REAL_BIN/$_b" "/usr/local/bin/$_b"
      echo "    已链接 /usr/local/bin/$_b -> $NODE_REAL_BIN/$_b"
    fi
  done
  hash -r 2>/dev/null || true
}
if command -v pnpm >/dev/null 2>&1 && ! pnpm -v >/dev/null 2>&1; then
  echo "    检测到不可用的 pnpm（$(command -v pnpm)），清理 corepack shim 后改用 npm 安装"
  corepack disable >/dev/null 2>&1 || true
  rm -f /usr/local/bin/pnpm /usr/local/bin/pnpx /usr/bin/pnpm /usr/bin/pnpx 2>/dev/null || true
  hash -r 2>/dev/null || true
fi
link_pnpm
if ! command -v pnpm >/dev/null 2>&1 || ! pnpm -v >/dev/null 2>&1; then
  echo "    用 npm 安装 pnpm@$PNPM_MAJOR.x（国内源）"
  npm i -g "pnpm@$PNPM_MAJOR" --registry=https://registry.npmmirror.com --loglevel=error || true
  hash -r 2>/dev/null || true
  link_pnpm
fi
if ! command -v pnpm >/dev/null 2>&1 || ! pnpm -v >/dev/null 2>&1; then
  die "pnpm 仍不可用。手动修：ln -sfn \"$NODE_REAL_BIN/pnpm\" /usr/local/bin/pnpm && pnpm -v"
fi
pnpm config set registry https://registry.npmmirror.com >/dev/null
ok "pnpm $(pnpm -v)"

say "5/5 目录约定"
install -d -m 755 /opt /srv /var/log
cat > /etc/apps-layout.md <<'EOF'
# 本机应用约定（deploy/deploy-app.sh 自动遵守）

代码   /opt/<app>               每次部署只覆盖源码，保留 node_modules / .next
配置   /etc/<app>/<app>.env     唯一真源，chmod 600；应用内 .env.local 是它的软链
数据   /srv/<app>               上传、sqlite、静态站点等需要长期保留的东西
日志   /var/log/<app>.log       已配 logrotate（weekly × 4，compress）
服务   systemd <app>.service    Restart=always，NODE_ENV=production，PORT 由部署时指定
端口   3000 起逐个应用手动指定，部署脚本会检查冲突
EOF
ok "约定写入 /etc/apps-layout.md（cat 查看）"

printf '\n\033[1;32m机器初始化完成。\033[0m\n'
printf '下一步部署应用：\n  sudo bash deploy/deploy-app.sh <应用名> <端口> [源码目录]\n'
printf '  例：sudo bash deploy/deploy-app.sh shunlu 3000 /root/src\n\n'
