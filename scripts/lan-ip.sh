#!/usr/bin/env bash
# 打印本机在局域网中的 IPv4 地址（默认路由所用网卡）。
#
# 用于 Docker 部署时把宿主机地址注入后端：容器（macOS 上是 Docker 虚拟机）
# 看不到宿主机网卡，只能由宿主机告诉它。
#
#   PHOTOSWITCH_LAN_IP=$(./scripts/lan-ip.sh) docker compose up -d
set -euo pipefail

print_first_non_loopback() {
  awk '/inet /&&$2!="127.0.0.1"{print $2; exit}'
}

if command -v ip >/dev/null 2>&1; then
  result=$(ip -4 route get 8.8.8.8 2>/dev/null | grep -oE 'src [0-9.]+' | head -n1 | cut -d' ' -f2 || true)
  if [ -n "$result" ]; then
    echo "$result"
    exit 0
  fi
fi

if [ "$(uname)" = "Darwin" ] && command -v route >/dev/null 2>&1; then
  iface=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
  if [ -n "$iface" ]; then
    result=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
    if [ -n "$result" ]; then
      echo "$result"
      exit 0
    fi
  fi
fi

ifconfig 2>/dev/null | print_first_non_loopback
