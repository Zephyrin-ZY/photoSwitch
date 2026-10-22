from __future__ import annotations
import shutil
from pathlib import Path
from ..models.photo import PhotoFile, PhotoStatus
from .scanner import find_raw_companion
from .thumbnail import load_oriented_image


def export_photos(
    files: list[PhotoFile],
    dest_folder: str,
    only_favorites: bool = False,
    correct_orientation: bool = False,
    export_jpg: bool = True,
    export_raw: bool = False,
    on_progress=None,
) -> dict:
    dest = Path(dest_folder)
    dest.mkdir(parents=True, exist_ok=True)

    selected = [
        f
        for f in files
        if (f.is_favorite if only_favorites else (f.status == PhotoStatus.KEEP or f.is_favorite))
    ]
    total = len(selected)
    if on_progress is not None:
        on_progress(0, total)

    details = []
    errors = []
    exported_photos = 0
    exported_files = 0
    missing_raw = 0
    skipped = 0

    for index, f in enumerate(selected, start=1):
        src = Path(f.original_path)
        formats: list[str] = []
        paths: list[str] = []

        if export_jpg:
            if src.is_file():
                target = _export_primary(src, f.format, dest, correct_orientation)
                if target is not None:
                    formats.append("jpg")
                    paths.append(str(target))
                else:
                    errors.append({"file": f.filename, "error": "export failed"})
            else:
                errors.append({"file": f.filename, "error": "source not found"})

        if export_raw:
            raw_src = find_raw_companion(f)
            if raw_src is None:
                missing_raw += 1
            else:
                try:
                    raw_target = _unique_export_path(dest / raw_src.name)
                    shutil.copy2(str(raw_src), str(raw_target))
                    formats.append("raw")
                    paths.append(str(raw_target))
                except OSError as exc:
                    errors.append({"file": raw_src.name, "error": str(exc)})

        if paths:
            exported_photos += 1
            exported_files += len(paths)
            details.append({
                "file": f.filename,
                "formats": formats,
                "dest": paths[0] if len(paths) == 1 else paths,
            })
        else:
            skipped += 1

        if on_progress is not None:
            on_progress(index, total)

    return {
        "exported": exported_photos,
        "exported_files": exported_files,
        "missing_raw": missing_raw,
        "skipped": skipped,
        "errors": len(errors),
        "details": details,
        "error_details": errors,
    }


def _export_primary(src: Path, fmt: str, dest: Path, correct_orientation: bool) -> Path | None:
    if correct_orientation:
        target = _unique_export_path(dest / f"{src.stem}.jpg")
        if _export_corrected_image(str(src), fmt, target):
            return target

    target = _unique_export_path(dest / src.name)
    try:
        shutil.copy2(str(src), str(target))
    except OSError:
        return None
    return target


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
