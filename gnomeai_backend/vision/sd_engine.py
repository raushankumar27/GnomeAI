import os
import json
import uuid
from PIL import Image

os.environ["VF_HF_ATTN_IMPL"] = "sdpa"

from gnomeai_backend.config import app_settings

def enhance_image_prompt(raw_prompt):
    """Enhances user prompt using LLM if available, otherwise uses smart heuristic fallback."""
    if not raw_prompt or not raw_prompt.strip():
        return raw_prompt

    from gnomeai_backend.llm.client import query_llm
    messages = [
        {"role": "system", "content": "You are an expert AI prompt engineer for image generation models (like Stable Diffusion). Enhance the user's short prompt into a vivid, descriptive prompt detailing lighting, art style, subject details, and composition. Output ONLY the final enhanced prompt text, without quotes, conversational text, or prefixes."},
        {"role": "user", "content": f"Enhance this prompt for image generation: {raw_prompt}"}
    ]
    try:
        enhanced = query_llm(messages, max_tokens=120)
        if enhanced and len(enhanced.strip()) > 5:
            return enhanced.strip().strip('"').strip("'")
    except Exception as e:
        print(f"LLM Prompt enhancer note ({e}). Falling back to heuristic prompt expansion.")

    modifiers = [
        "highly detailed",
        "dramatic atmospheric lighting",
        "cinematic 8k composition",
        "sharp focus",
        "unreal engine 5 render",
        "masterpiece"
    ]
    lowered = raw_prompt.lower()
    to_add = [m for m in modifiers if m.lower() not in lowered]
    if to_add:
        return f"{raw_prompt.strip().rstrip('.')}, {', '.join(to_add[:4])}"
    return raw_prompt

def get_pytorch_device_and_dtype():
    import torch
    if torch.cuda.is_available():
        return "cuda", torch.float16
    elif hasattr(torch, "xpu") and torch.xpu.is_available():
        return "xpu", torch.float16
    else:
        return "cpu", torch.float32

def _load_pytorch_pipeline(torch_class, model_id, device, dtype):
    class_name = getattr(torch_class, "__name__", str(torch_class))
    if class_name == "MageFlowPipeline":
        return torch_class.from_pretrained(model_id, device=device)
    elif "Flux" in class_name:
        return torch_class.from_pretrained(model_id, torch_dtype=dtype)
    else:
        return torch_class.from_pretrained(
            model_id,
            torch_dtype=dtype,
            safety_checker=None,
            requires_safety_checker=False,
            trust_remote_code=True
        )

def run_stable_diffusion(
    prompt, steps=None, width=None, height=None, input_image_path=None, strength=0.75, model_id=None,
    cancel_event=None, progress_callback=None
):
    """
    Dedicated image generation engine with step cancellation & progress reporting.
    Generates images locally using OpenVINO (GPU/NPU/CPU) or PyTorch Diffusers fallback.
    Saves output to ~/Pictures or ~ and returns absolute image path.
    """
    steps = steps or app_settings.get("image_default_steps", 20)
    width = width or app_settings.get("image_default_width", 512)
    height = height or app_settings.get("image_default_height", 512)
    model_id = model_id or app_settings.get("image_model_id", "runwayml/stable-diffusion-v1-5")

    model_id_lower = model_id.lower()
    safe_name = model_id.replace("/", "_").replace("\\", "_")
    cache_dir = os.path.expanduser(f"~/.cache/gnomeai/{safe_name}-ov")

    def handle_step(step):
        if cancel_event and cancel_event.is_set():
            print(f"[SD Engine] Generation cancelled at step {step + 1}/{steps}", flush=True)
            raise RuntimeError("Job cancelled by user")
        if progress_callback:
            try:
                progress_callback((step + 1) / float(steps))
            except Exception:
                pass
    
    if "flux" in model_id_lower:
        from optimum.intel import OVFluxPipeline
        ov_text_class = OVFluxPipeline
        ov_img_class = None
    elif "mage" in model_id_lower:
        try:
            from optimum.intel import OVStableDiffusionPipeline, OVStableDiffusionImg2ImgPipeline
            ov_text_class = OVStableDiffusionPipeline
            ov_img_class = OVStableDiffusionImg2ImgPipeline
        except Exception:
            ov_text_class = None
            ov_img_class = None
    elif "xl" in model_id_lower:
        from optimum.intel import OVStableDiffusionXLPipeline, OVStableDiffusionXLImg2ImgPipeline
        ov_text_class = OVStableDiffusionXLPipeline
        ov_img_class = OVStableDiffusionXLImg2ImgPipeline
    else:
        from optimum.intel import OVStableDiffusionPipeline, OVStableDiffusionImg2ImgPipeline
        ov_text_class = OVStableDiffusionPipeline
        ov_img_class = OVStableDiffusionImg2ImgPipeline

    if "flux" in model_id_lower:
        from diffusers import FluxPipeline
        torch_text_class = FluxPipeline
        torch_img_class = None
    elif "mage" in model_id_lower:
        try:
            from mage_flow import MageFlowPipeline
            torch_text_class = MageFlowPipeline
            torch_img_class = MageFlowPipeline
        except Exception:
            try:
                from diffusers import AutoPipelineForText2Image, AutoPipelineForImage2Image
                torch_text_class = AutoPipelineForText2Image
                torch_img_class = AutoPipelineForImage2Image
            except Exception:
                from diffusers import DiffusionPipeline
                torch_text_class = DiffusionPipeline
                torch_img_class = DiffusionPipeline
    elif "xl" in model_id_lower:
        from diffusers import StableDiffusionXLPipeline, StableDiffusionXLImg2ImgPipeline
        torch_text_class = StableDiffusionXLPipeline
        torch_img_class = StableDiffusionXLImg2ImgPipeline
    else:
        from diffusers import StableDiffusionPipeline, StableDiffusionImg2ImgPipeline
        torch_text_class = StableDiffusionPipeline
        torch_img_class = StableDiffusionImg2ImgPipeline

    if input_image_path and os.path.exists(input_image_path):
        if not ov_img_class:
            print(f"Img2Img is not directly supported for FLUX models. Skipping Img2Img fallback.", flush=True)
        else:
            print(f"Running Img2Img transformation pipeline ({model_id}, strength={strength}) with image: {input_image_path}", flush=True)
            init_img = Image.open(input_image_path).convert("RGB").resize((width, height))
            
            try:
                import openvino as ov
                
                if not os.path.exists(cache_dir):
                    print(f"Exporting image model '{model_id}' to OpenVINO IR for Img2Img (first time setup)...", flush=True)
                    pipe = ov_text_class.from_pretrained(model_id, export=True, compile=False)
                    pipe.save_pretrained(cache_dir)

                core = ov.Core()
                devices = core.available_devices
                device = "GPU" if "GPU" in devices else "CPU"
                
                print(f"Loading OpenVINO Img2Img pipeline ({ov_img_class.__name__}) on {device}...", flush=True)
                pipe = ov_img_class.from_pretrained(cache_dir, device=device, compile=True)
                if hasattr(pipe, "safety_checker"):
                    pipe.safety_checker = None
                    
                def ov_callback(step, timestep, latents):
                    handle_step(step)

                image = pipe(prompt, image=init_img, strength=strength, num_inference_steps=steps, callback=ov_callback, callback_steps=1).images[0]
                print("✨ OpenVINO Img2Img transformation complete!", flush=True)
            except Exception as e:
                if isinstance(e, RuntimeError) and "Job cancelled" in str(e):
                    raise e
                print(f"OpenVINO Img2Img note ({e}). Using PyTorch Diffusers Img2Img for selected model '{model_id}'...", flush=True)
                device, dtype = get_pytorch_device_and_dtype()
                pipe = _load_pytorch_pipeline(torch_img_class, model_id, device, dtype)
                if hasattr(pipe, "to"):
                    pipe = pipe.to(device)
                if hasattr(pipe, "enable_attention_slicing"):
                    pipe.enable_attention_slicing()

                def torch_callback(step, timestep, latents):
                    handle_step(step)

                if hasattr(pipe, "edit"):
                    images = pipe.edit(prompt, ref_images=[init_img], heights=[height], widths=[width], steps=steps)
                    image = images[0]
                else:
                    image = pipe(prompt, image=init_img, strength=strength, num_inference_steps=steps, callback=torch_callback, callback_steps=1).images[0]

    if not input_image_path or not os.path.exists(input_image_path):
        try:
            import openvino as ov
            from optimum.exporters.base import ExporterConfig
            
            def patched_init(self, config, task, int_dtype="int64", float_dtype="fp32"):
                self.task = task
                self._config = config
                self._normalized_config = self.__class__.NORMALIZED_CONFIG_CLASS(self._config)
                self.int_dtype = int_dtype
                self.float_dtype = float_dtype
            ExporterConfig.__init__ = patched_init
            
            core = ov.Core()
            devices = core.available_devices
            device = "GPU" if "GPU" in devices else "CPU"
            
            if not os.path.exists(cache_dir):
                print(f"Exporting '{model_id}' to OpenVINO IR (first time setup)...", flush=True)
                pipe = ov_text_class.from_pretrained(
                    model_id,
                    export=True,
                    compile=False
                )
                pipe.save_pretrained(cache_dir)
                
            print(f"Loading OpenVINO pipeline ({ov_text_class.__name__}) on {device}...", flush=True)
            pipe = ov_text_class.from_pretrained(
                cache_dir,
                device=device,
                compile=True
            )
            if hasattr(pipe, "safety_checker"):
                pipe.safety_checker = None
            
            def ov_callback(step, timestep, latents):
                handle_step(step)

            print("Starting OpenVINO image generation...", flush=True)
            if "flux" in model_id_lower:
                image = pipe(prompt, num_inference_steps=steps, width=width, height=height).images[0]
            else:
                image = pipe(prompt, num_inference_steps=steps, width=width, height=height, callback=ov_callback, callback_steps=1).images[0]
            
        except Exception as e:
            if isinstance(e, RuntimeError) and "Job cancelled" in str(e):
                raise e
            print(f"OpenVINO pipeline note ({e}). Loading selected PyTorch model engine '{model_id}'...", flush=True)
            
            device, dtype = get_pytorch_device_and_dtype()
            print(f"Loading PyTorch Diffusers model '{model_id}' on {device} ({dtype})...", flush=True)
            
            pipe = _load_pytorch_pipeline(torch_text_class, model_id, device, dtype)
            if hasattr(pipe, "to"):
                pipe = pipe.to(device)
            if hasattr(pipe, "enable_attention_slicing"):
                pipe.enable_attention_slicing()

            def torch_callback(step, timestep, latents):
                handle_step(step)

            print(f"Starting PyTorch image generation ({steps} steps)...", flush=True)
            if hasattr(pipe, "generate"):
                images = pipe.generate(prompt, heights=[height], widths=[width], steps=steps)
                image = images[0]
            elif "flux" in model_id_lower:
                image = pipe(prompt, num_inference_steps=steps, width=width, height=height).images[0]
            else:
                try:
                    image = pipe(prompt, num_inference_steps=steps, width=width, height=height, callback=torch_callback, callback_steps=1).images[0]
                except Exception as inner_e:
                    if isinstance(inner_e, RuntimeError) and "Job cancelled" in str(inner_e):
                        raise inner_e
                    image = pipe(prompt, num_inference_steps=steps, width=width, height=height).images[0]
    
    out_dir = os.path.expanduser("~/Pictures")
    if not os.path.exists(out_dir):
        out_dir = os.path.expanduser("~")
    
    dest_path = os.path.join(out_dir, f"gnomeai_{uuid.uuid4().hex[:8]}.png")
    image.save(dest_path)
    return dest_path
