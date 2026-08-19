import React, { useState, useEffect } from 'react';

interface ModelsPaneProps {
  hfSearch: string;
  setHfSearch: (val: string) => void;
  availableModels: string[];
  compileLog: string;
  loadAllModels: () => void;
  handleCompileModel: (modelId: string) => void;
  apiFetch: any;
  allModelOptions: any[];
  activeModel: string;
  isModelLoaded: boolean;
  isModelLoading: boolean;
  handleSelectModel: (item: any) => Promise<void>;
  handleToggleModelLoad: () => Promise<void>;
  showToast: any;
  backendPort: number;
}

export default function ModelsPane({
  hfSearch,
  setHfSearch,
  availableModels,
  compileLog,
  loadAllModels,
  handleCompileModel,
  apiFetch,
  allModelOptions,
  activeModel,
  isModelLoaded,
  isModelLoading,
  handleSelectModel,
  handleToggleModelLoad,
  showToast,
  backendPort
}: ModelsPaneProps) {
  const [activeSubTab, setActiveSubTab] = useState<'llm' | 'voice' | 'image' | 'mcp'>('llm');
  const [selectedLlm, setSelectedLlm] = useState<any | null>(null);
  const [voiceModels, setVoiceModels] = useState<any[]>([]);
  const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);

  // Hugging Face search states
  const [showHfSearch, setShowHfSearch] = useState(false);
  const [hfQuery, setHfQuery] = useState('');
  const [hfSearchResults, setHfSearchResults] = useState<any[]>([]);
  const [searchingHf, setSearchingHf] = useState(false);
  const [selectedHfRepo, setSelectedHfRepo] = useState<string | null>(null);
  const [repoFiles, setRepoFiles] = useState<any[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [activeDownloads, setActiveDownloads] = useState<Record<string, { progress: number; status: string; filename: string }>>({});


  const [imageModels, setImageModels] = useState<any[]>([]);
  const [loadingImageId, setLoadingImageId] = useState<string | null>(null);

  const [mcpServers, setMcpServers] = useState<any[]>([]);
  const [mcpName, setMcpName] = useState('');
  const [mcpCommand, setMcpCommand] = useState('');
  const [mcpArgs, setMcpArgs] = useState('');
  const [mcpEnv, setMcpEnv] = useState('');
  const [editingMcpName, setEditingMcpName] = useState<string | null>(null);
  const [showMcpForm, setShowMcpForm] = useState(false);
  const [expandedMcpServer, setExpandedMcpServer] = useState<string | null>(null);

  // Fetch Voice models status
  const fetchVoiceStatus = async () => {
    try {
      const res = await apiFetch('/api/models/voice/status');
      if (res && res.success) {
        setVoiceModels(res.models || []);
      }
    } catch (e) {
      console.error("Error fetching voice model status:", e);
    }
  };

  // Fetch Image models status
  const fetchImageStatus = async () => {
    try {
      const res = await apiFetch('/api/models/image/status');
      if (res && res.success) {
        setImageModels(res.models || []);
      }
    } catch (e) {
      console.error("Error fetching image model status:", e);
    }
  };

  // Fetch MCP servers status
  const fetchMcpServers = async () => {
    try {
      const res = await apiFetch('/api/mcp/servers');
      if (res && res.success) {
        setMcpServers(res.servers || []);
      }
    } catch (e) {
      console.error("Error fetching MCP servers:", e);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'voice') {
      fetchVoiceStatus();
      const interval = setInterval(fetchVoiceStatus, 4000);
      return () => clearInterval(interval);
    } else if (activeSubTab === 'image') {
      fetchImageStatus();
      const interval = setInterval(fetchImageStatus, 4000);
      return () => clearInterval(interval);
    } else if (activeSubTab === 'mcp') {
      fetchMcpServers();
      const interval = setInterval(fetchMcpServers, 4000);
      return () => clearInterval(interval);
    }
  }, [activeSubTab]);

  const handleSaveMcpServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mcpName.trim() || !mcpCommand.trim()) {
      showToast("Name and command are required.", "warning");
      return;
    }

    let parsedArgs: string[] = [];
    if (mcpArgs.trim()) {
      try {
        if (mcpArgs.trim().startsWith('[')) {
          parsedArgs = JSON.parse(mcpArgs);
        } else {
          parsedArgs = mcpArgs.split('\n').map(a => a.trim()).filter(a => a.length > 0);
        }
      } catch (err) {
        showToast("Arguments must be valid JSON array or one argument per line.", "error");
        return;
      }
    }

    let parsedEnv: Record<string, string> = {};
    if (mcpEnv.trim()) {
      try {
        parsedEnv = JSON.parse(mcpEnv);
      } catch (err) {
        const lines = mcpEnv.split('\n');
        for (const line of lines) {
          const idx = line.indexOf('=');
          if (idx !== -1) {
            const k = line.substring(0, idx).trim();
            const v = line.substring(idx + 1).trim();
            if (k) parsedEnv[k] = v;
          } else if (line.trim()) {
            showToast("Environment variables must be valid JSON object or KEY=VALUE line by line.", "error");
            return;
          }
        }
      }
    }

    try {
      const res = await apiFetch('/api/mcp/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: mcpName.trim(),
          command: mcpCommand.trim(),
          args: parsedArgs,
          env: parsedEnv
        })
      });

      if (res && res.success) {
        showToast(`Saved MCP Server: ${mcpName}`, "success");
        setMcpName('');
        setMcpCommand('');
        setMcpArgs('');
        setMcpEnv('');
        setEditingMcpName(null);
        setShowMcpForm(false);
        fetchMcpServers();
      } else {
        showToast("Failed to save MCP server.", "error");
      }
    } catch (err) {
      showToast("Error saving MCP server.", "error");
    }
  };

  const handleEditMcpServer = (srv: any) => {
    setMcpName(srv.name);
    setMcpCommand(srv.command);
    setMcpArgs(JSON.stringify(srv.args, null, 2));
    setMcpEnv(JSON.stringify(srv.env, null, 2));
    setEditingMcpName(srv.name);
    setShowMcpForm(true);
  };

  const handleDeleteMcpServer = async (name: string) => {
    if (!window.confirm(`Are you sure you want to delete MCP server '${name}'?`)) return;
    try {
      const res = await apiFetch(`/api/mcp/servers/${name}`, {
        method: 'DELETE'
      });
      if (res && res.success) {
        showToast(`Deleted MCP Server: ${name}`, "success");
        fetchMcpServers();
      } else {
        showToast("Failed to delete MCP server.", "error");
      }
    } catch (err) {
      showToast("Error deleting MCP server.", "error");
    }
  };

  const handleRestartMcpServer = async (name: string) => {
    try {
      const res = await apiFetch(`/api/mcp/servers/${name}/restart`, {
        method: 'POST'
      });
      if (res && res.success) {
        showToast(`Restarted MCP Server: ${name}`, "success");
        fetchMcpServers();
      } else {
        showToast("Failed to restart MCP server.", "error");
      }
    } catch (err) {
      showToast("Error restarting MCP server.", "error");
    }
  };

  const applyPresetTemplate = (preset: { name: string; command: string; args: string; env: string }) => {
    setMcpName(preset.name);
    setMcpCommand(preset.command);
    setMcpArgs(preset.args);
    setMcpEnv(preset.env);
    setEditingMcpName(null);
    setShowMcpForm(true);
    showToast(`Template '${preset.name}' loaded. Configure and click Save!`, "info");
  };

  const PRESETS = [
    {
      title: "SQLite Database Manager",
      desc: "Expose query/schema tools for a local SQLite database file.",
      preset: {
        name: "sqlite-db",
        command: "npx",
        args: JSON.stringify(["-y", "@modelcontextprotocol/server-sqlite", "--db-path", "/absolute/path/to/database.db"], null, 2),
        env: JSON.stringify({}, null, 2)
      }
    },
    {
      title: "Filesystem (Local Filesystem Access)",
      desc: "Grants reading/writing access to files in selected local directories.",
      preset: {
        name: "filesystem",
        command: "npx",
        args: JSON.stringify(["-y", "@modelcontextprotocol/server-filesystem", "/absolute/path/to/allowed/directory"], null, 2),
        env: JSON.stringify({}, null, 2)
      }
    },
    {
      title: "GitHub Developer Integration",
      desc: "Browse repos, view issues, create PRs, and commit file edits.",
      preset: {
        name: "github-tools",
        command: "npx",
        args: JSON.stringify(["-y", "@modelcontextprotocol/server-github"], null, 2),
        env: JSON.stringify({ GITHUB_PERSONAL_ACCESS_TOKEN: "your_github_token_here" }, null, 2)
      }
    },
    {
      title: "Brave Search Engine",
      desc: "Perform web search and retrieve real-time search results.",
      preset: {
        name: "brave-search",
        command: "npx",
        args: JSON.stringify(["-y", "@modelcontextprotocol/server-brave-search"], null, 2),
        env: JSON.stringify({ BRAVE_API_KEY: "your_brave_api_key_here" }, null, 2)
      }
    },
    {
      title: "Puppeteer Web Automator",
      desc: "Automate browser actions, navigate websites, and capture screenshots.",
      preset: {
        name: "puppeteer-browser",
        command: "npx",
        args: JSON.stringify(["-y", "@modelcontextprotocol/server-puppeteer"], null, 2),
        env: JSON.stringify({}, null, 2)
      }
    },
    {
      title: "Fetch (Web Content Downloader)",
      desc: "Extract text contents and metadata from any public URL.",
      preset: {
        name: "fetch",
        command: "npx",
        args: JSON.stringify(["-y", "fetch-mcp"], null, 2),
        env: JSON.stringify({}, null, 2)
      }
    },
    {
      title: "Artiforge.ai (Context Orchestrator)",
      desc: "AI orchestration and codebase context-indexing tool. Requires an Artiforge API Key.",
      preset: {
        name: "artiforge",
        command: "npx",
        args: JSON.stringify(["-y", "@artiforge/mcp-server"], null, 2),
        env: JSON.stringify({ ARTIFORGE_API_KEY: "your_artiforge_key_here" }, null, 2)
      }
    },
    {
      title: "Sequential Thinking (Reasoning)",
      desc: "Enforce structured reasoning and step-by-step logic checking.",
      preset: {
        name: "sequential-thinking",
        command: "npx",
        args: JSON.stringify(["-y", "@modelcontextprotocol/server-sequential-thinking"], null, 2),
        env: JSON.stringify({}, null, 2)
      }
    }
  ];

  const handleDownloadVoice = async (id: string) => {
    setLoadingVoiceId(id);
    try {
      const res = await apiFetch('/api/models/voice/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: id })
      });
      if (res && res.success) {
        showToast(`Started downloading & compiling ${id}...`, 'info');
        fetchVoiceStatus();
      } else {
        showToast(`Failed to trigger download.`, 'error');
      }
    } catch (e) {
      showToast(`Error starting download.`, 'error');
    } finally {
      setLoadingVoiceId(null);
    }
  };

  const handleDeleteVoice = async (id: string) => {
    if (!window.confirm(`Are you sure you want to clean local cache files for ${id}?`)) return;
    try {
      const res = await apiFetch('/api/models/voice/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: id })
      });
      if (res && res.success) {
        showToast(`Successfully cleared cache for ${id}.`, 'success');
        fetchVoiceStatus();
      } else {
        showToast(`Failed to clear cache.`, 'error');
      }
    } catch (e) {
      showToast(`Error clearing cache.`, 'error');
    }
  };

  const handleDownloadImage = async (id: string) => {
    setLoadingImageId(id);
    try {
      const res = await apiFetch('/api/models/image/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: id })
      });
      if (res && res.success) {
        showToast(`Started downloading & exporting ${id} in background...`, 'info');
        fetchImageStatus();
      } else {
        showToast(`Failed to trigger image model download.`, 'error');
      }
    } catch (e) {
      showToast(`Error starting download.`, 'error');
    } finally {
      setLoadingImageId(null);
    }
  };

  const handleDeleteImage = async (id: string) => {
    if (!window.confirm(`Are you sure you want to delete PyTorch/OpenVINO caches for ${id}?`)) return;
    try {
      const res = await apiFetch('/api/models/image/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: id })
      });
      if (res && res.success) {
        showToast(`Successfully cleared cache for ${id}.`, 'success');
        fetchImageStatus();
      } else {
        showToast(`Failed to clear cache.`, 'error');
      }
    } catch (e) {
      showToast(`Error clearing cache.`, 'error');
    }
  };

  const handleClearPytorchCache = async (id: string) => {
    if (!window.confirm(`Are you sure you want to delete the raw PyTorch weights cache for ${id}? This will keep your OpenVINO compiled model intact.`)) return;
    try {
      const res = await apiFetch('/api/models/image/clear_pytorch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: id })
      });
      if (res && res.success) {
        showToast(`Successfully cleared raw PyTorch cache for ${id}.`, 'success');
        fetchImageStatus();
      } else {
        showToast(`Failed to clear PyTorch cache.`, 'error');
      }
    } catch (e) {
      showToast(`Error clearing cache.`, 'error');
    }
  };

  const handleImportGguf = async () => {
    if (window.electronAPI && window.electronAPI.openFileDialog) {
      try {
        const path = await window.electronAPI.openFileDialog();
        if (path) {
          showToast("Registering GGUF file...", "info");
          const res = await apiFetch('/api/models/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filepath: path })
          });
          if (res && res.success) {
            showToast(`Imported ${res.name} successfully!`, "success");
            loadAllModels();
          } else {
            showToast("Import failed. Make sure file exists and is .gguf format.", "error");
          }
        }
      } catch (e) {
        showToast("Dialog error", "error");
      }
    } else {
      showToast("File dialog not supported in this environment.", "warning");
    }
  };

  const handleSearchHf = async () => {
    if (!hfQuery.trim()) return;
    setSearchingHf(true);
    try {
      const res = await apiFetch(`/api/models/hf/search?query=${encodeURIComponent(hfQuery)}`);
      if (res && res.success) {
        setHfSearchResults(res.results || []);
        setSelectedHfRepo(null);
        setRepoFiles([]);
      } else {
        showToast("Failed to search Hugging Face.", "error");
      }
    } catch (e) {
      showToast("Error searching Hugging Face.", "error");
    } finally {
      setSearchingHf(false);
    }
  };

  const handleSelectHfRepo = async (repoId: string) => {
    setSelectedHfRepo(repoId);
    setLoadingFiles(true);
    try {
      const res = await apiFetch(`/api/models/hf/files?repo_id=${encodeURIComponent(repoId)}`);
      if (res && res.success) {
        setRepoFiles(res.files || []);
      } else {
        showToast("Failed to fetch repository files.", "error");
      }
    } catch (e) {
      showToast("Error fetching repository files.", "error");
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleDownloadHfFile = async (repoId: string, filename: string) => {
    try {
      const res = await apiFetch('/api/models/hf/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo_id: repoId, filename })
      });
      if (res && res.job_id) {
        showToast(`Started downloading ${filename}`, "info");
        
        const jobId = res.job_id;
        setActiveDownloads(prev => ({
          ...prev,
          [jobId]: { progress: 0, status: 'running', filename }
        }));
        
        const pollInterval = setInterval(async () => {
          try {
            const jobRes = await apiFetch(`/api/jobs/status/${jobId}`);
            if (jobRes) {
              if (jobRes.status === 'completed') {
                clearInterval(pollInterval);
                setActiveDownloads(prev => {
                  const next = { ...prev };
                  delete next[jobId];
                  return next;
                });
                showToast(`Successfully downloaded ${filename}!`, "success");
                loadAllModels();
              } else if (jobRes.status === 'failed') {
                clearInterval(pollInterval);
                setActiveDownloads(prev => {
                  const next = { ...prev };
                  delete next[jobId];
                  return next;
                });
                showToast(`Failed to download ${filename}: ${jobRes.error}`, "error");
              } else {
                setActiveDownloads(prev => ({
                  ...prev,
                  [jobId]: { progress: jobRes.progress || 0, status: jobRes.status, filename }
                }));
              }
            }
          } catch (err) {
            console.error("Error polling GGUF download job:", err);
          }
        }, 1500);
      } else {
        showToast("Failed to start download.", "error");
      }
    } catch (e) {
      showToast("Error starting download.", "error");
    }
  };


  const formatSize = (bytes: number) => {
    if (bytes === 0) return "N/A";
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <section className="tab-pane active tab-pane-column" id="pane-models">
      <header className="view-header flex-shrink-0">
        <span className="view-title">Unified Model Manager</span>
        <div className="flex-center gap-6 ml-auto">
          <button className={`nav-btn btn-nav-sub ${activeSubTab === 'llm' ? 'active' : ''}`} onClick={() => setActiveSubTab('llm')}>
            Chat LLMs (GGUF)
          </button>
          <button className={`nav-btn btn-nav-sub ${activeSubTab === 'voice' ? 'active' : ''}`} onClick={() => setActiveSubTab('voice')}>
            Voice Engines (TTS)
          </button>
          <button className={`nav-btn btn-nav-sub ${activeSubTab === 'image' ? 'active' : ''}`} onClick={() => setActiveSubTab('image')}>
            Image Generators (SD/Flux)
          </button>
          <button className={`nav-btn btn-nav-sub ${activeSubTab === 'mcp' ? 'active' : ''}`} onClick={() => setActiveSubTab('mcp')}>
            MCP Servers
          </button>
        </div>
      </header>

      {activeSubTab === 'llm' && (
        <div className="pane-split-container flex-grow-1 overflow-hidden">
          {/* Left Split: Model list */}
          <div className="split-left split-left-60">
            <div className="flex-center gap-8 margin-bottom-16">
              <button className="pill gradient-btn btn-hg-action" onClick={handleImportGguf}>
                📁 Import Local GGUF Model
              </button>
              <button 
                className={`pill btn-hf-toggle ${showHfSearch ? 'active' : ''}`} 
                onClick={() => setShowHfSearch(!showHfSearch)}
              >
                🤗 Search Hugging Face
              </button>
              <input 
                type="text" 
                className="input-search-bar"
                value={hfSearch}
                onChange={e => setHfSearch(e.target.value)}
                placeholder="Compile OpenVINO model ID... (e.g. Qwen/Qwen2.5-0.5B-Instruct)"
              />
              <button className="pill btn-hg-action" onClick={() => handleCompileModel(hfSearch)}>
                Compile
              </button>
            </div>

            {showHfSearch && (
              <div className="hf-search-card">
                <div className="flex-between">
                  <h4 className="accent-text text-13 flex-center gap-6 margin-0">
                    <span>🤗</span> Search Hugging Face GGUF Models
                  </h4>
                  <button onClick={() => setShowHfSearch(false)} className="hf-close-btn">✕ Close</button>
                </div>
                <div className="flex-center gap-8">
                  <input
                    type="text"
                    className="input-search-bar"
                    value={hfQuery}
                    onChange={e => setHfQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearchHf()}
                    placeholder="Search e.g. Qwen2.5-Instruct or Llama-3..."
                  />
                  <button className="pill gradient-btn btn-hg-action" onClick={handleSearchHf} disabled={searchingHf}>
                    {searchingHf ? 'Searching...' : 'Search'}
                  </button>
                </div>

                {hfSearchResults.length > 0 && (
                  <div className="flex-col gap-8 max-h-220 overflow-y-auto margin-top-8">
                    {hfSearchResults.map(repo => (
                      <div key={repo.id} className={`hf-result-item ${selectedHfRepo === repo.id ? 'selected' : ''}`} onClick={() => handleSelectHfRepo(repo.id)}>
                        <div className="flex-between">
                          <span className="font-600 text-125 text-white">{repo.id}</span>
                          <span className="text-10 text-dim">
                            Published: {repo.createdAt ? new Date(repo.createdAt).toLocaleDateString() : 'N/A'}
                          </span>
                        </div>
                        <div className="flex-center gap-12 margin-top-4 text-11 text-secondary">
                          <span>📥 {repo.downloads.toLocaleString()} downloads</span>
                          <span>❤️ {repo.likes.toLocaleString()} likes</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {selectedHfRepo && (
                  <div className="border-top-subtle pad-top-12 margin-top-4">
                    <div className="flex-between margin-bottom-8">
                      <span className="text-12 font-600 accent-text">Select GGUF File to Download:</span>
                      {loadingFiles && <span className="text-11 text-secondary">⏳ Fetching files...</span>}
                    </div>
                    
                    {repoFiles.length > 0 ? (
                      <div className="flex-col gap-6 max-h-180 overflow-y-auto">
                        {repoFiles.map(file => (
                          <div key={file.name} className="flex-between pad-y-6 pad-x-10 bg-subtle-card border-subtle-card round-6">
                            <span className="text-115 text-white text-ellipsis max-w-70" title={file.name}>{file.name}</span>
                            <div className="flex-center gap-10">
                              <span className="text-105 text-dim">{formatSize(file.size)}</span>
                              <button className="pill btn-dl-accent" onClick={() => handleDownloadHfFile(selectedHfRepo, file.name)}>
                                Download
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : !loadingFiles && (
                      <div className="text-11 text-dim text-center pad-8">No GGUF files found in this repository.</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {Object.keys(activeDownloads).length > 0 && (
              <div className="margin-bottom-16 flex-col gap-8">
                {Object.entries(activeDownloads).map(([jobId, dl]) => (
                  <div key={jobId} className="dl-progress-card">
                    <div className="flex-between margin-bottom-6 text-12">
                      <span className="font-600 text-white text-ellipsis max-w-80">
                        📥 Downloading: {dl.filename}
                      </span>
                      <span className="accent-text font-600">{Math.round(dl.progress * 100)}%</span>
                    </div>
                    <div className="dl-progress-bar-bg">
                      <div className="dl-progress-bar-fill" style={{ width: `${dl.progress * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}


            <div className="models-list-container overflow-y-auto flex-grow-1">
              <div className="section-subtitle text-11 uppercase text-dim margin-bottom-10 letter-spacing-05">
                Available Chat Models ({allModelOptions.length})
              </div>
              <div className="models-grid flex-col gap-8">
                {allModelOptions.map(m => {
                  const isActive = activeModel === m.name;
                  const isLoaded = isActive && isModelLoaded;
                  const isLoading = isActive && isModelLoading;
                  
                  return (
                    <div 
                      key={m.id} 
                      className={`model-card model-card-flex ${selectedLlm?.id === m.id ? 'active' : ''}`} 
                      onClick={() => setSelectedLlm(m)}
                    >
                      <div className="flex-col gap-4">
                        <div className="flex-center gap-8">
                          <span className="text-white text-13 font-600">{m.name}</span>
                          <span className="badge-subtle">
                            {m.badge}
                          </span>
                        </div>
                        <span className="text-11 text-dim">Format: {m.type === 'inbuilt' ? 'OpenVINO' : 'GGUF'}</span>
                      </div>

                      <div className="flex-center gap-8" onClick={e => e.stopPropagation()}>
                        <select 
                          className="input-select-sm text-11 bg-subtle-card text-white round-4 pad-y-2 pad-x-4 border-subtle"
                          defaultValue="AUTO"
                          onChange={async (e) => {
                            const dev = e.target.value;
                            try {
                              await apiFetch('/api/models/device_target', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ model_id: m.name, device: dev })
                              });
                              showToast(`Configured explicit target hardware for ${m.name}: ${dev}`, "info");
                            } catch (err: any) {
                              showToast(`⚠️ Hardware Allocation Warning: ${err.message || 'Target device load failed'}`, "error");
                            }
                          }}
                        >
                          <option value="AUTO">⚡ Target: AUTO</option>
                          <option value="CPU">💻 Target: CPU</option>
                          <option value="GPU">🚀 Target: GPU</option>
                          <option value="XPU">🎮 Target: XPU (iGPU)</option>
                          <option value="NPU">🧠 Target: NPU</option>
                        </select>
                        {isLoading ? (
                          <span className="text-11 accent-text">⏳ Loading...</span>
                        ) : isLoaded ? (
                          <button 
                            className="pill btn-unload-pill" 
                            onClick={handleToggleModelLoad}
                          >
                            Unload
                          </button>
                        ) : (
                          <button 
                            className="pill btn-load-pill" 
                            onClick={() => handleSelectModel(m)}
                          >
                            Load Model
                          </button>
                        )}

                        {m.type === 'inbuilt' && (
                          <button 
                            className="pill btn-delete-pill" 
                            onClick={async () => {
                              if (window.confirm(`Are you sure you want to delete local compiled model: ${m.name}?`)) {
                                const res = await apiFetch('/api/inbuilt_llm/delete', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ model_id: m.name })
                                });
                                if (res && res.success) {
                                  showToast(`Successfully deleted ${m.name}`);
                                  loadAllModels();
                                } else {
                                  showToast("Failed to delete model", "error");
                                }
                              }
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Split: Compilation Logs & Resource Advisor */}
          <div className="split-right split-right-40">
            {selectedLlm ? (
              <div className="model-detail-pane">
                <h3 className="margin-0 text-14 text-white">ℹ️ Model Details</h3>
                <div className="flex-col gap-8 text-12 text-secondary">
                  <div><strong>Name:</strong> {selectedLlm.name}</div>
                  <div><strong>Type/Source:</strong> {selectedLlm.type.toUpperCase()}</div>
                  <div><strong>Format:</strong> {selectedLlm.name.endsWith('.gguf') ? 'GGUF' : 'OpenVINO IR'}</div>
                  <div><strong>Status:</strong> {activeModel === selectedLlm.name ? (isModelLoaded ? '🟢 Active & Loaded' : '⏳ Loading') : '⚪ Unloaded'}</div>
                </div>

                <div className="border-top-subtle pad-top-12">
                  <h4 className="margin-top-0 margin-bottom-8 text-12 text-white">🧠 Resource Advisor</h4>
                  <div className="text-12 text-dim bg-subtle-card pad-8 round-6">
                    {selectedLlm.name.toLowerCase().includes('7b') ? (
                      <div>⚠️ This is a 7B parameter model. Recommended RAM: 16GB+. Ensure offload layers are tuned if using GPU.</div>
                    ) : selectedLlm.name.toLowerCase().includes('3b') ? (
                      <div>🟢 This is a 3B parameter model. Fits comfortably on most setups with 8GB+ RAM.</div>
                    ) : (
                      <div>🟢 Compact model. Light on resources and ideal for fast local execution.</div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="model-detail-pane">
                <div className="pad-12 border-bottom-subtle bg-subtle-card">
                  <h3 className="margin-0 text-13 text-white">🛠️ Offline Compilation Logs</h3>
                </div>
                <pre className="log-stream-pre">
                  {compileLog || "Logs output from compilation processes will stream live here..."}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'voice' && (
        <div className="pad-16 flex-col gap-16 overflow-y-auto flex-grow-1">
          <div className="section-subtitle text-11 uppercase text-dim letter-spacing-05">
            Voice Studio Synthesis Engines
          </div>
          
          <div className="models-grid grid-320">
            {voiceModels.length === 0 ? (
              <div className="text-13 pad-20 text-dim">
                Loading Voice Models status...
              </div>
            ) : (
              voiceModels.map(m => (
                <div 
                  key={m.id} 
                  className="interactive-widgets-frame widget-card" 
                >
                  <div className="flex-between">
                    <h3 className="margin-0 text-14 text-white">{m.name}</h3>
                    <span 
                      className={m.downloaded ? 'status-badge-green' : 'status-badge-red'}
                    >
                      {m.downloaded ? 'Downloaded' : 'Missing'}
                    </span>
                  </div>

                  <div className="text-12 text-secondary flex-col gap-4">
                    <div><strong>Device Type:</strong> {m.device}</div>
                    {m.downloaded && <div><strong>Cache Size:</strong> {formatSize(m.size_bytes)}</div>}
                  </div>

                  <div className="flex-center gap-8 margin-top-8">
                    {!m.downloaded ? (
                      <button 
                        className="pill gradient-btn flex-grow-1 pad-y-8 pad-x-14 text-12" 
                        onClick={() => handleDownloadVoice(m.id)}
                        disabled={loadingVoiceId === m.id}
                      >
                        {loadingVoiceId === m.id ? 'Downloading...' : '📥 Download & Compile'}
                      </button>
                    ) : (
                      <>
                        <button 
                          className="pill flex-grow-1 pad-y-8 pad-x-14 text-12 disabled-pill" 
                          disabled 
                        >
                          Ready
                        </button>
                        <button 
                          className="pill btn-unload-pill pad-y-8 pad-x-14 text-12" 
                          onClick={() => handleDeleteVoice(m.id)}
                        >
                          Clear Cache
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'image' && (
        <div className="pad-16 flex-col gap-16 overflow-y-auto flex-grow-1">
          <div className="section-subtitle text-11 uppercase text-dim letter-spacing-05">
            Image Studio Generator Models
          </div>
          
          <div className="models-grid grid-350">
            {imageModels.length === 0 ? (
              <div className="text-13 pad-20 text-dim">
                Loading Image Models status...
              </div>
            ) : (
              imageModels.map(m => (
                <div 
                  key={m.id} 
                  className="interactive-widgets-frame widget-card" 
                >
                  <div className="flex-between">
                    <h3 className="margin-0 text-14 text-white text-ellipsis max-w-70" title={m.name}>
                      {m.name}
                    </h3>
                    <span 
                      className={m.downloaded ? 'status-badge-green' : 'status-badge-red'}
                    >
                      {m.downloaded ? (m.ov_exists ? 'Ready (OpenVINO)' : 'Downloaded (PyTorch)') : 'Missing'}
                    </span>
                  </div>

                  <div className="text-12 text-secondary flex-col gap-4">
                    <div><strong>Model ID:</strong> <code className="font-mono text-105">{m.id}</code></div>
                    <div><strong>Type:</strong> {m.type}</div>
                    <div><strong>Device:</strong> {m.device}</div>
                    {m.downloaded && (
                      <div className="flex-center gap-12 margin-top-4">
                        {m.ov_exists && <div><strong>OpenVINO Size:</strong> {formatSize(m.ov_size_bytes)}</div>}
                        {m.hf_exists && <div><strong>PyTorch Hub Size:</strong> {formatSize(m.hf_size_bytes)}</div>}
                      </div>
                    )}
                  </div>

                  <div className="flex-col gap-8 margin-top-8 w-100">
                    <div className="flex-center gap-8 w-100">
                      {!m.ov_exists ? (
                        <button 
                          className="pill gradient-btn flex-grow-1 pad-y-8 pad-x-14 text-12" 
                          onClick={() => handleDownloadImage(m.id)}
                          disabled={loadingImageId === m.id}
                        >
                          {loadingImageId === m.id ? 'Processing...' : '📥 Download & Export (OpenVINO)'}
                        </button>
                      ) : (
                        <button 
                          className="pill flex-grow-1 pad-y-8 pad-x-14 text-12 disabled-pill" 
                          disabled 
                        >
                          Compiled
                        </button>
                      )}
                      {m.downloaded && !m.hf_exists && (
                        <button 
                          className="pill btn-unload-pill flex-grow-1 pad-y-8 pad-x-14 text-12" 
                          onClick={() => handleDeleteImage(m.id)}
                        >
                          Clear Cache
                        </button>
                      )}
                    </div>
                    {m.downloaded && m.hf_exists && (
                      <div className="flex-center gap-8 w-100">
                        {m.ov_exists && (
                          <button 
                            className="pill btn-warning-pill flex-grow-1 pad-y-8 pad-x-14 text-12" 
                            onClick={() => handleClearPytorchCache(m.id)}
                          >
                            Clear Raw PyTorch Cache
                          </button>
                        )}
                        <button 
                          className="pill btn-unload-pill flex-grow-1 pad-y-8 pad-x-14 text-12" 
                          onClick={() => handleDeleteImage(m.id)}
                        >
                          Clear Cache
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'mcp' && (
        <div className="pad-16 flex-col gap-16 overflow-y-auto flex-grow-1">
          <div className="flex-between">
            <div className="section-subtitle text-11 uppercase text-dim letter-spacing-05 margin-0">
              Model Context Protocol (MCP) Server Manager
            </div>
            <button 
              className="pill gradient-btn pad-y-8 pad-x-16 text-12" 
              onClick={() => {
                setEditingMcpName(null);
                setMcpName('');
                setMcpCommand('');
                setMcpArgs('');
                setMcpEnv('');
                setShowMcpForm(!showMcpForm);
              }}
            >
              {showMcpForm ? 'Cancel' : '➕ Add Custom Server'}
            </button>
          </div>

          {showMcpForm && (
            <div className="interactive-widgets-frame widget-card">
              <h3 className="margin-0 text-14 text-white">
                {editingMcpName ? `Edit Server: ${editingMcpName}` : 'Add New MCP Server'}
              </h3>
              <form onSubmit={handleSaveMcpServer} className="flex-col gap-12">
                <div className="grid-2col gap-12">
                  <div className="flex-col gap-4">
                    <label className="text-11 text-secondary">Server Name</label>
                    <input 
                      type="text" 
                      className="mcp-input-text"
                      value={mcpName} 
                      onChange={e => setMcpName(e.target.value)} 
                      disabled={!!editingMcpName}
                      placeholder="e.g. brave-search"
                      required
                    />
                  </div>
                  <div className="flex-col gap-4">
                    <label className="text-11 text-secondary">Command / Executable</label>
                    <input 
                      type="text" 
                      className="mcp-input-text"
                      value={mcpCommand} 
                      onChange={e => setMcpCommand(e.target.value)} 
                      placeholder="e.g. npx or python or node"
                      required
                    />
                  </div>
                </div>
                
                <div className="flex-col gap-4">
                  <label className="text-11 text-secondary">Arguments (one per line, or JSON array like ["-y", "mcp-server"])</label>
                  <textarea 
                    className="mcp-input-textarea"
                    value={mcpArgs} 
                    onChange={e => setMcpArgs(e.target.value)} 
                    placeholder="-y&#10;@modelcontextprotocol/server-fetch"
                    rows={3}
                  />
                </div>

                <div className="flex-col gap-4">
                  <label className="text-11 text-secondary">Environment Variables (JSON format, or KEY=VALUE line by line)</label>
                  <textarea 
                    className="mcp-input-textarea"
                    value={mcpEnv} 
                    onChange={e => setMcpEnv(e.target.value)} 
                    placeholder="{&#10;  &quot;API_KEY&quot;: &quot;your_key_here&quot;&#10;}"
                    rows={3}
                  />
                </div>

                <div className="flex-center gap-8 justify-end margin-top-4">
                  <button type="button" className="pill pad-y-8 pad-x-16 text-12" onClick={() => setShowMcpForm(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="pill gradient-btn pad-y-8 pad-x-16 text-12">
                    Save & Start Server
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Quick Install Templates */}
          {!showMcpForm && (
            <div className="flex-col gap-8">
              <div className="text-12 font-600 text-secondary">📥 Popular MCP Preset Templates (One-Click Setup)</div>
              <div className="grid-280">
                {PRESETS.map((p, idx) => (
                  <div 
                    key={idx} 
                    className="mcp-preset-item"
                    onClick={() => applyPresetTemplate(p.preset)}
                  >
                    <span className="text-125 font-600 text-white">{p.title}</span>
                    <span className="text-11 text-dim leading-14">{p.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Servers Grid */}
          <div className="section-subtitle text-11 uppercase text-dim letter-spacing-05 margin-top-8">
            Configured MCP Servers ({mcpServers.length})
          </div>

          <div className="flex-col gap-12">
            {mcpServers.length === 0 ? (
              <div className="text-13 pad-20 text-center bg-subtle-card border-subtle-card round-8 text-dim">
                No MCP servers configured. Add one or select a template above to get started!
              </div>
            ) : (
              mcpServers.map(srv => {
                const isExpanded = expandedMcpServer === srv.name;
                return (
                  <div 
                    key={srv.name} 
                    className="interactive-widgets-frame widget-card" 
                  >
                    <div className="flex-between">
                      <div className="flex-center gap-10">
                        <h3 className="margin-0 text-14 text-white">{srv.name}</h3>
                        <span 
                          className={srv.initialized ? 'status-badge-green' : 'status-badge-red'}
                        >
                          {srv.initialized ? 'Connected' : srv.running ? 'Starting...' : 'Stopped'}
                        </span>
                      </div>
                      <div className="flex-center gap-8">
                        <button 
                          className="pill btn-icon-subtle" 
                          onClick={() => handleRestartMcpServer(srv.name)}
                        >
                          🔄 Restart
                        </button>
                        <button 
                          className="pill btn-icon-subtle" 
                          onClick={() => handleEditMcpServer(srv)}
                        >
                          ✏️ Edit
                        </button>
                        <button 
                          className="pill btn-delete-pill" 
                          onClick={() => handleDeleteMcpServer(srv.name)}
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </div>

                    <div className="text-12 text-secondary flex-col gap-4">
                      <div><strong>Command:</strong> <code className="text-11 accent-text">{srv.command} {srv.args.join(' ')}</code></div>
                      {srv.env && Object.keys(srv.env).length > 0 && (
                        <div><strong>Environment Variables:</strong> <code className="text-105">{JSON.stringify(srv.env)}</code></div>
                      )}
                    </div>

                    {srv.tools_count > 0 && (
                      <div className="border-top-subtle pad-top-10 margin-top-4">
                        <div 
                          className="flex-between cursor-pointer"
                          onClick={() => setExpandedMcpServer(isExpanded ? null : srv.name)}
                        >
                          <span className="text-12 font-600 text-white">🛠️ Exposed Tools ({srv.tools_count})</span>
                          <span className="text-11 text-dim">{isExpanded ? 'Collapse ▲' : 'Expand ▼'}</span>
                        </div>
                        
                        {isExpanded && (
                          <div className="flex-col gap-8 margin-top-10 max-h-220 overflow-y-auto pad-right-4">
                            {srv.tools.map((t: any) => (
                              <div key={t.name} className="pad-y-8 pad-x-12 bg-subtle-card border-subtle-card round-6">
                                <div className="text-115 font-600 accent-text">{t.name}</div>
                                <div className="text-11 text-secondary margin-top-2">{t.description}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </section>
  );
}
