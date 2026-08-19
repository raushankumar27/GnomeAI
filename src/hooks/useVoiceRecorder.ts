import { useState, useRef, useEffect } from 'react';

interface VoiceRecorderOptions {
  backendPort: number;
  chatInput: string;
  setChatInput: (text: string) => void;
  showToast?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

export function useVoiceRecorder({ backendPort, chatInput, setChatInput, showToast }: VoiceRecorderOptions) {
  const [isRecordingVoice, setIsRecordingVoice] = useState<boolean>(false);
  const [isTranscribingVoice, setIsTranscribingVoice] = useState<boolean>(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const chatInputRef = useRef<string>('');
  const isRecordingRef = useRef<boolean>(false);
  const isTranscribingStreamRef = useRef<boolean>(false);

  useEffect(() => {
    chatInputRef.current = chatInput;
  }, [chatInput]);

  useEffect(() => {
    isRecordingRef.current = isRecordingVoice;
  }, [isRecordingVoice]);

  const startVoiceRecording = async () => {
    audioChunksRef.current = [];
    isTranscribingStreamRef.current = false;
    const initialPromptText = chatInputRef.current;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      const sendInterimTranscription = async () => {
        if (isTranscribingStreamRef.current || audioChunksRef.current.length === 0) return;
        isTranscribingStreamRef.current = true;
        try {
          const currentBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
          if (currentBlob.size < 1000) return;

          const formData = new FormData();
          formData.append('file', currentBlob, 'recording.webm');

          const res = await fetch(`http://127.0.0.1:${backendPort}/api/stt/transcribe`, {
            method: 'POST',
            body: formData
          });

          if (res.ok) {
            const data = await res.json();
            if (data.success && data.text && isRecordingRef.current) {
              const liveText = initialPromptText ? (initialPromptText + ' ' + data.text).trim() : data.text.trim();
              setChatInput(liveText);

              const textarea = document.querySelector('.chat-footer textarea') as HTMLTextAreaElement;
              if (textarea) {
                textarea.style.height = 'auto';
                textarea.style.height = textarea.scrollHeight + 'px';
              }
            }
          }
        } catch (err) {
          // Ignore transient intermediate chunk errors
        } finally {
          isTranscribingStreamRef.current = false;
        }
      };

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          sendInterimTranscription();
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        setIsRecordingVoice(false);
        setIsTranscribingVoice(true);
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
        if (showToast) showToast('⚡ Transcribing voice on Intel Arc GPU...', 'info');

        try {
          const formData = new FormData();
          formData.append('file', audioBlob, 'recording.webm');

          const res = await fetch(`http://127.0.0.1:${backendPort}/api/stt/transcribe`, {
            method: 'POST',
            body: formData
          });

          if (res.ok) {
            const data = await res.json();
            if (data.success && data.text) {
              const finalText = initialPromptText ? (initialPromptText + ' ' + data.text).trim() : data.text.trim();
              setChatInput(finalText);
              if (showToast) showToast('🎙️ Speech transcribed!', 'success');

              const textarea = document.querySelector('.chat-footer textarea') as HTMLTextAreaElement;
              if (textarea) {
                textarea.focus();
                setTimeout(() => {
                  textarea.style.height = 'auto';
                  textarea.style.height = textarea.scrollHeight + 'px';
                }, 0);
              }
            } else if (!chatInputRef.current && showToast) {
              showToast('No speech detected in audio.', 'warning');
            }
          } else if (showToast) {
            showToast('Transcription failed on backend server.', 'error');
          }
        } catch (err) {
          console.error('STT error:', err);
          if (showToast) showToast('Speech recognition server error.', 'error');
        } finally {
          setIsRecordingVoice(false);
          setIsTranscribingVoice(false);
        }
      };

      mediaRecorder.start(1200);
      setIsRecordingVoice(true);

      try {
        const sttRes = await fetch(`http://127.0.0.1:${backendPort}/api/stt/status`);
        if (sttRes.ok) {
          const sttData = await sttRes.json();
          if (sttData.status && !sttData.status.loaded && showToast) {
            showToast('🎙️ Loading voice model on demand...', 'info');
          } else if (showToast) {
            showToast('🎙️ Listening voice input...', 'info');
          }
        } else if (showToast) {
          showToast('🎙️ Listening voice input...', 'info');
        }
      } catch (e) {
        if (showToast) showToast('🎙️ Listening voice input...', 'info');
      }
    } catch (err) {
      console.error('Microphone access denied or error:', err);
      if (showToast) showToast('Microphone access denied or unavailable.', 'error');
      setIsRecordingVoice(false);
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    } else {
      setIsRecordingVoice(false);
    }
  };

  const handleVoiceInputToggle = () => {
    if (isRecordingRef.current) {
      stopVoiceRecording();
    } else {
      startVoiceRecording();
    }
  };

  return {
    isRecordingVoice,
    isTranscribingVoice,
    handleVoiceInputToggle,
    startVoiceRecording,
    stopVoiceRecording
  };
}
