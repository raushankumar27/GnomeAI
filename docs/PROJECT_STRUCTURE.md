# GnomeAI Studio - Master Project Structure & Architectural Documentation

> [!IMPORTANT]
> **LLM OPERATIONAL MANDATE & GOVERNANCE PROTOCOL**
> 1. **Single Source of Truth**: This document defines the canonical project structure, class usages, model dependencies, and feature workflows for GnomeAI Studio.
> 2. **Structural Alignment**: All AI-assisted code modifications across all sessions MUST align with the structure documented herein.
> 3. **Human Verification Requirement**: **NO structural code change** (e.g., adding/moving/renaming files, classes, modules, API routes, or modifying core schemas) may be executed without first proposing the change in this file and receiving explicit **Human Approval**.
> 4. **Post-Implementation Sync**: Whenever a structural change is approved and executed, `PROJECT_STRUCTURE.md` and `NOTES.md` MUST be updated immediately to reflect the new state of the repository.

---

## 1. Executive Summary & Tech Stack

**GnomeAI Studio** is a privacy-first, domain-driven AI assistant and desktop automation suite optimized for Linux and GNOME environments. It provides multi-modal LLM chat, autonomous code refactoring, text-to-speech (TTS), speech-to-text (STT), voice cloning, local image generation (Stable Diffusion), Model Context Protocol (MCP) tool integration, dynamic local RAG, and system telemetry monitoring.

### Tech Stack Overview
- **Host / OS Integration**: Linux D-Bus, MPRIS Media Controls, Linux Shell (`bash`), Hardware acceleration via Intel OpenVINO (CPU/NPU/iGPU), ONNX Runtime, and PyTorch.
- **Desktop Host (Electron)**: Electron (Node.js main process, IPC handlers, system tray, global hotkeys, floating Spotlight overlay bar).
- **Frontend UI Framework**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, KaTeX (math rendering), Zod (schema validation).
- **Backend AI Engine**: Python 3.10+, FastAPI (Uvicorn), Pydantic, HuggingFace Transformers, `llama-cpp-python` / OpenVINO LLM, `torchaudio`, `scipy`, `diffusers`.

---

## 2. Directory Map & File Hierarchy

```
GnomeAi/
├── PROJECT_STRUCTURE.md          # [Canonical] Master architecture & LLM governance documentation
├── NOTES.md                      # [Canonical] Development journal, changelog, and verified architecture tasks
├── main.js                       # Electron Main process (IPC handlers, desktop overlay, tray, hotkeys)
├── preload.js                    # Electron preload script (secure contextBridge API exposure)
├── overlay.html / overlay.js     # Floating Spotlight quick query desktop overlay window
├── index.html                    # Single-Page Application HTML entrypoint
├── vite.config.ts                # Vite build and dev server configuration
├── tsconfig.json                 # TypeScript compiler configuration
├── package.json                  # Node.js dependencies and desktop app scripts
├── launch.sh                     # System startup script (launches backend port 8095 & Electron UI)
├── install_npu.sh                # Setup script for Intel NPU / OpenVINO runtime dependencies
├── api_documentation.md          # OpenAPI / REST API route documentation reference
├── gnomeai_backend/              # Python FastAPI Backend Engine
│   ├── __init__.py               # Package initialization & core manager exports
│   ├── config.py                 # System configuration & setting persistence (~/.config/gnomeai/settings.json)
│   ├── agents/                   # Agent orchestration engines
│   │   ├── __init__.py           # Agent exports
│   │   ├── chat_engine.py        # Primary multi-turn streaming chat agent & tool loop
│   │   ├── code_agent.py        # Workspace-aware autonomous code agent & AST diff generator
│   │   ├── subagent.py          # Sub-task execution delegation
│   │   └── story_reader.py      # Audio storytelling & narration loop
│   ├── api/                      # Web API Layer
│   │   ├── server.py             # FastAPI server application setup & global HTTP/SSE routes
│   │   └── routers/              # Modular endpoint routers
│   │       ├── agents.py         # Subagent execution routes
│   │       ├── audio.py          # Voice synthesis, audio playback, custom voice streams
│   │       ├── mcp.py            # MCP server management endpoints
│   │       ├── models.py         # LLM, Voice, and Image model management endpoints
│   │       └── rag.py            # RAG collection indexing endpoints
│   ├── audio/                    # Speech Processing & Audio Engines
│   │   ├── __init__.py           # Audio exports
│   │   ├── openvino_tts.py       # Kokoro-v0.19 OpenVINO / ONNX fast speech synthesis
│   │   ├── qwen_tts.py           # Qwen3-TTS / CosyVoice audio synthesis manager
│   │   ├── stt.py                # Whisper speech-to-text transcription engine
│   │   ├── studio.py             # Voice cloning studio (reference audio analysis & X-Vector extraction)
│   │   ├── tts_worker.py         # Async background speech synthesis worker
│   │   ├── devanagari_stream.py  # Special text normalization stream for Hindi/Devanagari
│   │   └── mpris.py              # Linux D-Bus MPRIS media control interface
│   ├── core/                     # Core Application Managers & State Services
│   │   ├── __init__.py           # Core exports
│   │   ├── sessions.py           # Session storage (~/.config/gnomeai/sessions)
│   │   ├── learnings.py          # Long-term memory & system info extraction (~/.config/gnomeai/learnings.json)
│   │   ├── workspace.py          # Local workspace directory indexing & code symbol extractor
│   │   ├── model_manager.py      # Model downloading, NPU compiling, loading/unloading
│   │   └── jobs.py               # Asynchronous job status tracking service
│   ├── llm/                      # Large Language Model Providers & Inbuilt Inference
│   │   ├── __init__.py           # LLM exports
│   │   ├── inbuilt.py            # Local GGUF / OpenVINO / Transformers LLM execution engine
│   │   ├── client.py             # REST wrappers for external LLMs (LM Studio, Ollama, Cloud)
│   │   └── manager.py            # Unified LLM query routing manager
│   ├── tools/                    # Tool Registry & Execution Framework
│   │   ├── __init__.py           # Tool exports
│   │   ├── registry.py           # Native tool functions (bash, file edit, web search, system telemetry)
│   │   ├── mcp.py                # Model Context Protocol (MCP) client manager & server bridge
│   │   ├── rag.py                # Local SentenceTransformers document embedder & vector indexer
│   │   ├── skills.py             # Dynamic user skill execution engine
│   │   ├── image_finder.py       # Local image search & metadata tool
│   │   └── learnings_consolidator.py # Memory consolidation helper
│   └── vision/                   # Vision & Image Generation Engine
│       ├── __init__.py           # Vision exports
│       └── sd_engine.py          # Stable Diffusion (v1.5 / SDXL / OpenVINO) image generator
└── src/                          # Frontend React + TypeScript Application
    ├── main.tsx                  # React DOM root entrypoint
    ├── App.tsx                   # Main layout container, sidebar router, toasts, theme provider
    ├── types/                    # Core TypeScript interfaces & Zod validation schemas
    │   └── index.ts              # Data models (Session, Settings, ModelOption, WorkspaceFile)
    ├── context/                  # Global React State Providers
    │   ├── AppContext.tsx        # System settings, active theme, toasts, backend port state
    │   └── ChatContext.tsx       # Active session ID, session list, chat history, agent mode state
    └── components/               # UI Feature Panes & Components
        ├── Sidebar.tsx           # Primary navigation pane
        ├── ChatPane.tsx          # Multi-turn streaming chat, tool cards, diff previews, audio controls
        ├── AgentCanvasPane.tsx   # Visual multi-agent workflow graph canvas
        ├── ImageStudioPane.tsx   # Text-to-Image generation studio, prompt enhancer, gallery
        ├── VoicesPane.tsx        # Speech synthesis pane, voice selector, custom voice cloner
        ├── ModelsPane.tsx        # Model hub for downloading, NPU compiling, loading models
        ├── McpRegistryPane.tsx   # MCP server registration & dynamic tool explorer
        ├── LearningsPane.tsx     # Display extracted user facts & system memory
        ├── SkillsPane.tsx        # Dynamic skills creator & manager
        └── SettingsPane.tsx      # Application parameters, LM Studio endpoint, thermal settings
```

---

## 3. Class & Module Reference Map

### 3.1 Backend Modules (`gnomeai_backend/`)

#### Core Services (`gnomeai_backend/core/`)
| Class / Manager | File Path | Usage & Description |
| :--- | :--- | :--- |
| `SessionManager` | [`core/sessions.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/core/sessions.py) | Handles session lifecycle (creation, reading, saving, listing, deletion) stored as JSON files under `~/.config/gnomeai/sessions`. |
| `LearningsManager` | [`core/learnings.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/core/learnings.py) | Manages long-term memory. Automatically extracts facts and user preferences from chat streams and persists them in `learnings.json`. |
| `WorkspaceManager` | [`core/workspace.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/core/workspace.py) | Scans active project workspace, builds directory file trees, and extracts code metadata (functions, imports, line counts). |
| `LLMModelManager` | [`core/model_manager.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/core/model_manager.py) | Manages LLM model inventory, HuggingFace downloads, OpenVINO NPU compilation, and memory loading/unloading. |
| `VoiceModelManager` | [`core/model_manager.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/core/model_manager.py) | Manages TTS (Kokoro/Qwen) and STT (Whisper) model assets, ONNX files, and speaker voice binaries. |
| `ImageModelManager` | [`core/model_manager.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/core/model_manager.py) | Manages Stable Diffusion checkpoints, OpenVINO IR representations, and iGPU/NPU device assignment. |
| `JobManager` | [`core/jobs.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/core/jobs.py) | Tracks status (`pending`, `running`, `completed`, `failed`) and outputs of asynchronous tasks (e.g. SD image generation, model downloads). |

#### LLM Providers (`gnomeai_backend/llm/`)
| Class / Engine | File Path | Usage & Description |
| :--- | :--- | :--- |
| `InbuiltLLMEngine` | [`llm/inbuilt.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/llm/inbuilt.py) | Runs local GGUF models via llama.cpp or OpenVINO LLM pipeline directly within the Python backend process. |
| `LLMClient` | [`llm/client.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/llm/client.py) | Provides HTTP streaming interface to external OpenAI-compatible endpoints (LM Studio, Ollama, Cloud providers). |
| `LLMManager` | [`llm/manager.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/llm/manager.py) | High-level router that dispatches queries to `InbuiltLLMEngine` or `LLMClient` based on system settings. |

#### Agent Engines (`gnomeai_backend/agents/`)
| Function / Agent | File Path | Usage & Description |
| :--- | :--- | :--- |
| `run_agent_turn()` | [`agents/chat_engine.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/agents/chat_engine.py) | Primary multi-modal chat loop. Manages context building, systemic prompt assembly, tool call parsing, execution, and SSE stream formatting. |
| `CodeAgent` / `run_code_agent_turn()` | [`agents/code_agent.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/agents/code_agent.py) | Specialized code generation and refactoring agent. Performs workspace inspection, AST editing, and produces applyable unified diffs. |
| `SubAgent` / `run_subagent()` | [`agents/subagent.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/agents/subagent.py) | Handles background sub-task execution delegated by the primary agent engine. |

#### Speech & Audio Processing (`gnomeai_backend/audio/`)
| Class / Manager | File Path | Usage & Description |
| :--- | :--- | :--- |
| `OpenVINOTTSManager` | [`audio/openvino_tts.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/audio/openvino_tts.py) | High-speed TTS engine running Kokoro-v0.19 via OpenVINO / ONNX runtime for sub-second voice response. |
| `Qwen3TTSManager` | [`audio/qwen_tts.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/audio/qwen_tts.py) | Advanced voice synthesis engine for multi-speaker and expressive voice cloning generation. |
| `STTManager` | [`audio/stt.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/audio/stt.py) | Transcribes spoken user microphone input to text using local Whisper models. |
| `VoiceStudio` | [`audio/studio.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/audio/studio.py) | Manages custom voice profiles, processes reference audio files, extracts speaker X-Vectors, and saves custom voice presets. |
| `TTSWorker` | [`audio/tts_worker.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/audio/tts_worker.py) | Asynchronous queue worker for generating chat speech audio in background without blocking response stream. |
| `MPRISManager` | [`audio/mpris.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/audio/mpris.py) | Integrates with Linux D-Bus MPRIS specifications to query and control desktop media players (Spotify, VLC, Rhythmbox). |

#### Tools & Integrations (`gnomeai_backend/tools/`)
| Class / Tool | File Path | Usage & Description |
| :--- | :--- | :--- |
| Native Tools | [`tools/registry.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/tools/registry.py) | Built-in system execution functions: `run_command`, `read_file`, `write_file`, `update_file`, `list_dir`, `control_system`, `fetch_url`, `search_web`, `git_status`, `git_diff`, `get_cpu_usage`, `get_ram_usage`. |
| `MCPClientManager` | [`tools/mcp.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/tools/mcp.py) | Manages stdio and SSE connections to Model Context Protocol (MCP) servers, registering external dynamic tools automatically into the agent tool registry. |
| `RAGManager` | [`tools/rag.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/tools/rag.py) | Vectorizes workspace code files and documents using local embeddings (`SentenceTransformers`) for context retrieval during chat queries. |
| `SkillsManager` | [`tools/skills.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/tools/skills.py) | Dynamically loads, saves, and executes custom Python user skills. |

#### Vision (`gnomeai_backend/vision/`)
| Class / Module | File Path | Usage & Description |
| :--- | :--- | :--- |
| `StableDiffusionEngine` | [`vision/sd_engine.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/vision/sd_engine.py) | Generates images from text prompts using SD 1.5 / SDXL pipelines with OpenVINO / PyTorch hardware acceleration. |

---

### 3.2 Frontend Architecture (`src/`)

#### State Providers & Layout
- **[`src/App.tsx`](file:///home/master/Codes/linux%20Scripts/GnomeAi/src/App.tsx)**: Main application container. Handles theme switching (`lm-studio`, `dark`, `light`), toast notifications, backend port discovery (port 8095), and top-level pane routing.
- **[`src/context/AppContext.tsx`](file:///home/master/Codes/linux%20Scripts/GnomeAi/src/context/AppContext.tsx)**: Provides global system parameters (`SettingsType`), backend connectivity state, active theme, and toast dispatchers.
- **[`src/context/ChatContext.tsx`](file:///home/master/Codes/linux%20Scripts/GnomeAi/src/context/ChatContext.tsx)**: Manages chat session list (`sessions`), active session ID (`activeSessionId`), streaming message transcript (`chatHistory`), and operational mode (`chat`, `agent`, `code`, `auto`, `story_reader`).

#### View Components (`src/components/`)
- **[`ChatPane.tsx`](file:///home/master/Codes/linux%20Scripts/GnomeAi/src/components/ChatPane.tsx)**: Main chat interface featuring SSE message streaming, code block syntax highlighting, dynamic tool call visualizer cards, audio play controls, code diff review modal, and subagent progress cards.
- **[`AgentCanvasPane.tsx`](file:///home/master/Codes/linux%20Scripts/GnomeAi/src/components/AgentCanvasPane.tsx)**: Interactive visual node graph editor for orchestrating multi-agent tasks, defining tool data flows, and monitoring step execution visually.
- **[`ImageStudioPane.tsx`](file:///home/master/Codes/linux%20Scripts/GnomeAi/src/components/ImageStudioPane.tsx)**: Creative image studio. Includes LLM prompt expansion, aspect ratio selection, guidance scale / step sliders, job progress bar, and local gallery viewer with image deletion.
- **[`VoicesPane.tsx`](file:///home/master/Codes/linux%20Scripts/GnomeAi/src/components/VoicesPane.tsx)**: Speech hub for previewing Kokoro/Qwen voices, adjusting TTS speed and voice models, uploading/recording reference audio for custom voice cloning, and generating custom speech samples.
- **[`ModelsPane.tsx`](file:///home/master/Codes/linux%20Scripts/GnomeAi/src/components/ModelsPane.tsx)**: Model management suite. Allows searching HuggingFace, downloading GGUF/ONNX/SD models, triggering OpenVINO NPU compilation, and inspecting VRAM/RAM allocation.
- **[`McpRegistryPane.tsx`](file:///home/master/Codes/linux%20Scripts/GnomeAi/src/components/McpRegistryPane.tsx)**: MCP server hub for adding, editing, enabling, and disabling external stdio/HTTP MCP tool servers.
- **[`LearningsPane.tsx`](file:///home/master/Codes/linux%20Scripts/GnomeAi/src/components/LearningsPane.tsx)**: Viewer and manager for auto-extracted user preferences, hardware capabilities, and long-term conversation memory.
- **[`SkillsPane.tsx`](file:///home/master/Codes/linux%20Scripts/GnomeAi/src/components/SkillsPane.tsx)**: Workspace skill builder for creating, editing, and testing custom Python automation routines.
- **[`SettingsPane.tsx`](file:///home/master/Codes/linux%20Scripts/GnomeAi/src/components/SettingsPane.tsx)**: System settings configuration (LM Studio URL, backend port, system prompt, temperature, CPU thread count, font size, theme).

---

## 4. Models Inventory & System Usages

| Model Category | Engine / Provider | Recommended Models | Application Usage |
| :--- | :--- | :--- | :--- |
| **LLM (Primary)** | GGUF / OpenVINO / LM Studio | `Qwen/Qwen2.5-1.5B-Instruct`, `dolphin3.0-llama3.2-3b` | Main conversational agent, multi-turn reasoning, tool call decisions, code diff generation. |
| **LLM (Enhancer)** | Inbuilt / Cloud API | `Qwen2.5-7B-Instruct` | Image prompt enhancement and memory/learning consolidation. |
| **Voice Synthesis (TTS)** | Kokoro ONNX / OpenVINO | `kokoro-v0.19.onnx`, `af_sarah` | Fast real-time text-to-speech for chat responses. |
| **Expressive Voice (TTS)** | Qwen3-TTS / CosyVoice | `Qwen3-TTS` | Custom speaker cloning, emotional storytelling, and voice studio preview. |
| **Voice Recognition (STT)**| Whisper | `whisper-base.en`, `whisper-small` | Microphone voice input transcription in Chat and Overlay. |
| **Vision (Image Gen)** | Stable Diffusion | `runwayml/stable-diffusion-v1-5`, SDXL | Text-to-Image and Image-to-Image generation in Image Studio. |

---

## 5. Feature Workflows & Operational Mechanics

### 5.1 Multi-Modal Chat & Tool Execution
1. User sends message in [`ChatPane.tsx`](file:///home/master/Codes/linux%20Scripts/GnomeAi/src/components/ChatPane.tsx).
2. Request hits POST `/api/chat/stream` on FastAPI server.
3. [`chat_engine.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/agents/chat_engine.py) loads session history ([`sessions.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/core/sessions.py)), injects system prompt, active learnings ([`learnings.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/core/learnings.py)), and workspace context ([`workspace.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/core/workspace.py)).
4. Model streams text via SSE. If a tool call (e.g. `run_command`, `read_file`) is outputted, [`registry.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/tools/registry.py) executes the tool, sends the tool output back into the model context, and resumes response generation.
5. Speech audio is synthesized in background via [`tts_worker.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/audio/tts_worker.py) if TTS is enabled.

### 5.2 Autonomous Code Agent & Workspace Diffing
1. User issues code refactoring or bug fix request.
2. [`code_agent.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/agents/code_agent.py) inspects the target files using [`WorkspaceManager`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/core/workspace.py).
3. The agent generates a unified diff proposal.
4. Diff is sent to frontend [`ChatPane.tsx`](file:///home/master/Codes/linux%20Scripts/GnomeAi/src/components/ChatPane.tsx) as an interactive diff viewer card where the user can click **Apply Diff** (calling `/api/code/diff/apply`) or **Discard Diff**.

### 5.3 Custom Voice Cloning Studio
1. User records or uploads a WAV audio file in [`VoicesPane.tsx`](file:///home/master/Codes/linux%20Scripts/GnomeAi/src/components/VoicesPane.tsx).
2. Endpoint `POST /api/custom_voices/save` passes reference audio to [`studio.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/audio/studio.py).
3. `VoiceStudio` extracts speaker embedding (X-Vector) using `Qwen3TTSManager` / `CosyVoice` and persists the profile in `~/.config/gnomeai/custom_voices`.
4. Custom voice becomes immediately available for chat TTS synthesis.

### 5.4 Image Generation Studio
1. User enters prompt in [`ImageStudioPane.tsx`](file:///home/master/Codes/linux%20Scripts/GnomeAi/src/components/ImageStudioPane.tsx).
2. Optional: Prompt is enhanced by LLM via `POST /api/image/enhance_prompt`.
3. Endpoint `POST /api/image/generate` submits job to [`JobManager`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/core/jobs.py).
4. [`sd_engine.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/vision/sd_engine.py) runs Stable Diffusion generation using OpenVINO / PyTorch. Frontend polls `GET /api/jobs/status/{job_id}` until completed and displays final rendered image.

---

## 6. LLM Governance Protocol for Structural Changes

> [!CAUTION]
> **MANDATORY HUMAN VERIFICATION PROCEDURE FOR LLM CODE EDITS**

When working on any task that requires altering the structure of the codebase, AI assistants MUST follow this 4-step workflow:

1. **Step 1: Impact & Structure Assessment**:
   - Determine if the request introduces structural changes (e.g., creating a new module/component, deleting existing files, changing file locations, altering class signatures, or adding new backend API routes).

2. **Step 2: Update `PROJECT_STRUCTURE.md` & Request Approval**:
   - Write the exact proposed structural modifications into the "User Review Required" section of `PROJECT_STRUCTURE.md` (or an Implementation Plan artifact).
   - **STOP execution** and ask the human user for explicit approval.

3. **Step 3: Approved Execution**:
   - Only after receiving explicit approval from the human user, write the actual code changes across the codebase.

4. **Step 4: Update Documentation Sync & `NOTES.md`**:
   - Record the structural update in [`NOTES.md`](file:///home/master/Codes/linux%20Scripts/GnomeAi/NOTES.md) under the Architecture Changelog section.
   - Update [`PROJECT_STRUCTURE.md`](file:///home/master/Codes/linux%20Scripts/GnomeAi/PROJECT_STRUCTURE.md) to reflect the new state of the repository.
