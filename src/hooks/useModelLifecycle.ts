import { useState, useEffect, useCallback } from "react";
import { apiService, DeviceTarget } from "../services/BackendApiService";

export interface ModelStatus {
  loaded: boolean;
  model_id?: string;
  device?: string;
  error?: string;
}

export function useModelLifecycle() {
  const [modelStatus, setModelStatus] = useState<ModelStatus>({ loaded: false });
  const [deviceTarget, setDeviceTarget] = useState<DeviceTarget>("AUTO");
  const [deviceWarning, setDeviceWarning] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await apiService.getModelsStatus();
      if (data?.inbuilt) {
        setModelStatus({
          loaded: data.inbuilt.status === "loaded" || data.inbuilt.status === "compiled",
          model_id: data.active_model,
          device: data.inbuilt.device || "CPU"
        });
      }
    } catch (err) {
      console.warn("Failed to fetch model status:", err);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const selectDeviceTarget = async (modelId: string, target: DeviceTarget) => {
    setDeviceTarget(target);
    setDeviceWarning(null);
    setIsLoading(true);
    try {
      await apiService.setModelDeviceTarget(modelId, target);
      await fetchStatus();
    } catch (err: any) {
      const msg = err.message || `Failed to compile model on target hardware '${target}'`;
      setDeviceWarning(`⚠️ STRICT DEVICE ALLOCATION ERROR: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const compileModelOnDevice = async (precision: string = "int4", target: DeviceTarget = deviceTarget) => {
    setDeviceWarning(null);
    setIsLoading(true);
    try {
      await apiService.compileModel(precision, target);
      await fetchStatus();
    } catch (err: any) {
      const msg = err.message || `Compilation failed on device '${target}'`;
      setDeviceWarning(`⚠️ MODEL COMPILATION WARNING: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    modelStatus,
    deviceTarget,
    deviceWarning,
    isLoading,
    selectDeviceTarget,
    compileModelOnDevice,
    clearWarning: () => setDeviceWarning(null)
  };
}
