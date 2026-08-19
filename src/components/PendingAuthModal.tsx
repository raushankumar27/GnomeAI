import React from 'react';

interface PendingAuthModalProps {
  pendingAuthRequest: { code: string } | null;
  onApprove: () => void;
  onDeny: () => void;
}

export default function PendingAuthModal({ pendingAuthRequest, onApprove, onDeny }: PendingAuthModalProps) {
  if (!pendingAuthRequest) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-container max-w-600">
        <div className="modal-header">
          <h3 className="text-warning flex-center gap-8">
            ⚠️ Execution Approval Required
          </h3>
          <button className="pill modal-close-btn" onClick={onDeny}>×</button>
        </div>

        <p className="text-13 text-secondary margin-y-8">
          The AI Workspace Developer agent generated code and requires explicit user authorization before executing changes on your workspace environment:
        </p>

        <div className="code-block text-12 font-mono margin-y-10 pad-12 max-h-200 overflow-y-auto">
          <code>{pendingAuthRequest.code}</code>
        </div>

        <div className="modal-footer flex-between">
          <button className="pill btn-danger" onClick={onDeny}>
            ❌ Deny Execution
          </button>
          <button className="pill btn-success" onClick={onApprove}>
            ✅ Authorize & Proceed
          </button>
        </div>
      </div>
    </div>
  );
}
