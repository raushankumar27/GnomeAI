import os
from typing import Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["rag"])

class RAGQueryPayload(BaseModel):
    query: str
    top_k: int = 4

class RAGIndexPayload(BaseModel):
    workspace_path: str

@router.get("/learnings")
def get_learnings():
    from gnomeai_backend.core.learnings import load_learnings
    return {"learnings": load_learnings()}

@router.post("/learnings")
def update_learnings(payload: dict):
    from gnomeai_backend.core.learnings import save_learnings
    learnings = payload.get("learnings", [])
    save_learnings(learnings)
    return {"success": True, "learnings": learnings}

@router.post("/rag/query")
def query_rag(payload: RAGQueryPayload):
    from gnomeai_backend.tools.rag import rag_engine
    try:
        results = rag_engine.query(payload.query, top_k=payload.top_k)
        return {"success": True, "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/rag/index")
def index_rag_workspace(payload: RAGIndexPayload):
    from gnomeai_backend.tools.rag import rag_engine
    try:
        count = rag_engine.index_directory(payload.workspace_path)
        return {"success": True, "indexed_files": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
