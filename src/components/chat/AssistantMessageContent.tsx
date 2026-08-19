import React, { useState } from 'react';
import CodeBlockWidget from './CodeBlockWidget';
import InteractiveAudioWidget from './InteractiveAudioWidget';

function formatInlineMarkdown(text: string) {
  if (!text) return null;
  let res = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  
  res = res.replace(/`([^`]+)`/g, '<code class="inline-code-badge">$1</code>');
  res = res.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  res = res.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return <span dangerouslySetInnerHTML={{ __html: res }} />;
}

interface AssistantMessageContentProps {
  content: string;
  index: number;
  apiFetch: any;
  ttsState: { index: number; type: 'synthesizing' | 'playing' | 'idle'; sentenceIndex?: number; currentTime?: number; duration?: number };
  backendPort?: number;
  showToast?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export default function AssistantMessageContent({
  content,
  index,
  apiFetch,
  ttsState,
  backendPort,
  showToast
}: AssistantMessageContentProps) {
  const [showThinking, setShowThinking] = useState<boolean>(true);

  let bodyText = content
    .replace(/__GNOMEAI_UI__:\s*(\[\s*\{[\s\S]*?\}\s*\]|stats:[^\n]*)/g, '')
    .replace(/__GNOMEAI_STORY_TIMINGS__:\s*\[[\s\S]*?\]/g, '')
    .replace(/__GNOMEAI_STORY_CHOICES__:\s*\[[\s\S]*?\]/g, '')
    .replace(/__GNOMEAI_STORY_SCRIPT__:\s*\{[\s\S]*?\}/g, '')
    .trim();

  const thinkingText = React.useMemo(() => {
    const matches: string[] = [];
    const thinkRegex = /<think>([\s\S]*?)(?:<\/think>|$)/g;
    let match;
    while ((match = thinkRegex.exec(bodyText)) !== null) {
      const val = match[1].trim();
      if (val) matches.push(val);
    }
    return matches.join('\n\n');
  }, [bodyText]);

  const displayBodyText = React.useMemo(() => {
    let text = bodyText;
    text = text.replace(/<think>[\s\S]*?<\/think>/g, '');
    text = text.replace(/<think>[\s\S]*$/g, '');
    return text.trim();
  }, [bodyText]);

  const lines = displayBodyText.split('\n');
  const elements: React.ReactNode[] = [];
  let currentParagraphText = '';
  let globalSentenceCount = 0;

  const renderParagraphSentences = (pText: string) => {
    const sentenceRegex = /[^.!?\u0964\u0965\u3002\uff01\uff1f\u061f]+[.!?\u0964\u0965\u3002\uff01\uff1f\u061f]+(\s+|$)|[^.!?\u0964\u0965\u3002\uff01\uff1f\u061f]+$/g;
    const matches = pText.match(sentenceRegex) || [pText];

    return matches.map((sentenceText, sIdx) => {
      const currentIdx = globalSentenceCount;
      globalSentenceCount++;
      const isActive = ttsState.index === index && ttsState.type === 'playing' && ttsState.sentenceIndex === currentIdx;

      if (isActive) {
        const cleanSentence = sentenceText.replace(/[*_`#]/g, '');
        const words = cleanSentence.split(/(\s+)/);
        const wordsOnly = words.filter(w => w.trim().length > 0);
        const activeWordIndex = Math.floor(((ttsState.currentTime || 0) / (ttsState.duration || 1)) * wordsOnly.length);

        let wordOnlyCounter = 0;
        const wordNodes = words.map((w, wIdx) => {
          if (w.trim().length > 0) {
            const isWordActive = wordOnlyCounter === activeWordIndex;
            wordOnlyCounter++;
            return (
              <span key={wIdx} className={`tts-word ${isWordActive ? 'active-word' : ''}`}>
                {w}
              </span>
            );
          }
          return w;
        });

        return (
          <span key={sIdx} className="tts-sentence active-sentence">
            {wordNodes}
          </span>
        );
      }

      return (
        <span key={sIdx} className="tts-sentence">
          {formatInlineMarkdown(sentenceText)}
        </span>
      );
    });
  };

  const flushParagraph = (key: string) => {
    if (currentParagraphText.trim()) {
      elements.push(
        <div key={key} className="msg-text-content">
          {renderParagraphSentences(currentParagraphText)}
        </div>
      );
      currentParagraphText = '';
    }
  };

  let inCode = false;
  let codeLang = '';
  let codeLines: string[] = [];
  let inCollapsible = false;
  let collapsibleTitle = '';
  let collapsibleLines: string[] = [];
  let inList = false;
  let listType: 'ul' | 'ol' = 'ul';
  let listItems: React.ReactNode[] = [];

  const flushList = (key: string) => {
    if (listItems.length > 0) {
      const ListTag = listType;
      elements.push(
        <ListTag key={key} className="chat-markdown-list margin-y-8 pad-left-20">
          {listItems}
        </ListTag>
      );
      listItems = [];
      inList = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().toLowerCase().startsWith('<details')) {
      flushParagraph(`p-${i}`);
      flushList(`list-${i}`);
      inCollapsible = true;
      collapsibleTitle = 'Details';
      collapsibleLines = [];
      continue;
    }
    if (line.trim().toLowerCase() === '</details>') {
      inCollapsible = false;
      elements.push(
        <details key={`collapse-${i}`} className="agent-details-accordion" open>
          <summary>{collapsibleTitle}</summary>
          <div>{collapsibleLines.join('\n')}</div>
        </details>
      );
      collapsibleLines = [];
      continue;
    }

    const bulletMatch = line.match(/^(\s*)([-*+])\s+(.*)$/);
    const numberedMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);

    if (bulletMatch || numberedMatch) {
      flushParagraph(`p-${i}`);
      const isNumbered = !!numberedMatch;
      const targetType = isNumbered ? 'ol' : 'ul';
      const itemText = isNumbered ? numberedMatch[3] : bulletMatch[3];

      if (!inList || listType !== targetType) {
        flushList(`list-${i}`);
        inList = true;
        listType = targetType;
      }
      listItems.push(
        <li key={`li-${i}-${listItems.length}`} className="chat-list-item margin-y-2">
          {formatInlineMarkdown(itemText)}
        </li>
      );
      continue;
    } else if (inList && line.trim() === '') {
      flushList(`list-${i}`);
    }

    if (line.trim().startsWith('#')) {
      flushParagraph(`p-${i}`);
      flushList(`list-${i}`);
      const match = line.trim().match(/^(#{1,6})\s*(.*)$/);
      if (match && match[2].trim()) {
        const level = match[1].length;
        const text = match[2].trim();
        const HeadingTag = `h${level}` as any;
        elements.push(<HeadingTag key={`h-${i}`}>{formatInlineMarkdown(text)}</HeadingTag>);
        continue;
      }
    }

    if (line.trim().startsWith('```')) {
      if (inCode) {
        inCode = false;
        elements.push(<CodeBlockWidget key={`code-${i}`} code={codeLines.join('\n')} lang={codeLang} apiFetch={apiFetch} />);
        codeLines = [];
      } else {
        flushParagraph(`p-${i}`);
        flushList(`list-${i}`);
        inCode = true;
        codeLang = line.trim().slice(3);
      }
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (line.trim().startsWith('__GNOMEAI_AUDIO__:')) {
      flushParagraph(`p-${i}`);
      flushList(`list-${i}`);
      const raw = line.trim().substring(18);
      const firstColon = raw.indexOf(':');
      let recId = raw;
      let label = 'Audio Clip';
      if (firstColon !== -1) {
        recId = raw.substring(0, firstColon);
        label = raw.substring(firstColon + 1) || 'Audio Clip';
      }
      elements.push(<InteractiveAudioWidget key={`audio-${i}`} recId={recId} label={label} backendPort={backendPort} apiFetch={apiFetch} showToast={showToast} />);
      continue;
    }

    if (line.trim().startsWith('✅') || line.trim().startsWith('❌') || line.trim().startsWith('* Auto-routed') || line.trim().startsWith('* Phase') || line.trim().startsWith('* Executing') || line.trim().startsWith('* Running')) {
      flushParagraph(`p-${i}`);
      flushList(`list-${i}`);
      let cls = 'agent-status-label';
      let symbol = '● ';
      let text = line.trim();

      if (text.startsWith('✅')) {
        cls += ' status-success';
        symbol = '✓ ';
        text = text.replace('✅', '').trim();
      } else if (text.startsWith('❌')) {
        cls += ' status-error';
        symbol = '❌ ';
        text = text.replace('❌', '').trim();
      } else if (text.startsWith('*')) {
        cls += ' status-warning';
        text = text.replace('*', '').trim();
      }

      elements.push(
        <div key={`status-${i}`} className={`${cls} status-pill-line`}>
          <span>{symbol}</span>
          {formatInlineMarkdown(text)}
        </div>
      );
      continue;
    }

    currentParagraphText += (currentParagraphText ? '\n' : '') + line;
  }

  flushList('list-end');
  flushParagraph('p-last');

  if (inCode && codeLines.length > 0) {
    elements.push(<CodeBlockWidget key="code-streaming" code={codeLines.join('\n')} lang={codeLang} apiFetch={apiFetch} />);
  }

  return (
    <div className="message-content assistant-flat-content">
      {thinkingText && (
        <details className="thinking-accordion margin-bottom-10" open={showThinking}>
          <summary onClick={() => setShowThinking(!showThinking)}>
            🧠 Reasoning Chain ({thinkingText.split('\n').length} lines)
          </summary>
          <div className="thinking-content-box pad-10 font-mono text-12">
            {thinkingText}
          </div>
        </details>
      )}
      {elements}
    </div>
  );
}
