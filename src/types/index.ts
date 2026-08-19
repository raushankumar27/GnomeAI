import { z } from 'zod';

export const SessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  created_at: z.number().optional(),
  mode: z.string().optional(),
  system_prompt: z.string().optional(),
  temperature: z.number().optional(),
  workspace_path: z.string().nullable().optional(),
  active_model: z.object({
    name: z.string(),
    backend: z.string()
  }).nullable().optional()
});

export const SettingsSchema = z.object({
  lm_studio_url: z.string().optional(),
  model_name: z.string(),
  inbuilt_model_id: z.string().optional(),
  inbuilt_device: z.string(),
  tts_speed: z.number(),
  enable_dbus_monitor: z.boolean(),
  enable_tts: z.boolean(),
  llm_backend: z.string(),
  system_prompt: z.string().optional(),
  temperature: z.number().optional(),
  context_limit: z.number().optional(),
  cpu_threads: z.number().optional(),
  top_k: z.number().optional(),
  top_p: z.number().optional(),
  min_p: z.number().optional(),
  tts_voice: z.string().optional(),
  extension_model_id: z.string().optional(),
  chat_font_size: z.number().optional(),
  chat_font_family: z.string().optional()
});

export type SessionType = z.infer<typeof SessionSchema>;
export type SettingsType = z.infer<typeof SettingsSchema>;

export interface ModelOption {
  id: string;
  name: string;
  type: 'inbuilt' | 'loaded' | 'disk';
  badge: string;
}

export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

export interface WorkspaceFile {
  filename: string;
  rel_path: string;
  size_bytes: number;
  line_count: number;
  imports: string[];
  functions: string[];
}
