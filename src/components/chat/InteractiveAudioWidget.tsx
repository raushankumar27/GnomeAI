import React from 'react';

interface InteractiveAudioWidgetProps {
  recId: string;
  label: string;
  backendPort?: number;
  apiFetch: any;
  showToast?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export default function InteractiveAudioWidget({ recId, label, backendPort, apiFetch, showToast }: InteractiveAudioWidgetProps) {
  const isMaster = label.toLowerCase().includes('master');

  const handleRerollClip = async () => {
    const text = window.prompt("Edit Line Text for Re-roll:", "");
    if (text === null) return;
    const instruct = window.prompt("Edit Voice Prompt / Persona:", "Clear natural voice");
    if (instruct === null) return;

    try {
      if (showToast) showToast("🔄 Re-synthesizing story line audio clip...", "info");
      const data = await apiFetch('/api/story/reroll_line', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clip_id: recId, text, instruct })
      });
      if (data && data.success) {
        if (showToast) showToast("✨ Clip re-synthesized successfully!", "success");
        const host = window.location.hostname || '127.0.0.1';
        const audioElems = document.querySelectorAll(`audio[data-recid="${recId}"]`);
        audioElems.forEach((el: any) => {
          el.src = `http://${host}:${backendPort || 8095}/api/recordings/${recId}/wav?t=${Date.now()}`;
          el.load();
        });
      }
    } catch (e: any) {
      alert(`Re-roll error: ${e.message}`);
    }
  };

  return (
    <div className="interactive-widgets-frame pad-12 margin-y-8 flex-col gap-6" style={{ background: isMaster ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.03)', borderRadius: '10px', border: isMaster ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex-between align-center text-12 font-600 text-primary">
        <span>🎧 {label}</span>
        <div className="flex-center gap-6">
          {!isMaster && (
            <button className="story-action-btn" onClick={handleRerollClip} title="Re-synthesize line audio clip">
              🔄 Re-roll
            </button>
          )}
          <span className="badge-subtle">{isMaster ? 'FULL AUDIOBOOK' : 'READY'}</span>
        </div>
      </div>
      <audio controls data-recid={recId} src={`http://127.0.0.1:${backendPort || 8095}/api/recordings/${recId}/wav`} className="audio-elem-sm w-100 margin-top-4" />
    </div>
  );
}
