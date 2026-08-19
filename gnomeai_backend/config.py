import os
import json

SETTINGS_DIR = os.path.expanduser("~/.config/gnomeai")
os.makedirs(SETTINGS_DIR, exist_ok=True)
SETTINGS_FILE = os.path.join(SETTINGS_DIR, "settings.json")
PORT = 8095

DEFAULT_SETTINGS = {
    "lm_studio_url": "http://localhost:1234/v1",
    "model_name": "dolphin3.0-llama3.2-3b",
    "fast_model_name": "",
    "cloud_model_name": "",
    "enable_dbus_monitor": True,
    "enable_tts": True,
    "llm_backend": "inbuilt",
    "inbuilt_model_id": "Qwen/Qwen2.5-1.5B-Instruct",
    "panel_default_model": "Qwen/Qwen2.5-1.5B-Instruct",
    "gguf_models": {},
    "system_prompt": "You are GnomeAI, a helpful, intelligent Linux desktop assistant. Answer the user's questions or chat with them directly.",
    "temperature": 0.7,
    "cpu_threads": 4,
    "top_k": 40,
    "top_p": 0.95,
    "min_p": 0.05,
    "active_preset": "Default",
    "tts_speed": 1.0,
    "tts_voice": "af_sarah",
    "chat_font_size": 14.5,
    "chat_font_family": "Inter",
    "image_model_id": "runwayml/stable-diffusion-v1-5",
    "image_enable_llm_enhancer": True,
    "image_default_steps": 20,
    "image_default_width": 512,
    "image_default_height": 512
}


app_settings = DEFAULT_SETTINGS.copy()

def load_settings():
    global app_settings
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r") as f:
                saved = json.load(f)
                if isinstance(saved, dict):
                    app_settings.update(saved)
        except Exception as e:
            print(f"Error loading settings: {e}")
            
    # Ensure a fallback URL if empty
    if not app_settings.get("lm_studio_url"):
        app_settings["lm_studio_url"] = "http://localhost:1234/v1"

def save_settings():
    try:
        with open(SETTINGS_FILE, "w") as f:
            json.dump(app_settings, f, indent=4)
    except Exception as e:
        print(f"Error saving settings: {e}")

load_settings()
