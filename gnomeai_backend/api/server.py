import os
import json
import subprocess
import traceback
import time
import threading
import socket
import urllib.request
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import sys

BACKEND_LOG_FILE = os.path.expanduser("~/.config/gnomeai/backend.log")
os.makedirs(os.path.dirname(BACKEND_LOG_FILE), exist_ok=True)

class DualOutput:
    def __init__(self, original_stream, log_file_path):
        self.original_stream = original_stream
        self.log_file = open(log_file_path, "a", encoding="utf-8", errors="ignore")

    def write(self, data):
        self.original_stream.write(data)
        self.original_stream.flush()
        self.log_file.write(data)
        self.log_file.flush()

    def flush(self):
        self.original_stream.flush()
        self.log_file.flush()

    def isatty(self):
        return hasattr(self.original_stream, "isatty") and self.original_stream.isatty()

    def fileno(self):
        if hasattr(self.original_stream, "fileno"):
            return self.original_stream.fileno()
        raise OSError("fileno not supported")

# Truncate on start
with open(BACKEND_LOG_FILE, "w", encoding="utf-8") as f:
    f.write("")

sys.stdout = DualOutput(sys.stdout, BACKEND_LOG_FILE)
sys.stderr = DualOutput(sys.stderr, BACKEND_LOG_FILE)

from gnomeai_backend.config import app_settings, save_settings, PORT
from gnomeai_backend.core.sessions import (
    SESSIONS_DIR, get_session_path, create_session, load_session, 
    save_session, init_sessions, get_active_session_id, set_active_session_id
)
from gnomeai_backend.core.learnings import load_learnings, save_learnings, extract_learnings_from_session
from gnomeai_backend.agents.chat_engine import run_agent_turn, active_auth_events
from gnomeai_backend.tools import skills as skills_manager
from gnomeai_backend.core.workspace import workspace_manager
from gnomeai_backend.audio.qwen_tts import qwen_tts_manager
from gnomeai_backend.audio.openvino_tts import ov_tts_manager
from gnomeai_backend.audio.tts_worker import tts_worker
import shutil
from fastapi import File, UploadFile, Form
from fastapi.responses import Response, FileResponse, StreamingResponse

app = FastAPI(title="GnomeAI Studio API")

@app.get("/health")
def root_health_check():
    return {"status": "ok", "app": "gnomeai"}


from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": f"ERR_{exc.status_code}",
                "message": exc.detail
            }
        }
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": str(exc.errors())
            }
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": str(exc)
            }
        }
    )

def check_safe_path(path: str):
    if not path:
        return
    # Prevent traversal
    abs_path = os.path.abspath(os.path.expanduser(path))
    user_home = os.path.expanduser("~")
    if ".." in path or not (abs_path.startswith(user_home) or abs_path.startswith("/home")):
        raise HTTPException(status_code=403, detail="Access denied: Path must be within the user home or codes directory.")

router = APIRouter()

from gnomeai_backend.api.routers.models import router as models_router
from gnomeai_backend.api.routers.audio import router as audio_router
from gnomeai_backend.api.routers.rag import router as rag_router
from gnomeai_backend.api.routers.mcp import router as mcp_router
from gnomeai_backend.api.routers.agents import router as agents_router

app.include_router(models_router)
app.include_router(audio_router)
app.include_router(rag_router)
app.include_router(mcp_router)
app.include_router(agents_router)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


settings_lock = threading.Lock()
auto_loaded_by_panel = False
unload_timer = None
unload_timer_lock = threading.Lock()
active_aplay_process = None
active_aplay_lock = threading.Lock()

# Per-session stop events for cancelling generation
_stop_events: dict = {}
_stop_events_lock = threading.Lock()

def get_stop_event(session_id: str) -> threading.Event:
    with _stop_events_lock:
        if session_id not in _stop_events:
            _stop_events[session_id] = threading.Event()
        return _stop_events[session_id]

def clear_stop_event(session_id: str):
    with _stop_events_lock:
        ev = _stop_events.get(session_id)
        if ev:
            ev.clear()

# WebSocket active connections tracker
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass

manager = ConnectionManager()

def start_auto_unload_timer():
    global unload_timer
    with unload_timer_lock:
        if unload_timer is not None:
            unload_timer.cancel()
        
        def do_unload():
            global auto_loaded_by_panel
            print("[Auto-Unload] Idle timeout reached. Unloading model...")
            try:
                inbuilt_llm.unload_inbuilt_llm()
                auto_loaded_by_panel = False
            except Exception as e:
                print(f"[Auto-Unload] Error unloading model: {e}")
                
        unload_timer = threading.Timer(300.0, do_unload)
        unload_timer.daemon = True
        unload_timer.start()

def cancel_auto_unload_timer():
    global unload_timer
    with unload_timer_lock:
        if unload_timer is not None:
            unload_timer.cancel()
            unload_timer = None

PRESETS_FILE = os.path.expanduser("~/.config/gnomeai/presets.json")
CUSTOM_VOICES_DIR = os.path.expanduser("~/.config/gnomeai/custom_voices")
RECORDINGS_DIR = os.path.expanduser("~/.config/gnomeai/recordings")
os.makedirs(CUSTOM_VOICES_DIR, exist_ok=True)
os.makedirs(RECORDINGS_DIR, exist_ok=True)

import hashlib
import uuid
from datetime import datetime

from gnomeai_backend.core.jobs import job_manager

def create_job(job_type: str, metadata: Optional[Dict[str, Any]] = None, callback_url: Optional[str] = None) -> str:
    return job_manager.create_job(job_type, metadata=metadata, callback_url=callback_url)

def update_job(job_id: str, status: Optional[str] = None, progress: Optional[float] = None, result: Any = None, error: Optional[str] = None):
    job_manager.update_job(job_id=job_id, status=status, progress=progress, result=result, error=error)

from gnomeai_backend.audio import audio_studio_manager, stt_manager

def find_cached_speak_recording(text: str, voice: str) -> Optional[bytes]:
    return audio_studio_manager.find_cached_speak_recording(text, voice)

def save_speak_recording(wav_bytes: bytes, text: str, voice: str) -> str:
    return audio_studio_manager.save_speak_recording(wav_bytes, text, voice)

def save_generated_recording(wav_bytes: bytes, text: str, engine: str, source: str, speaker: str) -> str:
    return audio_studio_manager.save_generated_recording(wav_bytes, text, engine, source, speaker)

def load_presets():
    if not os.path.exists(PRESETS_FILE):
        defaults = {
            "Default": {
                "system_prompt": "You are GnomeAI, a helpful, intelligent Linux desktop assistant. Answer the user's questions or chat with them directly.",
                "temperature": 0.7,
                "cpu_threads": 4,
                "top_k": 40,
                "top_p": 0.95,
                "min_p": 0.05,
                "mode": "auto"
            },
            "Creative Assistant": {
                "system_prompt": "You are a creative, expressive assistant. Answer with vivid and descriptive language.",
                "temperature": 0.9,
                "cpu_threads": 4,
                "top_k": 50,
                "top_p": 0.95,
                "min_p": 0.05,
                "mode": "chat"
            },
            "Precise Coder": {
                "system_prompt": "You are a highly precise coding assistant. Provide clean, correct code blocks without unnecessary explanations.",
                "temperature": 0.2,
                "cpu_threads": 4,
                "top_k": 30,
                "top_p": 0.95,
                "min_p": 0.05,
                "mode": "code"
            }
        }
        os.makedirs(os.path.dirname(PRESETS_FILE), exist_ok=True)
        try:
            with open(PRESETS_FILE, "w") as f:
                json.dump(defaults, f, indent=4)
        except Exception:
            pass
        return defaults
        
    try:
        with open(PRESETS_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return {}

def save_presets(presets):
    try:
        os.makedirs(os.path.dirname(PRESETS_FILE), exist_ok=True)
        with open(PRESETS_FILE, "w") as f:
            json.dump(presets, f, indent=4)
        return True
    except Exception as e:
        print(f"Error saving presets: {e}")
        return False

# Pydantic Schemas
class SettingsUpdate(BaseModel):
    session_id: Optional[str] = None
    lm_studio_url: Optional[str] = None
    model_name: Optional[str] = None
    inbuilt_model_id: Optional[str] = None
    inbuilt_device: Optional[str] = None
    tts_speed: Optional[float] = None
    enable_dbus_monitor: Optional[bool] = None
    enable_tts: Optional[bool] = None
    llm_backend: Optional[str] = None
    system_prompt: Optional[str] = None
    temperature: Optional[float] = None
    cpu_threads: Optional[int] = None
    top_k: Optional[int] = None
    top_p: Optional[float] = None
    min_p: Optional[float] = None
    active_preset: Optional[str] = None
    tts_voice: Optional[str] = None
    expand_thoughts: Optional[bool] = None
    flash_attention: Optional[bool] = None
    context_limit: Optional[int] = None
    extension_model_id: Optional[str] = None
    chat_font_size: Optional[float] = None
    chat_font_family: Optional[str] = None

class SkillSave(BaseModel):
    id: str
    code: str

class SkillDelete(BaseModel):
    id: str

class SessionUpdateMode(BaseModel):
    session_id: str
    mode: str

SessionMode = SessionUpdateMode  # alias kept for any legacy references

class SessionSettingsUpdate(BaseModel):
    session_id: str
    system_prompt: Optional[str] = None
    temperature: Optional[float] = None

class SessionDelete(BaseModel):
    session_id: str

class SessionFork(BaseModel):
    session_id: str

class SessionRename(BaseModel):
    session_id: str
    title: str

class MessageDelete(BaseModel):
    session_id: str
    message_index: int

class SessionSummarize(BaseModel):
    session_id: Optional[str] = None

class SessionLearn(BaseModel):
    session_id: str

class LLMCompilePayload(BaseModel):
    precision: str = "int4"

class TTSRequest(BaseModel):
    text: str
    voice: str = "af_sarah"

class ChatAuthRequest(BaseModel):
    session_id: str
    approved: bool
    code: Optional[str] = None

class ModelImportPayload(BaseModel):
    filepath: str

class MCPServerPayload(BaseModel):
    name: str
    command: str
    args: Optional[List[str]] = None
    env: Optional[Dict[str, str]] = None

# HTTP REST API endpoints
@router.get("/api/status")
def get_status():
    lms_connected = False
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1.0)
        res = sock.connect_ex(('localhost', 1234))
        sock.close()
        lms_connected = (res == 0)
    except Exception:
        pass
    return {"status": "online", "lm_studio_connected": lms_connected}

@router.get("/api/settings")
def get_settings():
    lms_connected = False
    loaded_models = []
    with settings_lock:
        lms_url = app_settings.get('lm_studio_url', '')
        current_settings = app_settings.copy()
    try:
        url = f"{lms_url.rstrip('/')}/models"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=2) as response:
            models_data = json.loads(response.read().decode("utf-8"))
            loaded_models = [m.get("id") for m in models_data.get("data", [])]
            lms_connected = True
    except Exception:
        pass
    return {
        "settings": current_settings,
        "lm_studio_connected": lms_connected,
        "available_models": loaded_models
    }

@router.post("/api/settings")
def post_settings(payload: SettingsUpdate):
    global app_settings
    with settings_lock:
        data = payload.model_dump(exclude_unset=True)
        for k, v in data.items():
            app_settings[k] = v
        save_settings()
        current_settings = app_settings.copy()
        
        # Save model details into the target session
        session_id = payload.session_id or get_active_session_id()
        if session_id:
            session = load_session(session_id)
            if session:
                backend = payload.llm_backend or current_settings.get("llm_backend", "inbuilt")
                model_name = payload.inbuilt_model_id if backend == "inbuilt" else payload.model_name
                if model_name:
                    session["active_model"] = {
                        "name": model_name,
                        "backend": backend
                    }
                    save_session(session_id, session)
    return {"success": True, "settings": current_settings}

class VoiceDesignPayload(BaseModel):
    text: str
    language: str
    instruct: str
    engine: Optional[str] = "qwen3"

class CustomVoicePayload(BaseModel):
    text: str
    language: str
    speaker: str
    instruct: Optional[str] = None
    model_size: str = "1.7B"
    engine: Optional[str] = "qwen3"

class VoiceDeletePayload(BaseModel):
    name: str

@router.post("/api/voice_design/generate")
def voice_design_generate(payload: VoiceDesignPayload):
    try:
        wav_bytes = audio_studio_manager.generate_voice_design(
            text=payload.text,
            language=payload.language,
            instruct=payload.instruct,
            engine=payload.engine or "qwen3"
        )
        return Response(content=wav_bytes, media_type="audio/wav")
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/audio/preprocess")
async def preprocess_audio_endpoint(file: UploadFile = File(...)):
    try:
        raw_bytes = await file.read()
        cleaned_bytes = audio_studio_manager.preprocess_noise_suppression(raw_bytes)
        return Response(content=cleaned_bytes, media_type="audio/wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/voice_clone/generate")
async def voice_clone_generate(
    file: UploadFile = File(...),
    target_text: str = Form(...),
    ref_text: str = Form(""),
    use_xvector_only: str = Form("false"),
    language: str = Form("Auto"),
    model_size: str = Form("1.7B"),
    engine: str = Form("qwen3"),
    preprocess_audio: str = Form("false")
):
    try:
        audio_bytes = await file.read()
        wav_bytes = audio_studio_manager.generate_voice_clone(
            audio_bytes=audio_bytes,
            target_text=target_text,
            ref_text=ref_text,
            use_xvector_only=use_xvector_only.lower() == "true",
            language=language,
            model_size=model_size,
            engine=engine,
            preprocess_audio=preprocess_audio.lower() == "true",
            filename=file.filename or "uploaded_file"
        )
        return Response(content=wav_bytes, media_type="audio/wav")
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/tts/stream")
async def tts_stream_endpoint(payload: dict = Body(...)):
    text = payload.get("text", "")
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    try:
        gen = audio_studio_manager.generate_tts_stream(
            text=text,
            engine=payload.get("engine", "qwen3"),
            speaker=payload.get("speaker", "Ryan"),
            language=payload.get("language", "Auto"),
            instruct=payload.get("instruct", ""),
            model_size=payload.get("model_size", "1.7B")
        )
        return StreamingResponse(gen, media_type="audio/wav")
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/custom_voice/generate")
def custom_voice_generate(payload: CustomVoicePayload):
    try:
        wav_bytes = audio_studio_manager.generate_custom_voice(
            text=payload.text,
            language=payload.language,
            speaker=payload.speaker,
            instruct=payload.instruct,
            model_size=payload.model_size,
            engine=payload.engine or "qwen3"
        )
        return Response(content=wav_bytes, media_type="audio/wav")
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/recordings")
def get_recordings():
    try:
        return {"success": True, "recordings": audio_studio_manager.get_recordings()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/api/recordings/{rec_id}")
def delete_recording(rec_id: str):
    try:
        success = audio_studio_manager.delete_recording(rec_id)
        return {"success": success}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/recordings/{rec_id}/wav")
def get_recording_wav(rec_id: str):
    data = audio_studio_manager.get_recording_bytes(rec_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Recording audio not found")
    return Response(content=data, media_type="audio/wav")

@router.post("/api/custom_voices/save")
async def save_custom_voice(
    name: str = Form(...),
    type: str = Form(...),
    file: UploadFile = File(...),
    ref_text: str = Form(""),
    x_vector_only: str = Form("false"),
    description: str = Form(""),
    speaker: str = Form("")
):
    try:
        audio_studio_manager.save_custom_voice(
            name=name,
            voice_type=type,
            file_obj=file.file,
            ref_text=ref_text,
            x_vector_only=x_vector_only.lower() == "true",
            description=description,
            speaker=speaker
        )
        return {"success": True}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/custom_voices")
def get_custom_voices():
    return {"voices": audio_studio_manager.get_custom_voices()}

@router.get("/api/custom_voices/audio/{name}")
def get_custom_voice_audio(name: str):
    path = audio_studio_manager.get_custom_voice_wav_path(name)
    if path:
        return FileResponse(path, media_type="audio/wav")
    raise HTTPException(status_code=404, detail="Audio file not found")

@router.delete("/api/custom_voices/{name}")
def delete_custom_voice(name: str):
    success = audio_studio_manager.delete_custom_voice(name)
    return {"success": success}

# --- Story Mode Endpoints ---

class StoryRerollPayload(BaseModel):
    clip_id: str
    master_id: Optional[str] = None
    text: str
    instruct: str
    language: Optional[str] = "Auto"

class StoryExportPayload(BaseModel):
    master_id: str
    title: Optional[str] = "GnomeAI Audiobook"
    author: Optional[str] = "GnomeAI Studio"
    format: Optional[str] = "mp3"

@router.post("/api/story/reroll_line")
def story_reroll_line(payload: StoryRerollPayload):
    try:
        res = audio_studio_manager.story_reroll_line(
            clip_id=payload.clip_id,
            master_id=payload.master_id,
            text=payload.text,
            instruct=payload.instruct,
            language=payload.language or "Auto"
        )
        return res
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/story/export_audiobook")
def story_export_audiobook(payload: StoryExportPayload):
    try:
        out_path = audio_studio_manager.story_export_audiobook(
            master_id=payload.master_id,
            title=payload.title,
            author=payload.author,
            audio_format=payload.format
        )
        return {"success": True, "output_path": out_path, "filename": os.path.basename(out_path)}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/story/parse_ebook")
async def story_parse_ebook(file: UploadFile = File(...)):
    try:
        content_bytes = await file.read()
        filename = file.filename or "ebook.txt"
        ext = os.path.splitext(filename)[1].lower()
        
        text_content = ""
        if ext in (".txt", ".md"):
            text_content = content_bytes.decode("utf-8", errors="ignore")
        elif ext == ".pdf":
            try:
                import pypdf
                reader = pypdf.PdfReader(io.BytesIO(content_bytes))
                text_content = "\n\n".join([page.extract_text() for page in reader.pages if page.extract_text()])
            except Exception:
                tmp_pdf = f"/tmp/gnomeai_{uuid.uuid4().hex[:6]}.pdf"
                with open(tmp_pdf, "wb") as f:
                    f.write(content_bytes)
                res = subprocess.run(["pdftotext", tmp_pdf, "-"], capture_output=True, text=True)
                text_content = res.stdout
                if os.path.exists(tmp_pdf):
                    os.remove(tmp_pdf)
        else:
            text_content = content_bytes.decode("utf-8", errors="ignore")
            
        words = text_content.split()
        chunk_size = 600
        chapters = []
        for i in range(0, len(words), chunk_size):
            chunk_words = words[i:i+chunk_size]
            chap_num = (i // chunk_size) + 1
            chapters.append({
                "chapter_index": chap_num,
                "title": f"Passage {chap_num}",
                "text": " ".join(chunk_words)
            })
            
        return {"success": True, "filename": filename, "total_chapters": len(chapters), "chapters": chapters[:20]}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

class StoryRefinePayload(BaseModel):
    script: dict
    comment: str
    session_id: Optional[str] = None

@router.post("/api/story/refine_script")
async def handle_refine_story_script(payload: StoryRefinePayload):
    """
    Lightweight Story Script Refinement Endpoint:
    Receives current script JSON, user comment, and optional session context.
    Refines narration, dialogue, speaker roles, and emotions matching preset guidelines.
    """
    try:
        from gnomeai_backend.agents.chat_engine import refine_story_script
        updated_script = refine_story_script(payload.script, payload.comment, payload.session_id)
        return {"success": True, "script": updated_script}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/logs")
def get_logs(lines: int = 100):
    if not os.path.exists(BACKEND_LOG_FILE):
        return {"logs": "Log file not found"}
    try:
        with open(BACKEND_LOG_FILE, "r", errors="ignore") as f:
            content = f.readlines()
            last_lines = content[-lines:]
            return {"logs": "".join(last_lines)}
    except Exception as e:
        return {"logs": f"Error reading logs: {str(e)}"}

# --- Unified Model Lifecycle & Job Status Endpoints ---

@router.get("/api/models/llm")
def get_models_llm_status():
    from gnomeai_backend.llm import inbuilt as inbuilt_llm
    inbuilt_status = inbuilt_llm.get_status()
    lms_connected = False
    lms_models = []
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1.0)
        res = sock.connect_ex(('localhost', 1234))
        sock.close()
        lms_connected = (res == 0)
    except Exception:
        pass
    
    if lms_connected:
        try:
            url = f"{app_settings.get('lm_studio_url', 'http://localhost:1234').rstrip('/')}/models"
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=0.4) as response:
                models_data = json.loads(response.read().decode("utf-8"))
                for m in models_data.get("data", []):
                    lms_models.append({
                        "id": m.get("id"),
                        "name": m.get("id"),
                        "loaded": True,
                        "backend": "lms"
                    })
        except Exception:
            pass
            
    return {
        "success": True,
        "inbuilt": inbuilt_status,
        "lms": {
            "connected": lms_connected,
            "models": lms_models
        },
        "active_model": app_settings.get("model_name") or app_settings.get("inbuilt_model_id")
    }

@router.get("/api/models/llm/available")
def get_models_llm_available():
    from gnomeai_backend.llm.manager import LLMModelManager
    return {
        "success": True,
        "inbuilt": LLMModelManager.get_available_inbuilt_models(),
        "lms": LLMModelManager.get_lms_available()
    }

@router.post("/api/models/llm/{id:path}/load")
def load_llm_model_unified(id: str, payload: dict = Body(default={})):
    import urllib.parse
    id = urllib.parse.unquote(id)
    backend = payload.get("backend", "inbuilt")
    target_session_id = payload.get("session_id") or get_active_session_id()
    if backend == "lms":
        try:
            load_url = f"{app_settings['lm_studio_url'].rstrip('/')}/models/load"
            load_payload = json.dumps({"model": id}).encode('utf-8')
            req = urllib.request.Request(
                load_url, data=load_payload, 
                headers={'Content-Type': 'application/json'}, method='POST'
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                pass
            
            if target_session_id:
                session = load_session(target_session_id)
                if session:
                    session["active_model"] = {
                        "name": id,
                        "backend": "lms"
                    }
                    save_session(target_session_id, session)
            return {"success": True}
        except Exception as err:
            raise HTTPException(status_code=500, detail=str(err))
    else:
        from gnomeai_backend.llm import inbuilt as inbuilt_llm
        success = inbuilt_llm.load_inbuilt_llm(id)
        if success:
            if target_session_id:
                session = load_session(target_session_id)
                if session:
                    session["active_model"] = {
                        "name": id,
                        "backend": "inbuilt"
                    }
                    save_session(target_session_id, session)
        return {"success": success}

@router.post("/api/models/llm/{id:path}/unload")
def unload_llm_model_unified(id: str, payload: dict = Body(default={})):
    import urllib.parse
    id = urllib.parse.unquote(id)
    backend = payload.get("backend", "inbuilt")
    if backend == "lms":
        try:
            unload_url = f"{app_settings['lm_studio_url'].rstrip('/')}/models/unload"
            unload_payload = json.dumps({"model": id}).encode('utf-8')
            req = urllib.request.Request(
                unload_url, data=unload_payload, 
                headers={'Content-Type': 'application/json'}, method='POST'
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                pass
            return {"success": True}
        except Exception as err:
            raise HTTPException(status_code=500, detail=str(err))
    else:
        from gnomeai_backend.llm import inbuilt as inbuilt_llm
        inbuilt_llm.unload_inbuilt_llm()
        return {"success": True}

@router.post("/api/inbuilt_llm/unload")
def unload_inbuilt_llm_direct():
    from gnomeai_backend.llm import inbuilt as inbuilt_llm
    inbuilt_llm.unload_inbuilt_llm()
    if app_settings.get("llm_backend") == "lms":
        try:
            model_id = app_settings.get("model_name")
            if model_id:
                unload_url = f"{app_settings['lm_studio_url'].rstrip('/')}/models/unload"
                unload_payload = json.dumps({"model": model_id}).encode('utf-8')
                req = urllib.request.Request(
                    unload_url, data=unload_payload, 
                    headers={'Content-Type': 'application/json'}, method='POST'
                )
                with urllib.request.urlopen(req, timeout=5) as resp:
                    pass
        except Exception:
            pass
    return {"success": True}

@router.post("/api/inbuilt_llm/touch")
def touch_inbuilt_llm_direct():
    start_auto_unload_timer()
    return {"success": True}

@router.post("/api/inbuilt_llm/delete")
def delete_inbuilt_llm_direct(payload: dict = Body(default={})):
    model_id = payload.get("model_id")
    if model_id:
        from gnomeai_backend.llm import inbuilt as inbuilt_llm
        success = inbuilt_llm.delete_model_cache(model_id)
        return {"success": success}
    return {"success": False, "error": "model_id is required"}


@router.post("/api/models/llm/{id:path}/compile")
def compile_llm_model_unified(id: str, payload: LLMCompilePayload):
    from gnomeai_backend.llm import inbuilt as inbuilt_llm
    cache_dir = inbuilt_llm.get_model_cache_dir(id)
    job_id = create_job("llm_compile")

    def on_compile_log(chunk: str):
        try:
            import asyncio
            loop = asyncio.get_event_loop()
            asyncio.run_coroutine_threadsafe(
                manager.broadcast({"type": "compile_log", "content": chunk}), 
                loop
            )
        except Exception:
            pass

    def run_compile():
        from gnomeai_backend.llm import inbuilt as inbuilt_llm
        update_job(job_id, "running", progress=0.1)
        try:
            inbuilt_llm.set_status("compiling", f"Starting compile: {id}...", progress_pct=10)

            run_cmd = [
                "optimum-cli", "export", "openvino",
                "--model", id,
                "--weight-format", payload.precision,
                cache_dir
            ]
            env = os.environ.copy()
            env["HF_HUB_ENABLE_HF_TRANSFER"] = "1"
            env["PYTHONUNBUFFERED"] = "1"
            
            compile_log_path = os.path.expanduser("~/.cache/gnomeai/compile.log")
            os.makedirs(os.path.dirname(compile_log_path), exist_ok=True)
            
            with open(compile_log_path, "w") as log_f:
                process = subprocess.Popen(run_cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, env=env)
                for line in process.stdout:
                    log_f.write(line)
                    log_f.flush()
                    on_compile_log(line)
                process.wait()
            if process.returncode != 0:
                raise Exception(f"optimum-cli exited with code {process.returncode}")
            
            inbuilt_llm.set_status("idle", f"Model successfully compiled", progress_pct=100)
            on_compile_log("[COMPILE_FINISHED] Model successfully compiled!\n")
            update_job(job_id, "completed", progress=1.0, result={"model_id": id})
        except Exception as e:
            inbuilt_llm.set_status("error", f"Compilation failed: {e}", progress_pct=0)
            on_compile_log(f"[COMPILE_FAILED] Error: {e}\n")
            update_job(job_id, "failed", error=str(e))

    threading.Thread(target=run_compile, daemon=True).start()
    return {"job_id": job_id, "status": "pending"}

@router.delete("/api/models/llm/{id:path}")
def delete_llm_model_unified(id: str):
    from gnomeai_backend.llm import inbuilt as inbuilt_llm
    success = inbuilt_llm.delete_model_cache(id)
    return {"success": success}

class HFDownloadPayload(BaseModel):
    repo_id: str
    filename: str

@router.get("/api/models/hf/search")
def search_hf_models(query: str):
    import urllib.request
    import urllib.parse
    import json
    try:
        url = f"https://huggingface.co/api/models?search={urllib.parse.quote(query)}&filter=gguf&sort=downloads&direction=-1&limit=15"
        req = urllib.request.Request(url, headers={"User-Agent": "GnomeAI-Desktop-Assistant"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            results = []
            for item in data:
                results.append({
                    "id": item.get("id"),
                    "downloads": item.get("downloads", 0),
                    "likes": item.get("likes", 0),
                    "createdAt": item.get("createdAt"),
                    "lastModified": item.get("lastModified")
                })
            return {"success": True, "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/models/hf/files")
def get_hf_model_files(repo_id: str):
    import urllib.request
    import urllib.parse
    import json
    try:
        url = f"https://huggingface.co/api/models/{urllib.parse.quote(repo_id, safe='/')}/tree/main"
        req = urllib.request.Request(url, headers={"User-Agent": "GnomeAI-Desktop-Assistant"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            files = []
            for item in data:
                if item.get("type") == "file" and item.get("path", "").endswith(".gguf"):
                    files.append({
                        "name": item.get("path"),
                        "size": item.get("size", 0)
                    })
            return {"success": True, "files": files}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/models/hf/download")
def download_hf_model(payload: HFDownloadPayload):
    from gnomeai_backend.llm.manager import LLMModelManager
    job_id = create_job("gguf_download")
    
    def run_download():
        update_job(job_id, "running", progress=0.0)
        try:
            def progress_cb(progress):
                update_job(job_id, "running", progress=progress)
                
            filepath = LLMModelManager.download_gguf_file(
                payload.repo_id, 
                payload.filename, 
                progress_callback=progress_cb
            )
            
            LLMModelManager.import_gguf_model(filepath)
            
            update_job(job_id, "completed", progress=1.0, result={"filename": payload.filename, "filepath": filepath})
        except Exception as e:
            update_job(job_id, "failed", error=str(e))
            
    threading.Thread(target=run_download, daemon=True).start()
    return {"job_id": job_id, "status": "pending"}


# --- Voice Models ---

@router.get("/api/models/voice")
def get_models_voice_status():
    from gnomeai_backend.llm.manager import VoiceModelManager
    return {"success": True, "models": VoiceModelManager.get_status()}

@router.get("/api/models/voice/available")
def get_models_voice_available():
    return {
        "success": True,
        "models": ["kokoro", "openvoice", "gpt_sovits"]
    }

@router.post("/api/models/voice/{id:path}/load")
def load_voice_model_unified(id: str):
    return {"success": True}

@router.post("/api/models/voice/{id:path}/unload")
def unload_voice_model_unified(id: str):
    return {"success": True}

@router.post("/api/models/voice/{id:path}/download")
def download_voice_model_unified(id: str):
    job_id = create_job("voice_download")
    
    def run_download():
        update_job(job_id, "running", progress=0.1)
        try:
            if id == "kokoro":
                from .openvino_tts_manager import ov_tts_manager
                ov_tts_manager.load_kokoro()
            elif id == "openvoice":
                from .openvino_tts_manager import ov_tts_manager
                ov_tts_manager.load_openvoice()
            elif id == "gpt_sovits":
                from .openvino_tts_manager import ov_tts_manager
                ov_tts_manager.load_gpt_sovits()
            else:
                raise ValueError(f"Unknown voice model: {id}")
            update_job(job_id, "completed", progress=1.0, result={"model_id": id})
        except Exception as e:
            update_job(job_id, "failed", error=str(e))

    threading.Thread(target=run_download, daemon=True).start()
    return {"job_id": job_id, "status": "pending"}

@router.delete("/api/models/voice/{id:path}")
def delete_voice_model_unified(id: str):
    from gnomeai_backend.llm.manager import VoiceModelManager
    try:
        VoiceModelManager.delete_model(id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Image Models ---

@router.get("/api/models/image")
def get_models_image_status():
    from gnomeai_backend.llm.manager import ImageModelManager
    return {
        "success": True,
        "active_model_id": app_settings.get("image_model_id", "runwayml/stable-diffusion-v1-5"),
        "models": ImageModelManager.get_status()
    }

@router.get("/api/models/image/available")
def get_models_image_available():
    from gnomeai_backend.llm.manager import ImageModelManager
    return {
        "success": True,
        "models": [m["id"] for m in ImageModelManager.AVAILABLE_IMAGE_MODELS]
    }

@router.post("/api/models/image/{id:path}/load")
def load_image_model_unified(id: str):
    app_settings["image_model_id"] = id
    save_settings()
    return {"success": True, "active_model_id": id}

@router.post("/api/models/image/{id:path}/unload")
def unload_image_model_unified(id: str):
    return {"success": True}

@router.post("/api/models/image/{id:path}/download")
def download_image_model_unified(id: str):
    job_id = create_job("image_download")
    
    def run_download():
        update_job(job_id, "running", progress=0.1)
        try:
            model_id_lower = id.lower()
            safe_name = id.replace("/", "_").replace("\\", "_")
            cache_dir = os.path.expanduser(f"~/.cache/gnomeai/{safe_name}-ov")
            
            if "flux" in model_id_lower:
                from optimum.intel import OVFluxPipeline
                ov_text_class = OVFluxPipeline
            elif "mage" in model_id_lower:
                from optimum.intel import OVStableDiffusionPipeline
                ov_text_class = OVStableDiffusionPipeline
            elif "xl" in model_id_lower:
                from optimum.intel import OVStableDiffusionXLPipeline
                ov_text_class = OVStableDiffusionXLPipeline
            else:
                from optimum.intel import OVStableDiffusionPipeline
                ov_text_class = OVStableDiffusionPipeline
                
            print(f"[Image Pre-Download] Starting background Optimum OpenVINO export for: {id}", flush=True)
            pipe = ov_text_class.from_pretrained(id, export=True, compile=False)
            pipe.save_pretrained(cache_dir)
            print(f"[Image Pre-Download] Export finished and saved to: {cache_dir}", flush=True)
            
            update_job(job_id, "completed", progress=1.0, result={"model_id": id, "cache_dir": cache_dir})
        except Exception as e:
            print(f"[Image Pre-Download Error] Failed to export {id}: {e}", flush=True)
            update_job(job_id, "failed", error=str(e))

    threading.Thread(target=run_download, daemon=True).start()
    return {"job_id": job_id, "status": "pending"}

@router.delete("/api/models/image/{id:path}")
def delete_image_model_unified(id: str):
    from gnomeai_backend.llm.manager import ImageModelManager
    try:
        ImageModelManager.delete_model(id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- MCP Server Manager Endpoints ---

@router.get("/api/mcp/servers")
def get_mcp_servers():
    try:
        from gnomeai_backend.tools.mcp import mcp_manager
        return {"success": True, "servers": mcp_manager.get_servers_status()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/mcp/servers")
def add_or_update_mcp_server(payload: MCPServerPayload):
    try:
        from gnomeai_backend.tools.mcp import mcp_manager
        success = mcp_manager.add_or_update_server(
            name=payload.name,
            command=payload.command,
            args=payload.args,
            env=payload.env
        )
        return {"success": success}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/api/mcp/servers/{name}")
def delete_mcp_server(name: str):
    try:
        from gnomeai_backend.tools.mcp import mcp_manager
        success = mcp_manager.delete_server(name)
        return {"success": success}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/mcp/servers/{name}/restart")
def restart_mcp_server(name: str):
    try:
        from gnomeai_backend.tools.mcp import mcp_manager
        success = mcp_manager.restart_server(name)
        return {"success": success}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Job Status Endpoint ---

@router.get("/api/jobs/status/{job_id}")
def get_job_status(job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@router.post("/api/jobs/{job_id}/cancel")
def cancel_job_endpoint(job_id: str):
    success = job_manager.cancel_job(job_id)
    if not success:
        job = job_manager.get_job(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        raise HTTPException(status_code=400, detail=f"Job cannot be cancelled (current status: {job.get('status')})")
    return {"success": True, "job_id": job_id, "status": "cancelled"}

# --- SSE Chat Streaming Endpoint ---

class ChatSimplePayload(BaseModel):
    message: str
    session_id: Optional[str] = None
    mode: Optional[str] = "chat"

@router.post("/api/chat/simple")
def chat_simple(payload: ChatSimplePayload):
    try:
        from gnomeai_backend.llm.inbuilt import loaded_model, load_inbuilt_llm
        from gnomeai_backend.agents.chat_engine import run_agent_turn
        
        if loaded_model is None:
            predefined = app_settings.get("extension_model_id")
            if predefined:
                print(f"[Extension Server] Auto-loading predefined model: {predefined}", flush=True)
                load_inbuilt_llm(predefined)

        from .chat_engine import run_agent_turn
        session_id = payload.session_id or get_active_session_id()
        session = load_session(session_id)
        if not session:
            session_id = create_session()["id"]
            session = load_session(session_id)
        
        session["chat_history"].append({
            "role": "user",
            "content": payload.message
        })
        save_session(session_id, session)

        stop_event = get_stop_event(session_id)
        clear_stop_event(session_id)

        summary = ""
        for event in run_agent_turn(
            payload.message,
            mode=payload.mode,
            stop_event=stop_event,
            session_id=session_id
        ):
            ev_type = event.get("type")
            if ev_type == "chat_response":
                summary += event.get("content", "")
            elif ev_type == "success" and not summary:
                summary = event.get("message", "")
        
        if summary.strip():
            # Reload to preserve concurrent edits
            session = load_session(session_id)
            if session:
                history = session.get("chat_history", [])
                history.append({
                    "role": "assistant",
                    "content": summary
                })
                save_session(session_id, session)

        return {"success": True, "response": summary}
    except Exception as e:
        return {"success": False, "error": str(e)}

class StudioExpandPayload(BaseModel):
    session_id: Optional[str] = None

@router.post("/api/studio/expand")
async def studio_expand(payload: StudioExpandPayload):
    session_id = payload.session_id or get_active_session_id()
    await manager.broadcast({
        "type": "focus_studio",
        "session_id": session_id
    })
    return {"success": True}

class ChatStreamPayload(BaseModel):
    session_id: str
    message: str
    mode: Optional[str] = "chat"
    last_script: Optional[str] = None

@router.post("/api/chat/stream")
def chat_stream(payload: ChatStreamPayload):
    session_id = payload.session_id
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    clear_stop_event(session_id)
    stop_event = get_stop_event(session_id)

    session["chat_history"].append({
        "role": "user",
        "content": payload.message
    })
    save_session(session_id, session)

    def sse_generator():
        summary = ""
        in_thinking = False
        try:
            for event in run_agent_turn(
                payload.message,
                last_script=payload.last_script,
                mode=payload.mode,
                stop_event=stop_event,
                session_id=session_id
            ):
                if stop_event.is_set():
                    break
                
                ev_type = event.get("type")
                if ev_type == "reasoning":
                    if not in_thinking:
                        summary += "<think>"
                        in_thinking = True
                    summary += event.get("content", "")
                else:
                    if in_thinking:
                        summary += "</think>"
                        in_thinking = False
                    if ev_type == "chat_response":
                        summary += event.get("content", "")
                    elif ev_type == "status":
                        msg = event.get("message", "")
                        if not msg.startswith(("🔍 Phase 1", "⚙️ Running inspection", "🛠️ Executing check")):
                            summary += f"\n<details>\n* {msg}\n</details>\n"
                    elif ev_type == "generated_code":
                        summary += f"\n```python\n{event.get('code', '')}\n```\n"
                    elif ev_type == "stdout" and event.get("content"):
                        summary += f"\n<details>\n**Output:**\n```\n{event.get('content', '')}\n```\n</details>\n"
                    elif ev_type == "stderr" and event.get("content"):
                        summary += f"\n<details>\n**Error:**\n```\n{event.get('content', '')}\n```\n</details>\n"
                    elif ev_type == "success":
                        msg = event.get('message', '')
                        if msg != "Chat response completed.":
                            summary += f"\n<details>\n✅ {msg}\n</details>\n"
                    elif ev_type == "error":
                        summary += f"\n<details>\n❌ {event.get('message', '')}\n</details>\n"
                    elif event.get("type") == "llm_prompt_sent":
                        pass

                yield f"data: {json.dumps(event)}\n\n"
            
            if in_thinking:
                summary += "</think>"
                in_thinking = False

            if not stop_event.is_set():
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        finally:
            if in_thinking:
                summary += "</think>"
                in_thinking = False
            if summary.strip():
                cur_session = load_session(session_id)
                if cur_session:
                    history = cur_session.get("chat_history", [])
                    if history and history[-1].get("role") == "assistant":
                        history[-1]["content"] = summary
                    else:
                        history.append({
                            "role": "assistant",
                            "content": summary
                        })
                    
                    if cur_session.get("title") == "New Conversation" and history:
                        first_user_content = ""
                        for m in history:
                            if m.get("role") == "user" and m.get("content"):
                                first_user_content = m.get("content").strip()
                                break
                        if first_user_content:
                            suggested_title = first_user_content
                            if len(suggested_title) > 25:
                                suggested_title = suggested_title[:22] + "..."
                            cur_session["title"] = suggested_title
                    save_session(session_id, cur_session)

    return StreamingResponse(sse_generator(), media_type="text/event-stream")

@router.get("/api/skills")
def get_skills():
    from gnomeai_backend.tools import skills as skills_manager
    skills = skills_manager.load_skills()
    skills_list = []
    for s_id, s_meta in skills.items():
        s_meta["code"] = skills_manager.get_skill_code(s_id) or ""
        skills_list.append(s_meta)
    return {"success": True, "skills": skills_list}

@router.post("/api/skills/save")
def save_skill_code(payload: SkillSave):
    from gnomeai_backend.tools import skills as skills_manager
    success, msg = skills_manager.update_skill_code(payload.id, payload.code)
    return {"success": success, "message": msg}

@router.delete("/api/skills/{id}")
def delete_skill(id: str):
    from gnomeai_backend.tools import skills as skills_manager
    success, msg = skills_manager.delete_skill(id)
    if not success:
        raise HTTPException(status_code=400, detail=msg)
    return {"success": success, "message": msg}

@router.get("/api/sessions")
def get_sessions():
    from gnomeai_backend.core.sessions import transient_sessions
    sessions_list = []
    seen_ids = set()

    # Include in-memory (transient) sessions — these are new chats with no messages yet
    for sess_id, data in list(transient_sessions.items()):
        if data and sess_id not in seen_ids:
            seen_ids.add(sess_id)
            sessions_list.append({
                "id": data.get("id"),
                "title": data.get("title", "Conversation"),
                "created_at": data.get("created_at", 0)
            })

    # Include persisted sessions from disk
    files = [f for f in os.listdir(SESSIONS_DIR) if f.endswith(".json")]
    for f in files:
        sess_id = f.replace(".json", "")
        if sess_id in seen_ids:
            continue
        data = load_session(sess_id)
        if data:
            seen_ids.add(sess_id)
            sessions_list.append({
                "id": data.get("id"),
                "title": data.get("title", "Conversation"),
                "created_at": data.get("created_at", 0)
            })

    sessions_list.sort(key=lambda x: x.get("created_at", 0), reverse=True)
    return {
        "active_session_id": get_active_session_id(),
        "sessions": sessions_list
    }

@router.post("/api/sessions")
def post_sessions(payload: dict = Body(...)):
    title = payload.get("title", "New Chat")
    sess_data = create_session(title=title)
    sess_id = sess_data["id"]
    set_active_session_id(sess_id)
    return {"success": True, "id": sess_id}

@router.get("/api/sessions/{session_id}")
def get_session_by_id(session_id: str):
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    set_active_session_id(session_id)
    return {"success": True, "session": session}

@router.get("/api/sessions/{session_id}/context_size")
def get_session_context_size(session_id: str):
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    history = session.get("chat_history", [])
    text_content = " ".join([m.get("content", "") for m in history])
    word_count = len(text_content.split())
    # Approximation context length factor
    approx_tokens = int(word_count * 1.3)
    limit = app_settings.get("context_limit", 2048)
    return {"success": True, "estimated_tokens": approx_tokens, "context_limit": limit}

@router.post("/api/sessions/update_mode")
def post_session_mode(payload: SessionMode):
    session = load_session(payload.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session["mode"] = payload.mode
    save_session(payload.session_id, session)
    return {"success": True}

@router.post("/api/sessions/update_settings")
def post_session_settings(payload: SessionSettingsUpdate):
    session = load_session(payload.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if payload.system_prompt is not None:
        session["system_prompt"] = payload.system_prompt
    if payload.temperature is not None:
        session["temperature"] = payload.temperature
    save_session(payload.session_id, session)
    return {"success": True, "session": session}

@router.delete("/api/sessions/{session_id}")
def delete_session(session_id: str):
    success = False
    
    from gnomeai_backend.core.sessions import transient_sessions
    if session_id in transient_sessions:
        transient_sessions.pop(session_id, None)
        success = True
        
    sess_file = get_session_path(session_id)
    if os.path.exists(sess_file):
        try:
            os.remove(sess_file)
            success = True
        except Exception:
            pass
    if get_active_session_id() == session_id:
        # Fallback to next session
        files = [f for f in os.listdir(SESSIONS_DIR) if f.endswith(".json")]
        if files:
            set_active_session_id(files[0].replace(".json", ""))
        else:
            set_active_session_id(create_session()["id"])
    return {"success": success}

@router.post("/api/sessions/auth")
def post_sessions_auth(payload: ChatAuthRequest):
    session_id = payload.session_id
    if session_id in active_auth_events:
        auth_event, auth_status = active_auth_events[session_id]
        auth_status["approved"] = payload.approved
        auth_status["edited_code"] = payload.code
        auth_event.set()
        return {"success": True}
    return {"success": False, "error": "No pending authorization request found for this session."}

@router.post("/api/sessions/fork")
def post_sessions_fork(payload: SessionFork):
    session_id = payload.session_id
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    forked_sess_data = create_session(title=f"{session.get('title', 'Conversation')} (Fork)")
    forked_session_id = forked_sess_data["id"]
    new_sess = load_session(forked_session_id)
    new_sess["chat_history"] = session.get("chat_history", []).copy()
    new_sess["mode"] = session.get("mode", "chat")
    new_sess["system_prompt"] = session.get("system_prompt", "")
    new_sess["temperature"] = session.get("temperature", 0.7)
    save_session(forked_session_id, new_sess)
    set_active_session_id(forked_session_id)
    return {"success": True, "session": new_sess}

@router.post("/api/sessions/rename")
def post_sessions_rename(payload: SessionRename):
    session = load_session(payload.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    new_title = payload.title.strip()
    if not new_title:
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    session["title"] = new_title
    save_session(payload.session_id, session)
    return {"success": True, "title": new_title}

@router.delete("/api/sessions/{session_id}/messages/{message_index}")
def delete_message(session_id: str, message_index: int):
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    history = session.get("chat_history", [])
    if 0 <= message_index < len(history):
        history.pop(message_index)
    session["chat_history"] = history
    save_session(session_id, session)
    return {"success": True, "chat_history": history}

@router.post("/api/sessions/summarize")
def post_sessions_summarize(payload: SessionSummarize):
    from fastapi.responses import StreamingResponse
    session_id = payload.session_id or get_active_session_id()
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    chat_history = session.get("chat_history", [])
    
    # Pre-append the summary message bubble to the JSON file
    summary_bubble = {
        "role": "system",
        "is_summary": True,
        "title": "Chat Summary",
        "content": ""
    }
    chat_history.append(summary_bubble)
    save_session(session_id, session)
    
    def generator():
        if not chat_history[:-1]: # exclude the bubble itself
            yield "data: " + json.dumps({"type": "token", "text": "No chat history to summarize."}) + "\n\n"
            yield "data: " + json.dumps({"type": "done"}) + "\n\n"
            return
            
        try:
            from gnomeai_backend.llm.client import query_llm_stream
            
            # Clean history to exclude heavy metadata like 'prompt_sent'
            cleaned_history = [
                {"role": m.get("role"), "content": m.get("content", "")}
                for m in chat_history[:-1]
                if m.get("role") in ("user", "assistant") or m.get("content")
            ]
            
            prompt = [
                {"role": "system", "content": "You are a professional session summarizer. Summarize the key points of the entire conversation so far comprehensively but concisely, representing the view of the conversation so far. Any further communication will start from this summary."},
                {"role": "user", "content": f"Summarize this conversation:\n\n{json.dumps(cleaned_history, indent=2)}"}
            ]
            
            summary = ""
            for event in query_llm_stream(prompt, temperature=0.1):
                if event.get("type") == "content":
                    token = event.get("text", "")
                    summary += token
                    
                    # Update session JSON live to avoid data loss
                    cur_sess = load_session(session_id)
                    if cur_sess:
                        history = cur_sess.get("chat_history", [])
                        if history and history[-1].get("is_summary"):
                            history[-1]["content"] = summary
                            save_session(session_id, cur_sess)
                            
                    yield "data: " + json.dumps({"type": "token", "text": token}) + "\n\n"
            
            # Save shortened session title from the summary
            res = summary.strip().strip('"').split("\n")[0]
            if len(res) > 30:
                res = res[:27] + "..."
            cur_sess = load_session(session_id)
            if cur_sess:
                cur_sess["title"] = res
                save_session(session_id, cur_sess)
            
            yield "data: " + json.dumps({"type": "done"}) + "\n\n"
        except Exception as e:
            yield "data: " + json.dumps({"type": "error", "message": str(e)}) + "\n\n"

    return StreamingResponse(generator(), media_type="text/event-stream")

@router.post("/api/sessions/learn")
def post_sessions_learn(payload: SessionLearn):
    from fastapi.responses import StreamingResponse
    session_id = payload.session_id
    session = load_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    history = session.get("chat_history", [])
    
    # Pre-append the learning message bubble to the JSON file
    learning_bubble = {
        "role": "system",
        "is_learning": True,
        "title": "Extracting Memories...",
        "content": ""
    }
    history.append(learning_bubble)
    save_session(session_id, session)
    
    def generator():
        if not history[:-1]:
            yield "data: " + json.dumps({"type": "token", "text": "No chat history to learn from."}) + "\n"
            yield "data: " + json.dumps({"type": "done", "new_facts_count": 0}) + "\n"
            return
            
        try:
            from gnomeai_backend.core.learnings import extract_learnings_from_session
            
            yield "data: " + json.dumps({"type": "token", "text": "Analyzing chat transcript and extracting key facts...\n"}) + "\n"
            time.sleep(0.5)
            
            new_facts = extract_learnings_from_session(history[:-1])
            summary = ""
            if new_facts:
                existing = load_learnings()
                existing.extend(new_facts)
                save_learnings(existing)
                
                for fact in new_facts:
                    summary += f"• Learned: {fact}\n"
                    # Update session JSON live
                    cur_sess = load_session(session_id)
                    if cur_sess:
                        hist = cur_sess.get("chat_history", [])
                        if hist and hist[-1].get("is_learning"):
                            hist[-1]["content"] = summary
                            save_session(session_id, cur_sess)
                            
                    yield "data: " + json.dumps({"type": "token", "text": f"• Learned: {fact}\n"}) + "\n"
                    time.sleep(0.1)
                
                yield "data: " + json.dumps({"type": "done", "new_facts_count": len(new_facts)}) + "\n"
            else:
                summary = "No new facts extracted from this conversation.\n"
                cur_sess = load_session(session_id)
                if cur_sess:
                    hist = cur_sess.get("chat_history", [])
                    if hist and hist[-1].get("is_learning"):
                        hist[-1]["content"] = summary
                        save_session(session_id, cur_sess)
                        
                yield "data: " + json.dumps({"type": "token", "text": summary}) + "\n"
                yield "data: " + json.dumps({"type": "done", "new_facts_count": 0}) + "\n"
        except Exception as e:
            yield "data: " + json.dumps({"type": "error", "message": str(e)}) + "\n"

    return StreamingResponse(generator(), media_type="text/event-stream")

@router.post("/api/models/import")
def import_gguf_model(payload: ModelImportPayload):
    from gnomeai_backend.llm.manager import LLMModelManager
    try:
        check_safe_path(payload.filepath)
        filename = LLMModelManager.import_gguf_model(payload.filepath)
        return {"success": True, "name": filename}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/api/models/image/{id:path}/clear_pytorch")
def clear_image_model_pytorch(id: str):
    from gnomeai_backend.llm.manager import ImageModelManager
    try:
        success = ImageModelManager.clear_pytorch_cache(id)
        if success:
            return {"success": True}
        return {"success": False, "detail": "PyTorch cache not found."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/learnings")
def get_learnings():
    return {"success": True, "learnings": load_learnings()}

@router.post("/api/learnings")
def post_learnings(payload: dict = Body(...)):
    learnings = payload.get("learnings", [])
    success = save_learnings(learnings)
    return {"success": success}

@router.get("/api/presets")
def get_presets():
    return {"success": True, "presets": load_presets()}

@router.post("/api/presets")
def post_presets(payload: dict = Body(...)):
    success = save_presets(payload)
    return {"success": success}

@router.get("/api/tts/voices")
def get_tts_voices():
    voices = [
        {"id": "af_sarah", "name": "af_sarah (Female, American - Standard)"},
        {"id": "af_nicole", "name": "af_nicole (Female, American - Soft)"},
        {"id": "af_sky", "name": "af_sky (Female, American - Youthful)"},
        {"id": "af_bella", "name": "af_bella (Female, American - Expressive)"},
        {"id": "am_adam", "name": "am_adam (Male, American - Standard)"},
        {"id": "am_michael", "name": "am_michael (Male, American - Deep)"},
        {"id": "am_fenrir", "name": "am_fenrir (Male, American - Deep Voice 2)"},
        {"id": "am_easy", "name": "am_easy (Male, American - Casual)"},
        {"id": "bf_emma", "name": "bf_emma (Female, British)"},
        {"id": "bf_isabella", "name": "bf_isabella (Female, British - Soft)"},
        {"id": "bm_george", "name": "bm_george (Male, British)"},
        {"id": "bm_lewis", "name": "bm_lewis (Male, British - Gentle)"},
        {"id": "jf_alpha", "name": "jf_alpha (Female, Japanese)"},
        {"id": "jf_glowing", "name": "jf_glowing (Female, Japanese - Bright)"},
        {"id": "jm_kondo", "name": "jm_kondo (Male, Japanese)"},
        {"id": "jm_sato", "name": "jm_sato (Male, Japanese - Standard)"}
    ]
    return {"success": True, "voices": voices}

@router.get("/api/system/specs")
def get_system_specs():
    from gnomeai_backend.llm import inbuilt as inbuilt_llm
    return inbuilt_llm.get_system_specs()

# Asynchronous background text-to-speech request route (Step 8)
@router.post("/api/tts")
def post_tts(payload: TTSRequest):
    try:
        from gnomeai_backend.audio.mpris import mpris_manager
        mpris_manager.update_status("Playing", payload.text)
    except:
        pass

    # Check cache first
    cached_wav = find_cached_speak_recording(payload.text, payload.voice)
    if cached_wav is not None:
        print(f"[TTS Cache] Hit for text: {payload.text[:30]}...", flush=True)
        try:
            from gnomeai_backend.audio.mpris import mpris_manager
            mpris_manager.update_status("Stopped")
        except:
            pass
        return Response(content=cached_wav, media_type="audio/wav")

    voice = payload.voice
    if voice.startswith("custom_"):
        voice_name = voice[7:]
        json_path = os.path.join(CUSTOM_VOICES_DIR, f"{voice_name}.json")
        wav_path = os.path.join(CUSTOM_VOICES_DIR, f"{voice_name}.wav")
        if not os.path.exists(json_path):
            try:
                from gnomeai_backend.audio.mpris import mpris_manager
                mpris_manager.update_status("Stopped")
            except:
                pass
            raise HTTPException(status_code=404, detail="Custom voice metadata not found")
        try:
            with open(json_path, "r") as f:
                metadata = json.load(f)
            if metadata.get("type") == "clone" or metadata.get("type") == "design":
                if not os.path.exists(wav_path):
                    raise HTTPException(status_code=404, detail="Custom voice reference audio file not found")
                with open(wav_path, "rb") as af:
                    audio_bytes = af.read()
                ref_text = metadata.get("ref_text", "") if metadata.get("type") == "clone" else ""
                use_xvector = metadata.get("x_vector_only", True) if metadata.get("type") == "clone" else True
                wav_bytes = audio_studio_manager.generate_voice_clone(
                    audio_bytes=audio_bytes,
                    target_text=payload.text,
                    ref_text=ref_text,
                    use_xvector_only=use_xvector,
                    language="Auto",
                    model_size="1.7B"
                )
            elif metadata.get("type") == "custom":
                wav_bytes = audio_studio_manager.generate_custom_voice(
                    text=payload.text,
                    language="English",
                    speaker=metadata.get("speaker", "Ryan"),
                    instruct=metadata.get("description"),
                    model_size="1.7B"
                )
            else:
                raise HTTPException(status_code=400, detail="Invalid custom voice type")
            
            save_speak_recording(wav_bytes, payload.text, payload.voice)
            try:
                from gnomeai_backend.audio.mpris import mpris_manager
                mpris_manager.update_status("Stopped")
            except:
                pass
            return Response(content=wav_bytes, media_type="audio/wav")
        except Exception as e:
            try:
                from gnomeai_backend.audio.mpris import mpris_manager
                mpris_manager.update_status("Stopped")
            except:
                pass
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Qwen3-TTS failed: {str(e)}")

    speed = float(app_settings.get("tts_speed", 1.0))
    event = threading.Event()
    result = {}
    def callback(data):
        result.update(data)
        event.set()
    tts_worker.generate(payload.text, payload.voice, speed, callback)
    event.wait(timeout=60)
    try:
        from .mpris_manager import mpris_manager
        mpris_manager.update_status("Stopped")
    except:
        pass
    if result.get("status") == "success":
        wav_bytes = result["audio"]
        save_speak_recording(wav_bytes, payload.text, payload.voice)
        return Response(content=wav_bytes, media_type="audio/wav")
    else:
        raise HTTPException(status_code=500, detail=result.get("message", "TTS failed"))

@router.post("/api/tts/stop")
def stop_tts():
    try:
        from gnomeai_backend.audio.mpris import mpris_manager
        mpris_manager.update_status("Stopped")
        subprocess.run(["killall", "aplay"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(["killall", "spd-say"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}

@router.post("/api/stt/transcribe")
async def transcribe_audio(file: UploadFile = File(...), language: str = Form(None)):
    try:
        from gnomeai_backend.audio.stt import stt_manager
        audio_bytes = await file.read()
        text = stt_manager.transcribe(audio_bytes, language=language)
        return {"success": True, "text": text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/stt/status")
def get_stt_status():
    try:
        from gnomeai_backend.audio.stt import stt_manager
        return {"success": True, "status": stt_manager.get_status()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/stt/unload")
def unload_stt():
    try:
        from gnomeai_backend.audio.stt import stt_manager
        stt_manager.unload()
        return {"success": True, "message": "STT model unloaded successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class STTModelConfig(BaseModel):
    model_name: str

@router.post("/api/stt/model")
def set_stt_model(payload: STTModelConfig):
    try:
        from gnomeai_backend.audio.stt import stt_manager
        stt_manager.set_model_name(payload.model_name)
        return {"success": True, "model_name": payload.model_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/mcp/tools")
def get_mcp_tools():
    try:
        from gnomeai_backend.tools.mcp import mcp_manager
        return {"success": True, "tools": mcp_manager.get_all_tools()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/mcp/execute")
def execute_mcp_tool(payload: MCPExecutePayload):
    try:
        from gnomeai_backend.tools.mcp import mcp_manager
        result = mcp_manager.execute_mcp_tool(payload.tool_name, payload.arguments)
        return {"success": True, "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class MCPServerPayload(BaseModel):
    name: str
    command: str
    args: Optional[list] = []
    env: Optional[dict] = {}

@router.get("/api/mcp/servers")
def get_mcp_servers():
    try:
        from gnomeai_backend.tools.mcp import mcp_manager
        return {"success": True, "servers": mcp_manager.get_servers_status()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/mcp/servers")
def add_mcp_server(payload: MCPServerPayload):
    try:
        from gnomeai_backend.tools.mcp import mcp_manager
        success = mcp_manager.add_or_update_server(
            payload.name, payload.command, payload.args, payload.env
        )
        return {"success": success}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/api/mcp/servers/{name}")
def delete_mcp_server(name: str):
    try:
        from gnomeai_backend.tools.mcp import mcp_manager
        success = mcp_manager.delete_server(name)
        return {"success": success}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/mcp/servers/{name}/restart")
def restart_mcp_server(name: str):
    try:
        from .mcp_client import mcp_manager
        success = mcp_manager.restart_server(name)
        return {"success": success}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# WebSockets Route handler supporting streaming, compiling logs and cancellations (Step 4)
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Await client payload message events
            data = await websocket.receive_json()
            event_type = data.get("type")
            
            if event_type == "chat":
                # Start agent loop in a separate thread to support non-blocking cancel events
                session_id = data.get("session_id")
                message = data.get("message")
                mode = data.get("mode")
                last_script = data.get("last_script")  # script from previous agent turn for refinement

                if session_id:
                    set_active_session_id(session_id)

                # Clear any previous stop signal before starting a new generation
                clear_stop_event(session_id)
                stop_event = get_stop_event(session_id)

                # Immediately save user message to session file before querying the model
                session = load_session(session_id)
                if session:
                    session["chat_history"].append({
                        "role": "user",
                        "content": message
                    })
                    save_session(session_id, session)

                def run_chat_in_thread(loop, _stop_event=stop_event, _session_id=session_id,
                                       _message=message, _mode=mode, _last_script=last_script):
                    if _session_id:
                        set_active_session_id(_session_id)
                    summary = ""
                    in_thinking = False
                    suggestions = []
                    try:
                        for event in run_agent_turn(_message, last_script=_last_script,
                                                    mode=_mode, stop_event=_stop_event, session_id=_session_id):
                            if _stop_event.is_set():
                                break
                            # Broadcast incremental stream updates back via WS
                            asyncio.run_coroutine_threadsafe(websocket.send_json(event), loop)
                            
                            # Accumulate user-visible response components to save in session history (Bug #1 Fix)
                            ev_type = event.get("type")
                            if ev_type == "reasoning":
                                if not in_thinking:
                                    summary += "<think>"
                                    in_thinking = True
                                summary += event.get("content", "")
                            else:
                                if in_thinking:
                                    summary += "</think>"
                                    in_thinking = False
                                if ev_type == "chat_response":
                                    summary += event.get("content", "")
                                elif ev_type == "status":
                                    # Exclude transient environment inspection status lines to keep saved history clean
                                    msg = event.get("message", "")
                                    if not msg.startswith(("🔍 Phase 1", "⚙️ Running inspection", "🛠️ Executing check")):
                                        summary += f"\n<details>\n* {msg}\n</details>\n"
                                elif ev_type == "generated_code":
                                    summary += f"\n```python\n{event.get('code', '')}\n```\n"
                                elif ev_type == "stdout" and event.get("content"):
                                    summary += f"\n<details>\n**Output:**\n```\n{event.get('content', '')}\n```\n</details>\n"
                                elif ev_type == "stderr" and event.get("content"):
                                    summary += f"\n<details>\n**Error:**\n```\n{event.get('content', '')}\n```\n</details>\n"
                                elif ev_type == "success":
                                    summary += f"\n<details>\n✅ {event.get('message', '')}\n</details>\n"
                                elif ev_type == "error":
                                    summary += f"\n<details>\n❌ {event.get('message', '')}\n</details>\n"
                                elif event.get("type") == "llm_prompt_sent":
                                    cur_session = load_session(_session_id)
                                    if cur_session and cur_session.get("chat_history"):
                                        for msg in reversed(cur_session["chat_history"]):
                                            if msg.get("role") == "user":
                                                msg["prompt_sent"] = event.get("prompt")
                                                break
                                        save_session(_session_id, cur_session)
                                elif event.get("type") == "llm_prompt":
                                    cur_session = load_session(_session_id)
                                    if cur_session and cur_session.get("chat_history"):
                                        for msg in reversed(cur_session["chat_history"]):
                                            if msg.get("role") == "user":
                                                msg["prompt_sent"] = event.get("prompt_text")
                                                break
                                        save_session(_session_id, cur_session)

                        if in_thinking:
                            summary += "</think>"
                            in_thinking = False

                        if not _stop_event.is_set():
                            # Generate follow-up suggestions
                            try:
                                from gnomeai_backend.agents.chat_engine import generate_next_prompt_suggestions
                                suggestions = generate_next_prompt_suggestions(_message, summary)
                                if suggestions:
                                    asyncio.run_coroutine_threadsafe(
                                        websocket.send_json({"type": "suggestions", "suggestions": suggestions}), loop
                                    )
                            except Exception as seg_err:
                                print(f"Failed to generate suggestions: {seg_err}")

                            asyncio.run_coroutine_threadsafe(
                                websocket.send_json({"type": "done"}), loop
                            )
                    except Exception as err:
                        if not _stop_event.is_set():
                            asyncio.run_coroutine_threadsafe(
                                websocket.send_json({"type": "error", "message": str(err)}), loop
                            )
                    finally:
                        if in_thinking:
                            summary += "</think>"
                            in_thinking = False
                        if summary.strip():
                            cur_session = load_session(_session_id)
                            if cur_session:
                                history = cur_session.get("chat_history", [])
                                if history and history[-1].get("role") == "assistant":
                                    history[-1]["content"] = summary
                                    if suggestions:
                                        history[-1]["suggestions"] = suggestions
                                else:
                                    item = {
                                        "role": "assistant",
                                        "content": summary
                                    }
                                    if suggestions:
                                        item["suggestions"] = suggestions
                                    history.append(item)
                                
                                # Auto-generate title for new conversations to avoid staying "New Conversation" forever (Bug #15 Fix)
                                if cur_session.get("title") == "New Conversation" and history:
                                    first_user_content = ""
                                    for m in history:
                                        if m.get("role") == "user" and m.get("content"):
                                            first_user_content = m.get("content").strip()
                                            break
                                    if first_user_content:
                                        # Use the first 25 characters of the first user message as session title
                                        suggested_title = first_user_content
                                        if len(suggested_title) > 25:
                                            suggested_title = suggested_title[:22] + "..."
                                        cur_session["title"] = suggested_title
                                        
                                save_session(_session_id, cur_session)

                import asyncio
                loop = asyncio.get_event_loop()
                threading.Thread(target=run_chat_in_thread, args=(loop,), daemon=True).start()

            elif event_type == "stop_chat":
                session_id = data.get("session_id", get_active_session_id())
                print(f"[WS] Stop generation request received for session: {session_id}")
                # Signal the running thread to stop at the next iteration
                stop_ev = get_stop_event(session_id)
                stop_ev.set()
                await websocket.send_json({"type": "status", "message": "Generation stopped."})
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"[WS Error] Connection encountered issue: {e}")
        manager.disconnect(websocket)

class CodeOpenRequest(BaseModel):
    path: str
    session_id: Optional[str] = None

class CodeCloseRequest(BaseModel):
    session_id: Optional[str] = None

@router.post("/api/code/open")
def code_open(payload: CodeOpenRequest):
    try:
        from gnomeai_backend.core.workspace import workspace_manager
        check_safe_path(payload.path)
        workspace_manager.set_workspace(payload.path)
        session_id = payload.session_id or get_active_session_id()
        if session_id:
            session = load_session(session_id)
            if session:
                session["workspace_path"] = payload.path
                save_session(session_id, session)
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/code/close")
def code_close(payload: Optional[CodeCloseRequest] = Body(default=None)):
    try:
        from gnomeai_backend.core.workspace import workspace_manager
        workspace_manager.workspace_path = None
        workspace_manager.pending_diffs = {}
        session_id = payload.session_id if payload else get_active_session_id()
        if session_id:
            session = load_session(session_id)
            if session:
                session["workspace_path"] = None
                save_session(session_id, session)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/code/tree")
def code_tree():
    try:
        from gnomeai_backend.core.workspace import workspace_manager
        files = workspace_manager.list_files()
        return {"success": True, "files": files}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/code/diff/apply")
def code_diff_apply():
    try:
        from gnomeai_backend.core.workspace import workspace_manager
        workspace_manager.apply_all_diffs()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/code/diff/discard")
def code_diff_discard():
    try:
        from gnomeai_backend.core.workspace import workspace_manager
        workspace_manager.discard_all_diffs()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/code/agent/resume")
def code_agent_resume():
    return {"success": True}

@router.get("/health")
def health_check():
    return {"status": "ok", "app": "gnomeai"}

# --- Image Studio API Endpoints ---
@router.post("/api/image/generate")
def image_generate(
    file: Optional[UploadFile] = File(None),
    prompt: str = Form(...),
    enhance_prompt: str = Form("true"),
    width: int = Form(512),
    height: int = Form(512),
    steps: int = Form(20),
    strength: float = Form(0.75),
    model_id: Optional[str] = Form(None),
    callback_url: Optional[str] = Form(None)
):
    try:
        from gnomeai_backend.vision.sd_engine import run_stable_diffusion, enhance_image_prompt
        final_prompt = prompt.strip()
        if enhance_prompt.lower() == "true":
            final_prompt = enhance_image_prompt(final_prompt)
            
        temp_img_path = None
        if file:
            temp_img_path = os.path.expanduser(f"~/.cache/gnomeai/temp_{uuid.uuid4().hex[:6]}.png")
            os.makedirs(os.path.dirname(temp_img_path), exist_ok=True)
            with open(temp_img_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

        job_id = job_manager.create_job(
            job_type="image_generation",
            metadata={"prompt": final_prompt, "width": width, "height": height, "steps": steps},
            callback_url=callback_url
        )
        cancel_event = job_manager.get_cancel_event(job_id)

        def run_worker():
            job_manager.update_job(job_id, status="running", progress=0.05)
            try:
                def progress_cb(prog):
                    job_manager.update_job(job_id, status="running", progress=0.05 + 0.9 * prog)

                img_dest = run_stable_diffusion(
                    prompt=final_prompt,
                    steps=steps,
                    width=width,
                    height=height,
                    input_image_path=temp_img_path,
                    strength=strength,
                    model_id=model_id,
                    cancel_event=cancel_event,
                    progress_callback=progress_cb
                )
                if temp_img_path and os.path.exists(temp_img_path):
                    try:
                        os.remove(temp_img_path)
                    except Exception:
                        pass
                filename = os.path.basename(img_dest)
                res_payload = {
                    "success": True,
                    "path": img_dest,
                    "filename": filename,
                    "enhanced_prompt": final_prompt,
                    "url": f"/api/image/file/{filename}"
                }
                job_manager.update_job(job_id, status="completed", progress=1.0, result=res_payload)
            except Exception as e:
                if temp_img_path and os.path.exists(temp_img_path):
                    try:
                        os.remove(temp_img_path)
                    except Exception:
                        pass
                if job_manager.is_cancelled(job_id):
                    job_manager.update_job(job_id, status="cancelled", error="Job cancelled by user")
                else:
                    traceback.print_exc()
                    job_manager.update_job(job_id, status="failed", error=str(e))

        threading.Thread(target=run_worker, daemon=True).start()
        return {"job_id": job_id, "status": "pending"}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/image/status/{job_id}")
def get_image_status(job_id: str):
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

class PromptEnhancePayload(BaseModel):
    prompt: str

@router.post("/api/image/enhance_prompt")
def api_enhance_image_prompt(payload: PromptEnhancePayload):
    try:
        from gnomeai_backend.vision.sd_engine import enhance_image_prompt
        enhanced = enhance_image_prompt(payload.prompt)
        return {"success": True, "enhanced_prompt": enhanced}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/image/gallery")
def get_image_gallery():
    try:
        pictures_dir = os.path.expanduser("~/Pictures")
        images = []
        if os.path.exists(pictures_dir):
            for file in os.listdir(pictures_dir):
                if file.startswith("gnomeai_") and file.lower().endswith((".png", ".jpg", ".jpeg")):
                    full_path = os.path.join(pictures_dir, file)
                    stat = os.stat(full_path)
                    images.append({
                        "filename": file,
                        "path": full_path,
                        "size": stat.st_size,
                        "mtime": stat.st_mtime,
                        "url": f"/api/image/file/{file}"
                    })
        images.sort(key=lambda x: x["mtime"], reverse=True)
        return {"success": True, "images": images}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/image/file/{filename}")
def get_image_file(filename: str):
    safe_file = filename.replace("/", "_").replace("\\", "_")
    full_path = os.path.join(os.path.expanduser("~/Pictures"), safe_file)
    if os.path.exists(full_path):
        return FileResponse(full_path, media_type="image/png")
    raise HTTPException(status_code=404, detail="Image file not found")

@router.delete("/api/image/gallery/{filename}")
def delete_gallery_image(filename: str):
    try:
        safe_file = filename.replace("/", "_").replace("\\", "_")
        full_path = os.path.join(os.path.expanduser("~/Pictures"), safe_file)
        if os.path.exists(full_path):
            os.remove(full_path)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Unified Logs Endpoints ---

@router.get("/api/models/llm/logs/compile")
def get_compile_log():
    log_path = os.path.expanduser("~/.cache/gnomeai/compile.log")
    content = ""
    if os.path.exists(log_path):
        try:
            with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
        except:
            pass
    return {"success": True, "log": content}

# System monitoring global states for CPU
last_cpu_idle = 0.0
last_cpu_total = 0.0

def get_cpu_usage():
    try:
        with open('/proc/stat', 'r') as f:
            lines = f.readlines()
        for line in lines:
            if line.startswith('cpu '):
                parts = line.split()[1:]
                parts = [float(x) for x in parts]
                idle = parts[3]
                total = sum(parts)
                return idle, total
    except Exception:
        pass
    return 0.0, 0.0

def get_cpu_utilization():
    global last_cpu_idle, last_cpu_total
    idle, total = get_cpu_usage()
    idle_delta = idle - last_cpu_idle
    total_delta = total - last_cpu_total
    last_cpu_idle = idle
    last_cpu_total = total
    if total_delta <= 0:
        return 0.0
    return round((1.0 - idle_delta / total_delta) * 100.0, 1)

def get_ram_usage():
    try:
        meminfo = {}
        with open('/proc/meminfo', 'r') as f:
            for line in f:
                parts = line.split()
                if len(parts) >= 2:
                    meminfo[parts[0].replace(':', '')] = float(parts[1])
        total = meminfo.get('MemTotal', 0.0) / (1024 * 1024)
        available = meminfo.get('MemAvailable', 0.0) / (1024 * 1024)
        used = total - available
        pct = (used / total) * 100.0 if total > 0 else 0.0
        return round(total, 2), round(used, 2), round(pct, 1)
    except Exception:
        return 0.0, 0.0, 0.0

def get_gpu_info():
    if shutil.which("nvidia-smi"):
        try:
            out = subprocess.check_output(
                ["nvidia-smi", "--query-gpu=utilization.gpu,memory.total,memory.used", "--format=csv,noheader,nounits"],
                text=True
            )
            parts = out.strip().split(",")
            if len(parts) >= 3:
                gpu_util = float(parts[0].strip())
                mem_total = float(parts[1].strip())
                mem_used = float(parts[2].strip())
                return {
                    "brand": "NVIDIA",
                    "utilization": gpu_util,
                    "vram_total_gb": round(mem_total / 1024.0, 1),
                    "vram_used_gb": round(mem_used / 1024.0, 1),
                    "vram_pct": round((mem_used / mem_total) * 100.0, 1)
                }
        except:
            pass

    intel_mem_total_path = "/sys/class/drm/card0/device/mem_info_vram_total"
    intel_mem_used_path = "/sys/class/drm/card0/device/mem_info_vram_used"
    if os.path.exists(intel_mem_total_path) and os.path.exists(intel_mem_used_path):
        try:
            with open(intel_mem_total_path, "r") as f:
                tot = int(f.read().strip())
            with open(intel_mem_used_path, "r") as f:
                usd = int(f.read().strip())
            total_gb = round(tot / (1024 * 1024 * 1024), 1)
            used_gb = round(usd / (1024 * 1024 * 1024), 1)
            pct = round((usd / tot) * 100.0, 1) if tot > 0 else 0.0
            return {
                "brand": "Intel",
                "utilization": 0.0,
                "vram_total_gb": total_gb,
                "vram_used_gb": used_gb,
                "vram_pct": pct
            }
        except:
            pass
            
    return None

@router.get("/api/system/stats")
def get_system_stats():
    cpu = get_cpu_utilization()
    ram_total, ram_used, ram_pct = get_ram_usage()
    gpu = get_gpu_info()
    return {
        "success": True,
        "cpu_pct": cpu,
        "ram": {
            "total_gb": ram_total,
            "used_gb": ram_used,
            "pct": ram_pct
        },
        "gpu": gpu
    }

@router.get("/api/models/llm/logs/load")
def get_load_log():
    log_path = os.path.expanduser("~/.cache/gnomeai/load.log")
    content = ""
    if os.path.exists(log_path):
        try:
            with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
        except:
            pass
    return {"success": True, "log": content}

# Register routes
app.include_router(router)

# Mount frontend/dist fallback for production static serving (Step 5)
dist_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist")
if os.path.exists(dist_dir):
    app.mount("/", StaticFiles(directory=dist_dir, html=True), name="static")

def find_free_port(start_port=8095, max_attempts=20):
    import socket
    for port in range(start_port, start_port + max_attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('127.0.0.1', port))
                return port
            except OSError:
                continue
    return start_port

def run_server():
    import uvicorn
    try:
        from gnomeai_backend.audio.mpris import mpris_manager
        mpris_manager.start()
    except Exception as e:
        print(f"Failed to start MPRIS: {e}")
    init_sessions()
    port = find_free_port(PORT)
    print(f"Starting backend server on port {port}...")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
