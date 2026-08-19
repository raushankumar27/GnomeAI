import React from 'react';

interface ChatHeaderProps {
  activeSessionDetails: any;
  activeModel?: string;
  activeMode: 'chat' | 'agent' | 'code' | 'auto' | 'story_reader';
  setActiveMode: (mode: 'chat' | 'agent' | 'code' | 'auto' | 'story_reader') => void;
  contextEstimate: string;
  focusMode: boolean;
  onToggleFocusMode: () => void;
}

export default function ChatHeader({
  activeSessionDetails,
  activeModel,
  activeMode,
  setActiveMode,
  contextEstimate,
  focusMode,
  onToggleFocusMode
}: ChatHeaderProps) {
  return (
    <header className="view-header view-header-minimal">
      <div className="header-left">
        <span className="text-13 font-600 text-primary truncate max-w-220" title={activeSessionDetails?.title || 'New Chat'}>
          {activeSessionDetails?.title || 'New Chat'}
        </span>
        <span className="status-dot online" title="Backend Server Active" />
      </div>

      <div className="header-center flex-center gap-8">
        <span className="minimal-pill-trigger">
          {activeModel || 'Offline'}
        </span>

        <select 
          className="minimal-mode-select"
          value={activeMode}
          onChange={e => setActiveMode(e.target.value as any)}
        >
          <option value="auto">Auto Router</option>
          <option value="chat">Chat Only</option>
          <option value="agent">Desktop Agent</option>
          <option value="code">Code Developer</option>
        </select>
      </div>

      <div className="header-right flex-center gap-10">
        <span className="minimal-context-pill" title="Active Context Usage">
          {contextEstimate}
        </span>

        <button 
          className={`minimal-icon-btn ${focusMode ? 'active' : ''}`}
          onClick={onToggleFocusMode}
          title={focusMode ? 'Exit Zen Focus Mode (Ctrl+Shift+Z)' : 'Enter Zen Focus Mode (Ctrl+Shift+Z)'}
        >
          <svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M7 14H5v5h5v-2H7v-3m-2-4h2V7h3V5H5v5m12 7h-3v2h5v-5h-2v3m0-12h-3v2h3v3h2V5h-2z"/></svg>
        </button>
      </div>
    </header>
  );
}
