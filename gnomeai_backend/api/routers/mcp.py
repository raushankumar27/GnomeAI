import os
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/mcp", tags=["mcp"])

class MCPServerPayload(BaseModel):
    name: str
    command: str
    args: Optional[List[str]] = None
    env: Optional[Dict[str, str]] = None

@router.get("/servers")
def get_mcp_servers():
    from gnomeai_backend.tools.mcp import mcp_manager
    return {"servers": mcp_manager.list_servers()}

@router.post("/servers")
def add_mcp_server(payload: MCPServerPayload):
    from gnomeai_backend.tools.mcp import mcp_manager
    try:
        mcp_manager.add_server(payload.name, payload.command, payload.args, payload.env)
        return {"success": True, "servers": mcp_manager.list_servers()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/servers/{server_name}")
def remove_mcp_server(server_name: str):
    from gnomeai_backend.tools.mcp import mcp_manager
    try:
        mcp_manager.remove_server(server_name)
        return {"success": True, "servers": mcp_manager.list_servers()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tools")
def get_mcp_tools():
    from gnomeai_backend.tools.mcp import mcp_manager
    return {"tools": mcp_manager.list_tools()}
