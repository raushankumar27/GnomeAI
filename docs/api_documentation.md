# GnomeAI Studio API Reference

Welcome to the GnomeAI Studio API Reference. The API runs by default on `http://localhost:8095`.

## POST `/api/chat/stream`

**Summary:** Chat Stream

### Request Body (JSON Schema)

```json
{
  "session_id": "string",
  "message": "string",
  "mode": "string",
  "last_script": "string"
}
```

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/chat/stream" \
  -H "Content-Type: application/json" \
  -d '{
      "session_id": "string",
      "message": "string",
      "mode": "string",
      "last_script": "string"
    }'
```

---

## POST `/api/code/agent/resume`

**Summary:** Code Agent Resume

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/code/agent/resume"
```

---

## POST `/api/code/diff/apply`

**Summary:** Code Diff Apply

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/code/diff/apply"
```

---

## POST `/api/code/diff/discard`

**Summary:** Code Diff Discard

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/code/diff/discard"
```

---

## POST `/api/code/open`

**Summary:** Code Open

### Request Body (JSON Schema)

```json
{
  "path": "string"
}
```

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/code/open" \
  -H "Content-Type: application/json" \
  -d '{
      "path": "string"
    }'
```

---

## GET `/api/code/tree`

**Summary:** Code Tree

### Example Request (curl)

```bash
curl -X GET "http://localhost:8095/api/code/tree"
```

---

## POST `/api/custom_voice/generate`

**Summary:** Custom Voice Generate

### Request Body (JSON Schema)

```json
{
  "text": "string",
  "language": "string",
  "speaker": "string",
  "instruct": "string",
  "model_size": "string",
  "engine": "string"
}
```

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/custom_voice/generate" \
  -H "Content-Type: application/json" \
  -d '{
      "text": "string",
      "language": "string",
      "speaker": "string",
      "instruct": "string",
      "model_size": "string",
      "engine": "string"
    }'
```

---

## GET `/api/custom_voices`

**Summary:** Get Custom Voices

### Example Request (curl)

```bash
curl -X GET "http://localhost:8095/api/custom_voices"
```

---

## GET `/api/custom_voices/audio/{name}`

**Summary:** Get Custom Voice Audio

### Path Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | `string` | Yes |  |

### Example Request (curl)

```bash
curl -X GET "http://localhost:8095/api/custom_voices/audio/{name}"
```

---

## POST `/api/custom_voices/save`

**Summary:** Save Custom Voice

### Request Body (Multipart Form-Data)

| Field | Type | Description |
| --- | --- | --- |
| `name` | `string` | |
| `type` | `string` | |
| `file` | `string` | |
| `ref_text` | `string` | |
| `x_vector_only` | `string` | |
| `description` | `string` | |
| `speaker` | `string` | |

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/custom_voices/save" \
  -F "name=<string>" \
  -F "type=<string>" \
  -F "file=@/path/to/file" \
  -F "ref_text=<string>" \
  -F "x_vector_only=<string>" \
  -F "description=<string>" \
  -F "speaker=<string>"
```

---

## DELETE `/api/custom_voices/{name}`

**Summary:** Delete Custom Voice

### Path Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | `string` | Yes |  |

### Example Request (curl)

```bash
curl -X DELETE "http://localhost:8095/api/custom_voices/{name}"
```

---

## POST `/api/image/enhance_prompt`

**Summary:** Api Enhance Image Prompt

### Request Body (JSON Schema)

```json
{
  "prompt": "string"
}
```

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/image/enhance_prompt" \
  -H "Content-Type: application/json" \
  -d '{
      "prompt": "string"
    }'
```

---

## GET `/api/image/file/{filename}`

**Summary:** Get Image File

### Path Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `filename` | `string` | Yes |  |

### Example Request (curl)

```bash
curl -X GET "http://localhost:8095/api/image/file/{filename}"
```

---

## GET `/api/image/gallery`

**Summary:** Get Image Gallery

### Example Request (curl)

```bash
curl -X GET "http://localhost:8095/api/image/gallery"
```

---

## DELETE `/api/image/gallery/{filename}`

**Summary:** Delete Gallery Image

### Path Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `filename` | `string` | Yes |  |

### Example Request (curl)

```bash
curl -X DELETE "http://localhost:8095/api/image/gallery/{filename}"
```

---

## POST `/api/image/generate`

**Summary:** Image Generate

### Request Body (Multipart Form-Data)

| Field | Type | Description |
| --- | --- | --- |
| `file` | `string` | |
| `prompt` | `string` | |
| `enhance_prompt` | `string` | |
| `width` | `integer` | |
| `height` | `integer` | |
| `steps` | `integer` | |
| `strength` | `number` | |
| `model_id` | `string` | |

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/image/generate" \
  -F "file=@/path/to/file" \
  -F "prompt=<string>" \
  -F "enhance_prompt=<string>" \
  -F "width=<integer>" \
  -F "height=<integer>" \
  -F "steps=<integer>" \
  -F "strength=<number>" \
  -F "model_id=<string>"
```

---

## GET `/api/image/status/{job_id}`

**Summary:** Get Image Status

### Path Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `job_id` | `string` | Yes |  |

### Example Request (curl)

```bash
curl -X GET "http://localhost:8095/api/image/status/{job_id}"
```

---

## GET `/api/jobs/status/{job_id}`

**Summary:** Get Job Status

### Path Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `job_id` | `string` | Yes |  |

### Example Request (curl)

```bash
curl -X GET "http://localhost:8095/api/jobs/status/{job_id}"
```

---

## GET `/api/learnings`

**Summary:** Get Learnings

### Example Request (curl)

```bash
curl -X GET "http://localhost:8095/api/learnings"
```

---

## POST `/api/learnings`

**Summary:** Post Learnings

### Request Body (JSON Schema)

```json
object
```

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/learnings" \
  -H "Content-Type: application/json" \
  -d 'object'
```

---

## GET `/api/logs`

**Summary:** Get Logs

### Query Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `lines` | `integer` | No |  |

### Example Request (curl)

```bash
curl -X GET "http://localhost:8095/api/logs"
```

---

## GET `/api/models/image`

**Summary:** Get Models Image Status

### Example Request (curl)

```bash
curl -X GET "http://localhost:8095/api/models/image"
```

---

## GET `/api/models/image/available`

**Summary:** Get Models Image Available

### Example Request (curl)

```bash
curl -X GET "http://localhost:8095/api/models/image/available"
```

---

## DELETE `/api/models/image/{id}`

**Summary:** Delete Image Model Unified

### Path Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |

### Example Request (curl)

```bash
curl -X DELETE "http://localhost:8095/api/models/image/{id}"
```

---

## POST `/api/models/image/{id}/clear_pytorch`

**Summary:** Clear Image Model Pytorch

### Path Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/models/image/{id}/clear_pytorch"
```

---

## POST `/api/models/image/{id}/download`

**Summary:** Download Image Model Unified

### Path Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/models/image/{id}/download"
```

---

## POST `/api/models/image/{id}/load`

**Summary:** Load Image Model Unified

### Path Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/models/image/{id}/load"
```

---

## POST `/api/models/image/{id}/unload`

**Summary:** Unload Image Model Unified

### Path Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/models/image/{id}/unload"
```

---

## POST `/api/models/import`

**Summary:** Import Gguf Model

### Request Body (JSON Schema)

```json
{
  "filepath": "string"
}
```

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/models/import" \
  -H "Content-Type: application/json" \
  -d '{
      "filepath": "string"
    }'
```

---

## GET `/api/models/llm`

**Summary:** Get Models Llm Status

### Example Request (curl)

```bash
curl -X GET "http://localhost:8095/api/models/llm"
```

---

## GET `/api/models/llm/available`

**Summary:** Get Models Llm Available

### Example Request (curl)

```bash
curl -X GET "http://localhost:8095/api/models/llm/available"
```

---

## GET `/api/models/llm/logs/compile`

**Summary:** Get Compile Log

### Example Request (curl)

```bash
curl -X GET "http://localhost:8095/api/models/llm/logs/compile"
```

---

## GET `/api/models/llm/logs/load`

**Summary:** Get Load Log

### Example Request (curl)

```bash
curl -X GET "http://localhost:8095/api/models/llm/logs/load"
```

---

## DELETE `/api/models/llm/{id}`

**Summary:** Delete Llm Model Unified

### Path Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |

### Example Request (curl)

```bash
curl -X DELETE "http://localhost:8095/api/models/llm/{id}"
```

---

## POST `/api/models/llm/{id}/compile`

**Summary:** Compile Llm Model Unified

### Path Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |

### Request Body (JSON Schema)

```json
{
  "precision": "string"
}
```

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/models/llm/{id}/compile" \
  -H "Content-Type: application/json" \
  -d '{
      "precision": "string"
    }'
```

---

## POST `/api/models/llm/{id}/load`

**Summary:** Load Llm Model Unified

### Path Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |

### Request Body (JSON Schema)

```json
object
```

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/models/llm/{id}/load" \
  -H "Content-Type: application/json" \
  -d 'object'
```

---

## POST `/api/models/llm/{id}/unload`

**Summary:** Unload Llm Model Unified

### Path Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |

### Request Body (JSON Schema)

```json
object
```

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/models/llm/{id}/unload" \
  -H "Content-Type: application/json" \
  -d 'object'
```

---

## GET `/api/models/voice`

**Summary:** Get Models Voice Status

### Example Request (curl)

```bash
curl -X GET "http://localhost:8095/api/models/voice"
```

---

## GET `/api/models/voice/available`

**Summary:** Get Models Voice Available

### Example Request (curl)

```bash
curl -X GET "http://localhost:8095/api/models/voice/available"
```

---

## DELETE `/api/models/voice/{id}`

**Summary:** Delete Voice Model Unified

### Path Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |

### Example Request (curl)

```bash
curl -X DELETE "http://localhost:8095/api/models/voice/{id}"
```

---

## POST `/api/models/voice/{id}/download`

**Summary:** Download Voice Model Unified

### Path Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/models/voice/{id}/download"
```

---

## POST `/api/models/voice/{id}/load`

**Summary:** Load Voice Model Unified

### Path Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/models/voice/{id}/load"
```

---

## POST `/api/models/voice/{id}/unload`

**Summary:** Unload Voice Model Unified

### Path Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/models/voice/{id}/unload"
```

---

## GET `/api/presets`

**Summary:** Get Presets

### Example Request (curl)

```bash
curl -X GET "http://localhost:8095/api/presets"
```

---

## POST `/api/presets`

**Summary:** Post Presets

### Request Body (JSON Schema)

```json
object
```

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/presets" \
  -H "Content-Type: application/json" \
  -d 'object'
```

---

## GET `/api/recordings`

**Summary:** Get Recordings

### Example Request (curl)

```bash
curl -X GET "http://localhost:8095/api/recordings"
```

---

## DELETE `/api/recordings/{rec_id}`

**Summary:** Delete Recording

### Path Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `rec_id` | `string` | Yes |  |

### Example Request (curl)

```bash
curl -X DELETE "http://localhost:8095/api/recordings/{rec_id}"
```

---

## GET `/api/recordings/{rec_id}/wav`

**Summary:** Get Recording Wav

### Path Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `rec_id` | `string` | Yes |  |

### Example Request (curl)

```bash
curl -X GET "http://localhost:8095/api/recordings/{rec_id}/wav"
```

---

## GET `/api/sessions`

**Summary:** Get Sessions

### Example Request (curl)

```bash
curl -X GET "http://localhost:8095/api/sessions"
```

---

## POST `/api/sessions`

**Summary:** Post Sessions

### Request Body (JSON Schema)

```json
object
```

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/sessions" \
  -H "Content-Type: application/json" \
  -d 'object'
```

---

## POST `/api/sessions/auth`

**Summary:** Post Sessions Auth

### Request Body (JSON Schema)

```json
{
  "session_id": "string",
  "approved": "boolean",
  "code": "string"
}
```

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/sessions/auth" \
  -H "Content-Type: application/json" \
  -d '{
      "session_id": "string",
      "approved": "boolean",
      "code": "string"
    }'
```

---

## POST `/api/sessions/fork`

**Summary:** Post Sessions Fork

### Request Body (JSON Schema)

```json
{
  "session_id": "string"
}
```

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/sessions/fork" \
  -H "Content-Type: application/json" \
  -d '{
      "session_id": "string"
    }'
```

---

## POST `/api/sessions/learn`

**Summary:** Post Sessions Learn

### Request Body (JSON Schema)

```json
{
  "session_id": "string"
}
```

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/sessions/learn" \
  -H "Content-Type: application/json" \
  -d '{
      "session_id": "string"
    }'
```

---

## POST `/api/sessions/rename`

**Summary:** Post Sessions Rename

### Request Body (JSON Schema)

```json
{
  "session_id": "string",
  "title": "string"
}
```

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/sessions/rename" \
  -H "Content-Type: application/json" \
  -d '{
      "session_id": "string",
      "title": "string"
    }'
```

---

## POST `/api/sessions/summarize`

**Summary:** Post Sessions Summarize

### Request Body (JSON Schema)

```json
{
  "session_id": "string"
}
```

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/sessions/summarize" \
  -H "Content-Type: application/json" \
  -d '{
      "session_id": "string"
    }'
```

---

## POST `/api/sessions/update_mode`

**Summary:** Post Session Mode

### Request Body (JSON Schema)

```json
{
  "session_id": "string",
  "mode": "string"
}
```

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/sessions/update_mode" \
  -H "Content-Type: application/json" \
  -d '{
      "session_id": "string",
      "mode": "string"
    }'
```

---

## GET `/api/sessions/{session_id}`

**Summary:** Get Session By Id

### Path Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `session_id` | `string` | Yes |  |

### Example Request (curl)

```bash
curl -X GET "http://localhost:8095/api/sessions/{session_id}"
```

---

## DELETE `/api/sessions/{session_id}`

**Summary:** Delete Session

### Path Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `session_id` | `string` | Yes |  |

### Example Request (curl)

```bash
curl -X DELETE "http://localhost:8095/api/sessions/{session_id}"
```

---

## GET `/api/sessions/{session_id}/context_size`

**Summary:** Get Session Context Size

### Path Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `session_id` | `string` | Yes |  |

### Example Request (curl)

```bash
curl -X GET "http://localhost:8095/api/sessions/{session_id}/context_size"
```

---

## DELETE `/api/sessions/{session_id}/messages/{message_index}`

**Summary:** Delete Message

### Path Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `session_id` | `string` | Yes |  |
| `message_index` | `integer` | Yes |  |

### Example Request (curl)

```bash
curl -X DELETE "http://localhost:8095/api/sessions/{session_id}/messages/{message_index}"
```

---

## GET `/api/settings`

**Summary:** Get Settings

### Example Request (curl)

```bash
curl -X GET "http://localhost:8095/api/settings"
```

---

## POST `/api/settings`

**Summary:** Post Settings

### Request Body (JSON Schema)

```json
{
  "lm_studio_url": "string",
  "model_name": "string",
  "inbuilt_model_id": "string",
  "inbuilt_device": "string",
  "tts_speed": "number",
  "enable_dbus_monitor": "boolean",
  "enable_tts": "boolean",
  "llm_backend": "string",
  "system_prompt": "string",
  "temperature": "number",
  "cpu_threads": "integer",
  "top_k": "integer",
  "top_p": "number",
  "min_p": "number",
  "active_preset": "string",
  "tts_voice": "string",
  "expand_thoughts": "boolean",
  "flash_attention": "boolean",
  "context_limit": "integer"
}
```

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/settings" \
  -H "Content-Type: application/json" \
  -d '{
      "lm_studio_url": "string",
      "model_name": "string",
      "inbuilt_model_id": "string",
      "inbuilt_device": "string",
      "tts_speed": "number",
      "enable_dbus_monitor": "boolean",
      "enable_tts": "boolean",
      "llm_backend": "string",
      "system_prompt": "string",
      "temperature": "number",
      "cpu_threads": "integer",
      "top_k": "integer",
      "top_p": "number",
      "min_p": "number",
      "active_preset": "string",
      "tts_voice": "string",
      "expand_thoughts": "boolean",
      "flash_attention": "boolean",
      "context_limit": "integer"
    }'
```

---

## GET `/api/skills`

**Summary:** Get Skills

### Example Request (curl)

```bash
curl -X GET "http://localhost:8095/api/skills"
```

---

## POST `/api/skills/save`

**Summary:** Save Skill Code

### Request Body (JSON Schema)

```json
{
  "id": "string",
  "code": "string"
}
```

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/skills/save" \
  -H "Content-Type: application/json" \
  -d '{
      "id": "string",
      "code": "string"
    }'
```

---

## DELETE `/api/skills/{id}`

**Summary:** Delete Skill

### Path Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | Yes |  |

### Example Request (curl)

```bash
curl -X DELETE "http://localhost:8095/api/skills/{id}"
```

---

## GET `/api/status`

**Summary:** Get Status

### Example Request (curl)

```bash
curl -X GET "http://localhost:8095/api/status"
```

---

## GET `/api/system/specs`

**Summary:** Get System Specs

### Example Request (curl)

```bash
curl -X GET "http://localhost:8095/api/system/specs"
```

---

## POST `/api/tts`

**Summary:** Post Tts

### Request Body (JSON Schema)

```json
{
  "text": "string",
  "voice": "string"
}
```

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/tts" \
  -H "Content-Type: application/json" \
  -d '{
      "text": "string",
      "voice": "string"
    }'
```

---

## POST `/api/tts/stop`

**Summary:** Stop Tts

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/tts/stop"
```

---

## GET `/api/tts/voices`

**Summary:** Get Tts Voices

### Example Request (curl)

```bash
curl -X GET "http://localhost:8095/api/tts/voices"
```

---

## POST `/api/voice_clone/generate`

**Summary:** Voice Clone Generate

### Request Body (Multipart Form-Data)

| Field | Type | Description |
| --- | --- | --- |
| `file` | `string` | |
| `target_text` | `string` | |
| `ref_text` | `string` | |
| `use_xvector_only` | `string` | |
| `language` | `string` | |
| `model_size` | `string` | |
| `engine` | `string` | |

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/voice_clone/generate" \
  -F "file=@/path/to/file" \
  -F "target_text=<string>" \
  -F "ref_text=<string>" \
  -F "use_xvector_only=<string>" \
  -F "language=<string>" \
  -F "model_size=<string>" \
  -F "engine=<string>"
```

---

## POST `/api/voice_design/generate`

**Summary:** Voice Design Generate

### Request Body (JSON Schema)

```json
{
  "text": "string",
  "language": "string",
  "instruct": "string",
  "engine": "string"
}
```

### Example Request (curl)

```bash
curl -X POST "http://localhost:8095/api/voice_design/generate" \
  -H "Content-Type: application/json" \
  -d '{
      "text": "string",
      "language": "string",
      "instruct": "string",
      "engine": "string"
    }'
```

---

## GET `/health`

**Summary:** Health Check

### Example Request (curl)

```bash
curl -X GET "http://localhost:8095/health"
```

---
