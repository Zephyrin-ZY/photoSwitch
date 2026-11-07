from __future__ import annotations

import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Callable

from pydantic import BaseModel, Field, ValidationError

from ..models.photo import PhotoFile, PhotoStatus
from ..models.project import Project
from .indexer import get_file_lock, load_files, save_files

MANIFEST_FORMAT = "photoswitch-decisions"
MANIFEST_VERSION = 1
MAX_REPORT_SAMPLES = 100


class ManifestRaw(BaseModel):
    filename: str
    size: int | None = None


class ManifestPhoto(BaseModel):
    hash: str = Field(min_length=1)
    filename: str = ""
    size: int | None = None
    format: str = ""
    exif_time: str | None = None
    rel_path: str | None = None
    raw: ManifestRaw | None = None
    status: PhotoStatus
    favorite: bool = False


class Manifest(BaseModel):
    format: str
    version: int
    exported_at: str = ""
    project: dict = Field(default_factory=dict)
    stats: dict = Field(default_factory=dict)
    photos: list[ManifestPhoto]


@dataclass
class Decision:
    status: PhotoStatus
    favorite: bool
    strategy: str


@dataclass
class ImportPlan:
    updates: dict[str, Decision] = field(default_factory=dict)
    matched_manifest: int = 0
    by_strategy: Counter = field(default_factory=Counter)
    conflicts: list[dict] = field(default_factory=list)
    missing: list[dict] = field(default_factory=list)
    new_photos: list[dict] = field(default_factory=list)


def _norm(value: str | None) -> str:
    """文件名/路径比较键：统一 Unicode 规范化并忽略大小写。"""
    return unicodedata.normalize("NFC", value or "").casefold()


def _stem(filename: str) -> str:
    return Path(filename).stem


def _relative_path(photo: PhotoFile, roots: list[str]) -> str:
    path = Path(photo.original_path)
    for root in roots:
        try:
            rel = path.relative_to(root)
        except ValueError:
            continue
        return PurePosixPath(*rel.parts).as_posix()
    return PurePosixPath(path.name).as_posix()


def _photo_sample(photo: PhotoFile) -> dict:
    return {
        "hash": photo.hash,
        "filename": photo.filename,
        "size": photo.file_size,
    }


def _manifest_sample(photo: ManifestPhoto) -> dict:
    return {
        "hash": photo.hash,
        "filename": photo.filename,
        "size": photo.size,
        "status": photo.status.value,
    }


def build_manifest(project: Project, files: list[PhotoFile]) -> dict:
    stats = {"total": len(files), "keep": 0, "eliminate": 0, "pending": 0, "favorites": 0}
    photos = []
    for photo in files:
        stats[photo.status.value] += 1
        if photo.is_favorite:
            stats["favorites"] += 1
        photos.append({
            "hash": photo.hash,
            "filename": photo.filename,
            "size": photo.file_size,
            "format": photo.format,
            "exif_time": photo.created_at or None,
            "rel_path": _relative_path(photo, project.source_folders),
            "raw": (
                {"filename": photo.raw_filename, "size": photo.raw_size}
                if photo.raw_filename else None
            ),
            "status": photo.status.value,
            "favorite": photo.is_favorite,
        })

    photos.sort(key=lambda item: (item["rel_path"], item["filename"]))
    return {
        "format": MANIFEST_FORMAT,
        "version": MANIFEST_VERSION,
        "exported_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "project": {
            "name": project.name,
            "similarity_threshold": project.similarity_threshold,
            "roots": [Path(root).name for root in project.source_folders],
        },
        "stats": stats,
        "photos": photos,
    }


def parse_manifest(data: object) -> Manifest:
    if not isinstance(data, dict):
        raise ValueError("文件内容不是有效的 JSON 对象")
    if data.get("format") != MANIFEST_FORMAT:
        raise ValueError("不是 PhotoSwitch 筛选结果文件")
    try:
        version = int(data.get("version"))
    except (TypeError, ValueError):
        raise ValueError("筛选结果文件缺少版本号") from None
    if version > MANIFEST_VERSION:
        raise ValueError(f"文件版本 {version} 高于当前支持的版本 {MANIFEST_VERSION}，请升级 PhotoSwitch")
    try:
        manifest = Manifest.model_validate(data)
    except ValidationError as exc:
        first = exc.errors()[0] if exc.errors() else {}
        raise ValueError(f"筛选结果数据格式错误：{first.get('msg', '未知错误')}") from None
    if not manifest.photos:
        raise ValueError("筛选结果文件中没有照片记录")
    return manifest


def plan_import(project: Project, files: list[PhotoFile], manifest: Manifest) -> ImportPlan:
    plan = ImportPlan()

    targets: dict[str, PhotoFile] = {}
    target_rel: dict[str, str] = {}
    for photo in files:
        targets.setdefault(photo.hash, photo)
        target_rel.setdefault(photo.hash, _norm(_relative_path(photo, project.source_folders)))

    by_name_size: dict[tuple[str, int | None], set[str]] = defaultdict(set)
    by_name_exif: dict[tuple[str, str], set[str]] = defaultdict(set)
    by_stem_exif: dict[tuple[str, str], set[str]] = defaultdict(set)
    for file_hash, photo in targets.items():
        name_key = _norm(photo.filename)
        exif_key = _norm(photo.created_at)
        by_name_size[(name_key, photo.file_size)].add(file_hash)
        if exif_key:
            by_name_exif[(name_key, exif_key)].add(file_hash)
            by_stem_exif[(_norm(_stem(photo.filename)), exif_key)].add(file_hash)

    photos_by_hash: dict[str, list[int]] = defaultdict(list)
    for index, photo in enumerate(manifest.photos):
        photos_by_hash[photo.hash].append(index)

    used: set[int] = set()
    claimed: set[str] = set()
    ambiguous: set[int] = set()

    # 第一级：内容哈希。同一哈希可能对应项目里多份副本，决策应用到所有副本。
    for file_hash, indexes in photos_by_hash.items():
        if file_hash not in targets:
            continue
        statuses = {manifest.photos[i].status for i in indexes}
        favorites = {manifest.photos[i].favorite for i in indexes}
        if len(statuses) > 1 or len(favorites) > 1:
            used.update(indexes)
            claimed.add(file_hash)
            plan.conflicts.append({
                "reason": "manifest_conflict",
                "hash": file_hash,
                "filename": manifest.photos[indexes[0]].filename,
                "status": None,
                "detail": "清单中同一内容的多条记录决策不一致",
                "candidates": [],
            })
            continue
        plan.updates[file_hash] = Decision(
            status=next(iter(statuses)),
            favorite=next(iter(favorites)),
            strategy="hash",
        )
        claimed.add(file_hash)
        used.update(indexes)
        plan.matched_manifest += len(indexes)
        plan.by_strategy["hash"] += len(indexes)

    def try_level(
        strategy: str,
        key_fn: Callable[[ManifestPhoto], tuple | None],
        target_index: dict,
    ) -> None:
        pending = [i for i in range(len(manifest.photos)) if i not in used]
        counts = Counter(
            key for i in pending
            if (key := key_fn(manifest.photos[i])) is not None
        )

        for index in pending:
            photo = manifest.photos[index]
            key = key_fn(photo)
            if key is None:
                continue
            if counts[key] > 1:
                # 清单侧同键多条，本级别无法判定，留给更具体的级别
                ambiguous.add(index)
                continue

            candidates = target_index.get(key, set()) - claimed
            if len(candidates) > 1 and photo.rel_path:
                narrowed = {
                    file_hash for file_hash in candidates
                    if target_rel.get(file_hash) == _norm(photo.rel_path)
                }
                if len(narrowed) == 1:
                    candidates = narrowed

            if len(candidates) == 1:
                file_hash = next(iter(candidates))
                plan.updates[file_hash] = Decision(
                    status=photo.status,
                    favorite=photo.favorite,
                    strategy=strategy,
                )
                claimed.add(file_hash)
                used.add(index)
                plan.matched_manifest += 1
                plan.by_strategy[strategy] += 1
            elif len(candidates) > 1:
                ambiguous.add(index)

    try_level(
        "name_size",
        lambda p: (_norm(p.filename), p.size) if p.filename and p.size is not None else None,
        by_name_size,
    )
    try_level(
        "name_exif",
        lambda p: (_norm(p.filename), _norm(p.exif_time)) if p.filename and p.exif_time else None,
        by_name_exif,
    )
    try_level(
        "stem_exif",
        lambda p: (_norm(_stem(p.filename)), _norm(p.exif_time)) if p.filename and p.exif_time else None,
        by_stem_exif,
    )

    for index, photo in enumerate(manifest.photos):
        if index in used:
            continue
        if index in ambiguous:
            plan.conflicts.append({
                "reason": "ambiguous",
                "hash": photo.hash,
                "filename": photo.filename,
                "status": photo.status.value,
                "detail": "名称/大小/EXIF 存在多个候选，无法唯一确定",
                "candidates": [],
            })
        else:
            plan.missing.append(_manifest_sample(photo))

    for file_hash, photo in targets.items():
        if file_hash not in plan.updates:
            plan.new_photos.append(_photo_sample(photo))

    return plan


def run_import(
    project: Project,
    manifest: Manifest,
    mode: str,
    restore_favorites: bool,
    dry_run: bool,
) -> dict:
    with get_file_lock(project.id):
        files = load_files(project.id)
        plan = plan_import(project, files, manifest)

        applied = 0
        kept_existing = 0
        overwritten = 0
        favorites_restored = 0

        for photo in files:
            decision = plan.updates.get(photo.hash)
            if decision is None:
                continue

            if mode == "overwrite":
                if photo.status != decision.status:
                    applied += 1
                    overwritten += 1
                    if not dry_run:
                        photo.status = decision.status
            elif photo.status != PhotoStatus.PENDING:
                kept_existing += 1
            elif photo.status != decision.status:
                applied += 1
                if not dry_run:
                    photo.status = decision.status

            if restore_favorites and photo.is_favorite != decision.favorite:
                favorites_restored += 1
                if not dry_run:
                    photo.is_favorite = decision.favorite

        if not dry_run and (applied or favorites_restored):
            save_files(project.id, files)

        return {
            "mode": mode,
            "dry_run": dry_run,
            "manifest_total": len(manifest.photos),
            "matched": plan.matched_manifest,
            "applied": applied,
            "kept_existing": kept_existing,
            "overwritten": overwritten,
            "favorites_restored": favorites_restored,
            "by_strategy": dict(plan.by_strategy),
            "missing_count": len(plan.missing),
            "missing_samples": plan.missing[:MAX_REPORT_SAMPLES],
            "new_photos_count": len(plan.new_photos),
            "new_photos_samples": plan.new_photos[:MAX_REPORT_SAMPLES],
            "conflict_count": len(plan.conflicts),
            "conflicts": plan.conflicts[:MAX_REPORT_SAMPLES],
        }