import React from 'react';

interface ChatWelcomeOverlayProps {
  timeString: string;
  activeModel?: string;
  onSelectPrompt: (prompt: string) => void;
}

export default function ChatWelcomeOverlay({ timeString, activeModel, onSelectPrompt }: ChatWelcomeOverlayProps) {
  const suggestedPrompts = [
    "Write a Python script to monitor system CPU and GPU memory usage.",
    "Explain quantum computing principles using a simple analogy.",
    "Create a movie scene script with realistic dialogue between two characters.",
    "Help me refactor my application code into clean OOP architecture."
  ];

  return (
    <div className="welcome-container">
      <h1 className="welcome-clock">{timeString}</h1>
      <h2 className="welcome-heading">GnomeAI Studio</h2>
      <p className="welcome-subtitle">
        Active Local Model: <strong className="text-primary">{activeModel || 'Offline'}</strong>
      </p>

      <div className="suggested-prompts margin-top-16">
        {suggestedPrompts.map((prompt, idx) => (
          <button
            key={idx}
            className="pill suggestion-card-pill"
            onClick={() => onSelectPrompt(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
