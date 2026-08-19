from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from gnomeai_backend.interfaces.model import DeviceTarget

class BaseTTSEngine(ABC):
    """Abstract Base Class for text-to-speech, voice cloning, and voice design engines."""

    def __init__(self, engine_name: str):
        self._engine_name = engine_name
        self._target_device: DeviceTarget = DeviceTarget.AUTO

    @property
    def engine_name(self) -> str:
        return self._engine_name

    @property
    def target_device(self) -> DeviceTarget:
        return self._target_device

    @target_device.setter
    def target_device(self, device: DeviceTarget):
        self._target_device = device

    @abstractmethod
    def synthesize(self, text: str, voice: str = "default", speed: float = 1.0) -> bytes:
        """Synthesize audio bytes (WAV format) from text."""
        pass

    @abstractmethod
    def clone_voice(self, target_text: str, ref_audio_bytes: bytes, ref_text: str = "", language: str = "Auto") -> bytes:
        """Zero-shot voice cloning using reference audio sample."""
        pass

    @abstractmethod
    def design_voice(self, text: str, instruct: str, language: str = "Auto") -> bytes:
        """Generates custom voice based on text prompt description."""
        pass
