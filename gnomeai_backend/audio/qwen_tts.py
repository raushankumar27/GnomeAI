import os
import io
import soundfile as sf
import numpy as np
import unicodedata
from typing import Dict, Any, Optional
from gnomeai_backend.interfaces.audio import BaseTTSEngine
from gnomeai_backend.interfaces.model import DeviceTarget, DeviceCompilationError

def _clean_text(text: str) -> str:
    if not text:
        return ""
    return unicodedata.normalize('NFC', text.strip())

def _normalize_audio(wav, eps=1e-12, clip=True):
    x = np.asarray(wav)
    if np.issubdtype(x.dtype, np.integer):
        info = np.iinfo(x.dtype)
        if info.min < 0:
            y = x.astype(np.float32) / max(abs(info.min), info.max)
        else:
            mid = (info.max + 1) / 2.0
            y = (x.astype(np.float32) - mid) / mid
    elif np.issubdtype(x.dtype, np.floating):
        y = x.astype(np.float32)
        m = np.max(np.abs(y)) if y.size else 0.0
        if m > 1.0 + 1e-6:
            y = y / (m + eps)
    else:
        raise TypeError(f"Unsupported dtype: {x.dtype}")
    if clip:
        y = np.clip(y, -1.0, 1.0)
    if y.ndim > 1:
        y = np.mean(y, axis=-1).astype(np.float32)
    return y

def _convert_to_wav(audio_bytes: bytes) -> bytes:
    import subprocess
    if not audio_bytes:
        return b""
    try:
        process = subprocess.Popen(
            ['ffmpeg', '-y', '-i', 'pipe:0', '-ar', '16000', '-ac', '1', '-f', 'wav', 'pipe:1'],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        stdout, stderr = process.communicate(input=audio_bytes, timeout=15)
        if process.returncode == 0 and stdout:
            return stdout
    except Exception as e:
        print(f"[Qwen3-TTS] FFmpeg conversion warning: {str(e)}")
    return audio_bytes

def _normalize_language(language: str) -> str:
    if not language:
        return "auto"
    lang_lower = str(language).lower().strip()
    supported = ["auto", "chinese", "english", "french", "german", "italian", "japanese", "korean", "portuguese", "russian", "spanish"]
    if lang_lower in supported:
        return lang_lower
    return "auto"

class Qwen3TTSManager(BaseTTSEngine):
    """Manages Qwen3-TTS voice design, zero-shot voice cloning, and custom voice synthesis with strict hardware device target allocation."""

    def __init__(self):
        super().__init__(engine_name="Qwen3_TTS")
        import threading
        self.active_model_type = None  # "VoiceDesign", "Base", "CustomVoice"
        self.active_model_size = None  # "0.6B", "1.7B"
        self.model = None
        self.device = None
        self.dtype = None
        self.audio_cache = {}
        self.inference_lock = threading.Lock()

    def _ensure_device(self, target_device: Optional[str] = None):
        import torch
        dev = target_device or (self.target_device.value if self.target_device != DeviceTarget.AUTO else None)
        if dev:
            dev_lower = dev.lower()
            if "cuda" in dev_lower or "gpu" in dev_lower:
                if not torch.cuda.is_available():
                    raise DeviceCompilationError(model_id="Qwen3-TTS", device=dev, details="NVIDIA CUDA GPU is not available on this system.")
                self.device = "cuda"
                self.dtype = torch.bfloat16
            elif "xpu" in dev_lower:
                if not (hasattr(torch, "xpu") and torch.xpu.is_available()):
                    raise DeviceCompilationError(model_id="Qwen3-TTS", device=dev, details="Intel XPU (iGPU/dGPU) device drivers not available.")
                self.device = "xpu"
                self.dtype = torch.float16
            elif "cpu" in dev_lower:
                self.device = "cpu"
                self.dtype = torch.float32
            else:
                self.device = dev
                self.dtype = torch.float32
        else:
            if torch.cuda.is_available():
                self.device = "cuda"
                self.dtype = torch.bfloat16
            else:
                self.device = "cpu"
                self.dtype = torch.float32

    def _get_model_path(self, model_type: str, model_size: str) -> str:
        from huggingface_hub import snapshot_download
        repo_id = f"Qwen/Qwen3-TTS-12Hz-{model_size}-{model_type}"
        print(f"[Qwen3-TTS] Downloading model weights for {repo_id}...")
        return snapshot_download(repo_id)

    def _load_model(self, model_type: str, model_size: str, requested_device: Optional[str] = None):
        self._ensure_device(requested_device)
        import torch
        if self.active_model_type == model_type and self.active_model_size == model_size and self.model is not None:
            return

        if self.model is not None:
            print(f"[Qwen3-TTS] Unloading model {self.active_model_type} ({self.active_model_size}) to free memory...")
            self.model = None
            if torch.cuda.is_available():
                try: torch.cuda.empty_cache()
                except: pass

        from qwen_tts import Qwen3TTSModel
        repo_id = f"Qwen/Qwen3-TTS-12Hz-{model_size}-{model_type}"
        model_path = self._get_model_path(model_type, model_size)
        print(f"[Qwen3-TTS] Loading model {repo_id} strictly to target device: {self.device}...")
        
        try:
            self.model = Qwen3TTSModel.from_pretrained(
                model_path,
                device_map=self.device,
                dtype=self.dtype,
                attn_implementation="sdpa",
            )
            self.active_model_type = model_type
            self.active_model_size = model_size
            print(f"[Qwen3-TTS] Successfully loaded {repo_id} on {self.device}!")
        except Exception as load_err:
            print(f"[Qwen3-TTS] ⚠️ STRICT DEVICE ALLOCATION FAILURE on target device ({self.device}): {load_err}")
            raise DeviceCompilationError(model_id=repo_id, device=str(self.device), details=str(load_err))

    def synthesize(self, text: str, voice: str = "Aiden", speed: float = 1.0) -> bytes:
        return self.generate_custom_voice(text=text, speaker=voice)

    def clone_voice(self, target_text: str, ref_audio_bytes: bytes, ref_text: str = "", language: str = "Auto") -> bytes:
        return self.generate_voice_clone(audio_bytes=ref_audio_bytes, ref_text=ref_text, target_text=target_text, language=language)

    def design_voice(self, text: str, instruct: str, language: str = "Auto") -> bytes:
        return self.generate_voice_design(text=text, language=language, instruct=instruct)

    def generate_voice_design(self, text: str, language: str = "Auto", instruct: str = "", model_size: str = "1.7B", target_device: Optional[str] = None) -> bytes:
        import torch, gc
        target_size = "0.6B" if str(model_size).lower() in ("0.6b", "fast", "small") else "1.7B"
        text = _clean_text(text)
        language = _normalize_language(language)
        instruct_clean = instruct.strip() if instruct else ""
        
        cache_key = (text, language, instruct_clean, target_size, target_device)
        if cache_key in self.audio_cache:
            return self.audio_cache[cache_key]

        with self.inference_lock:
            gc.collect()
            if torch.cuda.is_available():
                try: torch.cuda.empty_cache()
                except: pass
            self._load_model("VoiceDesign", target_size, requested_device=target_device)
            dynamic_max_tokens = min(512, max(64, len(text) * 7))
            with torch.inference_mode():
                wavs, sr = self.model.generate_voice_design(
                    text=text,
                    language=language,
                    instruct=instruct_clean,
                    non_streaming_mode=True,
                    max_new_tokens=dynamic_max_tokens,
                )
                wav_io = io.BytesIO()
                sf.write(wav_io, wavs[0], sr, format='WAV')
                wav_bytes = wav_io.getvalue()

        if len(self.audio_cache) > 200:
            self.audio_cache.clear()
        self.audio_cache[cache_key] = wav_bytes
        return wav_bytes

    def generate_voice_clone(self, audio_bytes: bytes, ref_text: str = "", target_text: str = "", language: str = "Auto", use_xvector_only: bool = False, model_size: str = "1.7B", target_device: Optional[str] = None) -> bytes:
        import torch
        target_text = _clean_text(target_text)
        ref_text = _clean_text(ref_text)
        language = _normalize_language(language)
        audio_bytes = _convert_to_wav(audio_bytes)
        wav, sr = sf.read(io.BytesIO(audio_bytes))
        wav = _normalize_audio(wav)
        ref_audio_tuple = (wav, sr)
        dynamic_max_tokens = min(1024, max(128, len(target_text) * 10))

        with self.inference_lock:
            self._load_model("Base", model_size, requested_device=target_device)
            with torch.inference_mode():
                wavs, sr_out = self.model.generate_voice_clone(
                    text=target_text,
                    language=language,
                    ref_audio=ref_audio_tuple,
                    ref_text=ref_text if ref_text else None,
                    x_vector_only_mode=use_xvector_only,
                    max_new_tokens=dynamic_max_tokens,
                )
                wav_io = io.BytesIO()
                sf.write(wav_io, wavs[0], sr_out, format='WAV')
                return wav_io.getvalue()

    def generate_custom_voice(self, text: str, language: str = "Auto", speaker: str = "Aiden", instruct: str = None, model_size: str = "1.7B", target_device: Optional[str] = None) -> bytes:
        import torch
        text = _clean_text(text)
        language = _normalize_language(language)
        dynamic_max_tokens = min(1024, max(128, len(text) * 10))

        with self.inference_lock:
            self._load_model("CustomVoice", model_size, requested_device=target_device)
            with torch.inference_mode():
                wavs, sr = self.model.generate_custom_voice(
                    text=text,
                    language=language,
                    speaker=speaker.lower().replace(" ", "_"),
                    instruct=instruct.strip() if instruct else None,
                    non_streaming_mode=True,
                    max_new_tokens=dynamic_max_tokens,
                )
                wav_io = io.BytesIO()
                sf.write(wav_io, wavs[0], sr, format='WAV')
                return wav_io.getvalue()

qwen_tts_manager = Qwen3TTSManager()
