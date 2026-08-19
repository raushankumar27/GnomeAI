import os
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/agents", tags=["agents"])

class SessionUpdateMode(BaseModel):
    session_id: str
    mode: str

class ChatAuthRequest(BaseModel):
    session_id: str
    approved: bool
    code: Optional[str] = None

@router.post("/mode/update")
def update_session_mode(payload: SessionUpdateMode):
    from gnomeai_backend.core.sessions import load_session, save_session
    try:
        session = load_session(payload.session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        session["mode"] = payload.mode
        save_session(payload.session_id, session)
        return {"success": True, "mode": payload.mode}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/auth/pending")
def get_pending_auth():
    from gnomeai_backend.agents.chat_engine import active_auth_events
    pending = []
    for sid, data in active_auth_events.items():
        pending.append({"session_id": sid, "code": data.get("code")})
    return {"pending": pending}

@router.post("/auth/respond")
def respond_auth(payload: ChatAuthRequest):
    from gnomeai_backend.agents.chat_engine import active_auth_events
    if payload.session_id in active_auth_events:
        evt_info = active_auth_events.pop(payload.session_id)
        evt_info["event"].set()
        evt_info["approved"] = payload.approved
        return {"success": True}
    return {"success": False, "message": "No pending authorization found for session"}
