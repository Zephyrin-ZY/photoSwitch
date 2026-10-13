from __future__ import annotations
import os
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..core.indexer import (
    create_project, load_project, save_project,
    load_files, save_files, update_photo_status, get_project_dir,
    list_projects, delete_project, save_progress, load_progress,
)
from ..core.scanner import list_supported_files, scan_folder
from ..core.thumbnail import generate_thumbnail
from ..models.project import ProjectStatus
from concurrent.futures import ThreadPoolExecutor
import threading

router = APIRouter(prefix="/api/projects", tags=["projects"])

executor = ThreadPoolExecutor(max_workers=4)
_scan_progress: dict[str, dict] = {}


class CreateProjectRequest(BaseModel):
    name: str
    source_folders: list[str]
    similarity_threshold: float = 0.85


class UpdatePhotoStatusRequest(BaseModel):
    status: str


@router.get("")
def api_list_projects():
    projects = list_projects()
    return [p.model_dump() for p in projects]


@router.post("")
def api_create_project(req: CreateProjectRequest):
    project = create_project(req.name, req.source_folders, similarity_threshold=req.similarity_threshold)
    return project.model_dump()


@router.get("/{project_id}")
def api_get_project(project_id: str):
    try:
        project = load_project(project_id)
    except FileNotFoundError:
        raise HTTPException(404, "Project not found")
    return project.model_dump()


@router.delete("/{project_id}")
def api_delete_project(project_id: str):
    if not delete_project(project_id):
        raise HTTPException(404, "Project not found")
    return {"status": "deleted"}


@router.post("/{project_id}/scan")
def api_scan_project(project_id: str):
    try:
        project = load_project(project_id)
    except FileNotFoundError:
        raise HTTPException(404, "Project not found")

    def do_scan():
        all_photos = []
        discovered_total = 0
        candidate_lists: list[tuple[str, list[Path]]] = []

        for folder in project.source_folders:
            try:
                candidate_lists.append((folder, list_supported_files(folder)))
            except Exception:
                continue

        total_candidates = sum(len(files) for _, files in candidate_lists)
        _scan_progress[project_id] = {
            "done": False,
            "current": 0,
            "total": total_candidates,
            "discovered": 0,
            "current_folder": None,
            "current_file": None,
        }

        processed_candidates = 0
        for folder, files in candidate_lists:
            try:
                _scan_progress[project_id]["current_folder"] = folder

                photos = scan_folder(
                    folder,
                    files=files,
                    on_progress=lambda current, folder_total, current_file, discovered_in_folder: _scan_progress[project_id].update({
                        "current": processed_candidates + current,
                        "total": total_candidates,
                        "discovered": discovered_total + discovered_in_folder,
                        "current_folder": folder,
                        "current_file": current_file,
                    }),
                )
                all_photos.extend(photos)
                discovered_total += len(photos)
                processed_candidates += len(files)
            except Exception:
                processed_candidates += len(files)
                continue

        save_files(project_id, all_photos)
        project.total_files = len(all_photos)
        project.status = ProjectStatus.ANALYZING
        save_project(project)
        scan_done = {
            "done": True,
            "current": total_candidates,
            "total": total_candidates,
            "discovered": len(all_photos),
            "current_folder": None,
            "current_file": None,
        }
        _scan_progress[project_id] = scan_done
        save_progress(project_id, {"scan": scan_done})

    _scan_progress[project_id] = {
        "done": False,
        "current": 0,
        "total": 0,
        "discovered": 0,
        "current_folder": None,
        "current_file": None,
    }
    executor.submit(do_scan)
    return {"status": "scanning"}


@router.get("/{project_id}/scan/progress")
def api_scan_progress(project_id: str):
    prog = _scan_progress.get(project_id)
    if prog is not None:
        return prog

    # 尝试从磁盘恢复扫描进度
    disk_prog = load_progress(project_id)
    if disk_prog and "scan" in disk_prog:
        return disk_prog["scan"]

    return {
        "done": False,
        "current": 0,
        "total": 0,
        "discovered": 0,
        "current_folder": None,
        "current_file": None,
    }


@router.get("/{project_id}/photos")
def api_list_photos(
    project_id: str,
    status: str | None = None,
    cluster_id: str | None = None,
    favorite: bool | None = None,
    offset: int = 0,
    limit: int = 50,
):
    files = load_files(project_id)
    if status:
        files = [f for f in files if f.status.value == status]
    if cluster_id:
        files = [f for f in files if f.cluster_id == cluster_id]
    if favorite is not None:
        files = [f for f in files if f.is_favorite == favorite]
    total = len(files)
    files = files[offset:offset + limit]
    return {"total": total, "files": [f.model_dump() for f in files]}


@router.put("/{project_id}/photos/{file_hash}/status")
def api_update_photo_status(project_id: str, file_hash: str, req: UpdatePhotoStatusRequest):
    result = update_photo_status(project_id, file_hash, req.status)
    if result is None:
        raise HTTPException(404, "Photo not found")
    return result.model_dump()


class ToggleFavoriteRequest(BaseModel):
    is_favorite: bool


@router.put("/{project_id}/photos/{file_hash}/favorite")
def api_toggle_favorite(project_id: str, file_hash: str, req: ToggleFavoriteRequest):
    from ..core.indexer import load_files, save_files, get_file_lock
    lock = get_file_lock(project_id)
    with lock:
        files = load_files(project_id)
        for f in files:
            if f.hash == file_hash:
                f.is_favorite = req.is_favorite
                save_files(project_id, files)
                return f.model_dump()
    raise HTTPException(404, "Photo not found")


@router.get("/{project_id}/clusters")
def api_list_clusters(project_id: str, status: str | None = None, favorite: bool | None = None):
    files = load_files(project_id)
    clusters: dict[str, list] = {}
    for f in files:
        if f.cluster_id:
            if status and f.status.value != status:
                continue
            if favorite is not None and f.is_favorite != favorite:
                continue
            clusters.setdefault(f.cluster_id, []).append(f.model_dump())
    return {"clusters": clusters}


class BrowseRequest(BaseModel):
    path: str = ""


@router.post("/browse")
def api_browse_directory(req: BrowseRequest):
    if not req.path:
        if Path("/Users").exists():
            return _list_directory(Path("/Users"))
        return _list_directory(Path.home())

    target = Path(req.path).expanduser().resolve()
    if not target.exists():
        raise HTTPException(404, f"Path not found: {req.path}")
    if not target.is_dir():
        raise HTTPException(400, f"Not a directory: {req.path}")

    return _list_directory(target)


def _list_directory(directory: Path) -> dict:
    entries = []
    try:
        for item in sorted(directory.iterdir()):
            if item.name.startswith("."):
                continue
            if item.is_dir():
                try:
                    child_count = sum(1 for _ in item.iterdir() if not _.name.startswith("."))
                except PermissionError:
                    child_count = -1
                entries.append({
                    "name": item.name,
                    "path": str(item),
                    "is_dir": True,
                    "child_count": child_count,
                })
    except PermissionError:
        pass

    parent = str(directory.parent) if directory.parent != directory else None
    return {
        "current": str(directory),
        "parent": parent,
        "entries": entries,
    }
