import { useState } from 'react';

interface ChatEngineOptions {
  activeSessionId: string | null;
  activeMode: 'chat' | 'agent' | 'code' | 'auto' | 'story_reader';
  setChatHistory: React.Dispatch<React.SetStateAction<any[]>>;
  fetchSessions: () => Promise<void>;
  setActiveSessionId: (id: string) => void;
  apiFetch: any;
  showToast?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export function useChatEngine({
  activeSessionId,
  activeMode,
  setChatHistory,
  fetchSessions,
  setActiveSessionId,
  apiFetch,
  showToast
}: ChatEngineOptions) {
  const [chatInput, setChatInput] = useState<string>('');
  const [activeModeState, setActiveModeState] = useState<'chat' | 'agent' | 'code' | 'auto' | 'story_reader'>(activeMode);

  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = customPrompt || chatInput;
    if (!textToSend.trim() || !activeSessionId) return;

    if (!customPrompt) {
      setChatInput('');
    }

    const userMessage = { role: 'user', content: textToSend };
    const initialAssistantMessage = { role: 'assistant', content: '' };

    setChatHistory(prev => [...prev, userMessage, initialAssistantMessage]);

    try {
      const res = await apiFetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: activeSessionId,
          prompt: textToSend,
          mode: activeModeState
        })
      });

      if (!res || !res.success) {
        if (showToast) showToast('Failed to start chat stream', 'error');
      }
    } catch (e: any) {
      if (showToast) showToast(`Chat stream error: ${e.message}`, 'error');
    }
  };

  const handleStopGeneration = async () => {
    try {
      await apiFetch('/api/chat/cancel', { method: 'POST' });
      if (showToast) showToast('🛑 Response generation stopped', 'warning');
    } catch (e: any) {
      console.error('Stop generation error:', e);
    }
  };

  const handleForkSession = async (msgIndex: number) => {
    if (!activeSessionId) return;
    try {
      const res = await apiFetch('/api/sessions/fork', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: activeSessionId, at_index: msgIndex })
      });
      if (res && res.session_id) {
        await fetchSessions();
        setActiveSessionId(res.session_id);
        if (showToast) showToast('🌱 Chat session forked into new branch!', 'success');
      }
    } catch (e: any) {
      if (showToast) showToast(`Fork error: ${e.message}`, 'error');
    }
  };

  const handleResendMessage = async (text: string, userIndex?: number) => {
    if (userIndex !== undefined && activeSessionId) {
      try {
        await apiFetch('/api/sessions/truncate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: activeSessionId, at_index: userIndex })
        });
      } catch (e) {
        console.error('Truncate error:', e);
      }
    }
    handleSendMessage(text);
  };

  return {
    chatInput,
    setChatInput,
    activeModeState,
    setActiveModeState,
    handleSendMessage,
    handleStopGeneration,
    handleForkSession,
    handleResendMessage
  };
}
