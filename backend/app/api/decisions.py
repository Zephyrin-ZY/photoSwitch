from __future__ import annotations

import json
from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response

from ..core.decisions import build_manifest, parse_manifest, run_import
from ..core.indexer import load_files, load_project

router = APIRouter(prefix="/api/projects/{project_id}/decisions", tags=["decisions"])

MAX_IMPORT_BYTES = 50 * 1024 * 1024


@router.get("/export")
def api_export_decisions(project_id: str):
    try:
        project = load_project(project_id)
    except FileNotFoundError:
        raise HTTPException(404, "Project not found")

    files = load_files(project_id)
    if not files:
        raise HTTPException(400, "项目中还没有照片，无法导出筛选结果")

    manifest = build_manifest(project, files)
    content = json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")
    filename = f"{project.name}-筛选结果-{datetime.now():%Y%m%d-%H%M%S}.json"
    filename = filename.replace("/", "_").replace("\\", "_").replace('"', "_")
    return Response(
        content=content,
        media_type="application/json",
        headers={
            "Content-Disposition": (
                f"attachment; filename=\"photoswitch-decisions.json\"; "
                f"filename*=UTF-8''{quote(filename)}"
            )
        },
    )


@router.post("/import")
async def api_import_decisions(
    project_id: str,
    file: UploadFile = File(...),
    mode: str = "fill_pending",
    dry_run: bool = False,
    restore_favorites: bool = True,
):
    if mode not in ("fill_pending", "overwrite"):
        raise HTTPException(400, "mode 只能是 fill_pending 或 overwrite")

    try:
        project = load_project(project_id)
    except FileNotFoundError:
        raise HTTPException(404, "Project not found")

    raw = await file.read(MAX_IMPORT_BYTES + 1)
    if len(raw) > MAX_IMPORT_BYTES:
        raise HTTPException(413, "筛选结果文件过大")

    try:
        data = json.loads(raw.decode("utf-8-sig"))
        manifest = parse_manifest(data)
    except UnicodeDecodeError:
        raise HTTPException(400, "筛选结果文件不是 UTF-8 编码")
    except json.JSONDecodeError:
        raise HTTPException(400, "筛选结果文件不是有效的 JSON")
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    return run_import(
        project,
        manifest,
        mode=mode,
        restore_favorites=restore_favorites,
        dry_run=dry_run,
    )