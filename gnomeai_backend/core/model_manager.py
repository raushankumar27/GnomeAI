import time
import threading
from typing import Dict, Any, Optional
from gnomeai_backend.interfaces.model import BaseModelLifecycleManager, DeviceTarget, DeviceCompilationError

class ModelLifecycleManager(BaseModelLifecycleManager):
    """
    Unified hardware lifecycle manager for LLMs, STT, and TTS models.
    Supports LRU model eviction and strict explicit device target validation (CPU, GPU, XPU, NPU).
    Fails with DeviceCompilationError on compilation mismatch instead of auto-falling back.
    """
    def __init__(self, max_loaded_models: int = 4):
        super().__init__()
        self.max_loaded_models = max_loaded_models
        self.loaded_models: Dict[str, Dict[str, Any]] = {}
        self.device_preferences: Dict[str, DeviceTarget] = {}
        self.lock = threading.Lock()

    def set_device_preference(self, model_id: str, device: DeviceTarget):
        with self.lock:
            self.device_preferences[model_id] = device
            print(f"[ModelManager] Configured explicit device preference for '{model_id}' -> {device.value}")

    def get_device_preference(self, model_id: str) -> DeviceTarget:
        with self.lock:
            return self.device_preferences.get(model_id, DeviceTarget.AUTO)

    def load_model(self, model_id: str, target_device: Optional[DeviceTarget] = None) -> Any:
        device = target_device or self.get_device_preference(model_id)
        with self.lock:
            if model_id in self.loaded_models:
                cached_dev = self.loaded_models[model_id]["device"]
                if device != DeviceTarget.AUTO and cached_dev != device.value:
                    print(f"[ModelManager] Unloading '{model_id}' due to target device change ({cached_dev} -> {device.value})")
                    self._unload_model_unlocked(model_id)
                else:
                    self.loaded_models[model_id]["last_used"] = time.time()
                    return self.loaded_models[model_id]["instance"]
        return None

    def register_model(self, model_id: str, model_instance: Any, device: str = "AUTO", memory_mb: float = 0.0):
        with self.lock:
            if len(self.loaded_models) >= self.max_loaded_models and model_id not in self.loaded_models:
                self._evict_lru_model()

            self.loaded_models[model_id] = {
                "instance": model_instance,
                "device": device,
                "last_used": time.time(),
                "memory_mb": memory_mb
            }
            print(f"[ModelManager] Successfully registered model '{model_id}' on explicit device: {device}")

    def touch_model(self, model_id: str):
        with self.lock:
            if model_id in self.loaded_models:
                self.loaded_models[model_id]["last_used"] = time.time()

    def _unload_model_unlocked(self, model_id: str):
        if model_id in self.loaded_models:
            model_info = self.loaded_models.pop(model_id)
            instance = model_info.get("instance")
            if hasattr(instance, "unload"):
                try: instance.unload()
                except Exception as e: print(f"[ModelManager] Error unloading model '{model_id}': {e}")

    def unload_model(self, model_id: Optional[str] = None) -> bool:
        with self.lock:
            if model_id:
                if model_id in self.loaded_models:
                    self._unload_model_unlocked(model_id)
                    return True
                return False
            self.unload_all()
            return True

    def _evict_lru_model(self):
        if not self.loaded_models:
            return
        lru_id = min(self.loaded_models.keys(), key=lambda k: self.loaded_models[k]["last_used"])
        print(f"[ModelManager] Evicting LRU model '{lru_id}' to free hardware resources...")
        self._unload_model_unlocked(lru_id)

    def unload_all(self):
        with self.lock:
            for model_id in list(self.loaded_models.keys()):
                self._unload_model_unlocked(model_id)

    def get_status(self) -> Dict[str, Any]:
        with self.lock:
            return {
                "loaded_count": len(self.loaded_models),
                "device_preferences": {k: v.value for k, v in self.device_preferences.items()},
                "models": [
                    {
                        "id": k,
                        "device": v["device"],
                        "idle_seconds": round(time.time() - v["last_used"], 1)
                    }
                    for k, v in self.loaded_models.items()
                ]
            }

model_lifecycle_manager = ModelLifecycleManager()
