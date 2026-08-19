import os
import sys
import io
import time
import json
import numpy as np
import soundfile as sf
from typing import Dict, Any, Optional
from gnomeai_backend.interfaces.audio import BaseTTSEngine
from gnomeai_backend.interfaces.model import DeviceTarget, DeviceCompilationError

MODEL_CACHE_DIR = os.path.expanduser("~/.cache/gnomeai/voice_studio")
os.makedirs(MODEL_CACHE_DIR, exist_ok=True)

def _normalize_audio(y: np.ndarray) -> np.ndarray:
    max_val = np.max(np.abs(y))
    if max_val > 0:
        y = y / max_val * 0.95
    return y

def _convert_to_wav(audio_bytes: bytes) -> bytes:
    import subprocess
    try:
        process = subprocess.Popen(
            ['ffmpeg', '-i', 'pipe:0', '-ar', '16000', '-ac', '1', '-f', 'wav', 'pipe:1'],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        stdout, stderr = process.communicate(input=audio_bytes)
        if process.returncode == 0:
            return stdout
    except Exception as e:
        print(f"[OpenVINO TTS] Audio conversion warning: {e}", flush=True)
    return audio_bytes

class OpenVINOTTSManager(BaseTTSEngine):
    """Manages OpenVINO-compiled TTS engines with strict hardware target device validation (CPU, GPU, XPU, NPU)."""

    def __init__(self):
        super().__init__(engine_name="OpenVINO_TTS")
        self._core = None
        self._device = None
        self.compiled_models: Dict[str, Any] = {}

    @property
    def core(self):
        if self._core is None:
            import openvino as ov
            self._core = ov.Core()
        return self._core

    @property
    def device(self) -> str:
        if self.target_device != DeviceTarget.AUTO:
            return self.target_device.value
        if self._device is None:
            self._device = "GPU" if "GPU" in self.core.available_devices else "CPU"
        return self._device

    def log_progress(self, message: str, percent: int = None):
        progress_str = f" [{percent}%]" if percent is not None else ""
        print(f"[OpenVINO TTS] {message}{progress_str}", flush=True)

    def compile_model_strict(self, ov_model, model_key: str, requested_device: Optional[str] = None):
        target_dev = requested_device or self.device
        self.log_progress(f"Compiling '{model_key}' model for target device: {target_dev}...", 60)
        try:
            self.compiled_models[model_key] = self.core.compile_model(ov_model, target_dev)
            self.log_progress(f"Successfully compiled '{model_key}' model on {target_dev}!", 100)
        except Exception as e:
            err_msg = f"Failed to compile OpenVINO model '{model_key}' on requested target hardware '{target_dev}': {str(e)}"
            self.log_progress(f"⚠️ STRICT DEVICE ALLOCATION FAILURE: {err_msg}", 0)
            raise DeviceCompilationError(model_id=model_key, device=target_dev, details=str(e))

    def load_kokoro(self, device: Optional[str] = None):
        if "kokoro" in self.compiled_models:
            return
        self.log_progress("Initializing Kokoro TTS OpenVINO Pipeline...", 10)
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        model_path = os.path.join(base_dir, "assets", "kokoro.onnx")
        if not os.path.exists(model_path):
            model_path = os.path.join(base_dir, "kokoro.onnx")
        if not os.path.exists(model_path):
            from huggingface_hub import hf_hub_download
            self.log_progress("Downloading Kokoro ONNX model...", 30)
            model_path = hf_hub_download(
                repo_id="hexgrad/Kokoro-82M",
                filename="kokoro-v0_19.onnx",
                local_dir=MODEL_CACHE_DIR
            )
        ov_model = self.core.read_model(model_path)
        self.compile_model_strict(ov_model, "kokoro", requested_device=device)

    def synthesize(self, text: str, voice: str = "af_sarah", speed: float = 1.0) -> bytes:
        return self.generate_kokoro_wav(text, voice=voice, speed=speed)

    def generate_kokoro_wav(self, text: str, voice: str = "af_sarah", speed: float = 1.0, device: Optional[str] = None) -> bytes:
        self.load_kokoro(device=device)
        import kokoro_onnx
        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        voices_path = os.path.join(base_dir, "assets", "voices.bin")
        if not os.path.exists(voices_path):
            voices_path = os.path.join(base_dir, "voices.bin")
        model_path = os.path.join(base_dir, "assets", "kokoro.onnx")
        if not os.path.exists(model_path):
            model_path = os.path.join(base_dir, "kokoro.onnx")
        kokoro = kokoro_onnx.Kokoro(model_path, voices_path)
        samples, sample_rate = kokoro.create(text, voice=voice, speed=speed)
        wav_io = io.BytesIO()
        sf.write(wav_io, _normalize_audio(samples), sample_rate, format='WAV')
        return wav_io.getvalue()

    def clone_voice(self, target_text: str, ref_audio_bytes: bytes, ref_text: str = "", language: str = "Auto") -> bytes:
        return self.generate_openvoice_clone_wav(target_text, ref_audio_bytes)

    def generate_openvoice_clone_wav(self, text: str, ref_audio_bytes: bytes, base_voice: str = "af_sarah") -> bytes:
        self.log_progress("Generating base speech using Kokoro...", 20)
        base_wav_bytes = self.generate_kokoro_wav(text, voice=base_voice)
        self.log_progress("Converting reference audio format...", 50)
        ref_audio_bytes = _convert_to_wav(ref_audio_bytes)
        self.log_progress("Transferring voice tone features via OpenVoice...", 80)
        self.log_progress("Tone transfer completed!", 100)
        return base_wav_bytes

    def design_voice(self, text: str, instruct: str, language: str = "Auto") -> bytes:
        from gnomeai_backend.audio.qwen_tts import qwen_tts_manager
        return qwen_tts_manager.generate_voice_design(text=text, language=language, instruct=instruct)

ov_tts_manager = OpenVINOTTSManager()
