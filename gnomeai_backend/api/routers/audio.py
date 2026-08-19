import os
import json
import traceback
from typing import Optional, List
from fastapi import APIRouter, HTTPException, File, UploadFile, Form
from fastapi.responses import Response, FileResponse
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["audio"])

class TTSRequest(BaseModel):
    text: str
    voice: str = "af_sarah"
    speed: float = 1.0

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

RECORDINGS_DIR = os.path.expanduser("~/.config/gnomeai/recordings")
CUSTOM_VOICES_DIR = os.path.expanduser("~/.config/gnomeai/custom_voices")

@router.post("/tts")
def generate_tts(payload: TTSRequest):
    try:
        from gnomeai_backend.audio import audio_studio_manager
        from gnomeai_backend.audio.openvino_tts import ov_tts_manager
        
        if payload.voice.startswith("custom_"):
            wav_bytes = audio_studio_manager.generate_custom_voice(
                text=payload.text,
                language="Auto",
                speaker=payload.voice,
                engine="qwen3"
            )
        else:
            wav_bytes = ov_tts_manager.generate_kokoro_wav(payload.text, voice=payload.voice)
            
        return Response(content=wav_bytes, media_type="audio/wav")
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/stt/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    try:
        from gnomeai_backend.audio.stt import stt_manager
        audio_bytes = await file.read()
        text = stt_manager.transcribe(audio_bytes)
        return {"success": True, "text": text}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

