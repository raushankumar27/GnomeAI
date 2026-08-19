const promptInput = document.getElementById('prompt-input');
const btnMic = document.getElementById('btn-mic');
const spinner = document.getElementById('spinner');
const responseBox = document.getElementById('response-box');
const responseScroll = document.getElementById('response-scroll');
const btnRunCode = document.getElementById('btn-run-code');
const btnExpandSession = document.getElementById('btn-expand-session');
const btnOpenStudio = document.getElementById('btn-open-studio');
const btnClose = document.getElementById('btn-close');

let isRecording = false;
let recognition = null;
let serverUrl = 'http://localhost:8095';
let detectedPythonCode = '';

// Load active backend port
if (window.electronAPI && window.electronAPI.getBackendPort) {
  window.electronAPI.getBackendPort().then(port => {
    serverUrl = `http://localhost:${port}`;
  });
}

// Reset overlay state to folded
function resetOverlayState() {
  responseBox.style.display = 'none';
  responseScroll.innerHTML = '';
  btnRunCode.style.display = 'none';
  detectedPythonCode = '';
  promptInput.disabled = false;
  promptInput.value = '';
  if (window.electronAPI && window.electronAPI.resizeOverlay) {
    window.electronAPI.resizeOverlay(600, 90);
  }
}

// Close overlay on Escape key
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeOverlay();
  }
});

promptInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const text = promptInput.value.trim();
    if (text) {
      submitPrompt(text);
    }
  }
});

// Setup button actions
btnOpenStudio.addEventListener('click', () => {
  if (window.electronAPI && window.electronAPI.showStudio) {
    window.electronAPI.showStudio();
  }
  closeOverlay();
});

btnExpandSession.addEventListener('click', async () => {
  try {
    let sessionId = null;
    const sessionRes = await fetch(`${serverUrl}/api/sessions`);
    if (sessionRes.ok) {
      const sessionData = await sessionRes.json();
      if (sessionData.sessions && sessionData.sessions.length > 0) {
        sessionId = sessionData.sessions[0].id;
      }
    }
    if (window.electronAPI && window.electronAPI.expandSession) {
      window.electronAPI.expandSession(sessionId);
    }
  } catch (err) {
    console.error('Failed to get session for expand:', err);
    if (window.electronAPI && window.electronAPI.showStudio) {
      window.electronAPI.showStudio();
    }
  }
  closeOverlay();
});

btnClose.addEventListener('click', () => {
  closeOverlay();
});

btnRunCode.addEventListener('click', () => {
  if (detectedPythonCode) {
    submitPrompt(`Please execute this sandbox python code:\n\n\`\`\`python\n${detectedPythonCode}\n\`\`\``);
  }
});

// Setup speech recognition using MediaRecorder and backend STT api
let mediaRecorder = null;
let audioChunks = [];
let isTranscribingStream = false;

async function startRecording() {
  audioChunks = [];
  isTranscribingStream = false;
  const initialValue = promptInput.value;
  
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    
    const sendInterimTranscription = async () => {
      if (isTranscribingStream || audioChunks.length === 0) return;
      isTranscribingStream = true;
      try {
        const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        if (audioBlob.size < 1000) return;
        
        const formData = new FormData();
        formData.append('file', audioBlob, 'recording.webm');
        
        const res = await fetch(`${serverUrl}/api/stt/transcribe`, {
          method: 'POST',
          body: formData
        });
        
        if (res.ok && isRecording) {
          const data = await res.json();
          if (data.success && data.text) {
            promptInput.value = initialValue ? `${initialValue} ${data.text}`.trim() : data.text.trim();
          }
        }
      } catch (err) {
        // Ignore transient chunk errors
      } finally {
        isTranscribingStream = false;
      }
    };

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
        sendInterimTranscription();
      }
    };
    
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(track => track.stop());
      
      const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      promptInput.placeholder = '⚡ Transcribing speech on Intel Arc GPU...';
      promptInput.disabled = true;
      if (spinner) spinner.style.display = 'block';
      
      try {
        const formData = new FormData();
        formData.append('file', audioBlob, 'recording.webm');
        
        const res = await fetch(`${serverUrl}/api/stt/transcribe`, {
          method: 'POST',
          body: formData
        });
        
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.text) {
            const finalText = initialValue ? `${initialValue} ${data.text}`.trim() : data.text.trim();
            promptInput.value = finalText;
            submitPrompt(finalText);
          } else if (!promptInput.value) {
            promptInput.placeholder = 'No speech detected.';
            setTimeout(() => {
              promptInput.placeholder = 'Instruct GnomeAI...';
            }, 2000);
          } else {
            submitPrompt(promptInput.value);
          }
        } else {
          if (promptInput.value) {
            submitPrompt(promptInput.value);
          } else {
            promptInput.placeholder = 'Transcription failed.';
            setTimeout(() => {
              promptInput.placeholder = 'Instruct GnomeAI...';
            }, 2000);
          }
        }
      } catch (err) {
        console.error('STT error:', err);
        promptInput.placeholder = 'STT backend error.';
        setTimeout(() => {
          promptInput.placeholder = 'Instruct GnomeAI...';
        }, 2000);
      } finally {
        promptInput.disabled = false;
        if (spinner && !isRecording) spinner.style.display = 'none';
      }
    };
    
    mediaRecorder.start(1200);
    isRecording = true;
    btnMic.classList.add('active');
    promptInput.placeholder = 'Listening... (Click mic to stop)';

    // Check if STT model is loaded or loading on demand
    try {
      fetch(`${serverUrl}/api/stt/status`)
        .then(res => res.json())
        .then(data => {
          if (data.status && !data.status.loaded && isRecording) {
            promptInput.placeholder = 'Loading voice model... (Click mic to stop)';
          }
        })
        .catch(() => {});
    } catch (e) {}
  } catch (err) {
    console.error('Microphone access denied:', err);
    promptInput.placeholder = 'Mic access denied.';
    setTimeout(() => {
      promptInput.placeholder = 'Instruct GnomeAI...';
    }, 2000);
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  isRecording = false;
  btnMic.classList.remove('active');
  promptInput.placeholder = 'Instruct GnomeAI...';
}

btnMic.addEventListener('click', () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

// Listen to Voice trigger event from system tray click
if (window.electronAPI && window.electronAPI.onTriggerVoice) {
  window.electronAPI.onTriggerVoice(() => {
    if (!isRecording) {
      startRecording();
    }
  });
}

// Minimal markdown parser for simple responses inside overlay
function renderMarkdown(text) {
  // Extract python code blocks
  const codeRegex = /```python\n([\s\S]*?)```/g;
  let match;
  detectedPythonCode = '';
  while ((match = codeRegex.exec(text)) !== null) {
    detectedPythonCode = match[1];
  }

  if (detectedPythonCode) {
    btnRunCode.style.display = 'block';
  } else {
    btnRunCode.style.display = 'none';
  }

  // Basic HTML formatter
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/```python\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');

  return html;
}

async function submitPrompt(text) {
  spinner.style.display = 'block';
  btnMic.style.display = 'none';
  promptInput.disabled = true;
  
  // Expand overlay window size to fit response
  if (window.electronAPI && window.electronAPI.resizeOverlay) {
    window.electronAPI.resizeOverlay(600, 380);
  }
  responseBox.style.display = 'flex';
  responseScroll.innerHTML = '<div style="color: var(--text-dim);">GnomeAI is thinking...</div>';

  try {
    // 1. Get active session ID first
    let sessionId = null;
    const sessionRes = await fetch(`${serverUrl}/api/sessions`);
    if (sessionRes.ok) {
      const sessionData = await sessionRes.json();
      if (sessionData.sessions && sessionData.sessions.length > 0) {
        sessionId = sessionData.sessions[0].id;
      }
    }

    // 2. Call the chat endpoint
    const response = await fetch(`${serverUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        session_id: sessionId
      })
    });

    if (response.ok) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let finalResponse = '';

      responseScroll.innerHTML = '';

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunk = decoder.decode(value, { stream: !done });
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'chat_response') {
                  finalResponse += data.content;
                  responseScroll.innerHTML = renderMarkdown(finalResponse);
                  responseScroll.scrollTop = responseScroll.scrollHeight;
                } else if (data.type === 'success' && data.message) {
                  // Keep success message as fallback
                  if (!finalResponse) {
                    finalResponse = data.message;
                    responseScroll.innerHTML = renderMarkdown(finalResponse);
                  }
                } else if (data.type === 'error') {
                  responseScroll.innerHTML = `<div style="color: #ef4444;">Error: ${data.message}</div>`;
                }
              } catch (e) {
                // Ignore parse errors on partial chunks
              }
            }
          }
        }
      }
    } else {
      responseScroll.innerHTML = '<div style="color: #ef4444;">Failed to execute command on the backend.</div>';
    }
  } catch (err) {
    console.error(err);
    responseScroll.innerHTML = '<div style="color: #ef4444;">Connection to backend server failed.</div>';
  } finally {
    spinner.style.display = 'none';
    btnMic.style.display = 'flex';
    promptInput.disabled = false;
  }
}

function closeOverlay() {
  resetOverlayState();
  if (window.electronAPI && window.electronAPI.hideOverlay) {
    window.electronAPI.hideOverlay();
  }
}
