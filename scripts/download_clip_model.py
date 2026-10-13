#!/usr/bin/env python3
"""下载 CLIP 模型权重到本地目录。

photoSwitch 的相似照片分组依赖 openai/clip-vit-base-patch32。
仓库总大小约 3.4GB（含 TensorFlow / Flax 权重），本脚本只拉取 PyTorch 推理
真正需要的文件，约 600MB。

用法：
    python scripts/download_clip_model.py
    python scripts/download_clip_model.py --repo openai/clip-vit-base-patch32 \
        --target backend/models/clip-vit-base-patch32

环境变量：
    HF_ENDPOINT   Hugging Face 服务地址，国内可设为 https://hf-mirror.com
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# 只下载 PyTorch 推理必需的文件，跳过 tf_model.h5 / flax_model.msgpack
ALLOW_PATTERNS = [
    "*.json",
    "*.txt",
    "pytorch_model.bin",
    "model.safetensors",
    "vocab*",
    "merges*",
    "tokenizer*",
    "special_tokens_map*",
]

REQUIRED_FILES = ("config.json", "preprocessor_config.json")


def default_target() -> Path:
    repo_root = Path(__file__).resolve().parent.parent
    return repo_root / "backend" / "models" / "clip-vit-base-patch32"


def already_downloaded(target: Path) -> bool:
    weights = target / "pytorch_model.bin"
    safetensors = target / "model.safetensors"
    return (weights.exists() or safetensors.exists()) and all(
        (target / name).exists() for name in REQUIRED_FILES
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="下载 photoSwitch 使用的 CLIP 模型权重")
    parser.add_argument("--repo", default="openai/clip-vit-base-patch32", help="Hugging Face 仓库 id")
    parser.add_argument("--target", default=str(default_target()), help="本地保存目录")
    parser.add_argument("--force", action="store_true", help="即使已存在也重新下载")
    args = parser.parse_args()

    target = Path(args.target).expanduser().resolve()
    endpoint = os.environ.get("HF_ENDPOINT", "https://huggingface.co")

    if already_downloaded(target) and not args.force:
        print(f"[model] 模型已存在，跳过下载：{target}")
        return 0

    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        print(
            "[model] 未安装 huggingface_hub，请先执行: make setup\n"
            "        （或手动安装: pip install 'huggingface_hub>=0.30,<1.0'）",
            file=sys.stderr,
        )
        return 1

    target.mkdir(parents=True, exist_ok=True)
    print(f"[model] 仓库   : {args.repo}")
    print(f"[model] 目标   : {target}")
    print(f"[model] 服务端 : {endpoint}")
    print("[model] 开始下载（约 600MB，取决于网络速度）...")

    try:
        path = snapshot_download(
            repo_id=args.repo,
            local_dir=str(target),
            allow_patterns=ALLOW_PATTERNS,
        )
    except Exception as exc:  # noqa: BLE001 - 需要把任意下载错误反馈给用户
        print(f"[model] 下载失败：{type(exc).__name__}: {exc}", file=sys.stderr)
        print(
            "[model] 排查建议：\n"
            "        1) 切换镜像：HF_ENDPOINT=https://hf-mirror.com make model\n"
            "        2) 使用官方源：HF_ENDPOINT=https://huggingface.co make model\n"
            "        3) 手动下载后放入 backend/models/clip-vit-base-patch32/\n"
            "           https://huggingface.co/openai/clip-vit-base-patch32/tree/main",
            file=sys.stderr,
        )
        return 1

    print(f"[model] 下载完成：{path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
