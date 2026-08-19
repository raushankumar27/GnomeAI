import os
import sys
import gc
import threading
import time
import queue
import subprocess

class OutputRedirector:
    def __init__(self, filepath):
        self.filepath = filepath
        self.file = None
        self.old_stdout = None
        self.old_stderr = None

    def __enter__(self):
        os.makedirs(os.path.dirname(self.filepath), exist_ok=True)
        self.file = open(self.filepath, "w", buffering=1, encoding="utf-8")
        self.old_stdout = sys.stdout
        self.old_stderr = sys.stderr
        sys.stdout = self
        sys.stderr = self
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        sys.stdout = self.old_stdout
        sys.stderr = self.old_stderr
        if self.file:
            self.file.close()

    def write(self, data):
        if self.file and not self.file.closed:
            try:
                self.file.write(data)
            except (ValueError, OSError):
                pass
        if self.old_stdout:
            try:
                self.old_stdout.write(data)
            except (ValueError, OSError):
                pass

    def flush(self):
        if self.file and not self.file.closed:
            try:
                self.file.flush()
            except (ValueError, OSError):
                pass
        if self.old_stdout:
            try:
                self.old_stdout.flush()
            except (ValueError, OSError):
                pass

status_lock = threading.Lock()
status_state = {
    "stage": "idle",
    "message": "Inbuilt LLM is ready.",
    "progress_pct": None
}

loaded_model = None
loaded_tokenizer = None
current_model_id = None

class InbuiltLLMEngine:
    """Core LLM model loading, compilation, device detection, and execution engine."""

    @staticmethod
    def get_status():
        with status_lock:
            return status_state.copy()

    @staticmethod
    def set_status(stage, message, progress_pct=None):
        with status_lock:
            status_state["stage"] = stage
            status_state["message"] = message
            status_state["progress_pct"] = progress_pct
            print(f"[Inbuilt LLM Status] {stage}: {message} ({progress_pct or 0}%)")

    @staticmethod
    def get_model_cache_dir(model_id):
        slug = model_id.lower().replace("/", "_").replace("-", "_")
        return os.path.expanduser(f"~/.cache/gnomeai/llm/{slug}_ov")

    @staticmethod
    def detect_device(model_id):
        from gnomeai_backend.config import app_settings
        pref = app_settings.get("inbuilt_device", "auto")
        import openvino as ov
        core = ov.Core()
        devices = core.available_devices
        
        if pref != "auto" and pref.upper() in [d.upper() for d in devices]:
            for d in devices:
                if d.upper() == pref.upper():
                    return d

        if "GPU" in devices:
            return "GPU"
        if "NPU" in devices:
            return "NPU"
        return "CPU"

    @staticmethod
    def resolve_gguf_path(model_id):
        import urllib.parse
        model_id = urllib.parse.unquote(model_id)
        from gnomeai_backend.llm.manager import LLMModelManager
        return LLMModelManager.resolve_gguf_path(model_id)

    @staticmethod
    def get_available_inbuilt_models():
        from gnomeai_backend.llm.manager import LLMModelManager
        return LLMModelManager.get_available_inbuilt_models()

    @staticmethod
    def load_inbuilt_llm(model_id, force=False):
        import urllib.parse
        model_id = urllib.parse.unquote(model_id)
        global loaded_model, loaded_tokenizer, current_model_id
        
        if loaded_model is not None and current_model_id == model_id and not force:
            return True

        InbuiltLLMEngine.unload_inbuilt_llm()
        device = InbuiltLLMEngine.detect_device(model_id)
        
        with OutputRedirector(os.path.expanduser("~/.cache/gnomeai/load.log")):
            try:
                actual_path = InbuiltLLMEngine.resolve_gguf_path(model_id)
                if actual_path.endswith(".gguf") and os.path.exists(actual_path):
                    import openvino_genai as ov_genai
                    InbuiltLLMEngine.set_status("compiling", f"Loading GGUF model: {os.path.basename(actual_path)} on {device}...")
                    
                    try:
                        pipe = ov_genai.LLMPipeline(actual_path, device)
                        loaded_model = pipe
                        loaded_tokenizer = None
                        current_model_id = model_id
                        InbuiltLLMEngine.set_status("ready", f"Model {os.path.basename(actual_path)} successfully loaded on OpenVINO ({device})!")
                        return True
                    except Exception as ov_err:
                        print(f"OpenVINO GenAI failed to load {actual_path} on {device}: {ov_err}")
                        if device == "NPU":
                            import openvino as ov
                            core = ov.Core()
                            if "GPU" in core.available_devices:
                                print("NPU load failed. Retrying on GPU via OpenVINO GenAI...")
                                InbuiltLLMEngine.set_status("compiling", "NPU failed. Retrying GGUF model on GPU...")
                                try:
                                    pipe = ov_genai.LLMPipeline(actual_path, "GPU")
                                    loaded_model = pipe
                                    loaded_tokenizer = None
                                    current_model_id = model_id
                                    InbuiltLLMEngine.set_status("ready", f"Model {os.path.basename(actual_path)} successfully loaded on OpenVINO (GPU) after NPU fail!")
                                    return True
                                except Exception as gpu_err:
                                    print(f"OpenVINO GenAI failed to load {actual_path} on GPU: {gpu_err}")
                        
                        from gnomeai_backend.config import app_settings
                        import llama_cpp
                        specs = get_system_specs()
                        threads = specs.get("recommended_threads", 4)
                        context_limit = int(app_settings.get('context_limit', specs.get("recommended_context_limit", 2048)))
                        
                        InbuiltLLMEngine.set_status("compiling", f"Loading model via llama.cpp (GPU offload, ctx={context_limit})...")
                        model = llama_cpp.Llama(
                            model_path=actual_path,
                            n_ctx=context_limit,
                            n_threads=threads,
                            n_gpu_layers=-1
                        )
                        loaded_model = model
                        loaded_tokenizer = None
                        current_model_id = model_id
                        InbuiltLLMEngine.set_status("ready", f"Model {os.path.basename(actual_path)} loaded via llama.cpp on GPU!")
                        return True
                    
                from optimum.intel import OVModelForCausalLM
                from transformers import AutoTokenizer
                
                cache_dir = InbuiltLLMEngine.get_model_cache_dir(model_id)
                xml_path = os.path.join(cache_dir, "openvino_model.xml")
                
                if not os.path.exists(xml_path):
                    raise FileNotFoundError(f"Model {model_id} is not compiled yet. Please compile it first.")

                InbuiltLLMEngine.set_status("compiling", f"Compiling model for device: {device}...")
                tokenizer = AutoTokenizer.from_pretrained(cache_dir)
                try:
                    if device == "NPU":
                        model = OVModelForCausalLM.from_pretrained(cache_dir, device=device, compile=False)
                        from gnomeai_backend.config import app_settings
                        specs = get_system_specs()
                        context_limit = int(app_settings.get('context_limit', specs.get("recommended_context_limit", 2048)))
                        print(f"[NPU Compile] Reshaping model input to static shape: batch_size=1, sequence_length={context_limit}")
                        model.reshape(1, context_limit)
                        model.compile()
                    else:
                        model = OVModelForCausalLM.from_pretrained(cache_dir, device=device, compile=True)
                except Exception as device_err:
                    print(f"Failed to load model {model_id} on {device}: {device_err}")
                    if device == "NPU":
                        import openvino as ov
                        core = ov.Core()
                        if "GPU" in core.available_devices:
                            print("NPU load failed. Retrying on GPU...")
                            InbuiltLLMEngine.set_status("compiling", "NPU failed. Retrying model on GPU...")
                            try:
                                model = OVModelForCausalLM.from_pretrained(cache_dir, device="GPU", compile=True)
                                loaded_model = model
                                loaded_tokenizer = tokenizer
                                current_model_id = model_id
                                InbuiltLLMEngine.set_status("ready", f"Model {model_id} successfully loaded on GPU after NPU fail!")
                                return True
                            except Exception as gpu_err:
                                print(f"Failed to load model on GPU: {gpu_err}")
                                device_err = gpu_err
                    
                    import shutil
                    if os.path.exists(cache_dir):
                        try:
                            shutil.rmtree(cache_dir)
                        except Exception as rm_err:
                            print(f"Failed to delete {cache_dir}: {rm_err}")
                    raise RuntimeError(f"Model failed to load/compile on NPU/GPU: {device_err}")
                
                loaded_model = model
                loaded_tokenizer = tokenizer
                current_model_id = model_id
                
                InbuiltLLMEngine.set_status("ready", f"Model {model_id} successfully loaded on {device}!")
                return True
                
            except Exception as e:
                import traceback
                traceback.print_exc()
                InbuiltLLMEngine.set_status("error", f"Failed to initialize local LLM: {str(e)}")
                InbuiltLLMEngine.unload_inbuilt_llm(keep_error_status=True)
                return False

    @staticmethod
    def unload_inbuilt_llm(keep_error_status=False):
        global loaded_model, loaded_tokenizer, current_model_id
        if loaded_model is not None or keep_error_status:
            if not keep_error_status:
                InbuiltLLMEngine.set_status("idle", "Unloading current model...")
                
            if loaded_model is not None:
                try: del loaded_model
                except: pass
            if loaded_tokenizer is not None:
                try: del loaded_tokenizer
                except: pass
                    
            loaded_model = None
            loaded_tokenizer = None
            current_model_id = None
            gc.collect()
            
            if not keep_error_status:
                InbuiltLLMEngine.set_status("idle", "Inbuilt LLM is offline.")

    @staticmethod
    def init_inbuilt_llm_async(model_id, force=False):
        thread = threading.Thread(
            target=InbuiltLLMEngine.load_inbuilt_llm,
            args=(model_id, force),
            daemon=True
        )
        thread.start()

query_lock = threading.Lock()

def query_inbuilt_llm_stream(messages, temperature=0.1, max_tokens=None):
    global loaded_model, loaded_tokenizer
    
    with query_lock:
        if loaded_model is None:
            raise Exception("Inbuilt LLM is not initialized. Please load a model first.")

    try:
        import llama_cpp
        is_llama_cpp = isinstance(loaded_model, llama_cpp.Llama)
    except ImportError:
        is_llama_cpp = False

    if is_llama_cpp:
        try:
            loaded_model.reset()
        except Exception as reset_err:
            print(f"Failed to reset model KV cache: {reset_err}")
            
        chat_completion = loaded_model.create_chat_completion(
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens or 1024,
            stream=True
        )
        for chunk in chat_completion:
            delta = chunk['choices'][0]['delta']
            if 'content' in delta:
                yield delta['content']
        return

    try:
        import openvino_genai as ov_genai
        is_genai = isinstance(loaded_model, ov_genai.LLMPipeline)
    except ImportError:
        is_genai = False

    if is_genai:
        q = queue.Queue()

        class QueueStreamer(ov_genai.StreamerBase):
            def __init__(self):
                super().__init__()
            def write(self, subword: str):
                q.put(subword)
                return False
            def end(self):
                q.put(None)

        streamer = QueueStreamer()
        config = ov_genai.GenerationConfig()
        config.max_new_tokens = max_tokens or 1024
        config.temperature = temperature or 0.1
        config.do_sample = (temperature > 0.1)

        tokenizer = loaded_model.get_tokenizer()
        try:
            prompt = tokenizer.apply_chat_template(messages, add_generation_prompt=True, tokenize=False)
        except Exception:
            prompt = ""
            for msg in messages:
                role = msg.get("role", "user")
                content = msg.get("content", "")
                prompt += f"{role.capitalize()}: {content}\n"
            prompt += "Assistant: "

        def generate_thread():
            try:
                loaded_model.generate(prompt, config, streamer)
            except Exception as e:
                print(f"GenAI generation error: {e}")
                q.put(None)

        thread = threading.Thread(target=generate_thread, daemon=True)
        thread.start()

        while True:
            token = q.get()
            if token is None:
                break
            yield token
        return

    from transformers import TextIteratorStreamer
    if loaded_tokenizer is None:
        raise Exception("Inbuilt LLM tokenizer is missing.")

    prompt = loaded_tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True
    )
    inputs = loaded_tokenizer(prompt, return_tensors="pt")
    
    streamer = TextIteratorStreamer(
        loaded_tokenizer,
        skip_prompt=True,
        skip_special_tokens=True
    )
    
    generation_kwargs = {
        **inputs,
        "streamer": streamer,
        "max_new_tokens": max_tokens or 1024,
        "temperature": temperature or 0.1,
        "do_sample": (temperature > 0.1)
    }
    
    thread = threading.Thread(
        target=loaded_model.generate,
        kwargs=generation_kwargs,
        daemon=True
    )
    thread.start()
    
    for new_text in streamer:
        if new_text:
            yield new_text

def is_model_downloaded(model_id):
    actual_path = InbuiltLLMEngine.resolve_gguf_path(model_id)
    if actual_path.endswith(".gguf") and os.path.exists(actual_path):
        return True
    cache_dir = InbuiltLLMEngine.get_model_cache_dir(model_id)
    xml_path = os.path.join(cache_dir, "openvino_model.xml")
    return os.path.exists(xml_path)

def delete_model_cache(model_id):
    from gnomeai_backend.llm.manager import LLMModelManager
    return LLMModelManager.delete_model_cache(model_id)

_CACHED_DEVICES = None

def get_system_specs():
    global _CACHED_DEVICES
    try:
        cores = os.cpu_count() or 4
        total_ram_gb = 8.0
        try:
            with open("/proc/meminfo", "r") as f:
                for line in f:
                    if "MemTotal" in line:
                        total_ram_gb = int(line.split()[1]) / (1024 * 1024)
                        break
        except Exception:
            pass

        if _CACHED_DEVICES is None:
            try:
                import openvino as ov
                core = ov.Core()
                _CACHED_DEVICES = core.available_devices
            except Exception:
                _CACHED_DEVICES = ["CPU"]
        devices = _CACHED_DEVICES
    except Exception:
        cores = 4
        total_ram_gb = 8.0
        devices = ["CPU"]

    if total_ram_gb < 6.0:
        context_limit = 512
        threads = max(1, cores // 2)
    elif total_ram_gb < 10.0:
        context_limit = 1024
        threads = max(1, cores - 2)
    elif total_ram_gb < 18.0:
        context_limit = 2048
        threads = max(1, cores - 2)
    else:
        context_limit = 4096
        threads = max(1, cores - 2)

    if cores > 1:
        threads = min(threads, cores - 1)

    return {
        "cores": cores,
        "total_ram_gb": round(total_ram_gb, 1),
        "devices": devices,
        "recommended_threads": threads,
        "recommended_context_limit": context_limit
    }

get_status = InbuiltLLMEngine.get_status
set_status = InbuiltLLMEngine.set_status
get_model_cache_dir = InbuiltLLMEngine.get_model_cache_dir
detect_device = InbuiltLLMEngine.detect_device
resolve_gguf_path = InbuiltLLMEngine.resolve_gguf_path
get_available_inbuilt_models = InbuiltLLMEngine.get_available_inbuilt_models
load_inbuilt_llm = InbuiltLLMEngine.load_inbuilt_llm
unload_inbuilt_llm = InbuiltLLMEngine.unload_inbuilt_llm
init_inbuilt_llm_async = InbuiltLLMEngine.init_inbuilt_llm_async
inbuilt_llm = InbuiltLLMEngine

