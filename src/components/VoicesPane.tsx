import React, { useState, useRef, useEffect } from 'react';

// Utility to convert Web Audio AudioBuffer to WAV Blob
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const out = new DataView(new ArrayBuffer(length));
  let channels: Float32Array[] = [];
  let sampleRate = buffer.sampleRate;
  let offset = 0;
  let pos = 0;

  function setUint16(data: number) { out.setUint16(pos, data, true); pos += 2; }
  function setUint32(data: number) { out.setUint32(pos, data, true); pos += 4; }

  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8);
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt "
  setUint32(16);
  setUint16(1);          // PCM
  setUint16(numOfChan);
  setUint32(sampleRate);
  setUint32(sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);

  setUint32(0x61746164); // "data"
  setUint32(length - pos - 4);

  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (offset < buffer.length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      out.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }
  return new Blob([out], { type: 'audio/wav' });
}

interface AudioWaveformTrimmerProps {
  audioBlob: Blob;
  onTrimComplete: (trimmedBlob: Blob, startSec: number, endSec: number) => void;
  onCleanAudio: () => void;
  isCleaning: boolean;
}

function AudioWaveformTrimmer({ audioBlob, onTrimComplete, onCleanAudio, isCleaning }: AudioWaveformTrimmerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(1);
  const [isCropping, setIsCropping] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    const decode = async () => {
      try {
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);
        if (!isCancelled) {
          setAudioBuffer(decoded);
          setTrimStart(0);
          setTrimEnd(1);
        }
        audioCtx.close();
      } catch (err) {
        console.error("Audio decode error:", err);
      }
    };
    if (audioBlob) decode();
    return () => { isCancelled = true; };
  }, [audioBlob]);

  useEffect(() => {
    if (!audioBuffer || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const channelData = audioBuffer.getChannelData(0);
    const step = Math.ceil(channelData.length / width);
    const amp = height / 2;

    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(0, amp);
    ctx.lineTo(width, amp);
    ctx.stroke();

    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = channelData[i * step + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      const x = i;
      const startX = trimStart * width;
      const endX = trimEnd * width;
      const isSelected = x >= startX && x <= endX;

      const barHeight = Math.max(2, (max - min) * amp);
      ctx.fillStyle = isSelected ? '#38bdf8' : 'rgba(100, 116, 139, 0.35)';
      ctx.fillRect(x, amp - barHeight / 2, 1, barHeight);
    }

    ctx.fillStyle = '#818cf8';
    ctx.fillRect(trimStart * width - 2, 0, 4, height);
    ctx.fillRect(trimEnd * width - 2, 0, 4, height);
  }, [audioBuffer, trimStart, trimEnd]);

  const handleCrop = async () => {
    if (!audioBuffer) return;
    setIsCropping(true);
    try {
      const duration = audioBuffer.duration;
      const startSec = trimStart * duration;
      const endSec = trimEnd * duration;
      const sampleRate = audioBuffer.sampleRate;
      const startFrame = Math.floor(startSec * sampleRate);
      const endFrame = Math.floor(endSec * sampleRate);
      const frameCount = endFrame - startFrame;

      if (frameCount <= 0) return;

      const offlineCtx = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        frameCount,
        sampleRate
      );

      const newBuffer = offlineCtx.createBuffer(
        audioBuffer.numberOfChannels,
        frameCount,
        sampleRate
      );

      for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
        const data = audioBuffer.getChannelData(ch).subarray(startFrame, endFrame);
        newBuffer.copyToChannel(data, ch, 0);
      }

      const source = offlineCtx.createBufferSource();
      source.buffer = newBuffer;
      source.connect(offlineCtx.destination);
      source.start();

      const renderedBuffer = await offlineCtx.startRendering();
      const wavBlob = audioBufferToWavBlob(renderedBuffer);
      onTrimComplete(wavBlob, startSec, endSec);
    } catch (err) {
      console.error("Trim failed:", err);
    } finally {
      setIsCropping(false);
    }
  };

  const totalDuration = audioBuffer ? audioBuffer.duration.toFixed(1) : "0.0";
  const selectedDuration = audioBuffer ? ((trimEnd - trimStart) * audioBuffer.duration).toFixed(1) : "0.0";

  return (
    <div className="waveform-trimmer-box margin-top-8 pad-10 bg-subtle-card round-8 flex-col gap-8">
      <div className="flex-between align-center text-11 text-secondary font-500">
        <span>🌊 Audio Waveform & Interactive Trimmer</span>
        <span>Slice: {selectedDuration}s / {totalDuration}s</span>
      </div>
      <canvas ref={canvasRef} width={360} height={56} className="w-100 round-6 cursor-pointer border-subtle-card" />
      <div className="flex-center gap-10">
        <div className="flex-col flex-grow-1 text-10">
          <label className="text-dim">Start: {(audioBuffer ? trimStart * audioBuffer.duration : 0).toFixed(1)}s</label>
          <input 
            type="range" 
            min={0} 
            max={Math.max(0, trimEnd - 0.05)} 
            step={0.01} 
            value={trimStart} 
            onChange={e => setTrimStart(parseFloat(e.target.value))} 
            className="w-100"
          />
        </div>
        <div className="flex-col flex-grow-1 text-10">
          <label className="text-dim">End: {(audioBuffer ? trimEnd * audioBuffer.duration : 1).toFixed(1)}s</label>
          <input 
            type="range" 
            min={Math.min(1, trimStart + 0.05)} 
            max={1} 
            step={0.01} 
            value={trimEnd} 
            onChange={e => setTrimEnd(parseFloat(e.target.value))} 
            className="w-100"
          />
        </div>
        <div className="flex-center gap-6">
          <button 
            onClick={onCleanAudio} 
            disabled={isCleaning} 
            className="pill btn-subtle-bg text-11 pad-y-4 pad-x-8"
            title="Remove background hiss & noise via FFmpeg filter"
          >
            {isCleaning ? "⏳ Noise Filter..." : "🧹 Clean Noise"}
          </button>
          <button 
            onClick={handleCrop} 
            disabled={isCropping}
            className="pill gradient-btn text-11 pad-y-4 pad-x-10"
          >
            {isCropping ? "✂️..." : "✂️ Crop Trim"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface VoicesPaneProps {
  apiFetch: any;
  showToast: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  backendPort: number;
  settings: any;
  fetchSettings: () => Promise<void>;
}

export default function VoicesPane({ apiFetch, showToast, backendPort, settings, fetchSettings }: VoicesPaneProps) {
  const [activeSubTab, setActiveSubTab] = useState<'design' | 'clone' | 'custom' | 'recordings'>('design');
  const [selectedEngine, setSelectedEngine] = useState<'qwen3' | 'kokoro' | 'gpt_sovits' | 'openvoice'>('qwen3');
  const getSupportedTabs = () => {
    switch (selectedEngine) {
      case 'kokoro':
        return ['custom'];
      case 'gpt_sovits':
        return ['clone', 'custom'];
      case 'openvoice':
        return ['clone', 'custom'];
      case 'qwen3':
      default:
        return ['design', 'clone', 'custom'];
    }
  };

  useEffect(() => {
    const supported = getSupportedTabs();
    if (!supported.includes(activeSubTab)) {
      setActiveSubTab(supported[0] as any);
    }
  }, [selectedEngine]);

  const [customVoices, setCustomVoices] = useState<any[]>([]);
  const [recordings, setRecordings] = useState<any[]>([]);

  const fetchRecordings = async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${backendPort}/api/recordings`);
      if (response.ok) {
        const data = await response.json();
        setRecordings(data.recordings || []);
      }
    } catch (e) {
      console.error("Failed to fetch recordings:", e);
    }
  };

  const handleDeleteRecording = async (recId: string) => {
    if (!window.confirm("Are you sure you want to delete this recording?")) return;
    try {
      const response = await fetch(`http://127.0.0.1:${backendPort}/api/recordings/${recId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        showToast("Recording deleted", "success");
        fetchRecordings();
      } else {
        showToast("Delete failed", "error");
      }
    } catch (e) {
      showToast("Connection failed", "error");
    }
  };

  useEffect(() => {
    fetchRecordings();
  }, [backendPort, activeSubTab]);

  // Shared Constants
  const languages = ["Auto", "Hindi", "English", "Chinese", "Japanese", "Korean", "French", "German", "Spanish", "Portuguese", "Russian"];
  const modelSizes = ["0.6B", "1.7B"];
  const speakers = ["Aiden", "Dylan", "Eric", "Ono_anna", "Ryan", "Serena", "Sohee", "Uncle_fu", "Vivian"];

  const getSpeakersForEngine = () => {
    if (selectedEngine === 'kokoro' || selectedEngine === 'openvoice' || selectedEngine === 'gpt_sovits') {
      return [
        { id: "af_sarah", name: "Sarah (Female US)" },
        { id: "af_bella", name: "Bella (Female US)" },
        { id: "af_nicole", name: "Nicole (Female US)" },
        { id: "af_sky", name: "Sky (Female US)" },
        { id: "am_adam", name: "Adam (Male US)" },
        { id: "am_michael", name: "Michael (Male US)" },
        { id: "bf_emma", name: "Emma (Female UK)" },
        { id: "bf_isabella", name: "Isabella (Female UK)" },
        { id: "bm_george", name: "George (Male UK)" },
        { id: "bm_lewis", name: "Lewis (Male UK)" }
      ];
    } else {
      return [
        { id: "Aiden", name: "Aiden" },
        { id: "Dylan", name: "Dylan" },
        { id: "Eric", name: "Eric" },
        { id: "Ono_anna", name: "Ono Anna" },
        { id: "Ryan", name: "Ryan" },
        { id: "Serena", name: "Serena" },
        { id: "Sohee", name: "Sohee" },
        { id: "Uncle_fu", name: "Uncle Fu" },
        { id: "Vivian", name: "Vivian" }
      ];
    }
  };

  useEffect(() => {
    const defaultSpeaker = selectedEngine === 'kokoro' || selectedEngine === 'openvoice' ? 'af_sarah' : 'Ryan';
    setTtsSpeaker(defaultSpeaker);
  }, [selectedEngine]);

  // Voice Design Tab States
  const [designText, setDesignText] = useState<string>(() => {
    return localStorage.getItem('gnomeai_voices_designText') || "It's in the top drawer... wait, it's empty? No way, that's impossible! I'm sure I put it there!";
  });
  const [designLang, setDesignLang] = useState("Auto");
  const [designInstruct, setDesignInstruct] = useState<string>(() => {
    return localStorage.getItem('gnomeai_voices_designInstruct') || "Speak in an incredulous tone, but with a hint of panic beginning to creep into your voice.";
  });
  const [designAudio, setDesignAudio] = useState<string | null>(null);
  const [designAudioBlob, setDesignAudioBlob] = useState<Blob | null>(null);
  const [designStatus, setDesignStatus] = useState("");
  const [isDesigning, setIsDesigning] = useState(false);

  // Voice Clone Tab States
  const [selectedRefVoiceName, setSelectedRefVoiceName] = useState("");
  const [cloneRefAudio, setCloneRefAudio] = useState<string | null>(null);
  const [cloneRefAudioBlob, setCloneRefAudioBlob] = useState<Blob | null>(null);
  const [cloneRefText, setCloneRefText] = useState<string>(() => {
    return localStorage.getItem('gnomeai_voices_cloneRefText') || "Hello, I am raushan, this is my voice";
  });
  const [cloneXvector, setCloneXvector] = useState(false);
  const [cloneTargetText, setCloneTargetText] = useState<string>(() => {
    return localStorage.getItem('gnomeai_voices_cloneTargetText') || "Hey, man I want to also go out";
  });
  const [cloneLang, setCloneLang] = useState("Auto");
  const [cloneModelSize, setCloneModelSize] = useState("1.7B");
  const [cloneAudio, setCloneAudio] = useState<string | null>(null);
  const [cloneAudioBlob, setCloneAudioBlob] = useState<Blob | null>(null);
  const [cloneStatus, setCloneStatus] = useState("");
  const [isCloning, setIsCloning] = useState(false);

  // Microphone Recording for Cloning
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // TTS CustomVoice Tab States
  const [ttsText, setTtsText] = useState<string>(() => {
    return localStorage.getItem('gnomeai_voices_ttsText') || "Hello! Welcome to Text-to-Speech system. This is a demo of our TTS capabilities.";
  });
  const [ttsLang, setTtsLang] = useState("English");
  const [ttsSpeaker, setTtsSpeaker] = useState<string>(() => {
    return localStorage.getItem('gnomeai_voices_ttsSpeaker') || "Ryan";
  });
  const [ttsInstruct, setTtsInstruct] = useState("");
  const [ttsModelSize, setTtsModelSize] = useState("1.7B");
  const [ttsAudio, setTtsAudio] = useState<string | null>(null);
  const [ttsAudioBlob, setTtsAudioBlob] = useState<Blob | null>(null);
  const [ttsStatus, setTtsStatus] = useState("");
  const [isTtsGenerating, setIsTtsGenerating] = useState(false);

  // Enhancements States (Features 1, 2, 3, 7)
  const [preprocessAudio, setPreprocessAudio] = useState(true);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isCleaningAudio, setIsCleaningAudio] = useState(false);
  const [isStreamingTTS, setIsStreamingTTS] = useState(false);

  // Auto-Transcribe Reference Audio via STT
  const handleAutoTranscribe = async () => {
    if (!cloneRefAudioBlob) {
      showToast("Please record or upload a reference voice sample first", "warning");
      return;
    }
    setIsTranscribing(true);
    setCloneStatus("Transcribing reference audio via Whisper STT engine...");
    try {
      const formData = new FormData();
      formData.append("file", cloneRefAudioBlob, "ref_audio.wav");
      if (cloneLang && cloneLang !== "Auto") {
        formData.append("language", cloneLang.toLowerCase());
      }
      const response = await fetch(`http://127.0.0.1:${backendPort}/api/stt/transcribe`, {
        method: 'POST',
        body: formData
      });
      if (response.ok) {
        const data = await response.json();
        if (data.text) {
          setCloneRefText(data.text);
          showToast("Audio transcribed successfully!", "success");
          setCloneStatus(`Transcribed: "${data.text.substring(0, 40)}..."`);
        } else {
          showToast("No speech recognized in audio sample", "warning");
        }
      } else {
        showToast("STT transcription failed", "error");
      }
    } catch (err) {
      showToast("Connection error during STT", "error");
    } finally {
      setIsTranscribing(false);
    }
  };

  // Clean Audio & Suppress Noise
  const handleCleanAudioSample = async () => {
    if (!cloneRefAudioBlob) {
      showToast("Please record or upload audio first", "warning");
      return;
    }
    setIsCleaningAudio(true);
    setCloneStatus("Filtering noise & background hiss via FFmpeg filter...");
    try {
      const formData = new FormData();
      formData.append("file", cloneRefAudioBlob, "audio.wav");
      const response = await fetch(`http://127.0.0.1:${backendPort}/api/audio/preprocess`, {
        method: 'POST',
        body: formData
      });
      if (response.ok) {
        const cleanedBlob = await response.blob();
        const cleanedUrl = URL.createObjectURL(cleanedBlob);
        setCloneRefAudio(cleanedUrl);
        setCloneRefAudioBlob(cleanedBlob);
        showToast("Background noise suppressed & audio cleaned!", "success");
        setCloneStatus("Audio preprocessed & cleaned successfully.");
      } else {
        showToast("Audio cleaning failed", "error");
      }
    } catch (err) {
      showToast("Error connecting to backend", "error");
    } finally {
      setIsCleaningAudio(false);
    }
  };

  // Waveform Trim Callback
  const handleTrimComplete = (trimmedBlob: Blob, startSec: number, endSec: number) => {
    const trimmedUrl = URL.createObjectURL(trimmedBlob);
    setCloneRefAudio(trimmedUrl);
    setCloneRefAudioBlob(trimmedBlob);
    showToast(`Audio cropped (${startSec.toFixed(1)}s - ${endSec.toFixed(1)}s)`, "success");
    setCloneStatus(`Audio sample trimmed to ${(endSec - startSec).toFixed(1)} seconds.`);
  };

  // Streaming Audio Synthesizer
  const handleStreamTTSGeneration = async (type: 'design' | 'clone' | 'custom') => {
    setIsStreamingTTS(true);
    const statusSetter = type === 'design' ? setDesignStatus : (type === 'clone' ? setCloneStatus : setTtsStatus);
    statusSetter("⚡ Connecting to backend & initializing local voice model stream...");

    try {
      const response = await fetch(`http://127.0.0.1:${backendPort}/api/tts/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: type === 'design' ? designText : (type === 'clone' ? cloneTargetText : ttsText),
          engine: selectedEngine,
          speaker: ttsSpeaker,
          language: type === 'design' ? designLang : (type === 'clone' ? cloneLang : ttsLang),
          instruct: type === 'design' ? designInstruct : ttsInstruct,
          model_size: ttsModelSize
        })
      });

      if (response.ok && response.body) {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let totalBytes = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            totalBytes += value.length;
            statusSetter(`⚡ Streaming audio packets... Received ${(totalBytes / 1024).toFixed(1)} KB`);
          }
        }

        if (chunks.length === 0 || totalBytes === 0) {
          statusSetter("Streaming error: Received empty audio stream from backend.");
          showToast("Empty audio stream received", "warning");
          return;
        }

        const fullBlob = new Blob(chunks, { type: 'audio/wav' });
        const url = URL.createObjectURL(fullBlob);

        if (type === 'design') { setDesignAudio(url); setDesignAudioBlob(fullBlob); }
        else if (type === 'clone') { setCloneAudio(url); setCloneAudioBlob(fullBlob); }
        else { setTtsAudio(url); setTtsAudioBlob(fullBlob); }

        statusSetter(`Streaming complete! Received ${(totalBytes / 1024).toFixed(1)} KB audio.`);
        showToast("Audio streamed successfully!", "success");

        // Auto play generated audio stream
        try {
          const audioElem = new Audio(url);
          audioElem.play().catch(() => {});
        } catch {}

        fetchRecordings();
      } else {
        let errText = "Streaming request failed";
        try {
          const err = await response.json();
          errText = err.detail || errText;
        } catch {
          errText = await response.text() || errText;
        }
        statusSetter(`Streaming Error: ${errText}`);
        showToast(`Streaming failed: ${errText}`, "error");
      }
    } catch (e) {
      statusSetter(`Streaming Connection Error: ${String(e)}`);
      showToast(`Streaming error: ${String(e)}`, "error");
    } finally {
      setIsStreamingTTS(false);
    }
  };

  // Persistence Effects
  useEffect(() => { localStorage.setItem('gnomeai_voices_designText', designText); }, [designText]);
  useEffect(() => { localStorage.setItem('gnomeai_voices_designInstruct', designInstruct); }, [designInstruct]);
  useEffect(() => { localStorage.setItem('gnomeai_voices_cloneRefText', cloneRefText); }, [cloneRefText]);
  useEffect(() => { localStorage.setItem('gnomeai_voices_cloneTargetText', cloneTargetText); }, [cloneTargetText]);
  useEffect(() => { localStorage.setItem('gnomeai_voices_ttsText', ttsText); }, [ttsText]);
  useEffect(() => { localStorage.setItem('gnomeai_voices_ttsSpeaker', ttsSpeaker); }, [ttsSpeaker]);

  // Save Voice States
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveVoiceName, setSaveVoiceName] = useState("");
  const [voiceToSaveType, setVoiceToSaveType] = useState<'design' | 'clone' | 'custom'>('design');

  // Live log streaming
  const [liveLogs, setLiveLogs] = useState("");
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const fetchLiveLogs = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${backendPort}/api/logs`);
      if (res.ok) {
        const data = await res.json();
        setLiveLogs(data.logs || "");
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    let timer: any = null;
    if (isDesigning || isCloning || isTtsGenerating || isStreamingTTS) {
      fetchLiveLogs();
      timer = setInterval(fetchLiveLogs, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isDesigning, isCloning, isTtsGenerating, isStreamingTTS]);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [liveLogs]);

  useEffect(() => {
    if (backendPort) {
      fetchCustomVoices();
    }
  }, [backendPort, activeSubTab]);

  const fetchCustomVoices = async () => {
    if (!backendPort) return;
    const res = await apiFetch('/api/custom_voices');
    if (res && res.voices) {
      setCustomVoices(res.voices);
    }
  };

  const handleSelectRefVoice = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    setSelectedRefVoiceName(name);
    if (!name) {
      setCloneRefAudio(null);
      setCloneRefAudioBlob(null);
      setCloneRefText("");
      setCloneXvector(false);
      return;
    }
    
    const voice = customVoices.find(v => v.name === name);
    if (voice) {
      setCloneStatus(`Loading saved reference voice: ${name}...`);
      try {
        const res = await fetch(`http://127.0.0.1:${backendPort}/api/custom_voices/audio/${name}`);
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          setCloneRefAudio(url);
          setCloneRefAudioBlob(blob);
          setCloneRefText(voice.ref_text || "");
          setCloneXvector(!!voice.x_vector_only);
          setCloneStatus(`Loaded reference voice: ${name}`);
        } else {
          showToast("Failed to fetch reference audio", "error");
        }
      } catch (e) {
        showToast("Error loading reference voice", "error");
      }
    }
  };

  // Mic Recording implementation
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setCloneRefAudio(audioUrl);
        setCloneRefAudioBlob(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setCloneStatus("Recording voice sample...");
    } catch (err) {
      console.error("Error accessing microphone:", err);
      showToast("Could not access microphone", "error");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setCloneStatus("Recording stopped.");
    }
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setCloneRefAudio(url);
      setCloneRefAudioBlob(file);
      setCloneStatus(`Uploaded voice sample: ${file.name}`);
    }
  };

  // Hinglish to Devanagari Transliteration Utility
  const transliterateHinglishToHindi = (text: string): string => {
    if (!text) return text;
    const wordMap: Record<string, string> = {
      "namaste": "नमस्ते", "namaskar": "नमस्कार", "aap": "आप", "kaise": "कैसे", "kaisa": "कैसा",
      "kaisi": "कैसी", "kya": "क्या", "hal": "हाल", "chal": "चाल", "hai": "है", "hain": "हैं",
      "ho": "हो", "hu": "हूँ", "hoon": "हूँ", "main": "मैं", "mera": "मेरा", "meri": "मेरी",
      "mere": "मेरे", "naam": "नाम", "ye": "यह", "yeh": "यह", "wo": "वह", "woh": "वह",
      "kahan": "कहाँ", "kaha": "कहा", "kab": "कब", "kyun": "क्यों", "kaun": "कौन", "ha": "हाँ",
      "haan": "हाँ", "nahin": "नहीं", "nahi": "नहीं", "achha": "अच्छा", "accha": "अच्छा",
      "thik": "ठीक", "theek": "ठीक", "bohot": "बहुत", "bahut": "बहुत", "shukriya": "शुक्रिया",
      "dhanyawad": "धन्यवाद", "dhanyavad": "धन्यवाद", "bhai": "भाई", "dost": "दोस्त", "karo": "करो",
      "karna": "करना", "kar": "कर", "gaya": "गया", "gayi": "गई", "gaye": "गए", "raha": "रहा",
      "rahi": "रही", "rahe": "रहे", "aaj": "आज", "kal": "कल", "mujhko": "मुझको", "mujhe": "मुझे",
      "tujhe": "तुझे", "is": "इस", "us": "उस", "bhi": "भी", "hi": "ही", "to": "तो", "aur": "और",
      "par": "पर", "se": "से", "ko": "को", "ka": "का", "ki": "की", "ke": "के", "lagta": "लगता"
    };
    return text.split(/(\s+|[.,!?।])/).map(part => {
      const clean = part.toLowerCase().trim();
      return wordMap[clean] || part;
    }).join('');
  };

  // Generation Trigger Functions
  const handleGenerateVoiceDesign = async () => {
    if (!designText.trim() || !designInstruct.trim()) {
      showToast("Please fill all required fields", "warning");
      return;
    }
    setIsDesigning(true);
    setDesignStatus("Processing Voice Design model locally (Synthesizing)...");
    setDesignAudio(null);
    setDesignAudioBlob(null);

    try {
      const response = await fetch(`http://127.0.0.1:${backendPort}/api/voice_design/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: designText,
          language: designLang,
          instruct: designInstruct,
          engine: selectedEngine
        })
      });

      if (response.ok) {
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        setDesignAudio(audioUrl);
        setDesignAudioBlob(audioBlob);
        setDesignStatus("Voice designed & synthesized successfully!");
        showToast("Voice generation complete!", "success");
        fetchRecordings();
      } else {
        let errDetail = "Generation failed";
        try {
          const err = await response.json();
          errDetail = err.detail || errDetail;
        } catch {
          errDetail = await response.text() || errDetail;
        }
        setDesignStatus(`Error: ${errDetail}`);
      }
    } catch (e) {
      setDesignStatus(`Error: ${String(e)}`);
    } finally {
      setIsDesigning(false);
    }
  };

  const handleGenerateVoiceClone = async () => {
    if (!cloneTargetText.trim()) {
      showToast("Please enter target text to synthesize", "warning");
      return;
    }
    if (!cloneRefAudioBlob) {
      showToast("Please record or upload a reference voice sample", "warning");
      return;
    }
    if (!cloneXvector && !cloneRefText.trim()) {
      showToast("Please enter transcript of reference audio", "warning");
      return;
    }

    setIsCloning(true);
    setCloneStatus("Initializing Voice Cloning model locally (Extracting features)...");
    setCloneAudio(null);
    setCloneAudioBlob(null);

    try {
      const formData = new FormData();
      formData.append("file", cloneRefAudioBlob, "ref_audio.wav");
      formData.append("target_text", cloneTargetText);
      formData.append("ref_text", cloneXvector ? "" : cloneRefText);
      formData.append("use_xvector_only", String(cloneXvector));
      formData.append("language", cloneLang);
      formData.append("model_size", cloneModelSize);
      formData.append("engine", selectedEngine);

      const response = await fetch(`http://127.0.0.1:${backendPort}/api/voice_clone/generate`, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        setCloneAudio(audioUrl);
        setCloneAudioBlob(audioBlob);
        setCloneStatus("Voice cloned & target text synthesized successfully!");
        showToast("Voice cloning complete!", "success");
        fetchRecordings();
      } else {
        let errDetail = "Cloning failed";
        try {
          const err = await response.json();
          errDetail = err.detail || errDetail;
        } catch {
          errDetail = await response.text() || errDetail;
        }
        setCloneStatus(`Error: ${errDetail}`);
      }
    } catch (e) {
      setCloneStatus(`Error: ${String(e)}`);
    } finally {
      setIsCloning(false);
    }
  };

  const handleGenerateCustomVoice = async () => {
    if (!ttsText.trim()) {
      showToast("Please enter text to synthesize", "warning");
      return;
    }
    setIsTtsGenerating(true);
    setTtsStatus("Running CustomVoice TTS locally...");
    setTtsAudio(null);
    setTtsAudioBlob(null);

    try {
      const response = await fetch(`http://127.0.0.1:${backendPort}/api/custom_voice/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: ttsText,
          language: ttsLang,
          speaker: ttsSpeaker,
          instruct: ttsInstruct || null,
          model_size: ttsModelSize,
          engine: selectedEngine
        })
      });

      if (response.ok) {
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        setTtsAudio(audioUrl);
        setTtsAudioBlob(audioBlob);
        setTtsStatus("Custom speaker speech generated successfully!");
        showToast("TTS complete!", "success");
        fetchRecordings();
      } else {
        const err = await response.json();
        setTtsStatus(`Error: ${err.detail || "Generation failed"}`);
      }
    } catch (e) {
      setTtsStatus(`Error: ${String(e)}`);
    } finally {
      setIsTtsGenerating(false);
    }
  };

  // Save Voice Logic
  const initiateSaveVoice = (type: 'design' | 'clone' | 'custom') => {
    setVoiceToSaveType(type);
    setSaveVoiceName("");
    setShowSaveModal(true);
  };

  const handleSaveVoice = async () => {
    const trimmedName = saveVoiceName.trim();
    if (!trimmedName) {
      showToast("Please enter a name for the voice", "warning");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("name", trimmedName);
      formData.append("type", voiceToSaveType);

      if (voiceToSaveType === 'clone') {
        if (!cloneRefAudioBlob) return;
        formData.append("file", cloneRefAudioBlob, "ref_audio.wav");
        formData.append("ref_text", cloneRefText);
        formData.append("x_vector_only", String(cloneXvector));
      } else if (voiceToSaveType === 'design') {
        if (!designAudioBlob) return;
        formData.append("file", designAudioBlob, "designed_audio.wav");
        formData.append("description", designInstruct);
      } else if (voiceToSaveType === 'custom') {
        if (!ttsAudioBlob) return;
        formData.append("file", ttsAudioBlob, "custom_audio.wav");
        formData.append("speaker", ttsSpeaker);
        formData.append("description", ttsInstruct);
      }

      const response = await fetch(`http://127.0.0.1:${backendPort}/api/custom_voices/save`, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        showToast(`Voice "${trimmedName}" saved successfully!`, "success");
        setShowSaveModal(false);
        fetchCustomVoices();
        fetchSettings(); // Refresh settings to list new voice in dropdown
      } else {
        const err = await response.json();
        showToast(`Save failed: ${err.detail}`, "error");
      }
    } catch (e) {
      showToast("Failed to connect to backend", "error");
    }
  };

  const handleDeleteCustomVoice = async (voiceName: string) => {
    if (!window.confirm(`Are you sure you want to delete the voice "${voiceName}"?`)) return;
    try {
      const response = await fetch(`http://127.0.0.1:${backendPort}/api/custom_voices/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: voiceName })
      });
      if (response.ok) {
        showToast("Voice deleted", "success");
        fetchCustomVoices();
        fetchSettings();
      }
    } catch (e) {
      showToast("Delete failed", "error");
    }
  };

  return (
    <section className="tab-pane active tab-pane-column" id="pane-voices">
      <header className="view-header flex-shrink-0">
        <span className="view-title">Voice Studio</span>
        <div className="flex-center gap-6 ml-auto">
          {getSupportedTabs().includes('design') && (
            <button className={`nav-btn btn-nav-sub ${activeSubTab === 'design' ? 'active' : ''}`} onClick={() => setActiveSubTab('design')}>Voice Design</button>
          )}
          {getSupportedTabs().includes('clone') && (
            <button className={`nav-btn btn-nav-sub ${activeSubTab === 'clone' ? 'active' : ''}`} onClick={() => setActiveSubTab('clone')}>Voice Clone</button>
          )}
          {getSupportedTabs().includes('custom') && (
            <button className={`nav-btn btn-nav-sub ${activeSubTab === 'custom' ? 'active' : ''}`} onClick={() => setActiveSubTab('custom')}>TTS Predefined</button>
          )}
          <button className={`nav-btn btn-nav-sub ${activeSubTab === 'recordings' ? 'active' : ''}`} onClick={() => setActiveSubTab('recordings')}>Recordings History</button>
        </div>
      </header>

      <div className="pane-split-container flex-grow-1 overflow-hidden">
        {/* Left Side: Parameters / Settings Form */}
        <div className="split-left split-left-50">
          {/* Active TTS Engine Selector */}
          {activeSubTab !== 'recordings' && (
            <div className="setting-block setting-block-border">
              <label className="setting-label-caps">Active TTS Engine</label>
              <select className="dropdown-pill w-100 margin-top-6" value={selectedEngine} onChange={e => setSelectedEngine(e.target.value as any)}>
                <option value="qwen3">Qwen3-TTS (OpenVINO INT8 GPU / Voice Design)</option>
                <option value="kokoro">Kokoro-TTS (ONNX via OpenVINO / Ultra-Fast)</option>
                <option value="gpt_sovits">GPT-SoVITS (ONNX via OpenVINO / Zero-Shot GPU)</option>
                <option value="openvoice">OpenVoice (ONNX via OpenVINO / Tone Transfer GPU)</option>
              </select>
            </div>
          )}

          {activeSubTab === 'design' && (
            <>
              <h3>Create Custom Voice with Natural Language</h3>
              {selectedEngine !== 'qwen3' && (
                <div className="voice-warning-box">
                  ⚠️ Voice Design prompts are only supported by the Qwen3 engine. Other engines will fall back to standard speech generation.
                </div>
              )}
              <div className="setting-block">
                <label>Text to Synthesize</label>
                <textarea
                  rows={3}
                  value={designText}
                  onChange={e => setDesignText(e.target.value)}
                  placeholder="Enter target speech text..."
                />
              </div>
              <div className="setting-block">
                <label>Language</label>
                <select className="dropdown-pill" value={designLang} onChange={e => setDesignLang(e.target.value)}>
                  {languages.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="setting-block">
                <label>Voice Description (Prompts Voice Style/Tone)</label>
                <textarea
                  rows={2}
                  value={designInstruct}
                  onChange={e => setDesignInstruct(e.target.value)}
                  placeholder="e.g., Speak in a low pitch, fast-paced male voice with a British accent."
                />
              </div>
              <div className="flex-center gap-8 margin-top-10">
                <button className="pill gradient-btn flex-grow-1 pad-y-10" onClick={handleGenerateVoiceDesign} disabled={isDesigning || isStreamingTTS}>
                  {isDesigning ? "⏳ Designing Custom Voice..." : "🎨 Design & Generate"}
                </button>
                <button className="pill btn-subtle-bg flex-grow-1 pad-y-10 text-white border-subtle-card flex-center justify-center gap-6" onClick={() => handleStreamTTSGeneration('design')} disabled={isDesigning || isStreamingTTS} title="Stream audio chunks in real-time">
                  {isStreamingTTS ? "⚡ Streaming..." : "⚡ Stream Audio"}
                </button>
              </div>
            </>
          )}

          {activeSubTab === 'clone' && (
            <>
              <h3>Clone Voice from Reference Audio</h3>
              {cloneLang === 'Hindi' && selectedEngine !== 'qwen3' && (
                <div className="voice-warning-box">
                  💡 For Hindi voice cloning, select <strong>Qwen3-TTS (1.7B)</strong> engine for optimal phonetic accuracy and natural Devanagari speech.
                </div>
              )}

              <div className="setting-block">
                <label>Or select from Saved Cloned/Designed Voices</label>
                <select 
                  className="dropdown-pill w-100" 
                  value={selectedRefVoiceName} 
                  onChange={handleSelectRefVoice}
                >
                  <option value="">-- Upload or Record a new sample --</option>
                  {customVoices.filter(v => v.type === 'clone' || v.type === 'design').map(v => (
                    <option key={v.name} value={v.name}>{v.name} ({v.type})</option>
                  ))}
                </select>
              </div>
              
              <div className="setting-block">
                <label>Reference Audio (Upload or Record sample)</label>
                <div className="audio-upload-box">
                  {cloneRefAudio && (
                    <audio src={cloneRefAudio} controls className="audio-elem-sm" />
                  )}
                  <div className="flex-center gap-8 w-100 margin-bottom-4">
                    <button 
                      className={`pill flex-grow-1 pad-y-8 pad-x-12 border-none text-white ${isRecording ? 'btn-danger-bg' : 'btn-subtle-bg'}`} 
                      onClick={isRecording ? stopRecording : startRecording}
                    >
                      {isRecording ? "⏹️ Stop Recording" : "🎙️ Record Audio"}
                    </button>
                    <label className="pill flex-grow-1 pad-y-8 pad-x-12 cursor-pointer text-center flex-center justify-center btn-subtle-bg">
                      📁 Upload File
                      <input type="file" accept="audio/*" className="display-none" onChange={handleAudioUpload} />
                    </label>
                  </div>
                  {cloneRefAudioBlob && (
                    <AudioWaveformTrimmer 
                      audioBlob={cloneRefAudioBlob} 
                      onTrimComplete={handleTrimComplete} 
                      onCleanAudio={handleCleanAudioSample}
                      isCleaning={isCleaningAudio}
                    />
                  )}
                </div>
              </div>

              <div className="setting-block">
                <label className="switch-group switch-label-flex">
                  <input type="checkbox" checked={preprocessAudio} onChange={e => setPreprocessAudio(e.target.checked)} />
                  <span>🧹 Preprocess Audio (Suppress ambient background noise & silence via FFmpeg)</span>
                </label>
              </div>

              <div className="setting-block">
                <label className="switch-group switch-label-flex">
                  <input type="checkbox" checked={cloneXvector} onChange={e => setCloneXvector(e.target.checked)} />
                  <span>Use x-vector only (No reference text needed, but lower quality)</span>
                </label>
              </div>

              {!cloneXvector && (
                <div className="setting-block">
                  <div className="flex-between align-center">
                    <label>Reference Text (Transcript of the reference audio)</label>
                    <div className="flex-center gap-6">
                      <button 
                        type="button" 
                        className="btn-subtle-pill text-11 pad-y-2 pad-x-8"
                        onClick={handleAutoTranscribe}
                        disabled={isTranscribing || !cloneRefAudioBlob}
                        title="Auto-transcribe reference audio using Whisper STT"
                      >
                        {isTranscribing ? "⏳ Transcribing..." : "✨ Auto-Transcribe Sample"}
                      </button>
                      <button 
                        type="button" 
                        className="btn-subtle-pill text-11 pad-y-2 pad-x-8"
                        onClick={() => setCloneRefText(transliterateHinglishToHindi(cloneRefText))}
                        title="Convert Hinglish words to Devanagari script"
                      >
                        ✨ Convert Hinglish → हिन्दी
                      </button>
                    </div>
                  </div>
                  <textarea
                    rows={2}
                    value={cloneRefText}
                    onChange={e => setCloneRefText(e.target.value)}
                    placeholder="Enter what the reference speaker says in the audio..."
                  />
                </div>
              )}

              <div className="setting-block">
                <div className="flex-between align-center">
                  <label>Target Text (Text to synthesize with cloned voice)</label>
                  <button 
                    type="button" 
                    className="btn-subtle-pill text-11 pad-y-2 pad-x-8"
                    onClick={() => setCloneTargetText(transliterateHinglishToHindi(cloneTargetText))}
                    title="Convert Hinglish words to Devanagari script"
                  >
                    ✨ Convert Hinglish → हिन्दी
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={cloneTargetText}
                  onChange={e => setCloneTargetText(e.target.value)}
                  placeholder="Enter the speech content you want to clone the voice for..."
                />
              </div>

              <div className="flex-center gap-12">
                <div className="setting-block flex-grow-1">
                  <label>Language</label>
                  <select className="dropdown-pill" value={cloneLang} onChange={e => setCloneLang(e.target.value)}>
                    {languages.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                {selectedEngine === 'qwen3' && (
                  <div className="setting-block flex-grow-1">
                    <label>Model Size</label>
                    <select className="dropdown-pill" value={cloneModelSize} onChange={e => setCloneModelSize(e.target.value)}>
                      {modelSizes.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex-center gap-8 margin-top-10">
                <button className="pill gradient-btn flex-grow-1 pad-y-10" onClick={handleGenerateVoiceClone} disabled={isCloning || isRecording || isStreamingTTS}>
                  {isCloning ? "⏳ Cloning Voice..." : "🧬 Clone & Generate"}
                </button>
                <button className="pill btn-subtle-bg flex-grow-1 pad-y-10 text-white border-subtle-card flex-center justify-center gap-6" onClick={() => handleStreamTTSGeneration('clone')} disabled={isCloning || isRecording || isStreamingTTS} title="Stream audio chunks in real-time">
                  {isStreamingTTS ? "⚡ Streaming..." : "⚡ Stream Audio"}
                </button>
              </div>
            </>
          )}

           {activeSubTab === 'custom' && (
            <>
              <h3>TTS with Predefined {selectedEngine === 'qwen3' ? 'Qwen3' : (selectedEngine === 'kokoro' ? 'Kokoro' : (selectedEngine === 'openvoice' ? 'OpenVoice' : 'GPT-SoVITS'))} Speakers</h3>
              <div className="setting-block">
                <label>Text to Synthesize</label>
                <textarea
                  rows={3}
                  value={ttsText}
                  onChange={e => setTtsText(e.target.value)}
                  placeholder="Enter target speech text..."
                />
              </div>
              <div className="flex-center gap-12">
                <div className="setting-block flex-grow-1">
                  <label>Language</label>
                  <select className="dropdown-pill" value={ttsLang} onChange={e => setTtsLang(e.target.value)}>
                    {languages.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="setting-block flex-grow-1">
                  <label>Speaker</label>
                  <select className="dropdown-pill" value={ttsSpeaker} onChange={e => setTtsSpeaker(e.target.value)}>
                    <optgroup label="Default Speakers">
                      {getSpeakersForEngine().map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </optgroup>
                    {customVoices.length > 0 && selectedEngine !== 'kokoro' && (
                      <optgroup label="Saved Custom Voices">
                        {customVoices.map(v => (
                          <option key={v.name} value={`custom_${v.name}`}>{v.name}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              </div>
              {selectedEngine === 'qwen3' && (
                <>
                  <div className="setting-block">
                    <label>Style Instruction (Optional)</label>
                    <input
                      type="text"
                      className="dropdown-pill input-pill-full"
                      value={ttsInstruct}
                      onChange={e => setTtsInstruct(e.target.value)}
                      placeholder="e.g., Speak in a cheerful and energetic tone"
                    />
                  </div>
                  <div className="setting-block">
                    <label>Model Size</label>
                    <select className="dropdown-pill" value={ttsModelSize} onChange={e => setTtsModelSize(e.target.value)}>
                      {modelSizes.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </>
              )}

              <div className="flex-center gap-8 margin-top-10">
                <button className="pill gradient-btn flex-grow-1 pad-y-10" onClick={handleGenerateCustomVoice} disabled={isTtsGenerating || isStreamingTTS}>
                  {isTtsGenerating ? "⏳ Generating Speech..." : "🔊 Generate Predefined TTS"}
                </button>
                <button className="pill btn-subtle-bg flex-grow-1 pad-y-10 text-white border-subtle-card flex-center justify-center gap-6" onClick={() => handleStreamTTSGeneration('custom')} disabled={isTtsGenerating || isStreamingTTS} title="Stream audio chunks in real-time">
                  {isStreamingTTS ? "⚡ Streaming..." : "⚡ Stream Audio"}
                </button>
              </div>
            </>
          )}

          {activeSubTab === 'recordings' && (
            <>
              <h3>Generated Recordings History</h3>
              <div className="flex-col gap-12 margin-top-10">
                {recordings.length === 0 ? (
                  <div className="opacity-50 text-13 pad-20 text-center">
                    No generated recordings found.
                  </div>
                ) : (
                  recordings.map(rec => (
                    <div key={rec.id} className="interactive-widgets-frame pad-14 margin-0 flex-col gap-10">
                      <div className="flex-between align-start">
                        <div>
                          <span className="badge-subtle mr-6">
                            {rec.engine.toUpperCase()}
                          </span>
                          <span className="active-mode-badge">
                            {rec.source.toUpperCase()}
                          </span>
                        </div>
                        <span className="text-11 text-dim">
                          {new Date(rec.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="text-13 text-primary font-500 line-break-anywhere">
                        "{rec.text}"
                      </div>
                      {rec.speaker && (
                        <div className="text-12 text-secondary">
                          <strong>Speaker / Info:</strong> {rec.speaker}
                        </div>
                      )}
                      <div className="flex-center gap-10 margin-top-6">
                        <audio 
                          src={`http://127.0.0.1:${backendPort}/api/recordings/${rec.id}/wav`} 
                          controls 
                          className="flex-grow-1 audio-elem-sm" 
                        />
                        <button 
                          onClick={() => handleDeleteRecording(rec.id)} 
                          className="pill btn-unload-pill pad-y-6 pad-x-12" 
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        {/* Right Side: Player Preview & Custom Voice Manager */}
        <div className="split-right split-right-50">
          <div className="table-card card-pad-18">
            <h3>🎧 Output Generation Preview</h3>
            
            {activeSubTab === 'design' && (
              <div className="flex-col gap-12 margin-top-12">
                {designAudio ? (
                  <>
                    <audio src={designAudio} controls className="w-100" />
                    <button className="pill gradient-btn" onClick={() => initiateSaveVoice('design')}>💾 Save Designed Voice style</button>
                  </>
                ) : (
                  <div className="preview-empty-text">
                    No designed voice generated yet. Click generate on the left.
                  </div>
                )}
                {designStatus && (
                  <div className="status-log-stream">
                    <div>{designStatus}</div>
                    {(isDesigning || liveLogs) && (
                      <div className="margin-top-8 border-top-subtle pad-top-8 text-11 text-dim">
                        {liveLogs}
                        <div ref={logEndRef} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeSubTab === 'clone' && (
              <div className="flex-col gap-12 margin-top-12">
                {cloneAudio ? (
                  <>
                    <audio src={cloneAudio} controls className="w-100" />
                    <button className="pill gradient-btn" onClick={() => initiateSaveVoice('clone')}>💾 Save Cloned Reference voice</button>
                  </>
                ) : (
                  <div className="preview-empty-text">
                    No cloned voice generated yet. Setup reference audio on the left.
                  </div>
                )}
                {cloneStatus && (
                  <div className="status-log-stream">
                    <div>{cloneStatus}</div>
                    {(isCloning || liveLogs) && (
                      <div className="margin-top-8 border-top-subtle pad-top-8 text-11 text-dim">
                        {liveLogs}
                        <div ref={logEndRef} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeSubTab === 'custom' && (
              <div className="flex-col gap-12 margin-top-12">
                {ttsAudio ? (
                  <>
                    <audio src={ttsAudio} controls className="w-100" />
                    <button className="pill gradient-btn" onClick={() => initiateSaveVoice('custom')}>💾 Save Custom Preset voice</button>
                  </>
                ) : (
                  <div className="preview-empty-text">
                    No predefined speaker generated yet. Click generate on the left.
                  </div>
                )}
                {ttsStatus && (
                  <div className="status-log-stream">
                    <div>{ttsStatus}</div>
                    {(isTtsGenerating || liveLogs) && (
                      <div className="margin-top-8 border-top-subtle pad-top-8 text-11 text-dim">
                        {liveLogs}
                        <div ref={logEndRef} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Custom Voices List */}
          <div className="table-card card-pad-18 flex-grow-1">
            <h3>👥 Saved Local Custom Voices</h3>
            {customVoices.length === 0 ? (
              <div className="pad-18 text-dim text-125 italic">
                No custom cloned or designed voices saved yet. Generate one above to save it.
              </div>
            ) : (
              <div className="flex-col gap-8 margin-top-12">
                {customVoices.map((v) => (
                  <div key={v.name} className="flex-between pad-y-10 pad-x-14 bg-subtle-card border-subtle-card round-8">
                    <div className="flex-col gap-2">
                      <span className="text-135 text-white font-500">{v.name}</span>
                      <span className="text-11 text-dim">
                        Type: {v.type === 'clone' ? 'Cloned Audio' : v.type === 'design' ? 'Designed Prompt' : 'Custom Preset'}
                      </span>
                    </div>
                    <div className="flex-center gap-8">
                      <audio src={`http://127.0.0.1:${backendPort}/api/custom_voices/audio/${v.name}`} controls className="audio-elem-xs" />
                      <button 
                        className="pill btn-unload-pill pad-y-4 pad-x-10 text-11" 
                        onClick={() => handleDeleteCustomVoice(v.name)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save Modal */}
      {showSaveModal && (
        <div className="modal-overlay">
          <div className="modal-container w-400">
            <h3 className="margin-0">💾 Save Custom Voice</h3>
            <span className="text-125 text-secondary">
              Provide a name for this voice to save it. You will be able to select it as a TTS voice in settings.
            </span>
            <div className="setting-block">
              <label>Voice Name</label>
              <input 
                type="text" 
                className="dropdown-pill input-pill-full" 
                value={saveVoiceName} 
                onChange={e => setSaveVoiceName(e.target.value)} 
                placeholder="e.g. Raushan Cloned"
              />
            </div>
            <div className="flex-center gap-8 justify-end margin-top-6">
              <button className="pill" onClick={() => setShowSaveModal(false)}>Cancel</button>
              <button className="pill gradient-btn" onClick={handleSaveVoice}>Save Voice</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
