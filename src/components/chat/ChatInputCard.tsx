import React from 'react';

interface ChatInputCardProps {
  chatInput: string;
  setChatInput: (text: string) => void;
  handleSendMessage: () => void;
  handleStopGeneration: () => void;
  isGenerating: boolean;
  isRecordingVoice: boolean;
  isTranscribingVoice: boolean;
  handleVoiceInputToggle: () => void;
}

export default function ChatInputCard({
  chatInput,
  setChatInput,
  handleSendMessage,
  handleStopGeneration,
  isGenerating,
  isRecordingVoice,
  isTranscribingVoice,
  handleVoiceInputToggle
}: ChatInputCardProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="chat-footer">
      <div className="chat-input-card">
        <textarea
          className="chat-textarea"
          placeholder="Instruct GnomeAI (Shift+Enter for newline)..."
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
        />

        <div className="flex-between align-center margin-top-4">
          <div className="flex-center gap-6">
            <button
              className={`mic-btn pill ${isRecordingVoice ? 'recording-active' : ''}`}
              title={isRecordingVoice ? 'Stop voice recording' : 'Start Speech-To-Text (Push to talk)'}
              onClick={handleVoiceInputToggle}
            >
              {isRecordingVoice ? '🔴 Recording...' : isTranscribingVoice ? '⚡ Transcribing...' : '🎙️ Voice'}
            </button>
          </div>

          <div className="flex-center gap-6">
            {isGenerating ? (
              <button className="pill btn-danger text-12" onClick={handleStopGeneration}>
                ⏹ Stop
              </button>
            ) : (
              <button
                className="pill gradient-btn text-12"
                onClick={handleSendMessage}
                disabled={!chatInput.trim()}
              >
                Send ➔
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
