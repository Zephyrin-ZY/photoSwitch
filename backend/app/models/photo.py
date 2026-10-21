from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class PhotoStatus(str, Enum):
    PENDING = "pending"
    KEEP = "keep"
    ELIMINATE = "eliminate"


class PhotoFile(BaseModel):
    hash: str
    filename: str
    original_path: str
    file_size: int
    format: str
    status: PhotoStatus = PhotoStatus.PENDING
    is_favorite: bool = False
    cluster_id: str | None = None
    exif: dict[str, object] = Field(default_factory=dict)
    created_at: str = ""
    width: int | None = None
    height: int | None = None
    orientation: int | None = None
