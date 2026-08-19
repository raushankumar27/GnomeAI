import os
import json
import uuid
import shutil
import hashlib
import subprocess
import traceback
from datetime import datetime
from typing import Optional, List, Dict, Any

from gnomeai_backend.audio.qwen_tts import qwen_tts_manager
from gnomeai_backend.audio.openvino_tts import ov_tts_manager
from gnomeai_backend.audio.stt import stt_manager
from gnomeai_backend.audio.tts_worker import tts_worker

CUSTOM_VOICES_DIR = os.path.expanduser("~/.config/gnomeai/custom_voices")
RECORDINGS_DIR = os.path.expanduser("~/.config/gnomeai/recordings")
os.makedirs(CUSTOM_VOICES_DIR, exist_ok=True)
os.makedirs(RECORDINGS_DIR, exist_ok=True)

class AudioStudioManager:
    """
    Centralized Audio Studio Manager handling persistent voice library storage,
    generated recordings history, FFmpeg audio preprocessing & noise suppression,
    voice design synthesis, voice cloning, custom voice TTS generation, and audio streaming.
    """

    def __init__(self):
        self.custom_voices_dir = CUSTOM_VOICES_DIR
        self.recordings_dir = RECORDINGS_DIR

    # --- Preprocessing & Noise Suppression ---
    def preprocess_noise_suppression(self, audio_bytes: bytes) -> bytes:
        """Applies high-pass filter (80Hz), low-pass filter (8000Hz), and silence trimming via FFmpeg."""
        try:
            process = subprocess.Popen(
                ['ffmpeg', '-y', '-i', 'pipe:0', '-af', 'highpass=f=80,lowpass=f=8000,silenceremove=start_periods=1:start_duration=0.1:start_threshold=-45dB:stop_periods=1:stop_duration=0.1:stop_threshold=-45dB', '-ar', '16000', '-ac', '1', '-f', 'wav', 'pipe:1'],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            stdout, stderr = process.communicate(input=audio_bytes)
            if process.returncode == 0 and len(stdout) > 0:
                print("[AudioStudio] Audio preprocessed & noise suppressed successfully via FFmpeg.", flush=True)
                return stdout
            else:
                print(f"[AudioStudio] FFmpeg filtering notice: {stderr.decode('utf-8', errors='ignore')}", flush=True)
        except Exception as e:
            print(f"[AudioStudio] Error during audio preprocessing: {e}", flush=True)
        return audio_bytes

    # --- Recording Storage & Cache Helpers ---
    def find_cached_speak_recording(self, text: str, voice: str) -> Optional[bytes]:
        """Checks if a chat speak recording with identical text and voice is cached."""
        fingerprint = hashlib.sha256(f"{text.strip()}_{voice}".encode("utf-8")).hexdigest()
        if os.path.exists(self.recordings_dir):
            for fname in os.listdir(self.recordings_dir):
                if fname.endswith(".json"):
                    try:
                        with open(os.path.join(self.recordings_dir, fname), "r") as f:
                            meta = json.load(f)
                        if meta.get("source") == "speak" and meta.get("fingerprint") == fingerprint:
                            wav_path = os.path.join(self.recordings_dir, f"{meta['id']}.wav")
                            if os.path.exists(wav_path):
                                with open(wav_path, "rb") as wf:
                                    return wf.read()
                    except Exception:
                        pass
        return None

    def save_speak_recording(self, wav_bytes: bytes, text: str, voice: str) -> str:
        """Saves a chat speak recording with a hash fingerprint for caching."""
        rec_id = f"rec_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
        wav_path = os.path.join(self.recordings_dir, f"{rec_id}.wav")
        json_path = os.path.join(self.recordings_dir, f"{rec_id}.json")
        fingerprint = hashlib.sha256(f"{text.strip()}_{voice}".encode("utf-8")).hexdigest()
        
        try:
            with open(wav_path, "wb") as f:
                f.write(wav_bytes)
            
            meta = {
                "id": rec_id,
                "timestamp": datetime.now().isoformat(),
                "text": text,
                "engine": "qwen3",
                "source": "speak",
                "speaker": voice,
                "fingerprint": fingerprint,
                "filename": f"{rec_id}.wav"
            }
            with open(json_path, "w") as f:
                json.dump(meta, f, indent=4)
            return rec_id
        except Exception as e:
            print(f"[AudioStudio] Error saving speak recording: {e}", flush=True)
            return ""

    def save_generated_recording(self, wav_bytes: bytes, text: str, engine: str, source: str, speaker: str) -> str:
        """Saves generated WAV bytes and metadata persistently."""
        rec_id = f"rec_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
        wav_path = os.path.join(self.recordings_dir, f"{rec_id}.wav")
        json_path = os.path.join(self.recordings_dir, f"{rec_id}.json")
        
        try:
            with open(wav_path, "wb") as f:
                f.write(wav_bytes)
            
            meta = {
                "id": rec_id,
                "timestamp": datetime.now().isoformat(),
                "text": text,
                "engine": engine,
                "source": source,
                "speaker": speaker,
                "filename": f"{rec_id}.wav"
            }
            with open(json_path, "w") as f:
                json.dump(meta, f, indent=4)
            return rec_id
        except Exception as e:
            print(f"[AudioStudio] Error saving recording: {e}", flush=True)
            return ""

    def get_recordings(self) -> List[Dict[str, Any]]:
        recordings = []
        if os.path.exists(self.recordings_dir):
            for fname in os.listdir(self.recordings_dir):
                if fname.endswith(".json"):
                    json_path = os.path.join(self.recordings_dir, fname)
                    try:
                        with open(json_path, "r") as f:
                            meta = json.load(f)
                            recordings.append(meta)
                    except Exception:
                        pass
        recordings.sort(key=lambda r: r.get("timestamp", ""), reverse=True)
        return recordings

    def get_recording_bytes(self, rec_id: str) -> Optional[bytes]:
        wav_path = os.path.join(self.recordings_dir, f"{rec_id}.wav")
        if os.path.exists(wav_path):
            with open(wav_path, "rb") as f:
                return f.read()
        return None

    def delete_recording(self, rec_id: str) -> bool:
        wav_path = os.path.join(self.recordings_dir, f"{rec_id}.wav")
        json_path = os.path.join(self.recordings_dir, f"{rec_id}.json")
        deleted = False
        if os.path.exists(wav_path):
            os.remove(wav_path)
            deleted = True
        if os.path.exists(json_path):
            os.remove(json_path)
            deleted = True
        return deleted

    # --- Custom Voice Library ---
    def save_custom_voice(self, name: str, voice_type: str, file_obj: Any, ref_text: str = "", x_vector_only: bool = False, description: str = "", speaker: str = "") -> bool:
        safe_name = name.strip().replace("/", "_").replace("\\", "_")
        wav_path = os.path.join(self.custom_voices_dir, f"{safe_name}.wav")
        json_path = os.path.join(self.custom_voices_dir, f"{safe_name}.json")
        
        with open(wav_path, "wb") as buffer:
            shutil.copyfileobj(file_obj, buffer)
            
        metadata = {
            "name": safe_name,
            "type": voice_type,
            "ref_text": ref_text,
            "x_vector_only": x_vector_only,
            "description": description,
            "speaker": speaker
        }
        with open(json_path, "w") as f:
            json.dump(metadata, f, indent=4)
        return True

    def get_custom_voices(self) -> List[Dict[str, Any]]:
        voices = []
        if not os.path.exists(self.custom_voices_dir):
            return []
        for file in os.listdir(self.custom_voices_dir):
            if file.endswith(".json"):
                try:
                    with open(os.path.join(self.custom_voices_dir, file), "r") as f:
                        voices.append(json.load(f))
                except Exception:
                    pass
        return voices

    def get_custom_voice_wav_path(self, name: str) -> Optional[str]:
        safe_name = name.replace("/", "_").replace("\\", "_")
        wav_path = os.path.join(self.custom_voices_dir, f"{safe_name}.wav")
        if os.path.exists(wav_path):
            return wav_path
        return None

    def delete_custom_voice(self, name: str) -> bool:
        safe_name = name.replace("/", "_").replace("\\", "_")
        wav_path = os.path.join(self.custom_voices_dir, f"{safe_name}.wav")
        json_path = os.path.join(self.custom_voices_dir, f"{safe_name}.json")
        deleted = False
        if os.path.exists(wav_path):
            os.remove(wav_path)
            deleted = True
        if os.path.exists(json_path):
            os.remove(json_path)
            deleted = True
        return deleted

    # --- Synthesis Handlers ---
    def generate_voice_design(self, text: str, language: str, instruct: str, engine: str = "qwen3") -> bytes:
        try:
            wav_bytes = ov_tts_manager.generate_qwen_openvino_design_wav(text, language, instruct)
        except Exception as err:
            print(f"[AudioStudio] VoiceDesign OpenVINO fallback notice ({err}), generating via Kokoro...", flush=True)
            wav_bytes = ov_tts_manager.generate_kokoro_wav(text)
        self.save_generated_recording(
            wav_bytes=wav_bytes, text=text, engine=engine, source="design", speaker=instruct
        )
        return wav_bytes

    def generate_voice_clone(self, audio_bytes: bytes, target_text: str, ref_text: str = "", use_xvector_only: bool = False, language: str = "Auto", model_size: str = "1.7B", engine: str = "qwen3", preprocess_audio: bool = False, filename: str = "uploaded_file") -> bytes:
        if preprocess_audio:
            audio_bytes = self.preprocess_noise_suppression(audio_bytes)

        if engine == "kokoro":
            wav_bytes = ov_tts_manager.generate_kokoro_wav(target_text)
        elif engine == "gpt_sovits":
            wav_bytes = ov_tts_manager.generate_gpt_sovits_wav(target_text, audio_bytes)
        elif engine == "openvoice":
            wav_bytes = ov_tts_manager.generate_openvoice_clone_wav(target_text, audio_bytes)
        else:
            try:
                wav_bytes = ov_tts_manager.generate_qwen_openvino_clone_wav(target_text, audio_bytes, ref_text, language)
            except Exception as ov_err:
                print(f"[AudioStudio] VoiceClone OpenVINO notice ({ov_err}), generating via OpenVoice clone...", flush=True)
                wav_bytes = ov_tts_manager.generate_openvoice_clone_wav(target_text, audio_bytes)
        self.save_generated_recording(
            wav_bytes=wav_bytes, text=target_text, engine=engine, source="clone", speaker=filename
        )
        return wav_bytes

    def generate_custom_voice(self, text: str, language: str, speaker: str, instruct: Optional[str] = None, model_size: str = "1.7B", engine: str = "qwen3") -> bytes:
        speaker_clean = speaker
        if speaker_clean.startswith("custom_"):
            speaker_clean = speaker_clean[7:]

        json_path = os.path.join(self.custom_voices_dir, f"{speaker_clean}.json")
        wav_path = os.path.join(self.custom_voices_dir, f"{speaker_clean}.wav")

        if os.path.exists(json_path) and os.path.exists(wav_path):
            with open(json_path, "r") as f:
                metadata = json.load(f)
            with open(wav_path, "rb") as af:
                ref_bytes = af.read()
            wav_bytes = ov_tts_manager.generate_qwen_openvino_clone_wav(text, ref_bytes, metadata.get("ref_text", ""), language)
        elif engine == "kokoro":
            wav_bytes = ov_tts_manager.generate_kokoro_wav(text, voice=speaker_clean)
        elif engine == "gpt_sovits" and os.path.exists(wav_path):
            with open(wav_path, "rb") as af:
                ref_bytes = af.read()
            wav_bytes = ov_tts_manager.generate_gpt_sovits_wav(text, ref_bytes)
        elif engine == "openvoice" and os.path.exists(wav_path):
            with open(wav_path, "rb") as af:
                ref_bytes = af.read()
            wav_bytes = ov_tts_manager.generate_openvoice_clone_wav(text, ref_bytes, base_voice="af_bella")
        else:
            wav_bytes = ov_tts_manager.generate_qwen_openvino_custom_wav(text, speaker_clean, language, instruct)

        self.save_generated_recording(
            wav_bytes=wav_bytes, text=text, engine=engine, source="custom", speaker=speaker
        )
        return wav_bytes

    def generate_tts(self, text: str, voice: str, speed: float = 1.0) -> bytes:
        from gnomeai_backend.audio.mpris import mpris_manager
        try:
            mpris_manager.update_status("Playing", text)
        except Exception:
            pass

        cached_wav = self.find_cached_speak_recording(text, voice)
        if cached_wav is not None:
            try:
                mpris_manager.update_status("Stopped")
            except Exception:
                pass
            return cached_wav

        if voice.startswith("custom_"):
            speaker_clean = voice[7:]
            json_path = os.path.join(self.custom_voices_dir, f"{speaker_clean}.json")
            wav_path = os.path.join(self.custom_voices_dir, f"{speaker_clean}.wav")
            if not os.path.exists(json_path):
                try:
                    mpris_manager.update_status("Stopped")
                except Exception:
                    pass
                raise RuntimeError("Custom voice metadata not found")
            
            with open(json_path, "r") as f:
                metadata = json.load(f)
            if metadata.get("type") in ("clone", "design"):
                if not os.path.exists(wav_path):
                    raise RuntimeError("Custom voice reference audio file not found")
                with open(wav_path, "rb") as af:
                    audio_bytes = af.read()
                wav_bytes = ov_tts_manager.generate_qwen_openvino_clone_wav(text, audio_bytes, metadata.get("ref_text", ""), "Auto")
            elif metadata.get("type") == "custom":
                wav_bytes = ov_tts_manager.generate_qwen_openvino_custom_wav(text, metadata.get("speaker", "Ryan"), "English", metadata.get("description"))
            else:
                raise RuntimeError("Invalid custom voice type")

            self.save_speak_recording(wav_bytes, text, voice)
            try:
                mpris_manager.update_status("Stopped")
            except Exception:
                pass
            return wav_bytes

        import threading
        event = threading.Event()
        result = {}
        def callback(data):
            result.update(data)
            event.set()
        tts_worker.generate(text, voice, speed, callback)
        event.wait(timeout=60)
        try:
            mpris_manager.update_status("Stopped")
        except Exception:
            pass

        if result.get("status") == "success":
            wav_bytes = result["audio"]
            self.save_speak_recording(wav_bytes, text, voice)
            return wav_bytes
        else:
            raise RuntimeError(result.get("message", "TTS worker failed"))

    def generate_tts_stream(self, text: str, engine: str = "qwen3", speaker: str = "Ryan", language: str = "Auto", instruct: str = "", model_size: str = "1.7B"):
        try:
            if engine == "kokoro":
                wav_bytes = ov_tts_manager.generate_kokoro_wav(text)
            elif engine == "gpt_sovits":
                wav_bytes = ov_tts_manager.generate_gpt_sovits_wav(text, b"")
            elif engine == "openvoice":
                wav_bytes = ov_tts_manager.generate_openvoice_clone_wav(text, b"")
            elif instruct and instruct.strip():
                wav_bytes = ov_tts_manager.generate_qwen_openvino_design_wav(text, language, instruct)
            else:
                wav_bytes = ov_tts_manager.generate_qwen_openvino_custom_wav(text, speaker, language, instruct)
        except Exception as e:
            print(f"[AudioStudio Stream] Error synthesizing stream ({e}), generating via Kokoro...", flush=True)
            traceback.print_exc()
            wav_bytes = ov_tts_manager.generate_kokoro_wav(text)

        self.save_generated_recording(
            wav_bytes=wav_bytes, text=text, engine=engine, source="stream", speaker=speaker or instruct or "stream"
        )

        chunk_size = 8192
        for i in range(0, len(wav_bytes), chunk_size):
            yield wav_bytes[i:i + chunk_size]

    # --- Story Mode Reroll & Export ---
    def story_reroll_line(self, clip_id: str, master_id: Optional[str], text: str, instruct: str, language: str = "Auto") -> Dict[str, Any]:
        wav_bytes = ov_tts_manager.generate_qwen_openvino_design_wav(
            text=text, language=language or "Auto", instruct=instruct
        )
        wav_path = os.path.join(self.recordings_dir, f"{clip_id}.wav")
        with open(wav_path, "wb") as f:
            f.write(wav_bytes)

        meta_path = os.path.join(self.recordings_dir, f"{clip_id}.json")
        if os.path.exists(meta_path):
            with open(meta_path, "r") as f:
                meta = json.load(f)
            meta["text"] = text
            meta["speaker"] = instruct
            with open(meta_path, "w") as f:
                json.dump(meta, f, indent=4)

        if master_id:
            master_path = os.path.join(self.recordings_dir, f"{master_id}.wav")
            from pydub import AudioSegment
            recordings = []
            for fname in os.listdir(self.recordings_dir):
                if fname.endswith(".json") and not fname.startswith(master_id):
                    try:
                        with open(os.path.join(self.recordings_dir, fname), "r") as f:
                            m = json.load(f)
                            if m.get("source") == "story_clip":
                                recordings.append(m)
                    except Exception:
                        pass
            recordings.sort(key=lambda r: r.get("timestamp", ""))
            if recordings:
                pause = AudioSegment.silent(duration=400)
                combined = AudioSegment.empty()
                for i, r in enumerate(recordings):
                    c_path = os.path.join(self.recordings_dir, f"{r['id']}.wav")
                    if os.path.exists(c_path):
                        seg = AudioSegment.from_file(c_path, format="wav")
                        if i > 0:
                            combined += pause
                        combined += seg
                combined.export(master_path, format="wav")

        return {"success": True, "clip_id": clip_id, "master_id": master_id}

    def story_export_audiobook(self, master_id: str, title: str = "GnomeAI Audiobook", author: str = "GnomeAI Studio", audio_format: str = "mp3") -> str:
        master_path = os.path.join(self.recordings_dir, f"{master_id}.wav")
        if not os.path.exists(master_path):
            raise FileNotFoundError("Master audiobook recording file not found")

        export_dir = os.path.expanduser("~/Downloads/GnomeAI_Audiobooks")
        os.makedirs(export_dir, exist_ok=True)

        safe_title = "".join(c for c in (title or "Audiobook") if c.isalnum() or c in (" ", "_", "-")).strip().replace(" ", "_")
        if not safe_title:
            safe_title = "Audiobook"

        ext = "mp3" if (audio_format or "mp3").lower() == "mp3" else "m4a"
        out_path = os.path.join(export_dir, f"{safe_title}.{ext}")

        cmd = [
            "ffmpeg", "-y", "-i", master_path,
            "-metadata", f"title={title}",
            "-metadata", f"artist={author}",
            "-metadata", f"album={title}",
            "-b:a", "192k",
            out_path
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if res.returncode != 0:
            raise RuntimeError(f"FFmpeg audiobook export failed: {res.stderr.decode('utf-8', errors='ignore')}")

        return out_path

audio_studio_manager = AudioStudioManager()
