export type DeviceTarget = "CPU" | "GPU" | "XPU" | "NPU" | "AUTO";

export interface SettingsPayload {
  session_id?: string;
  lm_studio_url?: string;
  model_name?: string;
  inbuilt_model_id?: string;
  inbuilt_device?: DeviceTarget;
  tts_speed?: number;
  enable_tts?: boolean;
  llm_backend?: string;
  temperature?: number;
}

export class BackendApiService {
  private baseUrl: string;

  constructor(baseUrl: string = "http://localhost:8000") {
    this.baseUrl = baseUrl;
  }

  async getHealth(): Promise<{ status: string }> {
    const res = await fetch(`${this.baseUrl}/health`);
    return res.json();
  }

  async getSettings(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/settings`);
    return res.json();
  }

  async updateSettings(settings: SettingsPayload): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings)
    });
    return res.json();
  }

  async setModelDeviceTarget(modelId: string, device: DeviceTarget): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/models/device_target`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model_id: modelId, device })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || `Failed to allocate model to device '${device}'`);
    }
    return res.json();
  }

  async getModelsStatus(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/models/llm`);
    return res.json();
  }

  async compileModel(precision: string = "int4", device: DeviceTarget = "AUTO"): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/models/llm/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ precision, device })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || `Model compilation failed on device '${device}'`);
    }
    return res.json();
  }
}

export const apiService = new BackendApiService();
