import { useState, useEffect } from 'react';
import { ModelOption } from '../types';

export function useModelManager(
  backendPort: number,
  apiFetch: any,
  showToast?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void
) {
  const [hfSearch, setHfSearch] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [allModelOptions, setAllModelOptions] = useState<ModelOption[]>([]);
  const [compileLog, setCompileLog] = useState<string>('');
  const [showLogsPanel, setShowLogsPanel] = useState<boolean>(false);
  const [compilePrecision, setCompilePrecision] = useState<string>('int4');

  const loadAllModels = async () => {
    try {
      const data = await apiFetch('/api/models/llm');
      if (data) {
        const options: ModelOption[] = [];
        if (data.inbuilt && data.inbuilt.models) {
          data.inbuilt.models.forEach((m: string) => {
            options.push({ id: m, name: `Inbuilt: ${m}`, source: 'inbuilt' });
          });
        }
        if (data.lms && data.lms.models) {
          data.lms.models.forEach((m: any) => {
            options.push({ id: m.id || m.name, name: `LM Studio: ${m.name}`, source: 'lms' });
          });
        }
        setAllModelOptions(options);
      }
    } catch (e) {
      console.error('Load models error:', e);
    }
  };

  const handleCompileModel = async (modelId: string, device: string = 'AUTO') => {
    try {
      if (showToast) showToast(`⚙️ Compiling model on ${device}...`, 'info');
      const res = await apiFetch('/api/models/llm/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: modelId, precision: compilePrecision, device })
      });
      if (res && res.success) {
        if (showToast) showToast(`✨ Model ${modelId} compiled successfully!`, 'success');
        loadAllModels();
      } else {
        if (showToast) showToast(`Compilation failed: ${res?.error || 'Unknown error'}`, 'error');
      }
    } catch (e: any) {
      if (showToast) showToast(`Compilation error: ${e.message}`, 'error');
    }
  };

  const handleAllocateDevice = async (modelId: string, device: 'CPU' | 'GPU' | 'XPU' | 'NPU' | 'AUTO') => {
    try {
      if (showToast) showToast(`🎯 Allocating model ${modelId} to target device '${device}'...`, 'info');
      const res = await apiFetch('/api/models/device_target', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: modelId, device })
      });
      if (res && res.success) {
        if (showToast) showToast(`✅ Model allocated to target device '${device}'!`, 'success');
      }
    } catch (e: any) {
      if (showToast) showToast(`Device compilation error: ${e.message}`, 'error');
    }
  };

  return {
    hfSearch,
    setHfSearch,
    availableModels,
    setAvailableModels,
    allModelOptions,
    setAllModelOptions,
    compileLog,
    setCompileLog,
    showLogsPanel,
    setShowLogsPanel,
    compilePrecision,
    setCompilePrecision,
    loadAllModels,
    handleCompileModel,
    handleAllocateDevice
  };
}
