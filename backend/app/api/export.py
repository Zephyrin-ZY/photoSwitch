from __future__ import annotations
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..core.indexer import load_project, load_files
from ..core.exporter import export_photos
from ..models.project import ProjectStatus
from concurrent.futures import ThreadPoolExecutor

router = APIRouter(prefix="/api/projects/{project_id}/export", tags=["export"])

executor = ThreadPoolExecutor(max_workers=1)
_export_progress: dict[str, dict] = {}


class ExportRequest(BaseModel):
    dest_folder: str
    only_favorites: bool = False
    correct_orientation: bool = False


@router.post("")
def api_export(project_id: str, req: ExportRequest):
    try:
        project = load_project(project_id)
    except FileNotFoundError:
        raise HTTPException(404, "Project not found")

    files = load_files(project_id)
    _export_progress[project_id] = {"current": 0, "total": 0, "done": False}

    def do_export():
        result = export_photos(
            files,
            req.dest_folder,
            only_favorites=req.only_favorites,
            correct_orientation=req.correct_orientation,
        )
        _export_progress[project_id] = {"done": True, **result}

    executor.submit(do_export)
    return {"status": "exporting"}


@router.get("/progress")
def api_export_progress(project_id: str):
    return _export_progress.get(project_id, {"current": 0, "total": 0, "done": False})
