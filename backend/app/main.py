from __future__ import annotations
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api import projects, photos, analysis, export

app = FastAPI(title="PhotoSwitch", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
app.include_router(photos.router)
app.include_router(analysis.router)
app.include_router(export.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
