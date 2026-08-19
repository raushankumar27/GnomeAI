import React from 'react';

interface CompileLogConsoleProps {
  compileLog: string;
  showLogsPanel: boolean;
  setShowLogsPanel: (show: boolean) => void;
}

export default function CompileLogConsole({ compileLog, showLogsPanel, setShowLogsPanel }: CompileLogConsoleProps) {
  if (!showLogsPanel) return null;

  return (
    <div className="compile-log-modal-overlay">
      <div className="modal-container max-w-700">
        <div className="modal-header flex-between align-center">
          <h3 className="text-15 font-600 flex-center gap-8">
            💻 OpenVINO Model Compilation Terminal Logs
          </h3>
          <button className="pill modal-close-btn" onClick={() => setShowLogsPanel(false)}>×</button>
        </div>

        <div className="code-block font-mono text-12 pad-12 margin-y-10 max-h-350 overflow-y-auto bg-console text-console round-6">
          <pre>{compileLog || "Awaiting compilation logs..."}</pre>
        </div>

        <div className="modal-footer flex-end">
          <button className="pill btn-subtle text-12" onClick={() => setShowLogsPanel(false)}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
