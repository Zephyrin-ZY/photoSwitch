from __future__ import annotations
import re
import shutil
from pathlib import Path
from ..config import settings
from ..models.photo import PhotoFile, PhotoStatus
from .scanner import find_raw_companion
from .thumbnail import load_oriented_image

_INVALID_FOLDER_CHARS = re.compile(r'[\\/:*?"<>|\x00-\x1f]')


def export_root() -> Path:
    root = Path(settings.export_dir).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def export_dir_for_project(project_name: str) -> Path:
    safe_name = _INVALID_FOLDER_CHARS.sub("_", project_name).strip().strip(".")
    dest = export_root() / (safe_name or "project")
    dest.mkdir(parents=True, exist_ok=True)
    return dest


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
    # 已存在的同名文件直接覆盖；同一批次内重名才加序号，避免互相覆盖丢图
    used_names: set[str] = set()

    for index, f in enumerate(selected, start=1):
        src = Path(f.original_path)
        formats: list[str] = []
        paths: list[str] = []

        if export_jpg:
            if src.is_file():
                target = _export_primary(src, f.format, dest, correct_orientation, used_names)
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
                raw_target = _target_path(dest, raw_src.name, used_names)
                try:
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


def _export_primary(
    src: Path,
    fmt: str,
    dest: Path,
    correct_orientation: bool,
    used_names: set[str],
) -> Path | None:
    if correct_orientation:
        target = _target_path(dest, f"{src.stem}.jpg", used_names)
        if _export_corrected_image(str(src), fmt, target):
            return target
        used_names.discard(target.name.casefold())

    target = _target_path(dest, src.name, used_names)
    try:
        shutil.copy2(str(src), str(target))
    except shutil.SameFileError:
        pass
    except OSError:
        return None
    return target


def _target_path(dest: Path, filename: str, used_names: set[str]) -> Path:
    key = filename.casefold()
    if key not in used_names:
        used_names.add(key)
        return dest / filename

    stem = Path(filename).stem
    suffix = Path(filename).suffix
    i = 1
    while True:
        candidate = f"{stem}_{i}{suffix}"
        key = candidate.casefold()
        if key not in used_names:
            used_names.add(key)
            return dest / candidate
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
