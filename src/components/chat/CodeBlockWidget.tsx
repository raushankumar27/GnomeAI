import React from 'react';

interface CodeBlockWidgetProps {
  code: string;
  lang: string;
  apiFetch: any;
}

export default function CodeBlockWidget({ code, lang, apiFetch }: CodeBlockWidgetProps) {
  const codeLines = code.split('\n');

  if (lang === 'diff') {
    return (
      <div className="git-diff-block margin-y-10">
        <div className="git-diff-header flex-between pad-8">
          <span>📋 Proposed Changes Git Diff Preview</span>
          <span className="diff-tag-subtle">Unsaved Staged Changes</span>
        </div>
        <div className="git-diff-content font-mono text-12 pad-10">
          {codeLines.map((ln, idx) => {
            let cls = 'diff-line';
            if (ln.startsWith('+') && !ln.startsWith('+++')) cls += ' added';
            if (ln.startsWith('-') && !ln.startsWith('---')) cls += ' removed';
            if (ln.startsWith('@@')) cls += ' info';
            return <div key={idx} className={cls}>{ln}</div>;
          })}
        </div>
        <div className="diff-actions-bar pad-8 flex-between">
          <button className="pill btn-discard" onClick={() => apiFetch('/api/code/diff/discard', { method: 'POST' })}>❌ Discard</button>
          <button className="pill btn-apply" onClick={() => apiFetch('/api/code/diff/apply', { method: 'POST' })}>✅ Approve & Apply</button>
        </div>
      </div>
    );
  }

  return (
    <div className="code-wrapper margin-y-10">
      <div className="code-header-bar flex-between pad-6">
        <span className="code-lang-label text-11 font-mono">{lang.toUpperCase() || 'RAW'}</span>
        <button className="code-copy-btn pill" onClick={() => navigator.clipboard.writeText(code)}>
          <svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"/></svg>
          Copy
        </button>
      </div>
      <pre className="code-block pad-12 font-mono text-12 overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  );
}
