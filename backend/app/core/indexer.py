from __future__ import annotations
import json
import uuid
import threading
from pathlib import Path
from ..config import RAW_FORMATS, settings
from ..models.project import Project, ProjectStatus
from ..models.photo import PhotoFile, PhotoStatus

# 文件锁，防止并发写入 files.json
_file_locks = {}
_lock_lock = threading.Lock()


def get_project_dir(project_id: str) -> Path:
    return Path(settings.data_dir) / "projects" / project_id


def get_file_lock(project_id: str) -> threading.Lock:
    """获取项目文件的锁，防止并发写入"""
    with _lock_lock:
        if project_id not in _file_locks:
            _file_locks[project_id] = threading.Lock()
        return _file_locks[project_id]


def create_project(name: str, source_folders: list[str], similarity_threshold: float = 0.85) -> Project:
    project_id = str(uuid.uuid4())[:8]
    project_dir = get_project_dir(project_id)
    project_dir.mkdir(parents=True, exist_ok=True)

    project = Project(
        id=project_id,
        name=name,
        source_folders=source_folders,
        similarity_threshold=similarity_threshold,
        created_at=__import__("datetime").datetime.now().isoformat(),
    )
    (project_dir / "project.json").write_text(project.model_dump_json(indent=2))
    (project_dir / "files.json").write_text('{"files": []}')
    return project


def load_project(project_id: str) -> Project:
    project_dir = get_project_dir(project_id)
    data = (project_dir / "project.json").read_text()
    return Project.model_validate_json(data)


def list_projects() -> list[Project]:
    projects_dir = Path(settings.data_dir) / "projects"
    if not projects_dir.exists():
        return []

    projects = []
    for project_dir in sorted(projects_dir.iterdir(), reverse=True):
        project_file = project_dir / "project.json"
        if project_file.exists():
            try:
                project = Project.model_validate_json(project_file.read_text())
                projects.append(project)
            except Exception:
                continue
    return projects


def save_project(project: Project) -> None:
    project_dir = get_project_dir(project.id)
    (project_dir / "project.json").write_text(project.model_dump_json(indent=2))


def save_files(project_id: str, files: list[PhotoFile]) -> None:
    project_dir = get_project_dir(project_id)
    data = {"files": [f.model_dump() for f in files]}
    (project_dir / "files.json").write_text(
        __import__("json").dumps(data, ensure_ascii=False, indent=2)
    )


def load_files(project_id: str) -> list[PhotoFile]:
    project_dir = get_project_dir(project_id)
    data = json.loads((project_dir / "files.json").read_text())
    files = []
    for f in data["files"]:
        # 旧数据里 RAW 是独立照片，现在只作为 JPG 的附件存在，加载时直接忽略
        if f.get("format", "").lower() in RAW_FORMATS:
            continue
        # 兼容旧数据：status='favorite' 迁移到 is_favorite=True + status='keep'
        if f.get("status") == "favorite":
            f["status"] = "keep"
            f["is_favorite"] = True
        # 旧数据没有 is_favorite 字段时默认 False
        if "is_favorite" not in f:
            f["is_favorite"] = False
        # 旧数据没有 orientation 字段时默认 None
        if "orientation" not in f:
            f["orientation"] = None
        files.append(PhotoFile.model_validate(f))
    return files


def update_photo_status(project_id: str, file_hash: str, status: str) -> PhotoFile | None:
    """更新照片状态，使用文件锁防止并发写入"""
    lock = get_file_lock(project_id)
    with lock:
        files = load_files(project_id)
        for f in files:
            if f.hash == file_hash:
                f.status = PhotoStatus(status)
                save_files(project_id, files)
                return f
    return None


def delete_project(project_id: str) -> bool:
    import shutil
    project_dir = get_project_dir(project_id)
    if not project_dir.exists():
        return False
    shutil.rmtree(project_dir)
    return True


def save_progress(project_id: str, progress: dict) -> None:
    """将进度数据持久化到磁盘"""
    project_dir = get_project_dir(project_id)
    project_dir.mkdir(parents=True, exist_ok=True)
    (project_dir / "progress.json").write_text(
        __import__("json").dumps(progress, ensure_ascii=False, indent=2)
    )


def load_progress(project_id: str) -> dict | None:
    """从磁盘加载进度数据"""
    project_dir = get_project_dir(project_id)
    progress_file = project_dir / "progress.json"
    if progress_file.exists():
        try:
            return json.loads(progress_file.read_text())
        except Exception:
            return None
    return None
