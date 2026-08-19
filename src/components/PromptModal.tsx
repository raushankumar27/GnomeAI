import React from 'react';

interface PromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  systemPrompt: string;
  onSavePrompt: (prompt: string) => void;
}

export default function PromptModal({ isOpen, onClose, systemPrompt, onSavePrompt }: PromptModalProps) {
  if (!isOpen) return null;

  const templates = [
    { label: '🎭 Persona', text: '\n\n[Persona]\nYou are an expert and senior software developer specializing in Linux systems.' },
    { label: '🎯 Output Format', text: '\n\n[Output Format]\nAlways format your responses with structured markdown code blocks and keep reasoning inside a collapsed summary details tag.' },
    { label: '⚠️ Constraints', text: '\n\n[Constraints]\n- Never run commands without explaining what they do.\n- Avoid any destructive actions (like rm -rf).' },
    { label: '🧠 Chain of Thought', text: '\n\n[Reasoning]\nThink step by step before outputting the final answer.' }
  ];

  return (
    <div className="modal-overlay">
      <div className="modal-container">
        <div className="modal-header">
          <h3 className="flex-center gap-8">
            ✍️ Spacious System Prompt Editor
          </h3>
          <button className="pill modal-close-btn" onClick={onClose}>×</button>
        </div>
        
        <span className="setting-help-text">
          Configure the baseline instructions, rules, constraints, and identity for the AI agent.
        </span>

        {/* Quick Templates Blocks Row */}
        <div className="flex-wrap-gap">
          <span className="setting-help-text flex-center">Insert Template:</span>
          {templates.map(tpl => (
            <button 
              key={tpl.label}
              className="pill template-chip"
              onClick={() => {
                const updatedVal = (systemPrompt + tpl.text).trim();
                onSavePrompt(updatedVal);
              }}
            >
              {tpl.label}
            </button>
          ))}
        </div>

        <textarea 
          className="modal-textarea"
          placeholder="Type your system instructions here..."
          value={systemPrompt}
          onChange={e => onSavePrompt(e.target.value)}
        />

        <div className="modal-footer">
          <button className="pill gradient-btn" onClick={onClose}>
            Done & Apply
          </button>
        </div>
      </div>
    </div>
  );
}
