"""
GnomeAI Backend Package
Domain-driven AI assistant backend for Linux / GNOME desktop automation.
"""

from gnomeai_backend.core import (
    SessionManager, get_active_session_id, set_active_session_id, get_session_path, save_session, load_session, create_session, init_sessions,
    LearningsManager, detect_system_info, load_learnings, save_learnings, extract_learnings_from_session,
    WorkspaceManager, workspace_manager
)
from gnomeai_backend.llm import (
    InbuiltLLMEngine, get_status, set_status, load_inbuilt_llm, unload_inbuilt_llm, init_inbuilt_llm_async, query_inbuilt_llm_stream, get_system_specs,
    query_llm_stream, query_llm,
    LLMModelManager, VoiceModelManager, ImageModelManager
)
from gnomeai_backend.audio import (
    Qwen3TTSManager, qwen_tts_manager,
    OpenVINOTTSManager, ov_tts_manager,
    STTManager, stt_manager,
    TTSWorker, tts_worker,
    MPRISManager, mpris_manager
)
from gnomeai_backend.tools import (
    run_command, read_file, write_file, update_file, list_dir,
    control_system, fetch_url, search_web, git_status, git_diff,
    execute_tool, parse_tool_call, get_cpu_usage, get_ram_usage,
    get_system_uptime, get_volume_status,
    MCPServerConnection, MCPClientManager, mcp_manager,
    LocalEmbedder, RAGManager, rag_manager,
    SkillsManager, init_skills, load_skills, save_skill, delete_skill, get_skill_code, update_skill_code, match_skill_local
)
from gnomeai_backend.vision import enhance_image_prompt, run_stable_diffusion
from gnomeai_backend.agents import run_agent_turn, run_code_agent_turn, run_story_reader_turn, run_subagent
from gnomeai_backend.api.server import app, run_server

__all__ = [
    "SessionManager", "get_active_session_id", "set_active_session_id", "get_session_path", "save_session", "load_session", "create_session", "init_sessions",
    "LearningsManager", "detect_system_info", "load_learnings", "save_learnings", "extract_learnings_from_session",
    "WorkspaceManager", "workspace_manager",
    "InbuiltLLMEngine", "get_status", "set_status", "load_inbuilt_llm", "unload_inbuilt_llm", "init_inbuilt_llm_async", "query_inbuilt_llm_stream", "get_system_specs",
    "query_llm_stream", "query_llm",
    "LLMModelManager", "VoiceModelManager", "ImageModelManager",
    "Qwen3TTSManager", "qwen_tts_manager",
    "OpenVINOTTSManager", "ov_tts_manager",
    "STTManager", "stt_manager",
    "TTSWorker", "tts_worker",
    "MPRISManager", "mpris_manager",
    "run_command", "read_file", "write_file", "update_file", "list_dir",
    "control_system", "fetch_url", "search_web", "git_status", "git_diff",
    "execute_tool", "parse_tool_call", "get_cpu_usage", "get_ram_usage",
    "get_system_uptime", "get_volume_status",
    "MCPServerConnection", "MCPClientManager", "mcp_manager",
    "LocalEmbedder", "RAGManager", "rag_manager",
    "SkillsManager", "init_skills", "load_skills", "save_skill", "delete_skill", "get_skill_code", "update_skill_code", "match_skill_local",
    "enhance_image_prompt", "run_stable_diffusion",
    "run_agent_turn", "run_code_agent_turn", "run_story_reader_turn", "run_subagent",
    "app", "run_server"
]
