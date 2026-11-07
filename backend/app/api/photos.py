from __future__ import annotations
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response
from ..core.indexer import load_files
from ..core.scanner import find_raw_companion
from ..core.thumbnail import get_thumbnail_path, get_corrected_image_bytes
from pathlib import Path

router = APIRouter(prefix="/api/photos", tags=["photos"])


def _find_file(project_id: str, file_hash: str):
    files = load_files(project_id)
    for f in files:
        if f.hash == file_hash:
            return f
    return None


@router.get("/{file_hash}/thumbnail")
def api_get_thumbnail(file_hash: str, project_id: str, size: str = "thumb"):
    thumb_path = get_thumbnail_path(project_id, file_hash, size)
    if not thumb_path.exists():
        raise HTTPException(404, "Thumbnail not found")
    return FileResponse(str(thumb_path), media_type="image/jpeg")


@router.get("/{file_hash}/download")
def api_download_original(file_hash: str, project_id: str, format: str = "jpg"):
    photo = _find_file(project_id, file_hash)
    if photo is None:
        raise HTTPException(404, "Photo not found in project")

    if format == "jpg":
        src = Path(photo.original_path)
        filename = photo.filename
    elif format == "raw":
        raw = find_raw_companion(photo)
        if raw is None:
            raise HTTPException(404, "RAW file not found")
        src = raw
        filename = photo.raw_filename or raw.name
    else:
        raise HTTPException(400, "format must be jpg or raw")

    if not src.is_file():
        raise HTTPException(404, "Original file not found on disk")

    # 下载必须是磁盘原始字节，不做方向纠正或转码
    return FileResponse(str(src), filename=filename)


@router.get("/{file_hash}/original")
def api_get_original(file_hash: str, project_id: str):
    photo = _find_file(project_id, file_hash)
    if photo is None:
        raise HTTPException(404, "Photo not found in project")
    src = Path(photo.original_path)
    if not src.exists():
        raise HTTPException(404, "Original file not found on disk")

    corrected = get_corrected_image_bytes(str(src), photo.format)
    if corrected is not None:
        content, media_type = corrected
        return Response(content=content, media_type=media_type)

    media_type = f"image/{photo.format.lower()}"
    if media_type == "image/jpg":
        media_type = "image/jpeg"
    return FileResponse(str(src), media_type=media_type, filename=photo.filename)
