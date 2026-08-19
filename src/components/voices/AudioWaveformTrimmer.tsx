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

export default function AudioWaveformTrimmer({ audioBlob, onTrimComplete, onCleanAudio, isCleaning }: AudioWaveformTrimmerProps) {
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
