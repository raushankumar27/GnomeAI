import { useState, useRef } from 'react';

interface TTSAudioOptions {
  backendPort: number;
  apiFetch: any;
}

export function useTTSAudio({ backendPort, apiFetch }: TTSAudioOptions) {
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsQueueRef = useRef<string[]>([]);
  const ttsQueueIndexRef = useRef<number>(0);
  const ttsCancelRef = useRef<boolean>(false);

  const [autoReadEnabled, setAutoReadEnabled] = useState<boolean>(false);
  const [ttsState, setTtsState] = useState<{
    index: number;
    type: 'synthesizing' | 'playing' | 'idle';
    sentenceIndex?: number;
    currentTime?: number;
    duration?: number;
  }>({ index: -1, type: 'idle' });

  const stopCurrentTTSAudio = () => {
    ttsCancelRef.current = true;
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    setTtsState({ index: -1, type: 'idle' });
  };

  const playTTSQueue = async (msgIndex: number) => {
    if (ttsQueueIndexRef.current >= ttsQueueRef.current.length || ttsCancelRef.current) {
      setTtsState({ index: -1, type: 'idle' });
      return;
    }

    const sentence = ttsQueueRef.current[ttsQueueIndexRef.current];
    const sentenceIndex = ttsQueueIndexRef.current;
    setTtsState({ index: msgIndex, type: 'synthesizing', sentenceIndex });

    try {
      const res = await apiFetch('/api/tts/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sentence })
      });

      if (ttsCancelRef.current) {
        setTtsState({ index: -1, type: 'idle' });
        return;
      }

      if (res && res.success && res.rec_id) {
        const audioUrl = `http://127.0.0.1:${backendPort}/api/recordings/${res.rec_id}/wav`;
        const audio = new Audio(audioUrl);
        currentAudioRef.current = audio;

        audio.ontimeupdate = () => {
          if (!ttsCancelRef.current) {
            setTtsState({
              index: msgIndex,
              type: 'playing',
              sentenceIndex,
              currentTime: audio.currentTime,
              duration: audio.duration || 1
            });
          }
        };

        audio.onended = () => {
          if (!ttsCancelRef.current) {
            ttsQueueIndexRef.current++;
            playTTSQueue(msgIndex);
          }
        };

        audio.onerror = () => {
          if (!ttsCancelRef.current) {
            ttsQueueIndexRef.current++;
            playTTSQueue(msgIndex);
          }
        };

        await audio.play();
      } else {
        ttsQueueIndexRef.current++;
        playTTSQueue(msgIndex);
      }
    } catch (err) {
      console.error('TTS speech playback error:', err);
      if (!ttsCancelRef.current) {
        ttsQueueIndexRef.current++;
        playTTSQueue(msgIndex);
      }
    }
  };

  const handleSpeakMessage = (text: string, force: boolean = false, msgIndex: number = -1) => {
    if (!text || (!autoReadEnabled && !force)) return;
    stopCurrentTTSAudio();
    ttsCancelRef.current = false;

    // Segment text by sentence boundaries for speech queueing
    const sentenceRegex = /[^.!?\u0964\u0965\u3002\uff01\uff1f\u061f]+[.!?\u0964\u0965\u3002\uff01\uff1f\u061f]+(\s+|$)|[^.!?\u0964\u0965\u3002\uff01\uff1f\u061f]+$/g;
    const cleanText = text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/[*_`#]/g, '').trim();
    const sentences = cleanText.match(sentenceRegex) || [cleanText];

    ttsQueueRef.current = sentences.map(s => s.trim()).filter(Boolean);
    ttsQueueIndexRef.current = 0;

    if (ttsQueueRef.current.length > 0) {
      playTTSQueue(msgIndex);
    }
  };

  return {
    autoReadEnabled,
    setAutoReadEnabled,
    ttsState,
    stopCurrentTTSAudio,
    handleSpeakMessage
  };
}
