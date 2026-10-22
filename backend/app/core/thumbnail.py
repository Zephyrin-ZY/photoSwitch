from __future__ import annotations
import io
from pathlib import Path
from PIL import Image, ImageOps
from ..config import RAW_FORMATS, settings


def get_project_thumbnail_dir(project_id: str) -> Path:
    return Path(settings.data_dir) / "projects" / project_id / "thumbnails"


def get_thumbnail_path(project_id: str, file_hash: str, size: str = "thumb") -> Path:
    suffix = "medium" if size == "medium" else "thumb"
    return get_project_thumbnail_dir(project_id) / f"{file_hash}_{suffix}.jpg"


def generate_thumbnail(project_id: str, file_path: str, file_hash: str, fmt: str, force: bool = False) -> dict[str, str]:
    Path(get_project_thumbnail_dir(project_id)).mkdir(parents=True, exist_ok=True)

    img = load_oriented_image(file_path, fmt)
    if img is None:
        return {}

    results = {}
    for size_name, max_size in [
        ("thumb", settings.thumbnail_size),
        ("medium", settings.medium_thumbnail_size),
    ]:
        out_path = get_thumbnail_path(project_id, file_hash, size_name)
        if out_path.exists() and not force:
            results[size_name] = str(out_path)
            continue

        img_copy = img.copy()
        img_copy.thumbnail(max_size, Image.Resampling.LANCZOS)
        img_copy = img_copy.convert("RGB")
        img_copy.save(str(out_path), "JPEG", quality=85)
        results[size_name] = str(out_path)

    return results


def get_corrected_image_bytes(file_path: str, fmt: str) -> tuple[bytes, str] | None:
    """返回按 EXIF 方向修正后的 JPEG 图像字节。"""
    img = load_oriented_image(file_path, fmt)
    if img is None:
        return None

    img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)
    return buf.getvalue(), "image/jpeg"


def load_oriented_image(file_path: str, fmt: str) -> Image.Image | None:
    img = _load_image(file_path, fmt)
    if img is None:
        return None
    try:
        return ImageOps.exif_transpose(img)
    except Exception:
        return img


def _load_image(file_path: str, fmt: str) -> Image.Image | None:
    try:
        if fmt in RAW_FORMATS:
            return _load_raw(file_path)
        return Image.open(file_path)
    except Exception:
        return None


def _load_raw(file_path: str) -> Image.Image | None:
    try:
        import rawpy
        with rawpy.imread(file_path) as raw:
            thumb = raw.extract_thumb()
            if thumb.format == rawpy.ThumbFormat.JPEG:
                return Image.open(io.BytesIO(thumb.data))
            return Image.fromarray(thumb.data)
    except Exception:
        try:
            import rawpy
            with rawpy.imread(file_path) as raw:
                rgb = raw.postprocess(use_camera_wb=True, half_size=True)
                return Image.fromarray(rgb)
        except Exception:
            return None
