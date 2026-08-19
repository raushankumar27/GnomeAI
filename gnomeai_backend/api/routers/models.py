import os
import json
from typing import Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from gnomeai_backend.interfaces.model import DeviceTarget, DeviceCompilationError
from gnomeai_backend.core.model_manager import model_lifecycle_manager

router = APIRouter(prefix="/api/models", tags=["models"])

class LLMCompilePayload(BaseModel):
    precision: str = "int4"
    device: Optional[str] = "AUTO"  # "CPU", "GPU", "XPU", "NPU", "AUTO"

class ModelDeviceTargetPayload(BaseModel):
    model_id: str
    device: str  # "CPU", "GPU", "XPU", "NPU"

class ModelImportPayload(BaseModel):
    filepath: str

@router.get("/llm")
def get_llm_status():
    from gnomeai_backend.llm.inbuilt import InbuiltLLMEngine
    return {
        "success": True,
        "inbuilt": InbuiltLLMEngine.get_status(),
        "manager_status": model_lifecycle_manager.get_status()
    }

@router.post("/device_target")
def set_model_device_target(payload: ModelDeviceTargetPayload):
    try:
        dev_enum = DeviceTarget(payload.device.upper())
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid hardware device '{payload.device}'. Must be one of: CPU, GPU, XPU, NPU.")
    model_lifecycle_manager.set_device_preference(payload.model_id, dev_enum)
    return {"success": True, "model_id": payload.model_id, "device": dev_enum.value}

@router.post("/llm/unload")
def unload_inbuilt_llm():
    from gnomeai_backend.llm.inbuilt import InbuiltLLMEngine
    InbuiltLLMEngine.unload_inbuilt_llm()
    model_lifecycle_manager.unload_all()
    return {"success": True, "message": "Inbuilt models unloaded successfully"}

@router.get("/llm/logs/load")
def get_model_load_log():
    from gnomeai_backend.llm.inbuilt import InbuiltLLMEngine
    return {"success": True, "log": getattr(InbuiltLLMEngine, 'compile_log', '')}

@router.post("/llm/compile")
def compile_inbuilt_llm(payload: LLMCompilePayload):
    from gnomeai_backend.llm.inbuilt import InbuiltLLMEngine
    try:
        if payload.device:
            try:
                dev_enum = DeviceTarget(payload.device.upper())
                model_lifecycle_manager.set_device_preference("inbuilt_llm", dev_enum)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid target device: '{payload.device}'")
        InbuiltLLMEngine.load_and_compile_async(precision=payload.precision)
        return {"success": True, "message": f"Started model compilation ({payload.precision}) on requested device ({payload.device or 'AUTO'})"}
    except DeviceCompilationError as dce:
        raise HTTPException(status_code=400, detail=str(dce))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/hf/search")
def search_hf_models(query: str = ""):
    from gnomeai_backend.llm.inbuilt import InbuiltLLMEngine
    try:
        results = InbuiltLLMEngine.search_hf_gguf(query) if hasattr(InbuiltLLMEngine, 'search_hf_gguf') else []
        return {"success": True, "models": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/import")
def import_model_file(payload: ModelImportPayload):
    from gnomeai_backend.llm.inbuilt import InbuiltLLMEngine
    if not os.path.exists(payload.filepath):
        raise HTTPException(status_code=404, detail="File does not exist")
    try:
        imported_id = InbuiltLLMEngine.import_gguf_file(payload.filepath) if hasattr(InbuiltLLMEngine, 'import_gguf_file') else payload.filepath
        return {"success": True, "model_id": imported_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
