import os
import io
import time
import threading
import gc
import subprocess
import numpy as np
import soundfile as sf

class STTManager:
    """
    Manages Whisper automatic speech recognition model initialization,
    on-demand loading, multi-vendor hardware acceleration (Intel Arc GPU / NPU via OpenVINO, CUDA),
    and automatic offloading after inactivity.
    """

    def __init__(self, inactivity_timeout: float = 300.0):
        self.pipe = None
        self.ov_compiled_encoder = None
        self.processor = None
        self.model = None
        self.device = None
        self.model_name = "openai/whisper-small"  # Upgraded to 244M multilingual model for high Hindi & Indian accent accuracy
        self.inactivity_timeout = inactivity_timeout  # Default 5 minutes (300 seconds)
        self.offload_timer: threading.Timer | None = None
        self.lock = threading.Lock()
        self.last_used = 0.0

    def set_model_name(self, model_name: str):
        """Allows switching STT models dynamically (e.g. whisper-small, whisper-base, whisper-tiny)."""
        with self.lock:
            if self.model_name != model_name:
                print(f"[STT] Changing STT model from '{self.model_name}' to '{model_name}'...", flush=True)
                self.unload()
                self.model_name = model_name

    def _detect_device(self) -> str:
        """Detect best available hardware device (Intel Arc GPU, Intel NPU, NVIDIA CUDA, or CPU)."""
        if self.device is not None:
            return self.device
        
        # Priority 1: Check Intel OpenVINO devices for Intel Arc GPU or Intel NPU
        try:
            import openvino as ov
            core = ov.Core()
            devices = core.available_devices
            if 'GPU' in devices:
                self.device = "openvino_gpu"
                print("[STT] Hardware acceleration detected: Intel Arc GPU (OpenVINO iGPU)", flush=True)
                return self.device
            elif 'NPU' in devices:
                self.device = "openvino_npu"
                print("[STT] Hardware acceleration detected: Intel AI Boost NPU (OpenVINO)", flush=True)
                return self.device
        except Exception as ov_err:
            print(f"[STT] OpenVINO detection check: {ov_err}", flush=True)

        # Priority 2: Check NVIDIA CUDA
        try:
            import torch
            if torch.cuda.is_available():
                self.device = "cuda"
                print("[STT] Hardware acceleration detected: NVIDIA GPU (CUDA)", flush=True)
                return self.device
        except Exception:
            pass

        # Priority 3: Fallback CPU
        self.device = "cpu"
        print("[STT] Hardware execution: CPU", flush=True)
        return self.device

    def _load_model(self, force_cpu: bool = False):
        """Thread-safely load model on-demand on GPU/NPU/CPU."""
        with self.lock:
            self._reset_inactivity_timer()
            self.last_used = time.time()

            if force_cpu:
                self.device = "cpu"
                self.pipe = None
                self.ov_compiled_encoder = None

            if self.pipe is None and self.ov_compiled_encoder is None:
                device = "cpu" if force_cpu else self._detect_device()
                print(f"[STT] Loading model '{self.model_name}' on demand on device '{device}'...", flush=True)
                
                try:
                    if device.startswith("openvino"):
                        import openvino as ov
                        import torch
                        from transformers import WhisperForConditionalGeneration, WhisperProcessor

                        ov_target = "GPU" if device == "openvino_gpu" else "NPU"
                        print(f"[STT] Initializing OpenVINO backend for Intel hardware: {ov_target}...", flush=True)
                        
                        self.processor = WhisperProcessor.from_pretrained(self.model_name)
                        self.model = WhisperForConditionalGeneration.from_pretrained(self.model_name)
                        self.model.eval()

                        # Convert Whisper encoder to OpenVINO IR format
                        dummy_input = torch.randn(1, 80, 3000)
                        ov_encoder = ov.convert_model(self.model.model.encoder, example_input=dummy_input)
                        
                        core = ov.Core()
                        self.ov_compiled_encoder = core.compile_model(ov_encoder, device_name=ov_target)
                        print(f"[STT] OpenVINO Whisper encoder successfully compiled on Intel {ov_target}!", flush=True)

                    else:
                        from transformers import pipeline
                        pipe_kwargs = {
                            "task": "automatic-speech-recognition",
                            "model": self.model_name,
                            "device": device
                        }
                        self.pipe = pipeline(**pipe_kwargs)
                except Exception as load_err:
                    print(f"[STT] Error loading on '{device}': {load_err}. Falling back to standard pipeline...", flush=True)
                    from transformers import pipeline
                    self.device = "cpu"
                    self.ov_compiled_encoder = None
                    self.pipe = pipeline("automatic-speech-recognition", model=self.model_name, device="cpu")

                try:
                    from gnomeai_backend.core.model_manager import model_lifecycle_manager
                    model_lifecycle_manager.register_model("stt_whisper", self, device=self.device)
                except Exception as ex:
                    print(f"[STT] Failed to register with ModelLifecycleManager: {ex}", flush=True)

                print(f"[STT] Model '{self.model_name}' loaded successfully on device '{self.device}'.", flush=True)
            else:
                try:
                    from gnomeai_backend.core.model_manager import model_lifecycle_manager
                    model_lifecycle_manager.touch_model("stt_whisper")
                except Exception:
                    pass

            return self

    def _reset_inactivity_timer(self):
        """Reset the inactivity offload countdown timer."""
        if self.offload_timer is not None:
            self.offload_timer.cancel()
            self.offload_timer = None
        
        if self.inactivity_timeout > 0:
            self.offload_timer = threading.Timer(self.inactivity_timeout, self.unload)
            self.offload_timer.daemon = True
            self.offload_timer.start()

    def unload(self):
        """Thread-safely unload the STT model and clear GPU/NPU/CPU memory."""
        with self.lock:
            if self.offload_timer is not None:
                self.offload_timer.cancel()
                self.offload_timer = None

            if self.pipe is not None or self.ov_compiled_encoder is not None:
                print(f"[STT] Inactivity timeout reached ({self.inactivity_timeout}s). Auto-offloading STT model...", flush=True)
                del self.pipe
                del self.ov_compiled_encoder
                del self.model
                del self.processor
                self.pipe = None
                self.ov_compiled_encoder = None
                self.model = None
                self.processor = None

                gc.collect()
                try:
                    import torch
                    if hasattr(torch, "xpu") and hasattr(torch.xpu, "empty_cache"):
                        torch.xpu.empty_cache()
                    elif torch.cuda.is_available():
                        torch.cuda.empty_cache()
                except Exception as e:
                    print(f"[STT] Warning clearing torch cache: {e}", flush=True)

                print("[STT] STT model offloaded successfully. System GPU/NPU memory freed.", flush=True)

    def get_status(self) -> dict:
        """Returns current status of STT model."""
        with self.lock:
            is_loaded = (self.pipe is not None) or (self.ov_compiled_encoder is not None)
            idle = round(time.time() - self.last_used, 1) if is_loaded else 0.0
            return {
                "loaded": is_loaded,
                "model_name": self.model_name,
                "device": self.device or "not initialized",
                "idle_seconds": idle,
                "inactivity_timeout": self.inactivity_timeout
            }

    def _convert_to_wav(self, audio_bytes: bytes) -> bytes:
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
            else:
                print(f"[STT] FFmpeg conversion failed: {stderr.decode('utf-8', errors='ignore')}", flush=True)
        except Exception as e:
            print(f"[STT] Failed to convert audio using ffmpeg: {str(e)}", flush=True)
        return audio_bytes

    def transcribe(self, audio_bytes: bytes, language: str = None) -> str:
        try:
            wav_bytes = self._convert_to_wav(audio_bytes)
            data, samplerate = sf.read(io.BytesIO(wav_bytes))
            
            if data.ndim > 1:
                data = np.mean(data, axis=-1)
            data = data.astype(np.float32)

            self._load_model()

            if self.ov_compiled_encoder is not None and self.processor is not None and self.model is not None:
                # OpenVINO Intel Arc GPU / NPU Execution
                import torch
                from transformers.modeling_outputs import BaseModelOutput

                input_features = self.processor(data, sampling_rate=16000, return_tensors="pt").input_features
                enc_out = self.ov_compiled_encoder([input_features.numpy()])[0]
                encoder_outputs = BaseModelOutput(last_hidden_state=torch.from_numpy(enc_out))
                
                gen_kwargs = {"encoder_outputs": encoder_outputs}
                if language:
                    gen_kwargs["language"] = language

                predicted_ids = self.model.generate(**gen_kwargs)
                text = self.processor.batch_decode(predicted_ids, skip_special_tokens=True)[0].strip()
                print(f"[STT OpenVINO ({self.device})] Transcribed text: '{text}'", flush=True)
                return text

            elif self.pipe is not None:
                kwargs = {}
                if language:
                    kwargs["generate_kwargs"] = {"language": language, "task": "transcribe"}
                result = self.pipe(data, **kwargs)
                text = result.get("text", "").strip()
                print(f"[STT Pipeline ({self.device})] Transcribed text: '{text}'", flush=True)
                return text
            else:
                return ""

        except Exception as e:
            print(f"[STT] Transcription error: {str(e)}", flush=True)
            return ""

    def transcribe_bytes(self, audio_bytes: bytes, language: str = None) -> str:
        return self.transcribe(audio_bytes, language=language)

stt_manager = STTManager()
whisper_stt = stt_manager



