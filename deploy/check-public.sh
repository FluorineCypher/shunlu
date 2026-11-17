#!/usr/bin/env bash
# 公网链路体检（v1.21）—— 一条命令分清「应用/数据库慢」和「Cloudflare 隧道慢」
#
# 只发只读 GET，不写库、不需要口令（带 COOKIE 时才查登录态接口）。
#
# 用法（本机 git-bash 与 ECS 都能跑）：
#   bash deploy/check-public.sh                      # 默认各打 12 次
#   ROUNDS=20 bash deploy/check-public.sh            # 多打几次看长尾
#   COOKIE="sl_demo=...; sl_uid=11" bash deploy/check-public.sh   # 带登录态
#   DOMAIN=https://别的域名 ORIGIN=http://127.0.0.1:3000 bash deploy/check-public.sh
#
# 退出码：0 = 看起来正常；1 = 有问题要处理（非 200 / 源站慢 / 隧道加价 > 0.8s / 抖动 > 3×）。
set -u

DOMAIN="${DOMAIN:-https://shop.omzsh.top}"
ORIGIN="${ORIGIN:-http://47.97.167.178:3000}"
ROUNDS="${ROUNDS:-12}"
COOKIE="${COOKIE:-}"
TIMEOUT="${TIMEOUT:-30}"

hr() { printf "%s\n" "----------------------------------------------------------------"; }

# curl 公共参数（数组，避免 eval 二次解析引号）
CURL_ARGS=(-s -o /dev/null --max-time "$TIMEOUT")
if [ -n "$COOKIE" ]; then
  CURL_ARGS+=(-H "Cookie: $COOKIE")
fi

# 取一次：回显 "状态码 首字节秒 总秒"；失败统一记 000
fetch() {
  curl "${CURL_ARGS[@]}" -w "%{http_code} %{time_starttransfer} %{time_total}" "$1" 2>/dev/null \
    || printf "000 0 0"
}

# 从 stdin 读一列数字，输出 "min p50 p90 max"（插入排序，兼容 mawk）
stats() {
  sort -n | awk '
    { v[NR] = $1 }
    END {
      if (NR == 0) { print "0 0 0 0"; exit }
      for (i = 2; i <= NR; i++) {
        x = v[i]; j = i - 1
        while (j > 0 && v[j] > x) { v[j + 1] = v[j]; j-- }
        v[j + 1] = x
      }
      i50 = int((NR + 1) / 2); if (i50 < 1) i50 = 1
      i90 = int(NR * 0.9); if (i90 < 1) i90 = 1; if (i90 > NR) i90 = NR
      printf "%.3f %.3f %.3f %.3f\n", v[1], v[i50], v[i90], v[NR]
    }'
}

BAD=0
WARN=0

# probe 标签 URL TAG  -> 打印统计，并把 p50 / max / 非200数 存进 P_TAG_P50 / P_TAG_MAX / P_TAG_BAD
probe() {
  local label="$1" url="$2" tag="$3" row code ttfb total a1 a2 a3 a4 b1 b2 b3 b4 bad
  local f1 f2 fc
  f1=$(mktemp) || return 1; f2=$(mktemp) || return 1; fc=$(mktemp) || return 1
  local i
  for i in $(seq 1 "$ROUNDS"); do
    row=$(fetch "$url")
    code=${row%% *}; row=${row#* }
    ttfb=${row%% *}; total=${row##* }
    printf "%s\n" "${code:-000}" >> "$fc"
    printf "%s\n" "${ttfb:-0}" >> "$f1"
    printf "%s\n" "${total:-0}" >> "$f2"
  done
  printf "%-18s 状态码 %s\n" "$label" "$(sort "$fc" | uniq -c | awk '{ printf "%s×%s  ", $2, $1 }')"
  read -r a1 a2 a3 a4 <<< "$(stats < "$f1")"
  read -r b1 b2 b3 b4 <<< "$(stats < "$f2")"
  printf "%-18s TTFB   min %-7s p50 %-7s p90 %-7s max %s\n" "" "$a1" "$a2" "$a3" "$a4"
  printf "%-18s 总耗时 min %-7s p50 %-7s p90 %-7s max %s\n" "" "$b1" "$b2" "$b3" "$b4"
  printf -v "P_${tag}_P50" "%s" "$a2"
  printf -v "P_${tag}_MAX" "%s" "$a4"
  bad=$(grep -cv "^200$" "$fc")
  [ -n "$bad" ] || bad=0
  printf -v "P_${tag}_BAD" "%s" "$bad"
  if [ "$bad" -ne 0 ]; then BAD=1; fi
  rm -f "$f1" "$f2" "$fc"
}

echo "公网链路体检  域名=$DOMAIN  源站=$ORIGIN  每项 $ROUNDS 次  超时 ${TIMEOUT}s"
if [ -n "$COOKIE" ]; then echo "（已带 Cookie，测的是登录态接口）"; fi
hr
probe "域名 首屏 /"     "$DOMAIN/"      DOM
probe "源站 首屏 /"     "$ORIGIN/"      ORG

# 静态资源对照：自动从域名首页 HTML 里捞第一个 _next/static 脚本
ASSET=$(curl -s --max-time "$TIMEOUT" "$DOMAIN/" 2>/dev/null | grep -o '/_next/static/[^" ]*\.js' | head -1)
if [ -n "${ASSET:-}" ]; then
  probe "域名 静态资源"  "$DOMAIN$ASSET"  DAS
  probe "源站 静态资源"  "$ORIGIN$ASSET"  OAS
else
  echo "（没从首页 HTML 里找到 _next/static 脚本，跳过静态资源对照）"
fi

hr
echo "结论"
hr
D=$P_DOM_P50; O=$P_ORG_P50
GAP=$(awk -v d="$D" -v o="$O" 'BEGIN { printf "%.3f", d - o }')
JIT=$(awk -v p="$P_DOM_P50" -v m="$P_DOM_MAX" 'BEGIN { if (p + 0 > 0) printf "%.1f", m / p; else printf "0" }')
echo "  域名 TTFB p50 ${D}s / max ${P_DOM_MAX}s（抖动 ${JIT}×）  ·  源站 TTFB p50 ${O}s  ·  隧道加价 ${GAP}s"
if [ -n "${P_DAS_P50:-}" ]; then
  echo "  静态资源 域名 p50 ${P_DAS_P50}s  ·  源站 p50 ${P_OAS_P50}s"
fi
echo
if [ "$BAD" -ne 0 ]; then
  if [ "${P_ORG_BAD:-0}" -ne 0 ]; then
    echo "  ✗ 源站自己就返回非 200：这是应用/数据库问题，不是隧道。"
    echo "    → 看 /var/log/shunlu.log，按 docs/HANDOFF.md §4.5 三条命令查。"
  else
    echo "  ✗ 源站正常、域名有非 200：问题在 Cloudflare 隧道这一段。"
    echo "    → ECS：systemctl status cloudflared；journalctl -u cloudflared -n 100 --no-pager"
    echo "    → 确认同一个 tunnel ID 没有第二端在线（家里那台必须停）。"
  fi
elif awk -v o="$O" 'BEGIN { exit !(o > 0.8) }'; then
  echo "  ✗ 源站 TTFB p50 就超过 0.8s：应用或数据库慢，跟隧道无关。"
  echo "    → 按 docs/HANDOFF.md §4.5 查数据库往返；跨境 92ms/RT 的话考虑 §4.4 迁同机 PG。"
elif awk -v g="$GAP" 'BEGIN { exit !(g > 0.8) }'; then
  echo "  ⚠ 源站很快、公网比源站慢 ${GAP}s：慢在 Cloudflare → cloudflared(ECS) 这一段。"
  echo "    → 先确认同一 tunnel ID 只有一端在线；仍有长尾就在 /etc/cloudflared/config.yml 加 protocol: http2"
  echo "      （回落 TCP，绕开常被丢包的 QUIC/UDP 7844），再 systemctl restart cloudflared。"
  echo "    → 详情：deploy/README.md §7.6。"
  WARN=1
else
  echo "  ✓ 链路正常：域名与源站 TTFB 相差 ${GAP}s，没有明显非 200。"
fi

if awk -v j="$JIT" 'BEGIN { exit !(j + 0 > 3) }'; then
  echo "  ⚠ 抖动偏大（max / p50 = ${JIT}×）：长尾多半是 TLS 握手或隧道重连，按上面第二条处理。"
  WARN=1
fi

if [ "$WARN" -ne 0 ]; then exit 1; fi
exit "$BAD"
