from __future__ import annotations
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..core.indexer import load_project, load_files, save_files, save_project, save_progress, load_progress
from ..core.thumbnail import generate_thumbnail
from ..ai.clip_service import extract_features_and_cluster
from ..models.project import ProjectStatus
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
import time
import sys

router = APIRouter(prefix="/api/projects/{project_id}/analysis", tags=["analysis"])

executor = ThreadPoolExecutor(max_workers=2)
_progress: dict[str, dict] = {}
_running: set[str] = set()
_lock = threading.Lock()


class AnalysisRequest(BaseModel):
    force: bool = False


@router.post("/start")
def api_start_analysis(project_id: str, req: AnalysisRequest):
    with _lock:
        if project_id in _running:
            return {"status": "already_running"}

    try:
        project = load_project(project_id)
    except FileNotFoundError:
        raise HTTPException(404, "Project not found")

    if project.status == ProjectStatus.READY and not req.force:
        return {"status": "already_done"}

    project.status = ProjectStatus.ANALYZING
    save_project(project)

    _progress[project_id] = {
        "thumbnail": {"current": 0, "total": 0},
        "clip": {"current": 0, "total": 0},
        "done": False,
        "clip_done": False,
        "error": None,
    }

    def do_analysis():
        with _lock:
            _running.add(project_id)

        try:
            files = []
            for _ in range(30):
                files = load_files(project_id)
                if files:
                    break
                time.sleep(1)

            if not files:
                _progress[project_id]["error"] = "No files found"
                _progress[project_id]["done"] = True
                return

            total = len(files)
            _progress[project_id]["thumbnail"]["total"] = total
            _progress[project_id]["clip"]["total"] = total

            # 并行生成缩略图（4 个工作线程）
            thumb_completed = 0
            thumb_lock = threading.Lock()

            def gen_one_thumb(f):
                nonlocal thumb_completed
                generate_thumbnail(f.original_path, f.hash, f.format)
                with thumb_lock:
                    thumb_completed += 1
                    _progress[project_id]["thumbnail"]["current"] = thumb_completed

            with ThreadPoolExecutor(max_workers=4) as thumb_pool:
                futures = [thumb_pool.submit(gen_one_thumb, f) for f in files]
                for future in as_completed(futures):
                    future.result()  # raise if any failed

            vectors = extract_features_and_cluster(
                files, project_id,
                similarity_threshold=project.similarity_threshold,
                on_progress=lambda n: _progress[project_id].update({"clip": {"current": n, "total": total}})
            )

            if vectors is None:
                save_files(project_id, files)
                _progress[project_id]["clip_done"] = True
                _progress[project_id]["error"] = "CLIP feature extraction failed"
                _progress[project_id]["done"] = True
                return

            for i, f in enumerate(files):
                if i < len(vectors.get("files", files)):
                    v = vectors["files"][i]
                    if getattr(v, "cluster_id", None):
                        f.cluster_id = v.cluster_id

            save_files(project_id, files)
            _progress[project_id]["clip_done"] = True

            has_clusters = any(f.cluster_id for f in files)
            project.status = ProjectStatus.READY
            if not has_clusters:
                print("[Analysis] No clusters produced, all photos will be treated as independent", file=sys.stderr)

            save_project(project)
            _progress[project_id]["done"] = True
            save_progress(project_id, _progress[project_id])
        except Exception as e:
            _progress[project_id]["error"] = str(e)
            _progress[project_id]["done"] = True
            save_progress(project_id, _progress[project_id])
        finally:
            with _lock:
                _running.discard(project_id)

    executor.submit(do_analysis)
    return {"status": "analyzing"}


@router.get("/progress")
def api_analysis_progress(project_id: str):
    prog = _progress.get(project_id)
    if prog is not None:
        return prog

    # 尝试从磁盘恢复进度
    disk_prog = load_progress(project_id)
    if disk_prog is not None:
        return disk_prog

    try:
        project = load_project(project_id)
        if project.status == ProjectStatus.READY:
            return {
                "thumbnail": {"current": 0, "total": 0},
                "clip": {"current": 0, "total": 0},
                "done": True,
                "clip_done": True,
                "error": None,
            }
    except FileNotFoundError:
        pass

    return {
        "thumbnail": {"current": 0, "total": 0},
        "clip": {"current": 0, "total": 0},
        "done": False,
        "clip_done": False,
        "error": None,
    }


@router.post("/regenerate-thumbnails")
def api_regenerate_thumbnails(project_id: str):
    """强制重新生成所有缩略图（用于修复 EXIF 方向等问题）"""
    with _lock:
        if project_id in _running:
            return {"status": "already_running"}

    try:
        project = load_project(project_id)
    except FileNotFoundError:
        raise HTTPException(404, "Project not found")

    files = load_files(project_id)
    if not files:
        raise HTTPException(400, "No files")

    total = len(files)
    _progress[project_id] = {
        "thumbnail": {"current": 0, "total": total},
        "clip": {"current": 0, "total": 0},
        "done": False,
        "clip_done": True,
        "error": None,
    }

    def do_regenerate():
        with _lock:
            _running.add(project_id)
        try:
            completed = 0
            lock = threading.Lock()

            def gen_one(f):
                nonlocal completed
                generate_thumbnail(f.original_path, f.hash, f.format, force=True)
                with lock:
                    completed += 1
                    _progress[project_id]["thumbnail"]["current"] = completed

            with ThreadPoolExecutor(max_workers=4) as pool:
                futures = [pool.submit(gen_one, f) for f in files]
                for future in as_completed(futures):
                    future.result()

            _progress[project_id]["done"] = True
            save_progress(project_id, _progress[project_id])
        except Exception as e:
            _progress[project_id]["error"] = str(e)
            _progress[project_id]["done"] = True
        finally:
            with _lock:
                _running.discard(project_id)

    executor.submit(do_regenerate)
    return {"status": "regenerating"}
