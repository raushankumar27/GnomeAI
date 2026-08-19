import React from 'react';
import { SettingsType, ModelOption } from '../types';

interface SettingsPaneProps {
  settings: SettingsType;
  setSettings: (settings: SettingsType) => void;
  handleSaveSettings: () => void;
  customVoices: any[];
  allModelOptions?: ModelOption[];
  theme?: 'lm-studio' | 'dark' | 'light';
  setTheme?: (t: 'lm-studio' | 'dark' | 'light') => void;
}

export default function SettingsPane({
  settings,
  setSettings,
  handleSaveSettings,
  customVoices,
  allModelOptions,
  theme,
  setTheme
}: SettingsPaneProps) {
  return (
    <section className="tab-pane active" id="pane-settings">
      <header className="view-header">
        <span className="view-title">Settings & Configurations</span>
      </header>
      <div className="settings-container">
        <div className="settings-card">
          <h3>Local Models & Playback Settings</h3>
          
          {theme && setTheme && (
            <div className="input-row margin-bottom-16">
              <div className="input-group flex-grow-1">
                <label>App Visual Theme</label>
                <select
                  className="dropdown-pill w-100"
                  value={theme}
                  onChange={e => setTheme(e.target.value as any)}
                >
                  <option value="lm-studio">LM Studio Theme (Dark Charcoal & Royal Violet)</option>
                  <option value="dark">OLED Dark Mode</option>
                  <option value="light">Light Mode</option>
                </select>
              </div>
            </div>
          )}

          <div className="input-row">
            <div className="input-group">
              <label>TTS Speed Rate</label>
              <input 
                type="number" 
                min="0.5" 
                max="2.0" 
                step="0.1"
                value={settings.tts_speed}
                onChange={e => setSettings({ ...settings, tts_speed: parseFloat(e.target.value) })}
              />
            </div>
          </div>



          <div className="input-row margin-top-12">
            <div className="input-group flex-grow-1">
              <label>TTS Voice Preset</label>
              <select
                className="dropdown-pill w-100"
                value={settings.tts_voice || 'af_sarah'}
                onChange={e => setSettings({ ...settings, tts_voice: e.target.value })}
              >
                <option value="af_sarah">Sarah (US Female)</option>
                <option value="af_adam">Adam (US Male)</option>
                <option value="af_bella">Bella (US Female)</option>
                <option value="af_nicole">Nicole (US Female)</option>
                <option value="af_michael">Michael (US Male)</option>
                <option value="bf_emma">Emma (UK Female)</option>
                <option value="bf_george">George (UK Male)</option>
                {customVoices.map(v => (
                  <option key={v.name} value={`custom_${v.name}`}>{v.name} (Local Qwen3-TTS)</option>
                ))}
              </select>
            </div>
          </div>

          <div className="input-row margin-top-12">
            <div className="input-group flex-grow-1">
              <label>Default Model for Extension Launcher</label>
              <select
                className="dropdown-pill w-100"
                value={settings.extension_model_id || ''}
                onChange={e => setSettings({ ...settings, extension_model_id: e.target.value })}
              >
                <option value="">-- Use Active Server Model --</option>
                {allModelOptions?.map(m => (
                  <option key={m.id} value={m.name}>{m.name} ({m.type === 'inbuilt' ? 'OpenVINO' : 'GGUF'})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="action-row margin-top-20">
            <button 
              className="pill gradient-btn"
              onClick={handleSaveSettings}
            >
              Save Configurations
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
