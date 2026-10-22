from __future__ import annotations
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from ..core.indexer import load_project, load_files
from ..core.exporter import export_photos
from concurrent.futures import ThreadPoolExecutor

router = APIRouter(prefix="/api/projects/{project_id}/export", tags=["export"])

executor = ThreadPoolExecutor(max_workers=1)
_export_progress: dict[str, dict] = {}


class ExportRequest(BaseModel):
    dest_folder: str
    only_favorites: bool = False
    correct_orientation: bool = False
    export_jpg: bool = True
    export_raw: bool = False


@router.post("")
def api_export(project_id: str, req: ExportRequest):
    if not req.export_jpg and not req.export_raw:
        raise HTTPException(400, "At least one export format is required")

    try:
        load_project(project_id)
    except FileNotFoundError:
        raise HTTPException(404, "Project not found")

    files = load_files(project_id)
    progress = {"current": 0, "total": 0, "done": False}
    _export_progress[project_id] = progress

    def do_export():
        try:
            result = export_photos(
                files,
                req.dest_folder,
                only_favorites=req.only_favorites,
                correct_orientation=req.correct_orientation,
                export_jpg=req.export_jpg,
                export_raw=req.export_raw,
                on_progress=lambda current, total: progress.update({
                    "current": current,
                    "total": total,
                }),
            )
        except Exception as exc:
            progress.update({"done": True, "error": str(exc)})
            return

        progress.update({
            "done": True,
            "exported": result["exported"],
            "exported_files": result["exported_files"],
            "missing_raw": result["missing_raw"],
            "skipped": result["skipped"],
            "errors": result["errors"],
        })

    executor.submit(do_export)
    return {"status": "exporting"}


@router.get("/progress")
def api_export_progress(project_id: str):
    return _export_progress.get(project_id, {"current": 0, "total": 0, "done": False})
