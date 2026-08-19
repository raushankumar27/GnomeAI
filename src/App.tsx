import React, { useState, useEffect } from 'react';
import { SessionType, SettingsType, ModelOption, Toast } from './types';

// Split Modular Subcomponents
import Sidebar from './components/Sidebar';
import ChatPane from './components/ChatPane';
import SkillsPane from './components/SkillsPane';
import LearningsPane from './components/LearningsPane';
import ModelsPane from './components/ModelsPane';
import SettingsPane from './components/SettingsPane';
import VoicesPane from './components/VoicesPane';
import ImageStudioPane from './components/ImageStudioPane';
import McpRegistryPane from './components/McpRegistryPane';
import AgentCanvasPane from './components/AgentCanvasPane';
import PromptModal from './components/PromptModal';
import QuickSettingsDrawer from './components/QuickSettingsDrawer';
import PendingAuthModal from './components/PendingAuthModal';

// Custom Domain Hooks
import { useTooltipPortal } from './hooks/useTooltipPortal';
import { useVoiceRecorder } from './hooks/useVoiceRecorder';
import { usePresets } from './hooks/usePresets';
import { useLearningsAndSkills } from './hooks/useLearningsAndSkills';
import { useSessions } from './hooks/useSessions';
import { useTTSAudio } from './hooks/useTTSAudio';
import { useWebSocketStream } from './hooks/useWebSocketStream';
import { useModelManager } from './hooks/useModelManager';
import { useWorkspaceAgent } from './hooks/useWorkspaceAgent';
import { useChatEngine } from './hooks/useChatEngine';

declare global {
  interface Window {
    electronAPI: {
      platform: string;
      sendNotification: (title: string, body: string) => void;
      getBackendPort: () => Promise<number>;
      onPortUpdated: (callback: (port: number) => void) => void;
      updateTrayModels: (data: { activeModel: string }) => void;
      onTrayLoadModel: (callback: (model: string | null) => void) => void;
      onTrayUnloadModel: (callback: (model: string | null) => void) => void;
      hideOverlay: () => void;
      resizeOverlay: (width: number, height: number) => void;
      showStudio: () => void;
      expandSession: (sessionId: string | null) => void;
      onOpenSession: (callback: (sessionId: string) => void) => void;
      onTriggerVoice: (callback: () => void) => void;
      openDirectoryDialog: () => Promise<string | null>;
      openFileDialog: () => Promise<string | null>;
    };
  }
}

export default function App() {
  // 1. Core Navigation & Tab Routing State
  const [activeTab, setActiveTab] = useState<'chat' | 'skills' | 'learnings' | 'models' | 'settings' | 'voices' | 'images' | 'mcp' | 'canvas'>(() => {
    return (localStorage.getItem('gnomeai_active_tab') as any) || 'chat';
  });
  useEffect(() => { localStorage.setItem('gnomeai_active_tab', activeTab); }, [activeTab]);

  const [backendPort, setBackendPort] = useState<number>(0);
  const [theme, setTheme] = useState<'lm-studio' | 'dark' | 'light'>(() => {
    return (localStorage.getItem('theme') as 'lm-studio' | 'dark' | 'light') || 'lm-studio';
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const [isPromptModalOpen, setIsPromptModalOpen] = useState<boolean>(false);
  const [rightSidebarWidth, setRightSidebarWidth] = useState<number>(300);
  const [isResizingRightSidebar, setIsResizingRightSidebar] = useState<boolean>(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'success') => {
    const id = Date.now().toString() + Math.random().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => { setToasts(prev => prev.filter(t => t.id !== id)); }, 3000);
  };

  const apiFetch = async (endpoint: string, options?: RequestInit) => {
    const port = backendPort || 8095;
    const res = await fetch(`http://127.0.0.1:${port}${endpoint}`, options);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || err.message || 'API request failed');
    }
    return res.json();
  };

  // 2. Settings State
  const [settings, setSettings] = useState<SettingsType>({
    lm_studio_url: 'http://localhost:1234/v1',
    model_name: '',
    inbuilt_model_id: '',
    inbuilt_device: 'auto',
    tts_speed: 1.0,
    enable_tts: false,
    llm_backend: 'inbuilt',
    cpu_threads: 4,
    top_k: 40,
    top_p: 0.95,
    min_p: 0.05,
  });

  useEffect(() => {
    const fontSize = settings.chat_font_size ?? 14.5;
    const fontFamily = settings.chat_font_family || 'Inter';
    document.documentElement.style.setProperty('--chat-font-size', `${fontSize}px`);
    document.documentElement.style.setProperty('--chat-font-family', fontFamily);
  }, [settings.chat_font_size, settings.chat_font_family]);

  // 3. Domain Custom Hooks Composition
  useTooltipPortal();

  const sessionsHook = useSessions(apiFetch, settings.context_limit || 2048);
  const workspaceHook = useWorkspaceAgent(apiFetch, showToast);
  const modelManagerHook = useModelManager(backendPort, apiFetch, showToast);
  const presetsHook = usePresets(apiFetch, showToast);
  const learningsSkillsHook = useLearningsAndSkills(apiFetch, showToast);
  const ttsAudioHook = useTTSAudio({ backendPort, apiFetch });

  const wsStreamHook = useWebSocketStream({
    backendPort,
    activeSessionId: sessionsHook.activeSessionId,
    setChatHistory: sessionsHook.setChatHistory,
    setSessions: sessionsHook.setSessions,
    setPendingAuthRequest: workspaceHook.setPendingAuthRequest,
    showToast
  });

  const chatEngineHook = useChatEngine({
    activeSessionId: sessionsHook.activeSessionId,
    activeMode: 'auto',
    setChatHistory: sessionsHook.setChatHistory,
    fetchSessions: sessionsHook.fetchSessions,
    setActiveSessionId: sessionsHook.setActiveSessionId,
    apiFetch,
    showToast
  });

  const voiceRecorderHook = useVoiceRecorder({
    backendPort,
    chatInput: chatEngineHook.chatInput,
    setChatInput: chatEngineHook.setChatInput,
    showToast
  });

  // Initial Backend Port Resolution
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getBackendPort().then(port => { if (port) setBackendPort(port); });
      window.electronAPI.onPortUpdated(port => { if (port) setBackendPort(port); });
    } else {
      setBackendPort(8095);
    }
  }, []);

  const startResizingRightSidebar = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingRightSidebar(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRightSidebar) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= 260 && newWidth <= 650) setRightSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizingRightSidebar(false);
    if (isResizingRightSidebar) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingRightSidebar]);

  return (
    <div className="app-container flex-row">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        sessions={sessionsHook.sessions}
        activeSessionId={sessionsHook.activeSessionId}
        setActiveSessionId={sessionsHook.setActiveSessionId}
        handleCreateNewChat={sessionsHook.handleCreateNewChat}
        handleDeleteSession={sessionsHook.handleDeleteSession}
        handleRenameSession={sessionsHook.handleRenameSession}
        sidebarCollapsed={sidebarCollapsed}
        setSidebarCollapsed={setSidebarCollapsed}
      />

      <main className="main-content-view flex-column flex-1 overflow-hidden">
        {activeTab === 'chat' && (
          <ChatPane
            chatHistory={sessionsHook.chatHistory}
            chatInput={chatEngineHook.chatInput}
            setChatInput={chatEngineHook.setChatInput}
            handleSendMessage={chatEngineHook.handleSendMessage}
            handleStopGeneration={chatEngineHook.handleStopGeneration}
            isGenerating={wsStreamHook.isGenerating}
            activeMode={chatEngineHook.activeModeState}
            setActiveMode={chatEngineHook.setActiveModeState}
            contextEstimate={sessionsHook.contextEstimate}
            onSpeakMessage={ttsAudioHook.handleSpeakMessage}
            ttsState={ttsAudioHook.ttsState}
            onForkSession={chatEngineHook.handleForkSession}
            onResendMessage={chatEngineHook.handleResendMessage}
            isRecordingVoice={voiceRecorderHook.isRecordingVoice}
            isTranscribingVoice={voiceRecorderHook.isTranscribingVoice}
            handleVoiceInputToggle={voiceRecorderHook.handleVoiceInputToggle}
            backendPort={backendPort}
            apiFetch={apiFetch}
            showToast={showToast}
          />
        )}
        {activeTab === 'skills' && <SkillsPane skills={learningsSkillsHook.skills} activeSkill={learningsSkillsHook.activeSkill} setActiveSkill={learningsSkillsHook.setActiveSkill} skillCode={learningsSkillsHook.skillCode} setSkillCode={learningsSkillsHook.setSkillCode} apiFetch={apiFetch} showToast={showToast} />}
        {activeTab === 'learnings' && <LearningsPane learnings={learningsSkillsHook.learnings} newLearning={learningsSkillsHook.newLearning} setNewLearning={learningsSkillsHook.setNewLearning} handleAddLearning={learningsSkillsHook.handleAddLearning} handleDeleteLearning={learningsSkillsHook.handleDeleteLearning} editingLearningIndex={learningsSkillsHook.editingLearningIndex} setEditingLearningIndex={learningsSkillsHook.setEditingLearningIndex} editingLearningValue={learningsSkillsHook.editingLearningValue} setEditingLearningValue={learningsSkillsHook.setEditingLearningValue} handleSaveEditedLearning={learningsSkillsHook.handleSaveEditedLearning} />}
        {activeTab === 'models' && <ModelsPane modelOptions={modelManagerHook.allModelOptions} hfSearch={modelManagerHook.hfSearch} setHfSearch={modelManagerHook.setHfSearch} onCompileModel={modelManagerHook.handleCompileModel} onAllocateDevice={modelManagerHook.handleAllocateDevice} compileLog={modelManagerHook.compileLog} showLogsPanel={modelManagerHook.showLogsPanel} setShowLogsPanel={modelManagerHook.setShowLogsPanel} compilePrecision={modelManagerHook.compilePrecision} setCompilePrecision={modelManagerHook.setCompilePrecision} />}
        {activeTab === 'settings' && <SettingsPane settings={settings} setSettings={setSettings} theme={theme} setTheme={setTheme} apiFetch={apiFetch} showToast={showToast} />}
        {activeTab === 'voices' && <VoicesPane backendPort={backendPort} apiFetch={apiFetch} showToast={showToast} />}
        {activeTab === 'images' && <ImageStudioPane backendPort={backendPort} apiFetch={apiFetch} showToast={showToast} />}
        {activeTab === 'mcp' && <McpRegistryPane backendPort={backendPort} apiFetch={apiFetch} showToast={showToast} />}
        {activeTab === 'canvas' && <AgentCanvasPane backendPort={backendPort} apiFetch={apiFetch} showToast={showToast} />}
      </main>

      <QuickSettingsDrawer
        rightSidebarWidth={rightSidebarWidth}
        isResizingRightSidebar={isResizingRightSidebar}
        startResizingRightSidebar={startResizingRightSidebar}
        presets={presetsHook.presets}
        activePreset={presetsHook.activePreset}
        setActivePreset={presetsHook.setActivePreset}
        handleApplyPresetWithName={presetsHook.handleApplyPreset}
        handleDeletePresetWithName={presetsHook.handleDeletePreset}
        handleRenamePresetWithName={(name, newName) => presetsHook.handleSavePreset(newName, presetsHook.presets[name])}
        handleCreatePresetWithName={(name) => presetsHook.handleSavePreset(name, settings)}
        handleSaveActivePresetChanges={() => presetsHook.handleSavePreset(presetsHook.activePreset, settings)}
        activeMode={chatEngineHook.activeModeState}
        handleModeChange={chatEngineHook.setActiveModeState}
        activeSessionId={sessionsHook.activeSessionId}
        activeSessionDetails={sessionsHook.activeSessionDetails}
        setActiveSessionDetails={() => {}}
        setSessions={sessionsHook.setSessions}
        settings={settings}
        setSettings={setSettings}
        apiFetch={apiFetch}
        setIsPromptModalOpen={setIsPromptModalOpen}
      />

      <PromptModal
        isOpen={isPromptModalOpen}
        onClose={() => setIsPromptModalOpen(false)}
        systemPrompt={sessionsHook.activeSessionDetails ? (sessionsHook.activeSessionDetails.system_prompt ?? '') : (settings.system_prompt || '')}
        onSavePrompt={async (updatedVal: string) => {
          const nextSettings = { ...settings, system_prompt: updatedVal };
          setSettings(nextSettings);
          apiFetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nextSettings) });
        }}
      />

      <PendingAuthModal
        pendingAuthRequest={workspaceHook.pendingAuthRequest}
        onApprove={workspaceHook.handleApproveCodeAuth}
        onDeny={workspaceHook.handleDenyCodeAuth}
      />

      <div className="toast-wrapper">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
        ))}
      </div>
    </div>
  );
}
