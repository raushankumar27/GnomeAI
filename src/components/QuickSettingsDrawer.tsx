import React from 'react';
import { SettingsType } from '../types';

interface QuickSettingsDrawerProps {
  rightSidebarWidth: number;
  isResizingRightSidebar: boolean;
  startResizingRightSidebar: (e: React.MouseEvent) => void;
  presets: Record<string, any>;
  activePreset: string;
  setActivePreset: (preset: string) => void;
  handleApplyPresetWithName: (presetName: string) => void;
  handleDeletePresetWithName: (presetName: string) => void;
  handleRenamePresetWithName: (name: string, newName: string) => void;
  handleCreatePresetWithName: (name: string) => void;
  handleSaveActivePresetChanges: () => void;
  activeMode: 'chat' | 'agent' | 'code' | 'auto' | 'story_reader';
  handleModeChange: (mode: 'chat' | 'agent' | 'code' | 'auto' | 'story_reader') => void;
  activeSessionId: string | null;
  activeSessionDetails: any;
  setActiveSessionDetails: (details: any) => void;
  setSessions: React.Dispatch<React.SetStateAction<any[]>>;
  settings: SettingsType;
  setSettings: React.Dispatch<React.SetStateAction<SettingsType>>;
  apiFetch: any;
  setIsPromptModalOpen: (open: boolean) => void;
}

export default function QuickSettingsDrawer({
  rightSidebarWidth,
  isResizingRightSidebar,
  startResizingRightSidebar,
  presets,
  activePreset,
  setActivePreset,
  handleApplyPresetWithName,
  handleDeletePresetWithName,
  handleRenamePresetWithName,
  handleCreatePresetWithName,
  handleSaveActivePresetChanges,
  activeMode,
  handleModeChange,
  activeSessionId,
  activeSessionDetails,
  setActiveSessionDetails,
  setSessions,
  settings,
  setSettings,
  apiFetch,
  setIsPromptModalOpen
}: QuickSettingsDrawerProps) {
  const currentPreset = presets[activePreset] || {};
  const curPrompt = activeSessionDetails ? (activeSessionDetails.system_prompt ?? '') : (settings.system_prompt || '');
  const curTemp = activeSessionDetails ? (activeSessionDetails.temperature ?? 0.7) : (settings.temperature ?? 0.7);
  const curLimit = settings.context_limit ?? 2048;
  const curThreads = settings.cpu_threads ?? 4;
  const curTopK = settings.top_k ?? 40;
  const curTopP = settings.top_p ?? 0.95;
  const curMinP = settings.min_p ?? 0.05;

  const renderResetIndicator = (fieldKey: string, currentValue: any, presetValue: any, onReset: () => void) => {
    if (currentValue === undefined || presetValue === undefined) return null;
    const isModified = JSON.stringify(currentValue) !== JSON.stringify(presetValue);
    if (!isModified) return null;

    return (
      <span 
        className="preset-reset-indicator" 
        title={`Modified from preset value (${presetValue}). Click to reset.`}
        onClick={(e) => {
          e.stopPropagation();
          onReset();
        }}
      >
        ↺
      </span>
    );
  };

  const resetField = (fieldKey: string, defaultValue: any) => {
    if (fieldKey === 'system_prompt' || fieldKey === 'temperature') {
      if (activeSessionId && activeSessionDetails) {
        const updatedSess = { ...activeSessionDetails, [fieldKey]: defaultValue };
        setActiveSessionDetails(updatedSess);
        setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, [fieldKey]: defaultValue } : s));
        apiFetch('/api/sessions/update_settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: activeSessionId, [fieldKey]: defaultValue })
        });
        return;
      }
    }
    const nextSettings = { ...settings, [fieldKey]: defaultValue };
    setSettings(nextSettings);
    apiFetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextSettings)
    });
  };

  return (
    <div 
      className={`right-sidebar-panel ${isResizingRightSidebar ? 'is-resizing' : ''}`}
      style={{ width: `${rightSidebarWidth}px` }}
    >
      <div 
        className="right-sidebar-resizer-handle"
        onMouseDown={startResizingRightSidebar}
      />

      <div className="right-sidebar-content flex-col gap-16">
        <div className="right-sidebar-header flex-between align-center">
          <span className="sidebar-header-title">Parameter Presets</span>
        </div>

        {/* Preset Horizontal Selection List */}
        <div className="setting-block gap-8">
          <div className="presets-chips-row flex-wrap-gap">
            {Object.keys(presets).map(name => {
              const isActive = activePreset === name;
              const isSystem = ['Default', 'Coding', 'Creative', 'Strict'].includes(name);
              return (
                <div 
                  key={name}
                  className={`preset-chip ${isActive ? 'active' : ''}`}
                  onClick={() => handleApplyPresetWithName(name)}
                  onDoubleClick={() => {
                    if (isSystem) return;
                    const newName = prompt(`Rename preset "${name}":`, name);
                    if (newName && newName.trim() && newName.trim() !== name) {
                      handleRenamePresetWithName(name, newName.trim());
                    }
                  }}
                >
                  <span>{name}</span>
                  {!isSystem && (
                    <span 
                      className="preset-delete-btn"
                      title="Delete preset" 
                      onClick={e => {
                        e.stopPropagation();
                        if (confirm(`Delete preset "${name}"?`)) {
                          handleDeletePresetWithName(name);
                        }
                      }}
                    >
                      ×
                    </span>
                  )}
                </div>
              );
            })}
            
            {/* New Preset Dashed Button */}
            <div 
              className="preset-add-chip" 
              title="Create new preset" 
              onClick={() => {
                const name = prompt("Enter name for new preset:");
                if (name && name.trim()) {
                  handleCreatePresetWithName(name.trim());
                }
              }}
            >
              + Add Preset
            </div>
          </div>
        </div>

        {/* Accordion 1: Model Context */}
        <details className="setting-accordion" open>
          <summary className="accordion-header">Model Context</summary>
          <div className="accordion-content">

            <div className="setting-block gap-8">
              <div className="label-row flex-between">
                <label className="setting-label-bold">Preset Routing Mode</label>
                {renderResetIndicator('mode', activeMode, currentPreset.mode ?? 'auto', () => handleModeChange(currentPreset.mode ?? 'auto'))}
              </div>
              <select 
                className="dropdown-pill w-100"
                value={activeMode}
                onChange={e => handleModeChange(e.target.value as any)}
              >
                <option value="auto">Auto (Intent Classification)</option>
                <option value="chat">Chat (General Conversation)</option>
                <option value="agent">Desktop Agent (Automation)</option>
                <option value="code">Workspace Developer (Codebase)</option>
              </select>
              <span className="setting-help-text">Select behavior mode. Auto classifies intent. Manual overrides bypass classifier.</span>
            </div>
            
            <div className="setting-block gap-8">
              <div className="label-row flex-between">
                <div className="flex-center gap-8">
                  <label className="setting-label-bold">System Prompt</label>
                  <button 
                    className="expand-editor-btn" 
                    title="Open large editor" 
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); setIsPromptModalOpen(true); }}
                  >
                    <svg viewBox="0 0 24 24" width="11" height="11"><path fill="currentColor" d="M9.5,13H5V18.5H10.5V14H9.5V13M14,5V9.5H18.5V5H14M14,14V18.5H18.5V14H14M5,5V10.5H10.5V5H5Z"/></svg>
                    Expand Editor
                  </button>
                </div>
                {renderResetIndicator('system_prompt', curPrompt, currentPreset.system_prompt ?? '', () => resetField('system_prompt', currentPreset.system_prompt ?? ''))}
              </div>
              <textarea 
                rows={4} 
                className="lms-system-prompt-box"
                placeholder="You are my assistant..."
                value={curPrompt}
                onChange={async e => {
                  const val = e.target.value;
                  if (activeSessionId && activeSessionDetails) {
                    const updatedSess = { ...activeSessionDetails, system_prompt: val };
                    setActiveSessionDetails(updatedSess);
                    setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, system_prompt: val } : s));
                    await apiFetch('/api/sessions/update_settings', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ session_id: activeSessionId, system_prompt: val })
                    });
                  } else {
                    const nextSettings = { ...settings, system_prompt: val };
                    setSettings(nextSettings);
                    apiFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nextSettings) });
                  }
                }}
              />
              <span className="setting-help-text">Sets the agent identity, behavior guidelines, and baseline rules.</span>
            </div>

            <div className="setting-block gap-8">
              <div className="label-row flex-between">
                <label className="setting-label-bold">Context Limit</label>
                <span className="setting-value-num">
                  {curLimit}
                  {renderResetIndicator('context_limit', curLimit, currentPreset.context_limit ?? 2048, () => resetField('context_limit', currentPreset.context_limit ?? 2048))}
                </span>
              </div>
              <input 
                type="range" 
                className="setting-range-slider"
                min="512" 
                max="8192" 
                step="128"
                value={curLimit}
                onChange={e => {
                  const val = parseInt(e.target.value);
                  const nextSettings = { ...settings, context_limit: val };
                  setSettings(nextSettings);
                  apiFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nextSettings) });
                }}
              />
              <span className="setting-help-text">Max historical tokens sent to LLM. Greater values use more RAM.</span>
            </div>

            <div className="setting-block gap-8">
              <div className="label-row flex-between">
                <label className="setting-label-bold">CPU Threads</label>
                <span className="setting-value-num">
                  {curThreads}
                  {renderResetIndicator('cpu_threads', curThreads, currentPreset.cpu_threads ?? 4, () => resetField('cpu_threads', currentPreset.cpu_threads ?? 4))}
                </span>
              </div>
              <input 
                type="range" 
                className="setting-range-slider"
                min="1" 
                max="16" 
                step="1"
                value={curThreads}
                onChange={e => {
                  const val = parseInt(e.target.value);
                  const nextSettings = { ...settings, cpu_threads: val };
                  setSettings(nextSettings);
                  apiFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nextSettings) });
                }}
              />
              <span className="setting-help-text">Threads allocated for local model inference. Recommended: CPU physical cores.</span>
            </div>

          </div>
        </details>

        {/* Accordion 2: Sampler Settings */}
        <details className="setting-accordion" open>
          <summary className="accordion-header">Sampler Settings</summary>
          <div className="accordion-content">

            <div className="setting-block gap-8">
              <div className="label-row flex-between">
                <label className="setting-label-bold">Temperature</label>
                <span className="setting-value-num">
                  {curTemp.toFixed(2)}
                  {renderResetIndicator('temperature', curTemp, currentPreset.temperature ?? 0.7, () => resetField('temperature', currentPreset.temperature ?? 0.7))}
                </span>
              </div>
              <input 
                type="range" 
                className="setting-range-slider"
                min="0.0" 
                max="1.5" 
                step="0.05"
                value={curTemp}
                onChange={async e => {
                  const val = parseFloat(e.target.value);
                  if (activeSessionId && activeSessionDetails) {
                    const updatedSess = { ...activeSessionDetails, temperature: val };
                    setActiveSessionDetails(updatedSess);
                    setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, temperature: val } : s));
                    await apiFetch('/api/sessions/update_settings', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ session_id: activeSessionId, temperature: val })
                    });
                  } else {
                    const nextSettings = { ...settings, temperature: val };
                    setSettings(nextSettings);
                    apiFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nextSettings) });
                  }
                }}
              />
              <span className="setting-help-text">Controls randomness: lower is focused, higher is creative.</span>
            </div>

            <div className="setting-block gap-8">
              <div className="label-row flex-between">
                <label className="setting-label-bold">Top K</label>
                <span className="setting-value-num">
                  {curTopK}
                  {renderResetIndicator('top_k', curTopK, currentPreset.top_k ?? 40, () => resetField('top_k', currentPreset.top_k ?? 40))}
                </span>
              </div>
              <input 
                type="range" 
                className="setting-range-slider"
                min="1" 
                max="100" 
                step="1"
                value={curTopK}
                onChange={e => {
                  const val = parseInt(e.target.value);
                  const nextSettings = { ...settings, top_k: val };
                  setSettings(nextSettings);
                  apiFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nextSettings) });
                }}
              />
              <span className="setting-help-text">Limits selection list size to the top K highest-probability tokens.</span>
            </div>

            <div className="setting-block gap-8">
              <div className="label-row flex-between">
                <label className="setting-label-bold">Top P</label>
                <span className="setting-value-num">
                  {curTopP.toFixed(2)}
                  {renderResetIndicator('top_p', curTopP, currentPreset.top_p ?? 0.95, () => resetField('top_p', currentPreset.top_p ?? 0.95))}
                </span>
              </div>
              <input 
                type="range" 
                className="setting-range-slider"
                min="0.0" 
                max="1.0" 
                step="0.05"
                value={curTopP}
                onChange={e => {
                  const val = parseFloat(e.target.value);
                  const nextSettings = { ...settings, top_p: val };
                  setSettings(nextSettings);
                  apiFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nextSettings) });
                }}
              />
              <span className="setting-help-text">Nucleus sampling: discards tokens below cumulative probability threshold P.</span>
            </div>

            <div className="setting-block gap-8">
              <div className="label-row flex-between">
                <label className="setting-label-bold">Min P</label>
                <span className="setting-value-num">
                  {curMinP.toFixed(2)}
                  {renderResetIndicator('min_p', curMinP, currentPreset.min_p ?? 0.05, () => resetField('min_p', currentPreset.min_p ?? 0.05))}
                </span>
              </div>
              <input 
                type="range" 
                className="setting-range-slider"
                min="0.0" 
                max="1.0" 
                step="0.01"
                value={curMinP}
                onChange={e => {
                  const val = parseFloat(e.target.value);
                  const nextSettings = { ...settings, min_p: val };
                  setSettings(nextSettings);
                  apiFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nextSettings) });
                }}
              />
              <span className="setting-help-text">Discards tokens with probability below this value relative to the top token.</span>
            </div>

          </div>
        </details>

        <div className="setting-block">
          <button className="pill gradient-btn" onClick={handleSaveActivePresetChanges}>
            Save Parameter Changes
          </button>
        </div>
      </div>
    </div>
  );
}
