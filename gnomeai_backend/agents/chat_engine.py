import os
import re
import json
import subprocess
import traceback
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, Any, List, Optional
from gnomeai_backend.config import app_settings
from gnomeai_backend.llm.client import query_llm, query_llm_stream
from gnomeai_backend.tools import skills as skills_manager
from gnomeai_backend.core.learnings import load_learnings
from gnomeai_backend.tools.rag import rag_manager
from gnomeai_backend.audio import audio_studio_manager

class StreamParser:
    """Encapsulates parsing of streaming tokens, reasoning tags, JSON, and code blocks."""

    @staticmethod
    def extract_json(text: str) -> Optional[Any]:
        if not text:
            return None
        text_clean = re.sub(r'```json\s*(.*?)\s*```', r'\1', text, flags=re.DOTALL | re.IGNORECASE)
        text_clean = re.sub(r'```\s*(.*?)\s*```', r'\1', text_clean, flags=re.DOTALL)
        match = re.search(r'(\{.*\}|\[.*\])', text_clean, re.DOTALL)
        if match:
            try: return json.loads(match.group(1))
            except Exception: pass
        try: return json.loads(text_clean.strip())
        except Exception: return None

    @staticmethod
    def extract_python(text: str) -> str:
        match = re.search(r'```python\s*(.*?)\s*```', text, re.DOTALL | re.IGNORECASE)
        if match: return match.group(1)
        match = re.search(r'```\s*(.*?)\s*```', text, re.DOTALL)
        if match: return match.group(1)
        return text.strip()

class PromptTemplateManager:
    """Manages prompt construction, context formatting, tool definitions, and learnings injection."""

    def format_prompt(self, messages: Any) -> str:
        if isinstance(messages, list):
            prompt_text = ""
            for msg in messages:
                role = msg.get("role", "user").capitalize()
                content = msg.get("content", "")
                prompt_text += f"=== {role} ===\n{content}\n\n"
            return prompt_text.strip()
        return str(messages)

    def build_learnings_context(self, user_query: Optional[str] = None) -> str:
        learnings = load_learnings()
        dbus_facts = [
            "To control media players (MPRIS) via D-Bus commands, use: dbus-send --dest=org.mpris.MediaPlayer2.playerctl /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.PlayPause",
            "To toggle GNOME Dark Mode setting via gsettings: gsettings set org.gnome.desktop.interface color-scheme 'prefer-dark'"
        ]
        all_facts = dbus_facts + (learnings if learnings else [])
        context = "System Knowledge/Memory:\n" + "\n".join(f"- {l}" for l in all_facts) + "\n\n"
        if user_query:
            try:
                rag_results = rag_manager.search(user_query, top_n=3)
                filtered = [res for res in rag_results if res.get("score", 0.0) >= 0.15]
                if filtered:
                    context += "Relevant Local File Context (RAG):\n"
                    for res in filtered:
                        context += f"- File: {res['filename']} (Path: {res['path']})\n  Snippet: {res['snippet']}\n"
                    context += "\n"
            except Exception: pass
        return context

class ChatSessionRunner:
    """Orchestrates conversational turns, intent classification, and story reader sessions."""

    def __init__(self):
        self.parser = StreamParser()
        self.prompts = PromptTemplateManager()

    def classify_unified_intent(self, user_command: str, workspace_open: bool) -> str:
        cmd_lower = user_command.lower().strip()
        if cmd_lower.startswith(("story:", "tell a story", "read story", "dramatize story")):
            return "story_reader"
        if workspace_open and any(k in cmd_lower for k in ["code", "file", "test", "function", "class", "refactor", "bug", "workspace"]):
            return "workspace_code"
        return "chat"

prompt_manager = PromptTemplateManager()
stream_parser = StreamParser()
session_runner = ChatSessionRunner()

# Legacy alias wrappers preserving exact function imports across server.py
extract_json = stream_parser.extract_json
extract_python = stream_parser.extract_python
format_prompt = prompt_manager.format_prompt
build_learnings_context = prompt_manager.build_learnings_context
classify_unified_intent = session_runner.classify_unified_intent

ALL_TOOLS = {
    "git_status": {"description": "Retrieve current Git status.", "schema": "{\n  \"tool\": \"git_status\"\n}"},
    "git_diff": {"description": "Retrieve Git diff of modified files.", "schema": "{\n  \"tool\": \"git_diff\"\n}"},
    "search_web": {"description": "Perform web search query.", "schema": "{\n  \"tool\": \"search_web\", \"arguments\": {\"query\": \"\"}\n}"},
    "read_file": {"description": "Read file contents.", "schema": "{\n  \"tool\": \"read_file\", \"arguments\": {\"path\": \"\"}\n}"},
    "write_file": {"description": "Write file contents.", "schema": "{\n  \"tool\": \"write_file\", \"arguments\": {\"path\": \"\", \"content\": \"\"}\n}"},
    "list_dir": {"description": "List directory files.", "schema": "{\n  \"tool\": \"list_dir\", \"arguments\": {\"path\": \"\"}\n}"},
    "run_command": {"description": "Execute bash command.", "schema": "{\n  \"tool\": \"run_command\", \"arguments\": {\"command\": \"\"}\n}"}
}

def get_relevant_tools_context(user_query):
    query_lower = user_query.lower()
    selected_tools = []
    if "git" in query_lower: selected_tools.append("git_status")
    if "diff" in query_lower: selected_tools.append("git_diff")
    if any(k in query_lower for k in ["search", "web", "google"]): selected_tools.append("search_web")
    if any(k in query_lower for k in ["read", "cat", "view"]): selected_tools.append("read_file")
    if any(k in query_lower for k in ["write", "create file"]): selected_tools.append("write_file")
    if any(k in query_lower for k in ["list", "ls", "dir"]): selected_tools.append("list_dir")
    if any(k in query_lower for k in ["run", "cmd", "command", "bash"]): selected_tools.append("run_command")
    if not selected_tools: return ""
    tool_text = "You have access to the following tools:\n\n"
    for name in selected_tools:
        tool_text += f"Tool: {name}\nDescription: {ALL_TOOLS[name]['description']}\nFormat:\n```json\n{ALL_TOOLS[name]['schema']}\n```\n\n"
    return tool_text

def run_chat_engine_stream(messages, session_id=None):
    yield {"type": "status", "message": "💬 Processing chat response..."}
    try:
        for chunk in query_llm_stream(messages):
            yield chunk
    except Exception as e:
        yield {"type": "error", "message": str(e)}

run_agent_turn = run_chat_engine_stream
active_auth_events = {}

def run_story_reader_turn(user_command, session_id=None):
    yield {"type": "status", "message": "📖 Story Reader Mode active..."}
    yield {"type": "chat_response", "content": f"Processing story request: {user_command}"}

def refine_story_script(script_data: dict, comment: str, session_id=None) -> dict:
    return script_data

def rule_based_story_diarizer(text: str) -> list:
    return [{"speaker": "Narrator", "text": text}]

def generate_ambient_track(mood: str, duration_ms: int):
    return None

def generate_sfx_segment(sfx_name: str):
    return None

def change_audio_speed(segment, speed=1.0):
    return segment

def generate_next_prompt_suggestions(user_message, assistant_response):
    return [
        f"Tell me more about {user_message[:20]}...",
        "Can you explain this step by step?",
        "What are the next actions?"
    ]
