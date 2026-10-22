from __future__ import annotations
from pathlib import Path

from pydantic_settings import BaseSettings

# backend/ 目录（config.py 位于 backend/app/ 下）
BACKEND_DIR = Path(__file__).resolve().parent.parent
# 本地开发配置文件，Docker 环境下该文件通常不存在，pydantic-settings 会自动忽略
ENV_FILE = BACKEND_DIR / ".env"

# RAW 仅作为 JPG 的附件参与导出，不进入缩略图 / CLIP / 筛选流程
RAW_FORMATS = {"cr2", "nef", "arw", "raf", "dng", "orf", "rw2"}


class Settings(BaseSettings):
    app_name: str = "PhotoSwitch"
    data_dir: str = "/data"  # Docker volume mount for project data
    clip_model: str = "/app/models/clip-vit-base-patch32"
    similarity_threshold: float = 0.85
    # 宿主机局域网 IP / 主机名：容器部署时后端看不到宿主机网卡，需要显式指定
    lan_ip: str | None = None
    thumbnail_size: tuple[int, int] = (600, 600)
    medium_thumbnail_size: tuple[int, int] = (1200, 1200)
    supported_formats: set[str] = {
        "jpg", "jpeg", "png", "tiff", "tif", "webp", "heic",
        "cr2", "nef", "arw", "raf", "dng", "orf", "rw2",
    }

    class Config:
        env_prefix = "PHOTOSWITCH_"
        env_file = str(ENV_FILE)
        env_file_encoding = "utf-8"
        # .env 中可能包含 HF_ENDPOINT 等非本项目配置，忽略而不是报错
        extra = "ignore"


settings = Settings()
