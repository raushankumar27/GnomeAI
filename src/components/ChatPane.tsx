import React, { useState, useEffect, useRef } from 'react';
import ChatHeader from './chat/ChatHeader';
import ChatWelcomeOverlay from './chat/ChatWelcomeOverlay';
import ChatMessageItem from './chat/ChatMessageItem';
import ChatInputCard from './chat/ChatInputCard';

interface ChatPaneProps {
  chatHistory: any[];
  chatInput: string;
  setChatInput: (val: string) => void;
  handleSendMessage: (customPrompt?: string) => void;
  handleStopGeneration: () => void;
  isGenerating: boolean;
  activeMode: 'chat' | 'agent' | 'code' | 'auto' | 'story_reader';
  setActiveMode: (mode: 'chat' | 'agent' | 'code' | 'auto' | 'story_reader') => void;
  contextEstimate: string;
  onSpeakMessage?: (text: string, force?: boolean, msgIndex?: number) => void;
  ttsState: { index: number; type: 'synthesizing' | 'playing' | 'idle'; sentenceIndex?: number; currentTime?: number; duration?: number };
  onForkSession?: (msgIndex: number) => void;
  onResendMessage?: (text: string, userIndex?: number) => void;
  isRecordingVoice: boolean;
  isTranscribingVoice: boolean;
  handleVoiceInputToggle: () => void;
  backendPort?: number;
  apiFetch: any;
  showToast?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export default function ChatPane({
  chatHistory,
  chatInput,
  setChatInput,
  handleSendMessage,
  handleStopGeneration,
  isGenerating,
  activeMode,
  setActiveMode,
  contextEstimate,
  onSpeakMessage,
  ttsState,
  onForkSession,
  onResendMessage,
  isRecordingVoice,
  isTranscribingVoice,
  handleVoiceInputToggle,
  backendPort,
  apiFetch,
  showToast
}: ChatPaneProps) {
  const [focusMode, setFocusMode] = useState<boolean>(() => localStorage.getItem('gnomeai_focus_mode') === 'true');
  const [timeString, setTimeString] = useState<string>('00:00');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeString(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleFocusMode = () => {
    const next = !focusMode;
    setFocusMode(next);
    localStorage.setItem('gnomeai_focus_mode', String(next));
  };

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, isGenerating]);

  return (
    <div className={`chat-pane flex-column flex-1 overflow-hidden ${focusMode ? 'zen-focus-mode' : ''}`}>
      <ChatHeader
        activeSessionDetails={null}
        activeModel="OpenVINO Qwen"
        activeMode={activeMode}
        setActiveMode={setActiveMode}
        contextEstimate={contextEstimate}
        focusMode={focusMode}
        onToggleFocusMode={toggleFocusMode}
      />

      <div className="message-viewport flex-1 overflow-y-auto pad-20">
        {chatHistory.length === 0 ? (
          <ChatWelcomeOverlay
            timeString={timeString}
            activeModel="OpenVINO Qwen"
            onSelectPrompt={(prompt) => handleSendMessage(prompt)}
          />
        ) : (
          <div className="messages-list flex-col gap-12">
            {chatHistory.map((msg, idx) => (
              <ChatMessageItem
                key={idx}
                msg={msg}
                index={idx}
                onSpeakMessage={onSpeakMessage}
                ttsState={ttsState}
                onForkSession={onForkSession}
                onResendMessage={onResendMessage}
                backendPort={backendPort}
                apiFetch={apiFetch}
                showToast={showToast}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <ChatInputCard
        chatInput={chatInput}
        setChatInput={setChatInput}
        handleSendMessage={handleSendMessage}
        handleStopGeneration={handleStopGeneration}
        isGenerating={isGenerating}
        isRecordingVoice={isRecordingVoice}
        isTranscribingVoice={isTranscribingVoice}
        handleVoiceInputToggle={handleVoiceInputToggle}
      />
    </div>
  );
}
