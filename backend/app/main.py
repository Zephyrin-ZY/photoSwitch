from __future__ import annotations
import ipaddress
import socket
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from .api import projects, photos, analysis, export
from .config import settings

app = FastAPI(title="PhotoSwitch", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
app.include_router(photos.router)
app.include_router(analysis.router)
app.include_router(export.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


def _host_to_ip(value: str | None) -> str | None:
    """从 Host / X-Forwarded-Host 取值中的 IPv4（去掉端口）。

    非 IP（如 localhost、域名）、IPv6 与回环地址都返回 None。
    """
    if not value:
        return None
    host = value.split(",")[0].strip()
    if host.startswith("["):  # IPv6 字面量 [::1]:7003
        return None
    if host.count(":") == 1:
        host = host.rsplit(":", 1)[0]
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return None
    return host if ip.version == 4 and not ip.is_loopback else None


def _in_container() -> bool:
    return Path("/.dockerenv").exists()


def _detect_lan_ip() -> str | None:
    """探测本机在局域网中的主 IP。

    通过 UDP "连接"一个外部地址来读取默认路由所用网卡的本地 IP，
    不会真正发出数据包。这样能在多网卡（WiFi/有线/虚拟网卡）情况下
    返回平板应当访问的那个地址。

    前提是进程与宿主机共享网络栈：容器（macOS 上是 Docker 虚拟机）内
    跑时它只会拿到容器网桥地址，所以调用方需先判断 _in_container()。
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


def _all_ipv4() -> list[str]:
    """枚举本机所有非回环 IPv4 地址，作为主探测失败时的候选。"""
    ips: list[str] = []
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    except OSError:
        pass
    return ips


@app.get("/api/server-info")
def server_info(request: Request):
    """返回本机局域网访问信息，供前端在标题栏显示「平板该连哪个地址」。

    取值优先级：
      1. 请求头里的 Host / X-Forwarded-Host（已是 IPv4 时说明用户正在用
         该地址访问，最准确，且换网后无需重启服务）
      2. PHOTOSWITCH_LAN_IP 显式配置（容器部署时的唯一可靠来源）
      3. 本地 UDP 探测（仅非容器环境可信）
    """
    lan_ip = _host_to_ip(request.headers.get("x-forwarded-host")) or _host_to_ip(
        request.headers.get("host")
    )
    source = "forwarded" if lan_ip else None

    if not lan_ip and settings.lan_ip:
        configured = settings.lan_ip.strip()
        # 允许写 Bonjour 主机名（如 mymac.local），但回环地址没有意义
        if configured and configured != "localhost" and not configured.startswith("127."):
            lan_ip, source = configured, "config"

    if not lan_ip and not _in_container():
        lan_ip = _detect_lan_ip()
        source = "detected"

    candidates = [lan_ip] if lan_ip else []
    candidates += [ip for ip in _all_ipv4() if ip not in candidates]
    return {
        "lan_ip": lan_ip,
        "lan_ip_source": source,
        "in_container": _in_container(),
        "hostname": socket.gethostname(),
        "candidates": candidates,
    }
