from __future__ import annotations
import json
import sys
import numpy as np
from pathlib import Path
from ..config import settings
from ..models.photo import PhotoFile
from ..core.thumbnail import get_thumbnail_path

# 相似照片分组使用的 CLIP 模型（本地权重缺失时的在线回退仓库 id）
HF_CLIP_REPO = "openai/clip-vit-base-patch32"


def extract_features_and_cluster(
    files: list[PhotoFile],
    project_id: str,
    similarity_threshold: float | None = None,
    on_progress=None,
) -> dict | None:
    try:
        from transformers import CLIPProcessor, CLIPModel
        from PIL import Image
        import torch
    except ImportError as e:
        print(f"[CLIP] Import error: {e}", file=sys.stderr)
        return None

    try:
        model_id = settings.clip_model
        print(f"[CLIP] Loading model: {model_id}", file=sys.stderr)
        print(f"[CLIP] HF_ENDPOINT={__import__('os').environ.get('HF_ENDPOINT', 'not set')}", file=sys.stderr)
        print(f"[CLIP] Files to process: {len(files)}", file=sys.stderr)
        if files:
            print(f"[CLIP] First file: {files[0].filename} - {files[0].original_path}", file=sys.stderr)

        model, processor = _load_clip_model(model_id)
        model.eval()
        print(f"[CLIP] Model loaded successfully", file=sys.stderr)
    except Exception as e:
        print(f"[CLIP] Failed to load model: {e}", file=sys.stderr)
        return None

    features = []
    valid_indices = []

    for i, f in enumerate(files):
        try:
            print(f"[CLIP] Processing {f.filename}...", file=sys.stderr)
            thumb_path = get_thumbnail_path(project_id, f.hash, "thumb")
            img_path = str(thumb_path) if thumb_path.exists() else f.original_path
            img = Image.open(img_path).convert("RGB")
            img.thumbnail((224, 224))
            inputs = processor(images=img, return_tensors="pt")
            with torch.no_grad():
                feat = model.get_image_features(**inputs)
            feat = feat / feat.norm(dim=-1, keepdim=True)
            features.append(feat.squeeze().numpy())
            valid_indices.append(i)
            if i == 0:
                print(f"[CLIP] First image processed successfully", file=sys.stderr)
        except Exception as e:
            print(f"[CLIP] Error processing {f.filename}: {type(e).__name__}: {e}", file=sys.stderr)
            import traceback
            traceback.print_exc(file=sys.stderr)
            continue
        if on_progress:
            on_progress(i + 1)

    if not features:
        print("[CLIP] No features extracted", file=sys.stderr)
        return None

    print(f"[CLIP] Extracted features for {len(features)} photos", file=sys.stderr)
    vectors = np.array(features)
    project_dir = Path(settings.data_dir) / "projects" / project_id
    np.save(str(project_dir / "vectors.npy"), vectors)

    print("[CLIP] Clustering by similarity...", file=sys.stderr)
    effective_threshold = similarity_threshold if similarity_threshold is not None else settings.similarity_threshold
    clusters = _cluster_by_similarity(vectors, effective_threshold)
    cluster_map = {}
    for list_idx, cluster_id in enumerate(clusters):
        file_idx = valid_indices[list_idx]
        cid = f"cluster_{cluster_id:04d}"
        files[file_idx].cluster_id = cid
        cluster_map.setdefault(cid, []).append(files[file_idx].hash)

    (project_dir / "clusters.json").write_text(
        json.dumps(cluster_map, indent=2)
    )
    print(f"[CLIP] Created {len(cluster_map)} clusters", file=sys.stderr)
    return {"files": files}


def _cluster_by_similarity(vectors: np.ndarray, threshold: float) -> list[int]:
    from sklearn.cluster import AgglomerativeClustering
    dist = 1 - (vectors @ vectors.T)
    np.fill_diagonal(dist, 0)
    dist = np.clip(dist, 0, 1)

    clustering = AgglomerativeClustering(
        n_clusters=None,
        distance_threshold=1 - threshold,
        metric="precomputed",
        linkage="average",
    )
    return clustering.fit_predict(dist).tolist()


def _load_clip_model(model_id: str):
    from transformers import CLIPProcessor, CLIPModel
    from pathlib import Path

    path = Path(model_id)
    if path.exists() and path.is_dir():
        print(f"[CLIP] Detected local model directory: {path}", file=sys.stderr)
        model = CLIPModel.from_pretrained(
            pretrained_model_name_or_path=str(path),
            local_files_only=True,
        )
        processor = CLIPProcessor.from_pretrained(
            pretrained_model_name_or_path=str(path),
            local_files_only=True,
        )
        return model, processor

    # 本地目录不存在（例如首次 clone 未下载权重）时，回退到 Hugging Face Hub 在线拉取
    repo_id = model_id if "/" in model_id and not model_id.startswith((".", "~")) else HF_CLIP_REPO
    print(
        f"[CLIP] Local model dir not found: {model_id}; "
        f"downloading '{repo_id}' from Hugging Face Hub (set HF_ENDPOINT to use a mirror)",
        file=sys.stderr,
    )
    return (
        CLIPModel.from_pretrained(repo_id),
        CLIPProcessor.from_pretrained(repo_id),
    )
