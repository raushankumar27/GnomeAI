import json
import os
from gnomeai_backend.config import app_settings

def query_llm_stream(messages, temperature=0.1, max_tokens=None, model_name=None, image_path=None):
    """
    Query the local OpenVINO/llama_cpp model directly.
    Yields chunks of generated content and reasoning/thinking steps.
    """
    if image_path:
        yield {"type": "status", "message": "Inbuilt LLM does not support vision inputs. Proceeding in text-only mode."}
    from .inbuilt import query_inbuilt_llm_stream
    try:
        in_thinking = False
        for text in query_inbuilt_llm_stream(messages, temperature, max_tokens):
            if "<think>" in text:
                parts = text.split("<think>")
                if parts[0]:
                    yield {"type": "content", "text": parts[0]}
                in_thinking = True
                if len(parts) > 1 and parts[1]:
                    yield {"type": "reasoning", "text": parts[1]}
            elif "</think>" in text:
                parts = text.split("</think>")
                if parts[0]:
                    yield {"type": "reasoning", "text": parts[0]}
                in_thinking = False
                if len(parts) > 1 and parts[1]:
                    yield {"type": "content", "text": parts[1]}
            else:
                if in_thinking:
                    yield {"type": "reasoning", "text": text}
                else:
                    yield {"type": "content", "text": text}
        return
    except Exception as e:
        raise Exception(f"Inbuilt LLM query failed: {str(e)}")

def query_llm(messages, temperature=0.1, max_tokens=None, model_name=None, image_path=None):
    """
    Query the local LLM engine and return full response text.
    """
    full_text = ""
    for chunk in query_llm_stream(messages, temperature, max_tokens, model_name, image_path):
        if chunk["type"] == "content":
            full_text += chunk["text"]
    return full_text
