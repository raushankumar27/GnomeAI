import { useState } from 'react';

export function usePresets(apiFetch: any, showToast?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void) {
  const [presets, setPresets] = useState<Record<string, any>>({});
  const [activePreset, setActivePreset] = useState<string>('Default');
  const [showNewPresetForm, setShowNewPresetForm] = useState<boolean>(false);
  const [showRenamePresetForm, setShowRenamePresetForm] = useState<boolean>(false);
  const [newPresetName, setNewPresetName] = useState<string>('');
  const [renamePresetName, setRenamePresetName] = useState<string>('');

  const fetchPresets = async () => {
    try {
      const data = await apiFetch('/api/presets');
      if (data && data.presets) {
        setPresets(data.presets);
        if (data.active_preset) setActivePreset(data.active_preset);
      }
    } catch (e) {
      console.error('Fetch presets error:', e);
    }
  };

  const handleSavePreset = async (presetName: string, config: any) => {
    try {
      const res = await apiFetch('/api/presets/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: presetName, config })
      });
      if (res && res.success) {
        await fetchPresets();
        if (showToast) showToast(`Preset "${presetName}" saved!`, 'success');
      }
    } catch (e: any) {
      if (showToast) showToast(`Failed to save preset: ${e.message}`, 'error');
    }
  };

  const handleDeletePreset = async (presetName: string) => {
    try {
      const res = await apiFetch('/api/presets/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: presetName })
      });
      if (res && res.success) {
        await fetchPresets();
        if (showToast) showToast(`Preset "${presetName}" deleted!`, 'success');
      }
    } catch (e: any) {
      if (showToast) showToast(`Failed to delete preset: ${e.message}`, 'error');
    }
  };

  const handleApplyPreset = async (presetName: string) => {
    try {
      const res = await apiFetch('/api/presets/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: presetName })
      });
      if (res && res.success) {
        setActivePreset(presetName);
        if (showToast) showToast(`Applied preset "${presetName}"`, 'success');
        return res.settings;
      }
    } catch (e: any) {
      if (showToast) showToast(`Failed to apply preset: ${e.message}`, 'error');
    }
    return null;
  };

  return {
    presets,
    activePreset,
    setActivePreset,
    showNewPresetForm,
    setShowNewPresetForm,
    showRenamePresetForm,
    setShowRenamePresetForm,
    newPresetName,
    setNewPresetName,
    renamePresetName,
    setRenamePresetName,
    fetchPresets,
    handleSavePreset,
    handleDeletePreset,
    handleApplyPreset
  };
}
