from abc import ABC, abstractmethod
from enum import Enum
from typing import Dict, Any, Optional

class DeviceTarget(str, Enum):
    CPU = "CPU"
    GPU = "GPU"
    XPU = "XPU"  # Intel Arc / iGPU
    NPU = "NPU"  # Neural Processing Unit
    AUTO = "AUTO"

class DeviceCompilationError(Exception):
    """Raised when a model fails to compile or load on the specified hardware target device."""
    def __init__(self, model_id: str, device: str, details: str):
        self.model_id = model_id
        self.device = device
        self.details = details
        super().__init__(
            f"Model '{model_id}' failed to load on requested hardware device '{device}'. "
            f"Error details: {details}"
        )

class BaseModelLifecycleManager(ABC):
    """Abstract Base Class for managing model weights, device compilation, and runtime lifecycles."""

    def __init__(self):
        self._device_preference: DeviceTarget = DeviceTarget.AUTO
        self._active_model_id: Optional[str] = None
        self._loaded_models: Dict[str, Any] = {}

    @property
    def device_preference(self) -> DeviceTarget:
        return self._device_preference

    @device_preference.setter
    def device_preference(self, device: DeviceTarget):
        self._device_preference = device

    @abstractmethod
    def load_model(self, model_id: str, target_device: Optional[DeviceTarget] = None) -> Any:
        """
        Loads and compiles a model strictly on the requested device target.
        Must raise DeviceCompilationError if compilation fails on specified device.
        """
        pass

    @abstractmethod
    def unload_model(self, model_id: Optional[str] = None) -> bool:
        """Unloads model weights from memory and frees hardware buffers."""
        pass

    @abstractmethod
    def get_status(self) -> Dict[str, Any]:
        """Returns model status and currently allocated device."""
        pass
