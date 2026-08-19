import React from 'react';
import { ModelOption } from '../../types';

interface ModelDeviceTargetCardProps {
  modelOptions: ModelOption[];
  onAllocateDevice: (modelId: string, device: 'CPU' | 'GPU' | 'XPU' | 'NPU' | 'AUTO') => void;
}

export default function ModelDeviceTargetCard({ modelOptions, onAllocateDevice }: ModelDeviceTargetCardProps) {
  const devices: ('AUTO' | 'CPU' | 'GPU' | 'XPU' | 'NPU')[] = ['AUTO', 'CPU', 'GPU', 'XPU', 'NPU'];

  return (
    <div className="settings-card pad-20 margin-y-12">
      <div className="flex-between align-center margin-bottom-12">
        <div>
          <h3 className="text-16 font-600 text-primary flex-center gap-8">
            🎯 Explicit Hardware Device Allocation Matrix
          </h3>
          <span className="setting-help-text">
            Assign loaded OpenVINO / GGUF models directly to target compute units. Loading fails explicitly with warning if hardware device is unavailable.
          </span>
        </div>
      </div>

      <div className="device-target-grid flex-col gap-10">
        {modelOptions.length === 0 ? (
          <div className="text-dim text-12 pad-12 bg-subtle-card round-8 text-center">
            No active local models detected for device allocation.
          </div>
        ) : (
          modelOptions.map(m => (
            <div key={m.id} className="device-target-row flex-between align-center pad-12 bg-subtle-card round-8 border-subtle-card">
              <div className="flex-col">
                <span className="font-600 text-13 text-primary">{m.name}</span>
                <span className="text-11 text-dim font-mono">{m.id} ({m.source})</span>
              </div>

              <div className="flex-center gap-6">
                {devices.map(d => (
                  <button
                    key={d}
                    className="pill device-alloc-chip text-11 pad-y-4 pad-x-8"
                    onClick={() => onAllocateDevice(m.id, d)}
                    title={`Allocate ${m.name} to ${d}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
