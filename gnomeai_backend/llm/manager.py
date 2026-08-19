import os
import shutil
import threading
from gnomeai_backend.config import app_settings, save_settings

def get_dir_size(path):
    total = 0
    if os.path.exists(path):
        if os.path.isdir(path):
            for root, _, files in os.walk(path):
                for f in files:
                    fp = os.path.join(root, f)
                    try:
                        total += os.path.getsize(fp)
                    except Exception:
                        pass
        else:
            try:
                total = os.path.getsize(path)
            except Exception:
                pass
    return total

class LLMModelManager:
    """Manages LLM model paths, GGUF import/discovery, and disk cache deletion."""

    @staticmethod
    def resolve_gguf_path(model_id):
        if not model_id.endswith(".gguf"):
            return model_id
        if os.path.exists(model_id):
            return os.path.abspath(model_id)
        
        custom_models = app_settings.get("gguf_models", {})
        if model_id in custom_models and os.path.exists(custom_models[model_id]):
            return custom_models[model_id]

        clean_id = model_id.lstrip("/")
        user_home = os.path.expanduser("~")
        candidates = [
            os.path.join(user_home, ".cache", "lm-studio", "models", clean_id),
            os.path.join(user_home, ".lmstudio", "models", clean_id),
            os.path.join(user_home, ".var", "app", "ai.lmstudio.lm-studio", ".lmstudio", "models", clean_id),
            os.path.join(user_home, "Codes", "localAI", "models", clean_id)
        ]
        for candidate in candidates:
            if os.path.exists(candidate):
                return candidate

        search_roots = [
            os.path.join(user_home, ".cache", "lm-studio", "models"),
            os.path.join(user_home, ".lmstudio", "models"),
            os.path.join(user_home, ".var", "app", "ai.lmstudio.lm-studio", ".lmstudio", "models"),
            os.path.join(user_home, "Codes", "localAI", "models")
        ]
        base_filename = os.path.basename(model_id)
        for root_dir in search_roots:
            if os.path.exists(root_dir):
                for root, _, files in os.walk(root_dir):
                    if base_filename in files:
                        return os.path.join(root, base_filename)

        return model_id

    @staticmethod
    def get_available_inbuilt_models():
        models = []
        base_dir = os.path.expanduser("~/.cache/gnomeai/llm")
        if os.path.exists(base_dir):
            for name in os.listdir(base_dir):
                dir_path = os.path.join(base_dir, name)
                if os.path.isdir(dir_path):
                    xml_path = os.path.join(dir_path, "openvino_model.xml")
                    if os.path.exists(xml_path):
                        id_txt = os.path.join(dir_path, "model_id.txt")
                        if os.path.exists(id_txt):
                            try:
                                with open(id_txt, "r") as f:
                                    model_id = f.read().strip()
                                    if model_id and model_id not in models:
                                        models.append(model_id)
                                        continue
                            except:
                                pass
                        reconstructed = name
                        if name.endswith("_ov"):
                            reconstructed = name[:-3]
                        if reconstructed not in models:
                            models.append(reconstructed)
        return models

    @staticmethod
    def get_lms_available():
        models = []
        custom_models = app_settings.get("gguf_models", {})
        
        def is_likely_llm(filename):
            fn_lower = filename.lower()
            for kw in ["image", "diffusion", "sd15", "sdxl", "schnell", "flux1"]:
                if kw in fn_lower:
                    return False
            return True

        for name, path in custom_models.items():
            if os.path.exists(path) and name not in models:
                if is_likely_llm(name):
                    models.append(name)
        try:
            user_home = os.path.expanduser("~")
            search_paths = [
                os.path.join(user_home, ".cache", "lm-studio", "models"),
                os.path.join(user_home, ".lmstudio", "models")
            ]
            for path in search_paths:
                if os.path.exists(path):
                    for root, dirs, files in os.walk(path):
                        for file in files:
                            if file.endswith(".gguf"):
                                rel_path = os.path.relpath(os.path.join(root, file), path)
                                if rel_path not in models:
                                    if is_likely_llm(rel_path):
                                        models.append(rel_path)
        except Exception as d_err:
            print(f"Error scanning LM Studio directories: {d_err}")
        return models

    @staticmethod
    def import_gguf_model(filepath):
        if not filepath or not os.path.exists(filepath):
            raise ValueError("Specified GGUF file does not exist.")
        if not filepath.endswith(".gguf"):
            raise ValueError("Only .gguf files are supported for import.")
        
        filename = os.path.basename(filepath)
        gguf_models = app_settings.get("gguf_models", {})
        gguf_models[filename] = os.path.abspath(filepath)
        app_settings["gguf_models"] = gguf_models
        save_settings()
        return filename

    @staticmethod
    def delete_model_cache(model_id):
        if model_id.endswith(".gguf"):
            return True
        cache_dir = os.path.expanduser(f"~/.cache/gnomeai/llm/{model_id.lower().replace('/', '_').replace('-', '_')}_ov")
        if os.path.exists(cache_dir):
            shutil.rmtree(cache_dir)
            return True
        return False

class VoiceModelManager:
    @staticmethod
    def get_status():
        from gnomeai_backend.audio.openvino_tts import MODEL_CACHE_DIR, ov_tts_manager
        
        base_dir = "/home/master/Codes/linux Scripts/GnomeAi"
        kokoro_path1 = os.path.join(base_dir, "kokoro.onnx")
        kokoro_path2 = os.path.join(MODEL_CACHE_DIR, "kokoro-v0_19.onnx")
        kokoro_downloaded = os.path.exists(kokoro_path1) or os.path.exists(kokoro_path2)
        kokoro_size = 0
        if os.path.exists(kokoro_path1):
            kokoro_size = os.path.getsize(kokoro_path1)
        elif os.path.exists(kokoro_path2):
            kokoro_size = os.path.getsize(kokoro_path2)
            
        openvoice_dir = os.path.join(MODEL_CACHE_DIR, "openvoice")
        openvoice_downloaded = False
        openvoice_size = 0
        if os.path.exists(openvoice_dir):
            for root, _, files in os.walk(openvoice_dir):
                for f in files:
                    if f.endswith(".onnx"):
                        openvoice_downloaded = True
                    openvoice_size += os.path.getsize(os.path.join(root, f))

        gpt_sovits_dir = os.path.join(MODEL_CACHE_DIR, "gpt_sovits")
        gpt_sovits_downloaded = False
        gpt_sovits_size = 0
        if os.path.exists(gpt_sovits_dir):
            gpt_has_gpt = False
            gpt_has_sovits = False
            for root, _, files in os.walk(gpt_sovits_dir):
                for f in files:
                    if f == "gpt.onnx":
                        gpt_has_gpt = True
                    elif f == "sovits.onnx":
                        gpt_has_sovits = True
                    gpt_sovits_size += os.path.getsize(os.path.join(root, f))
            gpt_sovits_downloaded = gpt_has_gpt and gpt_has_sovits

        device = ov_tts_manager.device
        
        return [
            {
                "id": "kokoro",
                "name": "Kokoro-TTS",
                "downloaded": kokoro_downloaded,
                "size_bytes": kokoro_size,
                "device": "CPU/iGPU" if kokoro_downloaded else "N/A"
            },
            {
                "id": "openvoice",
                "name": "OpenVoice V2 Tone Converter",
                "downloaded": openvoice_downloaded,
                "size_bytes": openvoice_size,
                "device": device if openvoice_downloaded else "N/A"
            },
            {
                "id": "gpt_sovits",
                "name": "GPT-SoVITS v2 Zero-Shot",
                "downloaded": gpt_sovits_downloaded,
                "size_bytes": gpt_sovits_size,
                "device": device if gpt_sovits_downloaded else "N/A"
            }
        ]

    @staticmethod
    def delete_model(model_id):
        from gnomeai_backend.audio.openvino_tts import MODEL_CACHE_DIR, ov_tts_manager
        if model_id in ov_tts_manager.compiled_models:
            del ov_tts_manager.compiled_models[model_id]
            
        if model_id == "kokoro":
            kokoro_path = os.path.join(MODEL_CACHE_DIR, "kokoro-v0_19.onnx")
            if os.path.exists(kokoro_path):
                os.remove(kokoro_path)
        elif model_id == "openvoice":
            openvoice_dir = os.path.join(MODEL_CACHE_DIR, "openvoice")
            if os.path.exists(openvoice_dir):
                shutil.rmtree(openvoice_dir)
        elif model_id == "gpt_sovits":
            gpt_sovits_dir = os.path.join(MODEL_CACHE_DIR, "gpt_sovits")
            if os.path.exists(gpt_sovits_dir):
                shutil.rmtree(gpt_sovits_dir)

    @staticmethod
    def download_model(model_id):
        from gnomeai_backend.audio.openvino_tts import ov_tts_manager
        def background_load():
            try:
                if model_id == "kokoro":
                    ov_tts_manager.load_kokoro()
                elif model_id == "openvoice":
                    ov_tts_manager.load_openvoice()
                elif model_id == "gpt_sovits":
                    ov_tts_manager.load_gpt_sovits()
            except Exception as e:
                print(f"[Voice Download Error] Failed to load/download {model_id}: {e}", flush=True)
                
        threading.Thread(target=background_load, daemon=True).start()

class ImageModelManager:
    AVAILABLE_IMAGE_MODELS = [
        {"id": "runwayml/stable-diffusion-v1-5", "name": "Stable Diffusion v1.5 (Standard & Fast)", "type": "SD 1.5"},
        {"id": "Lykon/dreamshaper-8", "name": "DreamShaper v8 (Artistic & Oil Painting Master)", "type": "SD 1.5 Fine-tuned"},
        {"id": "stablediffusionapi/realistic-vision-v51", "name": "Realistic Vision v5.1 (Photorealistic Portraits)", "type": "SD 1.5 Fine-tuned"},
        {"id": "stabilityai/stable-diffusion-xl-base-1.0", "name": "Stable Diffusion XL 1.0 (High Resolution & Detail)", "type": "SDXL"},
        {"id": "black-forest-labs/FLUX.1-schnell", "name": "FLUX.1 Schnell (State-of-the-Art Speed & Quality)", "type": "FLUX"},
        {"id": "microsoft/Mage-Flow", "name": "Microsoft Mage-Flow (4B Native-Res MMDiT)", "type": "MAGE"},
        {"id": "microsoft/Mage-Flow-Turbo", "name": "Microsoft Mage-Flow-Turbo (Fast 4-Step Generation)", "type": "MAGE Turbo"},
        {"id": "microsoft/Mage-Flow-Edit", "name": "Microsoft Mage-Flow-Edit (Instruction Image Editing)", "type": "MAGE Edit"},
        {"id": "microsoft/Mage-Flow-Edit-Turbo", "name": "Microsoft Mage-Flow-Edit-Turbo (Fast 4-Step Editing)", "type": "MAGE Edit Turbo"}
    ]

    @classmethod
    def get_status(cls):
        status_list = []
        try:
            import openvino as ov
            core = ov.Core()
            devices = core.available_devices
            device = "GPU" if "GPU" in devices else "CPU"
        except Exception:
            device = "CPU"
            
        for m in cls.AVAILABLE_IMAGE_MODELS:
            model_id = m["id"]
            safe_name = model_id.replace("/", "_").replace("\\", "_")
            ov_cache_dir = os.path.expanduser(f"~/.cache/gnomeai/{safe_name}-ov")
            
            parts = model_id.split("/")
            hf_cache_dir = None
            if len(parts) == 2:
                author, name = parts
                hf_cache_dir = os.path.expanduser(f"~/.cache/huggingface/hub/models--{author}--{name}")
                
            ov_exists = os.path.exists(ov_cache_dir)
            hf_exists = hf_cache_dir is not None and os.path.exists(hf_cache_dir)
            
            ov_size = get_dir_size(ov_cache_dir) if ov_exists else 0
            hf_size = get_dir_size(hf_cache_dir) if hf_exists else 0
            
            downloaded = ov_exists or hf_exists
            status_list.append({
                "id": model_id,
                "name": m["name"],
                "type": m["type"],
                "downloaded": downloaded,
                "ov_exists": ov_exists,
                "hf_exists": hf_exists,
                "ov_size_bytes": ov_size,
                "hf_size_bytes": hf_size,
                "device": device if downloaded else "N/A"
            })
        return status_list

    @staticmethod
    def delete_model(model_id):
        safe_name = model_id.replace("/", "_").replace("\\", "_")
        ov_cache_dir = os.path.expanduser(f"~/.cache/gnomeai/{safe_name}-ov")
        
        parts = model_id.split("/")
        hf_cache_dir = None
        if len(parts) == 2:
            author, name = parts
            hf_cache_dir = os.path.expanduser(f"~/.cache/huggingface/hub/models--{author}--{name}")
            
        if os.path.exists(ov_cache_dir):
            shutil.rmtree(ov_cache_dir)
        if hf_cache_dir and os.path.exists(hf_cache_dir):
            shutil.rmtree(hf_cache_dir)

    @staticmethod
    def clear_pytorch_cache(model_id):
        parts = model_id.split("/")
        hf_cache_dir = None
        if len(parts) == 2:
            author, name = parts
            hf_cache_dir = os.path.expanduser(f"~/.cache/huggingface/hub/models--{author}--{name}")
            
        if hf_cache_dir and os.path.exists(hf_cache_dir):
            shutil.rmtree(hf_cache_dir)
            return True
        return False

    @staticmethod
    def download_model(model_id):
        def background_export():
            try:
                model_id_lower = model_id.lower()
                safe_name = model_id.replace("/", "_").replace("\\", "_")
                cache_dir = os.path.expanduser(f"~/.cache/gnomeai/{safe_name}-ov")
                
                if "flux" in model_id_lower:
                    from optimum.intel import OVFluxPipeline
                    ov_text_class = OVFluxPipeline
                elif "mage" in model_id_lower:
                    from optimum.intel import OVStableDiffusionPipeline
                    ov_text_class = OVStableDiffusionPipeline
                elif "xl" in model_id_lower:
                    from optimum.intel import OVStableDiffusionXLPipeline
                    ov_text_class = OVStableDiffusionXLPipeline
                else:
                    from optimum.intel import OVStableDiffusionPipeline
                    ov_text_class = OVStableDiffusionPipeline
                    
                print(f"[Image Pre-Download] Starting background Optimum OpenVINO export for: {model_id}", flush=True)
                pipe = ov_text_class.from_pretrained(model_id, export=True, compile=False)
                pipe.save_pretrained(cache_dir)
                print(f"[Image Pre-Download] Export finished and saved to: {cache_dir}", flush=True)
            except Exception as e:
                print(f"[Image Pre-Download Error] Failed to export {model_id}: {e}", flush=True)
                
        threading.Thread(target=background_export, daemon=True).start()
