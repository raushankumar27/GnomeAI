# GnomeAI Studio - Development Notes & Architecture Journal

This document serves as the session journal, architecture change log, and operational notes file for **GnomeAI Studio**. It is maintained alongside [`PROJECT_STRUCTURE.md`](file:///home/master/Codes/linux%20Scripts/GnomeAi/PROJECT_STRUCTURE.md) to track verified structural modifications, system design notes, and pending tasks.

---

## 1. Architecture Changelog & Human Verification Log

| Date | Verification Status | Structural Change Summary | Impacted Components |
| :--- | :--- | :--- | :--- |
| **2026-08-19** | **Approved by Human** | Initial establishment of canonical repository structure documentation and LLM Governance Protocol. | `PROJECT_STRUCTURE.md`, `NOTES.md` |
| **2026-08-19** | **Approved by Human** | Resolved 10 bugs in Story Mode feature (endpoint routing, unbound functions, res.json crashes, reasoning stream handling, speaker diarization, audio clip re-rolling). | `server.py`, `chat_engine.py`, `ChatPane.tsx` |
| **2026-08-19** | **Approved by Human** | Resolved 10 conflicts between Chat Mode, Story Mode, and Presets (mode parameter override, preset system prompt & temperature inheritance in Story Mode, RPG continuation handler). | `chat_engine.py`, `server.py`, `App.tsx`, `ChatPane.tsx` |

---

## 2. LLM Operational Quick-Rules

1. **Check `PROJECT_STRUCTURE.md` First**: Before making non-trivial code modifications in any session, consult [`PROJECT_STRUCTURE.md`](file:///home/master/Codes/linux%20Scripts/GnomeAi/PROJECT_STRUCTURE.md).
2. **Structural Change Human Approval Rule**: Any edit that:
   - Adds a new file or directory,
   - Deletes or renames an existing class or module,
   - Alters core schema definitions (e.g. `src/types/index.ts` or FastAPI request/response models),
   - Adds or modifies backend API routes in `gnomeai_backend/api/`,
   - Changes top-level UI routing or navigation in `src/App.tsx`,
   **MUST** be proposed and approved by the human user prior to code changes.
3. **Always Keep Docs in Sync**: After completing a verified structural update, append an entry to Section 1 of `NOTES.md` and update [`PROJECT_STRUCTURE.md`](file:///home/master/Codes/linux%20Scripts/GnomeAi/PROJECT_STRUCTURE.md).

---

## 3. Hardware & Runtime Acceleration Notes

- **Intel OpenVINO Acceleration**:
  - LLM models compiled for NPU/iGPU are stored in `~/.config/gnomeai/models/compiled`.
  - Setup script: [`install_npu.sh`](file:///home/master/Codes/linux%20Scripts/GnomeAi/install_npu.sh).
  - OpenVINO TTS (`audio/openvino_tts.py`) utilizes `kokoro-v0.19.onnx` for real-time speech generation.
- **FastAPI Engine**:
  - Default listener port: `8095` (configured in [`gnomeai_backend/config.py`](file:///home/master/Codes/linux%20Scripts/GnomeAi/gnomeai_backend/config.py)).
  - Startup script: [`launch.sh`](file:///home/master/Codes/linux%20Scripts/GnomeAi/launch.sh).

---

## 4. Pending Architectural Tasks & Roadmap

- [ ] Extend MCP client to support remote SSE endpoints with OAuth authentication.
- [ ] Add hardware telemetry graphs (NPU usage %, iGPU memory) to `SettingsPane.tsx`.
- [ ] Optimize local workspace RAG chunking algorithm for large codebases.
