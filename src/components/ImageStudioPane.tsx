import React, { useState, useEffect, useRef } from 'react';

interface GalleryImage {
  filename: string;
  url: string;
  path: string;
  created_at?: number;
}

interface ImageStudioPaneProps {
  apiFetch: any;
  showToast: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  backendPort: number;
}

const DEFAULT_IMAGE_MODELS = [
  { id: "runwayml/stable-diffusion-v1-5", name: "Stable Diffusion v1.5 (Standard & Fast)", type: "SD 1.5" },
  { id: "Lykon/dreamshaper-8", name: "DreamShaper v8 (Artistic & Oil Painting Master)", type: "SD 1.5 Fine-tuned" },
  { id: "stablediffusionapi/realistic-vision-v51", name: "Realistic Vision v5.1 (Photorealistic Portraits)", type: "SD 1.5 Fine-tuned" },
  { id: "stabilityai/stable-diffusion-xl-base-1.0", name: "Stable Diffusion XL 1.0 (High Resolution & Detail)", type: "SDXL" },
  { id: "black-forest-labs/FLUX.1-schnell", name: "FLUX.1 Schnell (State-of-the-Art Speed & Quality)", type: "FLUX" },
  { id: "microsoft/Mage-Flow", name: "Microsoft Mage-Flow (4B Native-Res MMDiT)", type: "MAGE" },
  { id: "microsoft/Mage-Flow-Turbo", name: "Microsoft Mage-Flow-Turbo (Fast 4-Step Generation)", type: "MAGE Turbo" },
  { id: "microsoft/Mage-Flow-Edit", name: "Microsoft Mage-Flow-Edit (Instruction Image Editing)", type: "MAGE Edit" },
  { id: "microsoft/Mage-Flow-Edit-Turbo", name: "Microsoft Mage-Flow-Edit-Turbo (Fast 4-Step Editing)", type: "MAGE Edit Turbo" }
];

export default function ImageStudioPane({ apiFetch, showToast, backendPort }: ImageStudioPaneProps) {
  const [activeSubTab, setActiveSubTab] = useState<'text2img' | 'img2img' | 'gallery'>(() => {
    return (localStorage.getItem('gnomeai_imagestudio_subtab') as any) || 'text2img';
  });

  // Text2Img States
  const [prompt, setPrompt] = useState<string>(() => {
    return localStorage.getItem('gnomeai_imagestudio_prompt') || 'A futuristic glowing cyberpunk city on Linux desktop, photorealistic, 8k';
  });
  const [enhancePrompt, setEnhancePrompt] = useState<boolean>(() => {
    return localStorage.getItem('gnomeai_imagestudio_enhancePrompt') !== 'false';
  });
  const [resolution, setResolution] = useState<'512x512' | '768x512' | '512x768' | '768x768'>(() => {
    return (localStorage.getItem('gnomeai_imagestudio_resolution') as any) || '512x512';
  });
  const [steps, setSteps] = useState<number>(() => {
    return Number(localStorage.getItem('gnomeai_imagestudio_steps')) || 20;
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [generatedImgUrl, setGeneratedImgUrl] = useState<string | null>(null);
  const [generatedImgPath, setGeneratedImgPath] = useState<string | null>(null);
  const [enhancedPromptResult, setEnhancedPromptResult] = useState<string | null>(null);
  const [fallbackWarning, setFallbackWarning] = useState<string | null>(null);

  // Img2Img States
  const [refImageFile, setRefImageFile] = useState<File | null>(null);
  const [refImagePreview, setRefImagePreview] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState<string>(() => {
    return localStorage.getItem('gnomeai_imagestudio_editPrompt') || 'An oil painting watercolor portrait of two smiling people, highly detailed';
  });
  const [strength, setStrength] = useState<number>(() => {
    return Number(localStorage.getItem('gnomeai_imagestudio_strength')) || 0.40;
  });

  // Persistence Effects
  useEffect(() => { localStorage.setItem('gnomeai_imagestudio_subtab', activeSubTab); }, [activeSubTab]);
  useEffect(() => { localStorage.setItem('gnomeai_imagestudio_prompt', prompt); }, [prompt]);
  useEffect(() => { localStorage.setItem('gnomeai_imagestudio_enhancePrompt', String(enhancePrompt)); }, [enhancePrompt]);
  useEffect(() => { localStorage.setItem('gnomeai_imagestudio_resolution', resolution); }, [resolution]);
  useEffect(() => { localStorage.setItem('gnomeai_imagestudio_steps', String(steps)); }, [steps]);
  useEffect(() => { localStorage.setItem('gnomeai_imagestudio_editPrompt', editPrompt); }, [editPrompt]);
  useEffect(() => { localStorage.setItem('gnomeai_imagestudio_strength', String(strength)); }, [strength]);

  // Gallery States
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [selectedGalleryImage, setSelectedGalleryImage] = useState<GalleryImage | null>(null);

  // Live Backend Logs
  const [liveLogs, setLiveLogs] = useState('');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const handleEnhancePrompt = async (targetPrompt: string, setTarget: (val: string) => void) => {
    if (!targetPrompt.trim()) {
      showToast('Please enter a prompt to enhance', 'warning');
      return;
    }
    setIsEnhancing(true);
    showToast('✨ Enhancing prompt with AI...', 'info');
    try {
      const res = await fetch(`http://127.0.0.1:${backendPort}/api/image/enhance_prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: targetPrompt })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.enhanced_prompt) {
          setTarget(data.enhanced_prompt);
          showToast('✨ Prompt enhanced! Review and edit it below before generating.', 'success');
        }
      } else {
        showToast('Failed to enhance prompt', 'error');
      }
    } catch (e) {
      showToast('Error enhancing prompt', 'error');
    } finally {
      setIsEnhancing(false);
    }
  };

  const fetchLiveLogs = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${backendPort}/api/logs`);
      if (res.ok) {
        const data = await res.json();
        setLiveLogs(data.logs || '');
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    let timer: any = null;
    if (isGenerating) {
      fetchLiveLogs();
      timer = setInterval(fetchLiveLogs, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isGenerating]);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [liveLogs]);

  // Image Model Selector States
  const [imageModels, setImageModels] = useState<{ id: string; name: string; type: string }[]>(DEFAULT_IMAGE_MODELS);
  const [activeImageModelId, setActiveImageModelId] = useState<string>(() => {
    return localStorage.getItem('gnomeai_imagestudio_modelId') || 'runwayml/stable-diffusion-v1-5';
  });

  const fetchGallery = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${backendPort}/api/image/gallery`);
      if (res.ok) {
        const data = await res.json();
        setGalleryImages(data.images || []);
      }
    } catch (e) {
      console.error('Failed to fetch image gallery:', e);
    }
  };

  const fetchImageModels = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${backendPort}/api/image/models`);
      if (res.ok) {
        const data = await res.json();
        if (data.models) setImageModels(data.models);
        if (data.active_model_id) setActiveImageModelId(data.active_model_id);
      }
    } catch (e) {
      console.error('Failed to fetch image models:', e);
    }
  };

  const handleSelectImageModel = async (modelId: string) => {
    setActiveImageModelId(modelId);
    showToast(`Active image model set to ${modelId}`, 'info');
    try {
      await fetch(`http://127.0.0.1:${backendPort}/api/image/model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: modelId })
      });
      showToast('Image model preference saved', 'success');
    } catch (e) {
      showToast('Failed to save image model', 'error');
    }
  };

  useEffect(() => {
    fetchGallery();
    fetchImageModels();
  }, [backendPort, activeSubTab]);

  const handleRefImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setRefImageFile(file);
      setRefImagePreview(URL.createObjectURL(file));
      showToast(`Loaded reference image: ${file.name}`, 'info');
    }
  };

  const parseWidthHeight = () => {
    const [w, h] = resolution.split('x').map(Number);
    return { width: w, height: h };
  };

  const pollImageJobStatus = async (jobId: string) => {
    return new Promise<any>((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`http://127.0.0.1:${backendPort}/api/image/status/${jobId}`);
          if (res.ok) {
            const data = await res.json();
            if (data.status === 'completed') {
              clearInterval(interval);
              resolve(data.result);
            } else if (data.status === 'failed') {
              clearInterval(interval);
              reject(new Error(data.error || 'Generation failed'));
            }
          }
        } catch (e) {
          // Ignore transient poll fetch errors and retry on next tick
        }
      }, 1000);
    });
  };

  const handleGenerateText2Img = async () => {
    if (!prompt.trim()) {
      showToast('Please enter an image prompt', 'warning');
      return;
    }
    setIsGenerating(true);
    setStatusMessage(`🎨 Initializing model engine (${activeImageModelId}). Downloading weights if needed...`);
    setGeneratedImgUrl(null);
    setGeneratedImgPath(null);
    setEnhancedPromptResult(null);
    setFallbackWarning(null);

    const { width, height } = parseWidthHeight();

    try {
      const formData = new FormData();
      formData.append('prompt', prompt);
      formData.append('enhance_prompt', String(enhancePrompt));
      formData.append('width', String(width));
      formData.append('height', String(height));
      formData.append('steps', String(steps));
      formData.append('model_id', activeImageModelId);

      const res = await fetch(`http://127.0.0.1:${backendPort}/api/image/generate`, {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const startData = await res.json();
        if (startData.job_id) {
          const data = await pollImageJobStatus(startData.job_id);
          const fullUrl = `http://127.0.0.1:${backendPort}${data.url}?t=${Date.now()}`;
          setGeneratedImgUrl(fullUrl);
          setGeneratedImgPath(data.path);
          setEnhancedPromptResult(data.enhanced_prompt);
          if (data.warning) {
            setFallbackWarning(data.warning);
            showToast(data.warning, 'warning');
          }
          setStatusMessage('✨ Image generated successfully!');
          showToast('Image generated!', 'success');
          fetchGallery();
        }
      } else {
        const err = await res.json();
        setStatusMessage(`Error: ${err.detail || 'Generation failed'}`);
        showToast('Generation failed', 'error');
      }
    } catch (e) {
      setStatusMessage(`Error: ${String(e)}`);
      showToast('Connection failed', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateImg2Img = async () => {
    if (!refImageFile) {
      showToast('Please upload a reference image first', 'warning');
      return;
    }
    if (!editPrompt.trim()) {
      showToast('Please enter an edit prompt', 'warning');
      return;
    }
    setIsGenerating(true);
    setStatusMessage('🎨 Running Image-to-Image transformation...');
    setGeneratedImgUrl(null);
    setGeneratedImgPath(null);
    setFallbackWarning(null);

    const { width, height } = parseWidthHeight();

    try {
      const formData = new FormData();
      formData.append('file', refImageFile);
      formData.append('prompt', editPrompt);
      formData.append('enhance_prompt', String(enhancePrompt));
      formData.append('width', String(width));
      formData.append('height', String(height));
      formData.append('steps', String(steps));
      formData.append('strength', String(strength));
      formData.append('model_id', activeImageModelId);

      const res = await fetch(`http://127.0.0.1:${backendPort}/api/image/generate`, {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const startData = await res.json();
        if (startData.job_id) {
          const data = await pollImageJobStatus(startData.job_id);
          const fullUrl = `http://127.0.0.1:${backendPort}${data.url}?t=${Date.now()}`;
          setGeneratedImgUrl(fullUrl);
          setGeneratedImgPath(data.path);
          setEnhancedPromptResult(data.enhanced_prompt);
          if (data.warning) {
            setFallbackWarning(data.warning);
            showToast(data.warning, 'warning');
          }
          setStatusMessage('✨ Image transformed successfully!');
          showToast('Image edited successfully!', 'success');
          fetchGallery();
        }
      } else {
        const err = await res.json();
        setStatusMessage(`Error: ${err.detail || 'Image editing failed'}`);
        showToast('Image editing failed', 'error');
      }
    } catch (e) {
      setStatusMessage(`Error: ${String(e)}`);
      showToast('Connection failed', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteImage = async (filename: string) => {
    if (!window.confirm(`Are you sure you want to delete ${filename}?`)) return;
    try {
      const res = await fetch(`http://127.0.0.1:${backendPort}/api/image/gallery/${filename}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        showToast('Image deleted', 'success');
        if (selectedGalleryImage?.filename === filename) {
          setSelectedGalleryImage(null);
        }
        fetchGallery();
      }
    } catch (e) {
      showToast('Delete failed', 'error');
    }
  };

  return (
    <section className="tab-pane active tab-pane-column" id="pane-imagestudio">
      <header className="view-header flex-shrink-0">
        <span className="view-title">🎨 Image Studio</span>
        <div className="flex-center gap-6 ml-auto">
          <button className={`nav-btn btn-nav-sub ${activeSubTab === 'text2img' ? 'active' : ''}`} onClick={() => setActiveSubTab('text2img')}>
            Text to Image
          </button>
          <button className={`nav-btn btn-nav-sub ${activeSubTab === 'img2img' ? 'active' : ''}`} onClick={() => setActiveSubTab('img2img')}>
            Image Editing (Img2Img)
          </button>
          <button className={`nav-btn btn-nav-sub ${activeSubTab === 'gallery' ? 'active' : ''}`} onClick={() => setActiveSubTab('gallery')}>
            Image Gallery ({galleryImages.length})
          </button>
        </div>
      </header>

      <div className="pane-split-container flex-grow-1 overflow-hidden">
        {/* Left Side: Parameters / Controls */}
        <div className="split-left split-left-45">
          {activeSubTab === 'text2img' && (
            <>
              <div className="flex-between">
                <h3 className="margin-0">Create Image from Prompt</h3>
              </div>

              <div className="setting-block setting-engine-box">
                <label className="setting-engine-label">Active Image Model Engine</label>
                <select
                  className="dropdown-pill w-100 margin-top-6 text-125"
                  value={activeImageModelId}
                  onChange={e => handleSelectImageModel(e.target.value)}
                >
                  {imageModels.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.type})
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="setting-block">
                <div className="flex-between margin-bottom-4">
                  <label className="margin-0">Prompt</label>
                  <button
                    type="button"
                    className="pill btn-enhance-prompt"
                    onClick={() => handleEnhancePrompt(prompt, setPrompt)}
                    disabled={isEnhancing || isGenerating}
                  >
                    {isEnhancing ? '✨ Enhancing...' : '✨ Enhance Prompt with AI'}
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="Describe the image you want to create or click Enhance Prompt to generate a detailed prompt..."
                />
                <div className="flex-center gap-8 margin-top-6">
                  <input
                    type="checkbox"
                    id="auto-enhance-t2i"
                    checked={enhancePrompt}
                    onChange={e => setEnhancePrompt(e.target.checked)}
                    className="checkbox-accent"
                  />
                  <label htmlFor="auto-enhance-t2i" className="cursor-pointer text-12 text-secondary">
                    Auto-enhance prompt with AI before generating
                  </label>
                </div>
              </div>

              <div className="setting-block">
                <label>Resolution Presets</label>
                <div className="flex-center gap-8 margin-top-6">
                  {(['512x512', '768x512', '512x768', '768x768'] as const).map(res => {
                    const isActive = resolution === res;
                    return (
                      <button
                        key={res}
                        type="button"
                        className={`pill flex-grow-1 pad-y-8 pad-x-10 text-12 cursor-pointer ${isActive ? 'active font-600' : 'font-400'}`}
                        onClick={() => {
                          setResolution(res);
                          showToast(`Resolution set to ${res}`, 'info');
                        }}
                      >
                        {res}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="setting-block">
                <label>Inference Steps ({steps})</label>
                <input
                  type="range"
                  min={10}
                  max={50}
                  value={steps}
                  onChange={e => setSteps(Number(e.target.value))}
                  className="w-100 margin-top-6"
                />
              </div>

              <button
                className="pill gradient-btn btn-action-full"
                onClick={handleGenerateText2Img}
                disabled={isGenerating}
              >
                {isGenerating ? '⏳ Generating Image...' : '🎨 Generate Image'}
              </button>
            </>
          )}

          {activeSubTab === 'img2img' && (
            <>
              <h3>Edit Image (Image-to-Image)</h3>

              <div className="setting-block setting-engine-box">
                <label className="setting-engine-label">Active Image Model Engine</label>
                <select
                  className="dropdown-pill w-100 margin-top-6 text-125"
                  value={activeImageModelId}
                  onChange={e => handleSelectImageModel(e.target.value)}
                >
                  {imageModels.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="setting-block">
                <label>Reference Input Image</label>
                <div className="audio-upload-box">
                  {refImagePreview && (
                    <img src={refImagePreview} alt="Reference" className="img-preview-sm" />
                  )}
                  <label className="pill pad-y-8 pad-x-16 cursor-pointer text-center">
                    📁 Select / Upload Image
                    <input type="file" accept="image/*" className="display-none" onChange={handleRefImageUpload} />
                  </label>
                </div>
              </div>

              <div className="setting-block">
                <div className="flex-between margin-bottom-4">
                  <label className="margin-0">Editing Instructions / Transformation Prompt</label>
                  <button
                    type="button"
                    className="pill btn-enhance-prompt"
                    onClick={() => handleEnhancePrompt(editPrompt, setEditPrompt)}
                    disabled={isEnhancing || isGenerating}
                  >
                    {isEnhancing ? '✨ Enhancing...' : '✨ Enhance Prompt with AI'}
                  </button>
                </div>
                <textarea
                  rows={3}
                  value={editPrompt}
                  onChange={e => setEditPrompt(e.target.value)}
                  placeholder="Describe the subject and desired style (e.g. An oil painting of two smiling people)..."
                />
                <div className="flex-center gap-8 margin-top-6">
                  <input
                    type="checkbox"
                    id="auto-enhance-i2i"
                    checked={enhancePrompt}
                    onChange={e => setEnhancePrompt(e.target.checked)}
                    className="checkbox-accent"
                  />
                  <label htmlFor="auto-enhance-i2i" className="cursor-pointer text-12 text-secondary">
                    Auto-enhance prompt with AI before generating
                  </label>
                </div>
                <div className="text-11 accent-text margin-top-4">
                  💡 <strong>Tip:</strong> Describe the subjects (e.g. <em>"two smiling people"</em>) alongside the style to retain them accurately.
                </div>
              </div>

              <div className="setting-block">
                <div className="flex-between">
                  <label>Editing Strength ({strength})</label>
                  <span className={strength <= 0.45 ? 'badge-strength-green' : 'badge-strength-amber'}>
                    {strength <= 0.45 ? '✨ Preserves Original Photo Details' : '🎨 Heavy Redraw / Repaint'}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={0.9}
                  step={0.05}
                  value={strength}
                  onChange={e => setStrength(Number(e.target.value))}
                  className="w-100 margin-top-6"
                />
                <div className="text-10 text-dim margin-top-4">
                  • <strong>0.30–0.45 (Recommended for photos)</strong>: Keeps faces, subjects & background layout intact.
                  <br />
                  • <strong>0.60–0.80</strong>: High creativity / redrafts subjects.
                </div>
              </div>

              <button
                className="pill gradient-btn btn-action-full"
                onClick={handleGenerateImg2Img}
                disabled={isGenerating || !refImageFile}
              >
                {isGenerating ? '⏳ Editing Image...' : '🖼️ Apply Image Edits'}
              </button>
            </>
          )}

          {activeSubTab === 'gallery' && (
            <>
              <h3>Local Image Gallery</h3>
              <p className="text-12 text-secondary">
                Viewing images saved in <code>~/Pictures</code> generated by GnomeAi.
              </p>

              <div className="gallery-grid">
                {galleryImages.map(img => (
                  <div
                    key={img.filename}
                    onClick={() => setSelectedGalleryImage(img)}
                    className={`gallery-item ${selectedGalleryImage?.filename === img.filename ? 'selected' : ''}`}
                  >
                    <img
                      src={`http://127.0.0.1:${backendPort}${img.url}`}
                      alt={img.filename}
                      className="gallery-thumb"
                    />
                    <div className="text-10 pad-4 text-ellipsis text-secondary whitespace-nowrap">
                      {img.filename}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Right Side: High-res Preview & Output Display */}
        <div className="split-right split-right-55">
          <div className="table-card card-pad-18 flex-grow-1 flex-col">
            <h3>🖼️ Output & Studio Preview</h3>

            {activeSubTab === 'gallery' && selectedGalleryImage ? (
              <div className="flex-col gap-12 margin-top-12 align-center">
                <img
                  src={`http://127.0.0.1:${backendPort}${selectedGalleryImage.url}`}
                  alt={selectedGalleryImage.filename}
                  className="img-preview-lg"
                />
                <div className="text-12 text-secondary text-center">
                  <code>{selectedGalleryImage.path}</code>
                </div>
                <div className="flex-center gap-10 margin-top-6">
                  <button
                    className="pill"
                    onClick={() => {
                      fetch(`http://127.0.0.1:${backendPort}/api/image/file/${selectedGalleryImage.filename}`);
                      window.open(`http://127.0.0.1:${backendPort}${selectedGalleryImage.url}`, '_blank');
                    }}
                  >
                    📂 Open High-Res
                  </button>
                  <button
                    className="pill btn-unload-pill"
                    onClick={() => handleDeleteImage(selectedGalleryImage.filename)}
                  >
                    🗑️ Delete Image
                  </button>
                </div>
              </div>
            ) : generatedImgUrl ? (
              <div className="flex-col gap-12 margin-top-12 align-center">
                <img
                  src={generatedImgUrl}
                  alt="Generated"
                  className="img-preview-lg"
                />
                {fallbackWarning && (
                  <div className="text-12 bg-warning-card border-warning-card pad-10 round-6 w-100">
                    <strong>Notice:</strong> {fallbackWarning}
                  </div>
                )}
                {enhancedPromptResult && (
                  <div className="text-12 text-secondary bg-subtle-card pad-10 round-6 w-100">
                    <strong>AI Enhanced Prompt:</strong> <em>"{enhancedPromptResult}"</em>
                  </div>
                )}
                {generatedImgPath && (
                  <div className="text-12 text-dim">
                    Saved to: <code>{generatedImgPath}</code>
                  </div>
                )}
              </div>
            ) : (
              <div className="preview-empty-text margin-auto">
                No image generated yet. Configure parameters on the left and click generate.
              </div>
            )}

            {statusMessage && (
              <div className="margin-top-auto status-log-stream max-h-150">
                <div>{statusMessage}</div>
                {(isGenerating || liveLogs) && (
                  <div className="margin-top-8 border-top-subtle pad-top-8 text-11 text-dim">
                    {liveLogs}
                    <div ref={logEndRef} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
