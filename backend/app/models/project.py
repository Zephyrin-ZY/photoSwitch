from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class ProjectStatus(str, Enum):
    SCANNING = "scanning"
    ANALYZING = "analyzing"
    READY = "ready"
    EXPORTING = "exporting"


class Project(BaseModel):
    id: str
    name: str
    source_folders: list[str] = Field(default_factory=list)
    created_at: str = ""
    status: ProjectStatus = ProjectStatus.SCANNING
    total_files: int = 0
    analyzed_files: int = 0
    similarity_threshold: float = 0.85
