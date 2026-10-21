from __future__ import annotations
import socket
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api import projects, photos, analysis, export

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


def _detect_lan_ip() -> str | None:
    """探测本机在局域网中的主 IP。

    通过 UDP "连接"一个外部地址来读取默认路由所用网卡的本地 IP，
    不会真正发出数据包。这样能在多网卡（WiFi/有线/虚拟网卡）情况下
    返回平板应当访问的那个地址。
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
def server_info():
    """返回本机局域网访问信息，供前端在标题栏显示「平板该连哪个地址」。

    注意：仅在服务直接跑在宿主机（make dev）时返回的是宿主机局域网 IP；
    若后端运行在容器内，返回的会是容器网络地址。
    """
    lan_ip = _detect_lan_ip()
    candidates = _all_ipv4()
    if lan_ip and lan_ip not in candidates:
        candidates.insert(0, lan_ip)
    return {
        "lan_ip": lan_ip,
        "hostname": socket.gethostname(),
        "candidates": candidates,
    }
