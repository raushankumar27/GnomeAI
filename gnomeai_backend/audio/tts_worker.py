import os
import threading
import queue
import soundfile as sf
import io
from gnomeai_backend.config import app_settings

class TTSWorker:
    """Background worker thread queue for executing Kokoro TTS synthesis asynchronously."""

    def __init__(self):
        self.queue = queue.Queue()
        self.lock = threading.Lock()
        self.global_kokoro = None
        self.thread = threading.Thread(target=self._worker_loop, daemon=True)
        self.thread.start()

    def _worker_loop(self):
        while True:
            item = self.queue.get()
            if item is None:
                break
            text, voice, speed, callback = item
            try:
                base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
                model_path = os.path.join(base_dir, "assets", "kokoro.onnx")
                if not os.path.exists(model_path):
                    model_path = os.path.join(base_dir, "kokoro.onnx")
                voices_path = os.path.join(base_dir, "assets", "voices.bin")
                if not os.path.exists(voices_path):
                    voices_path = os.path.join(base_dir, "voices.bin")

                if os.path.exists(model_path) and os.path.exists(voices_path):
                    with self.lock:
                        if self.global_kokoro is None:
                            import kokoro_onnx
                            print("[TTS Worker] Initializing Kokoro model...")
                            self.global_kokoro = kokoro_onnx.Kokoro(model_path, voices_path)
                        kokoro = self.global_kokoro

                    samples, sample_rate = kokoro.create(text, voice=voice, speed=speed)
                    wav_io = io.BytesIO()
                    sf.write(wav_io, samples, sample_rate, format='WAV')
                    wav_data = wav_io.getvalue()
                    callback({"status": "success", "audio": wav_data})
                else:
                    callback({"status": "error", "message": "Kokoro files not found"})
            except Exception as e:
                print(f"[TTS Worker] Error: {e}")
                callback({"status": "error", "message": str(e)})
            finally:
                self.queue.task_done()

    def generate(self, text, voice, speed, callback):
        self.queue.put((text, voice, speed, callback))

tts_worker = TTSWorker()
