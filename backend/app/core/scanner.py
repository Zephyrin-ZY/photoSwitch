from __future__ import annotations
import hashlib
import os
from pathlib import Path
from ..config import settings
from ..models.photo import PhotoFile


def compute_file_hash(file_path: str, chunk_size: int = 8192) -> str:
    md5 = hashlib.md5()
    with open(file_path, "rb") as f:
        while chunk := f.read(chunk_size):
            md5.update(chunk)
    return md5.hexdigest()


def get_file_format(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def get_exif_info(file_path: str) -> tuple[str, int | None]:
    """获取 EXIF 拍摄时间与方向。

    返回 (created_at, orientation)。
    orientation 遵循 EXIF 标准：1=正常，其余值表示旋转/镜像状态。
    """
    try:
        from PIL import Image
        img = Image.open(file_path)
        exif = img._getexif() or {}
        created_at = exif.get(36867) or exif.get(36868) or ""
        orientation = exif.get(274)
        if orientation is not None:
            orientation = int(orientation)
        return str(created_at), orientation
    except Exception:
        return "", None


def list_supported_files(folder_path: str) -> list[Path]:
    folder = Path(folder_path)
    if not folder.exists() or not folder.is_dir():
        raise ValueError(f"Folder does not exist: {folder_path}")

    return [
        file_path
        for file_path in sorted(folder.rglob("*"))
        if file_path.is_file() and get_file_format(file_path.name) in settings.supported_formats
    ]


def scan_folder(
    folder_path: str,
    files: list[Path] | None = None,
    on_progress=None,
) -> list[PhotoFile]:
    photos = []
    candidate_files = files if files is not None else list_supported_files(folder_path)
    total_candidates = len(candidate_files)
    for index, file_path in enumerate(candidate_files, start=1):
        fmt = get_file_format(file_path.name)

        file_hash = compute_file_hash(str(file_path))
        stat = file_path.stat()
        created, orientation = get_exif_info(str(file_path))

        photos.append(PhotoFile(
            hash=file_hash,
            filename=file_path.name,
            original_path=str(file_path),
            file_size=stat.st_size,
            format=fmt,
            created_at=created,
            orientation=orientation,
        ))

        if on_progress is not None:
            on_progress(index, total_candidates, str(file_path), len(photos))

    return photos
