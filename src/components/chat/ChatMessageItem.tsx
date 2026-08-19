import React, { useState } from 'react';
import AssistantMessageContent from './AssistantMessageContent';

interface ChatMessageItemProps {
  msg: any;
  index: number;
  onSpeakMessage?: (text: string, force?: boolean, msgIndex?: number) => void;
  ttsState: { index: number; type: 'synthesizing' | 'playing' | 'idle'; sentenceIndex?: number; currentTime?: number; duration?: number };
  onForkSession?: (msgIndex: number) => void;
  onResendMessage?: (text: string, userIndex?: number) => void;
  backendPort?: number;
  apiFetch: any;
  showToast?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export default function ChatMessageItem({
  msg,
  index,
  onSpeakMessage,
  ttsState,
  onForkSession,
  onResendMessage,
  backendPort,
  apiFetch,
  showToast
}: ChatMessageItemProps) {
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editText, setEditText] = useState<string>(msg.content || '');

  const isUser = msg.role === 'user';

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content || '');
    if (showToast) showToast('Copied message text to clipboard!', 'success');
  };

  const handleSaveEdit = () => {
    if (!editText.trim()) return;
    setIsEditing(false);
    if (onResendMessage) {
      onResendMessage(editText.trim(), index);
    }
  };

  if (isUser) {
    return (
      <div className="message-item user message-item-user margin-y-6">
        <div className="user-message-wrapper flex-col align-end">
          {isEditing ? (
            <div className="edit-user-msg-box pad-8 flex-col gap-6 w-100 max-w-600">
              <textarea
                className="modal-textarea text-13"
                value={editText}
                onChange={e => setEditText(e.target.value)}
                rows={3}
              />
              <div className="flex-end gap-6">
                <button className="pill btn-subtle text-11" onClick={() => setIsEditing(false)}>Cancel</button>
                <button className="pill gradient-btn text-11" onClick={handleSaveEdit}>Save & Submit</button>
              </div>
            </div>
          ) : (
            <div className="user-bubble-box pad-10">
              {msg.content}
            </div>
          )}

          <div className="msg-controls user-msg-controls flex-center gap-4 margin-top-4">
            <button className="msg-control-btn" title="Edit message" onClick={() => setIsEditing(!isEditing)}>
              ✏️
            </button>
            <button className="msg-control-btn" title="Copy message" onClick={handleCopy}>
              📋
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="message-item assistant message-item-assistant margin-y-10">
      <AssistantMessageContent
        content={msg.content || ''}
        index={index}
        apiFetch={apiFetch}
        ttsState={ttsState}
        backendPort={backendPort}
        showToast={showToast}
      />

      <div className="msg-controls assistant-msg-controls flex-center gap-6 margin-top-6">
        <button className="msg-control-btn" title="Copy response" onClick={handleCopy}>
          📋 Copy
        </button>
        {onSpeakMessage && (
          <button className="msg-control-btn" title="Read aloud with Kokoro TTS" onClick={() => onSpeakMessage(msg.content, true, index)}>
            🔊 Speak
          </button>
        )}
        {onForkSession && (
          <button className="msg-control-btn" title="Fork chat from this response" onClick={() => onForkSession(index)}>
            🌱 Fork
          </button>
        )}
      </div>
    </div>
  );
}
