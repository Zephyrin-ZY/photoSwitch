from __future__ import annotations
import hashlib
from pathlib import Path
from ..config import RAW_FORMATS, settings
from ..models.photo import PhotoFile

# 同一组同名文件中，优先把 RAW 挂到 JPG 上
_BASE_FORMAT_PRIORITY = ("jpg", "jpeg", "heic", "tif", "tiff", "png", "webp")


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


def count_base_files(files: list[Path]) -> int:
    """可进入筛选的照片数：非 RAW 文件；只有 RAW 的照片没有预览基准，直接忽略。"""
    return sum(1 for f in files if get_file_format(f.name) not in RAW_FORMATS)


def pair_photo_files(files: list[Path]) -> list[tuple[Path, Path | None]]:
    """按「同目录 + 同名（忽略大小写）」把 RAW 与基准图配对。

    返回 (基准图, RAW 路径或 None) 列表。同一组同名文件里有多个基准图时，
    只有优先级最高的那个（JPG 优先）携带 RAW，避免重复导出同一份 RAW。
    """
    bases_by_key: dict[tuple[Path, str], list[Path]] = {}
    raws_by_key: dict[tuple[Path, str], list[Path]] = {}

    for file_path in files:
        fmt = get_file_format(file_path.name)
        key = (file_path.parent, file_path.stem.lower())
        bucket = raws_by_key if fmt in RAW_FORMATS else bases_by_key
        bucket.setdefault(key, []).append(file_path)

    pairs: list[tuple[Path, Path | None]] = []
    for key, bases in bases_by_key.items():
        bases.sort(key=lambda p: (
            _BASE_FORMAT_PRIORITY.index(get_file_format(p.name))
            if get_file_format(p.name) in _BASE_FORMAT_PRIORITY
            else len(_BASE_FORMAT_PRIORITY),
            str(p),
        ))
        raw = sorted(raws_by_key.get(key, []), key=str)[0] if key in raws_by_key else None
        for index, base in enumerate(bases):
            pairs.append((base, raw if index == 0 else None))

    return sorted(pairs, key=lambda pair: str(pair[0]))


def find_raw_companion(photo: PhotoFile) -> Path | None:
    """导出时定位照片对应的 RAW：优先用扫描时记录的路径，否则按同名规则回查。"""
    if photo.raw_path:
        recorded = Path(photo.raw_path)
        if recorded.is_file():
            return recorded

    src = Path(photo.original_path)
    try:
        candidates = sorted(
            (
                sibling
                for sibling in src.parent.iterdir()
                if sibling.is_file()
                and sibling.stem.lower() == src.stem.lower()
                and get_file_format(sibling.name) in RAW_FORMATS
            ),
            key=str,
        )
    except OSError:
        return None
    return candidates[0] if candidates else None


def scan_folder(
    folder_path: str,
    files: list[Path] | None = None,
    on_progress=None,
) -> list[PhotoFile]:
    photos = []
    candidate_files = files if files is not None else list_supported_files(folder_path)
    pairs = pair_photo_files(candidate_files)
    total_candidates = len(pairs)
    for index, (file_path, raw_path) in enumerate(pairs, start=1):
        fmt = get_file_format(file_path.name)

        file_hash = compute_file_hash(str(file_path))
        stat = file_path.stat()
        created, orientation = get_exif_info(str(file_path))
        raw_stat = raw_path.stat() if raw_path is not None else None

        photos.append(PhotoFile(
            hash=file_hash,
            filename=file_path.name,
            original_path=str(file_path),
            file_size=stat.st_size,
            format=fmt,
            created_at=created,
            orientation=orientation,
            raw_path=str(raw_path) if raw_path is not None else None,
            raw_filename=raw_path.name if raw_path is not None else None,
            raw_format=get_file_format(raw_path.name) if raw_path is not None else None,
            raw_size=raw_stat.st_size if raw_stat is not None else None,
        ))

        if on_progress is not None:
            on_progress(index, total_candidates, str(file_path), len(photos))

    return photos
