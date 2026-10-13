from __future__ import annotations
import shutil
from pathlib import Path
from ..models.photo import PhotoFile, PhotoStatus
from .thumbnail import load_oriented_image


def export_photos(
    files: list[PhotoFile],
    dest_folder: str,
    only_favorites: bool = False,
    correct_orientation: bool = False,
) -> dict:
    dest = Path(dest_folder)
    dest.mkdir(parents=True, exist_ok=True)

    exported = []
    errors = []

    for f in files:
        if only_favorites:
            if not f.is_favorite:
                continue
        elif f.status != PhotoStatus.KEEP and not f.is_favorite:
            continue

        src = Path(f.original_path)
        if not src.exists():
            errors.append({"file": f.filename, "error": "source not found"})
            continue

        target_dir = dest
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = _unique_export_path(target_dir / f.filename)

        if correct_orientation and _export_corrected_image(str(src), f.format, target_path):
            exported.append({"file": f.filename, "dest": str(target_path)})
            continue

        shutil.copy2(str(src), str(target_path))
        exported.append({"file": f.filename, "dest": str(target_path)})

    return {"exported": len(exported), "errors": len(errors), "details": exported, "error_details": errors}


def _unique_export_path(target_path: Path) -> Path:
    if not target_path.exists():
        return target_path

    stem = target_path.stem
    suffix = target_path.suffix
    i = 1
    while True:
        candidate = target_path.with_name(f"{stem}_{i}{suffix}")
        if not candidate.exists():
            return candidate
        i += 1


def _export_corrected_image(source_path: str, fmt: str, target_path: Path) -> bool:
    try:
        img = load_oriented_image(source_path, fmt)
        if img is None:
            return False

        img = img.convert("RGB")
        img.save(str(target_path), format="JPEG", quality=95)
        return True
    except Exception:
        return False
