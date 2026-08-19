import React, { useState, useRef, useEffect } from 'react';

interface Node {
  id: string;
  type: 'input' | 'llm' | 'tool' | 'output';
  label: string;
  x: number;
  y: number;
  config: Record<string, string>;
}

interface Connection {
  fromId: string;
  toId: string;
}

export default function AgentCanvasPane() {
  const [nodes, setNodes] = useState<Node[]>([
    { id: '1', type: 'input', label: 'User Trigger / Input', x: 50, y: 150, config: { prompt: 'Translate to Spanish: Hello, how are you?' } },
    { id: '2', type: 'llm', label: 'Local LLM (Qwen-7B)', x: 300, y: 100, config: { system: 'You are a translator.' } },
    { id: '3', type: 'tool', label: 'Local Sandbox Compiler', x: 300, y: 240, config: { tool: 'python_sandbox' } },
    { id: '4', type: 'output', label: 'Voice TTS (af_sarah)', x: 580, y: 170, config: {} }
  ]);

  const [connections, setConnections] = useState<Connection[]>([
    { fromId: '1', toId: '2' },
    { fromId: '1', toId: '3' },
    { fromId: '2', toId: '4' }
  ]);

  // Viewport Pan & Zoom State
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  // Dragging & Interaction State
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Connecting Wires State
  const [connectingStartId, setConnectingStartId] = useState<string | null>(null);
  const [connectingMousePos, setConnectingMousePos] = useState<{ x: number; y: number } | null>(null);

  // Simulation State
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionLog, setExecutionLog] = useState<string[]>([]);

  const canvasRef = useRef<HTMLDivElement>(null);

  // Convert screen pointer coordinates to canvas space coordinates (accounting for pan & zoom)
  const getCanvasCoords = (clientX: number, clientY: number) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom
    };
  };

  // Node Dragging Start
  const handleNodePointerDown = (e: React.PointerEvent, nodeId: string) => {
    e.stopPropagation();
    setSelectedNodeId(nodeId);
    setDraggingNodeId(nodeId);

    const coords = getCanvasCoords(e.clientX, e.clientY);
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      dragOffsetRef.current = {
        x: coords.x - node.x,
        y: coords.y - node.y
      };
    }
  };

  // Canvas Workspace Pointer Down (Pan or Select)
  const handleWorkspacePointerDown = (e: React.PointerEvent) => {
    // Only initiate pan if clicking workspace background
    if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains('canvas-transform-layer') || (e.target as HTMLElement).tagName === 'svg') {
      setSelectedNodeId(null);
      setIsPanning(true);
      panStartRef.current = {
        x: e.clientX - pan.x,
        y: e.clientY - pan.y
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  // Global Workspace Pointer Move
  const handleWorkspacePointerMove = (e: React.PointerEvent) => {
    const coords = getCanvasCoords(e.clientX, e.clientY);

    // Node Dragging
    if (draggingNodeId) {
      setNodes(prev => prev.map(node => {
        if (node.id === draggingNodeId) {
          return {
            ...node,
            x: Math.round(coords.x - dragOffsetRef.current.x),
            y: Math.round(coords.y - dragOffsetRef.current.y)
          };
        }
        return node;
      }));
    } 
    // Canvas Panning
    else if (isPanning) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y
      });
    } 
    // Interactive Connection Dragging
    else if (connectingStartId) {
      setConnectingMousePos(coords);
    }
  };

  // Global Workspace Pointer Up
  const handleWorkspacePointerUp = (e: React.PointerEvent) => {
    if (isPanning) {
      setIsPanning(false);
    }
    if (draggingNodeId) {
      setDraggingNodeId(null);
    }
    if (connectingStartId) {
      setConnectingStartId(null);
      setConnectingMousePos(null);
    }
  };

  // Wheel Zoom Event
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom(prev => {
      const nextZoom = Math.max(0.3, Math.min(2.0, prev * zoomFactor));
      return parseFloat(nextZoom.toFixed(2));
    });
  };

  // Zoom Controls
  const zoomIn = () => setZoom(z => Math.min(2.0, parseFloat((z + 0.1).toFixed(2))));
  const zoomOut = () => setZoom(z => Math.max(0.3, parseFloat((z - 0.1).toFixed(2))));
  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  const recenterNodes = () => {
    if (nodes.length === 0) return;
    const minX = Math.min(...nodes.map(n => n.x));
    const minY = Math.min(...nodes.map(n => n.y));
    setPan({ x: Math.max(20, 100 - minX * zoom), y: Math.max(20, 100 - minY * zoom) });
  };

  // Add Node helper
  const addNode = (type: 'input' | 'llm' | 'tool' | 'output', customX?: number, customY?: number) => {
    const labels = {
      input: 'User Text Input',
      llm: 'LLM Reasoning Node',
      tool: 'System Tool Node',
      output: 'TTS / Actions Dispatcher'
    };

    const newId = String(Date.now());
    const spawnX = customX ?? Math.round(100 + Math.random() * 150 - pan.x / zoom);
    const spawnY = customY ?? Math.round(100 + Math.random() * 100 - pan.y / zoom);

    const newNode: Node = {
      id: newId,
      type,
      label: labels[type],
      x: Math.max(20, spawnX),
      y: Math.max(20, spawnY),
      config: {}
    };

    setNodes(prev => [...prev, newNode]);
    setSelectedNodeId(newId);
  };

  // HTML5 Drag and Drop handlers for sidebar -> canvas
  const handleSidebarDragStart = (e: React.DragEvent, type: 'input' | 'llm' | 'tool' | 'output') => {
    e.dataTransfer.setData('application/gnomeai-node-type', type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleCanvasDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/gnomeai-node-type') as 'input' | 'llm' | 'tool' | 'output';
    if (type) {
      const coords = getCanvasCoords(e.clientX, e.clientY);
      addNode(type, coords.x, coords.y);
    }
  };

  // Connection Dragging Handlers
  const startConnection = (e: React.PointerEvent, nodeId: string) => {
    e.stopPropagation();
    setConnectingStartId(nodeId);
    const coords = getCanvasCoords(e.clientX, e.clientY);
    setConnectingMousePos(coords);
  };

  const completeConnection = (e: React.PointerEvent, targetNodeId: string) => {
    e.stopPropagation();
    if (connectingStartId && connectingStartId !== targetNodeId) {
      const exists = connections.some(c => c.fromId === connectingStartId && c.toId === targetNodeId);
      if (!exists) {
        setConnections(prev => [...prev, { fromId: connectingStartId, toId: targetNodeId }]);
      }
    }
    setConnectingStartId(null);
    setConnectingMousePos(null);
  };

  const deleteConnection = (e: React.MouseEvent, fromId: string, toId: string) => {
    e.stopPropagation();
    setConnections(prev => prev.filter(c => !(c.fromId === fromId && c.toId === toId)));
  };

  const deleteSelectedNode = () => {
    if (!selectedNodeId) return;
    setNodes(prev => prev.filter(n => n.id !== selectedNodeId));
    setConnections(prev => prev.filter(c => c.fromId !== selectedNodeId && c.toId !== selectedNodeId));
    setSelectedNodeId(null);
  };

  const runSimulation = async () => {
    if (isExecuting) return;
    setIsExecuting(true);
    setExecutionLog([]);

    const log = (msg: string) => {
      setExecutionLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    };

    log('🚀 Starting Agentic workflow execution...');
    await new Promise(r => setTimeout(r, 600));

    const inputs = nodes.filter(n => n.type === 'input');
    for (const input of inputs) {
      log(`📥 Input node "${input.label}" triggered. Value: "${input.config.prompt || 'None'}"`);
      
      const nextConns = connections.filter(c => c.fromId === input.id);
      for (const conn of nextConns) {
        const dest = nodes.find(n => n.id === conn.toId);
        if (dest) {
          log(`⛓️ Flowing data to "${dest.label}"...`);
          await new Promise(r => setTimeout(r, 800));
          log(`⚙️ Executing logic in "${dest.label}"`);
          
          if (dest.type === 'llm') {
            log(`🧠 LLM Prompt sent. Generating translation/completion...`);
          } else if (dest.type === 'tool') {
            log(`🛠️ Sandboxed Python executor running tool: ${dest.config.tool || 'default'}`);
          }
          await new Promise(r => setTimeout(r, 1000));
          
          const finalConns = connections.filter(c => c.fromId === dest.id);
          for (const fc of finalConns) {
            const finalNode = nodes.find(n => n.id === fc.toId);
            if (finalNode) {
              log(`⛓️ Flowing data to "${finalNode.label}"...`);
              await new Promise(r => setTimeout(r, 800));
              log(`🔊 Playing audio TTS readout on speakers.`);
            }
          }
        }
      }
    }
    
    log('🏁 Workflow execution completed successfully.');
    setIsExecuting(false);
  };

  const updateSelectedNodeConfig = (key: string, value: string) => {
    setNodes(prev => prev.map(n => {
      if (n.id === selectedNodeId) {
        return {
          ...n,
          config: {
            ...n.config,
            [key]: value
          }
        };
      }
      return n;
    }));
  };

  const updateSelectedNodeLabel = (val: string) => {
    setNodes(prev => prev.map(n => {
      if (n.id === selectedNodeId) {
        return { ...n, label: val };
      }
      return n;
    }));
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  return (
    <section className="tab-pane active tab-pane-column" id="pane-canvas">
      <header className="view-header flex-between align-center">
        <span className="view-title">Multi-Agent Workflow Builder</span>
        <div className="flex-center gap-8 pad-right-20">
          <button className="pill gradient-btn pad-y-6 pad-x-14 font-600" onClick={runSimulation} disabled={isExecuting}>
            {isExecuting ? '⚡ Running...' : '▶ Run Workflow'}
          </button>
        </div>
      </header>

      <div className="pane-split-container flex-grow-1 overflow-hidden position-relative">
        {/* Sidebar Left: Drag nodes */}
        <div className="canvas-sidebar-left">
          <h3 className="text-12 font-600 text-dim letter-spacing-05">ADD NODE</h3>
          <span className="text-10 text-dim">Click or drag onto canvas</span>

          <button
            draggable
            onDragStart={(e) => handleSidebarDragStart(e, 'input')}
            className="pill canvas-node-btn"
            onClick={() => addNode('input')}
          >
            📥 Input Trigger
          </button>
          <button
            draggable
            onDragStart={(e) => handleSidebarDragStart(e, 'llm')}
            className="pill canvas-node-btn"
            onClick={() => addNode('llm')}
          >
            🧠 LLM Node
          </button>
          <button
            draggable
            onDragStart={(e) => handleSidebarDragStart(e, 'tool')}
            className="pill canvas-node-btn"
            onClick={() => addNode('tool')}
          >
            🛠️ Tool Invoke
          </button>
          <button
            draggable
            onDragStart={(e) => handleSidebarDragStart(e, 'output')}
            className="pill canvas-node-btn"
            onClick={() => addNode('output')}
          >
            🔊 Output Actions
          </button>
        </div>

        {/* Center: Canvas Workspace */}
        <div 
          ref={canvasRef}
          onPointerDown={handleWorkspacePointerDown}
          onPointerMove={handleWorkspacePointerMove}
          onPointerUp={handleWorkspacePointerUp}
          onWheel={handleWheel}
          onDragOver={handleCanvasDragOver}
          onDrop={handleCanvasDrop}
          className={`canvas-workspace ${isPanning ? 'panning' : ''}`}
          style={{
            cursor: isPanning ? 'grabbing' : draggingNodeId ? 'grabbing' : connectingStartId ? 'crosshair' : 'default',
            backgroundPosition: `${pan.x}px ${pan.y}px`,
            backgroundSize: `${24 * zoom}px ${24 * zoom}px`
          }}
        >
          {/* Transform Layer for Pan & Zoom */}
          <div 
            className="canvas-transform-layer"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
            }}
          >
            {/* SVG Connections Layer */}
            <svg className="canvas-svg-layer">
              <defs>
                <marker
                  id="wire-arrow"
                  viewBox="0 0 10 10"
                  refX="6"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 8 5 L 0 9 z" fill="#818cf8" />
                </marker>
              </defs>

              {/* Render Existing Connections */}
              {connections.map((c, i) => {
                const fromNode = nodes.find(n => n.id === c.fromId);
                const toNode = nodes.find(n => n.id === c.toId);
                if (!fromNode || !toNode) return null;

                const x1 = fromNode.x + 165;
                const y1 = fromNode.y + 37;
                const x2 = toNode.x;
                const y2 = toNode.y + 37;

                const dx = Math.max(40, Math.abs(x2 - x1) * 0.45);
                const pathD = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
                const midX = (x1 + x2) / 2;
                const midY = (y1 + y2) / 2;

                return (
                  <g key={`${c.fromId}-${c.toId}-${i}`} className="wire-group pointer-events-auto">
                    <path
                      d={pathD}
                      fill="none"
                      className="wire-path"
                      markerEnd="url(#wire-arrow)"
                    />
                    {isExecuting && (
                      <circle r="5" fill="#a5b4fc" filter="drop-shadow(0 0 6px #818cf8)">
                        <animateMotion dur="1.8s" repeatCount="indefinite" path={pathD} />
                      </circle>
                    )}
                    {/* Delete Connection Badge on wire hover */}
                    <g 
                      className="wire-delete-badge" 
                      onClick={(e) => deleteConnection(e, c.fromId, c.toId)}
                      transform={`translate(${midX}, ${midY})`}
                    >
                      <circle r="11" fill="#ef4444" stroke="#121214" strokeWidth="2" />
                      <text textAnchor="middle" dy="3.5" fill="#fff" fontSize="11" fontWeight="bold">✕</text>
                    </g>
                  </g>
                );
              })}

              {/* Render Active Live Wire Connection while dragging anchor */}
              {connectingStartId && connectingMousePos && (() => {
                const fromNode = nodes.find(n => n.id === connectingStartId);
                if (!fromNode) return null;
                const x1 = fromNode.x + 165;
                const y1 = fromNode.y + 37;
                const x2 = connectingMousePos.x;
                const y2 = connectingMousePos.y;
                const dx = Math.max(40, Math.abs(x2 - x1) * 0.45);
                const pathD = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

                return (
                  <path
                    d={pathD}
                    fill="none"
                    stroke="#a5b4fc"
                    strokeWidth="3.5"
                    strokeDasharray="6 4"
                    filter="drop-shadow(0 0 8px rgba(165, 180, 252, 0.8))"
                  />
                );
              })()}
            </svg>

            {/* Render Nodes */}
            {nodes.map(node => {
              const isSelected = selectedNodeId === node.id;
              const isDragging = draggingNodeId === node.id;
              return (
                <div
                  key={node.id}
                  onPointerDown={(e) => handleNodePointerDown(e, node.id)}
                  className={`canvas-node-card ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
                  style={{
                    left: node.x,
                    top: node.y
                  }}
                >
                  {/* Connection Anchor - Left (Input) */}
                  {node.type !== 'input' && (
                    <div
                      onPointerUp={(e) => completeConnection(e, node.id)}
                      className={`anchor-in ${connectingStartId ? 'active' : ''}`}
                      title="Release to connect input"
                    />
                  )}

                  {/* Connection Anchor - Right (Output) */}
                  {node.type !== 'output' && (
                    <div
                      onPointerDown={(e) => startConnection(e, node.id)}
                      className="anchor-out"
                      title="Drag to connect output"
                    />
                  )}

                  <span className="text-11 font-600 text-dim uppercase pointer-events-none">
                    {node.type}
                  </span>
                  <span className="text-135 font-600 text-white pointer-events-none">
                    {node.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Floating Canvas Navigation Toolbar */}
          <div className="canvas-controls-bar">
            <button className="canvas-control-btn" onClick={zoomOut} title="Zoom Out (-)">−</button>
            <span className="canvas-zoom-text">{Math.round(zoom * 100)}%</span>
            <button className="canvas-control-btn" onClick={zoomIn} title="Zoom In (+)">+</button>
            <button className="canvas-control-btn" onClick={resetZoom} title="Reset View (100%)">100%</button>
            <button className="canvas-control-btn" onClick={recenterNodes} title="Recenter View">🎯 Fit</button>
            <span className="text-10 text-dim pad-x-6">| {nodes.length} Nodes</span>
          </div>
        </div>

        {/* Sidebar Right: Configuration panel */}
        <div className="canvas-sidebar-right">
          <h3 className="text-12 font-600 text-dim letter-spacing-05">PROPERTIES</h3>
          
          {selectedNode ? (
            <div className="flex-col gap-12">
              <div className="flex-col gap-5">
                <label className="text-11 text-dim">Name</label>
                <input
                  type="text"
                  value={selectedNode.label}
                  onChange={e => updateSelectedNodeLabel(e.target.value)}
                  className="learnings-edit-input"
                />
              </div>

              {selectedNode.type === 'input' && (
                <div className="flex-col gap-5">
                  <label className="text-11 text-dim">Trigger Prompt</label>
                  <textarea
                    value={selectedNode.config.prompt || ''}
                    onChange={e => updateSelectedNodeConfig('prompt', e.target.value)}
                    className="learnings-edit-input"
                    rows={3}
                  />
                </div>
              )}

              {selectedNode.type === 'llm' && (
                <div className="flex-col gap-5">
                  <label className="text-11 text-dim">System Instruction</label>
                  <textarea
                    value={selectedNode.config.system || ''}
                    onChange={e => updateSelectedNodeConfig('system', e.target.value)}
                    className="learnings-edit-input"
                    rows={3}
                  />
                </div>
              )}

              {selectedNode.type === 'tool' && (
                <div className="flex-col gap-5">
                  <label className="text-11 text-dim">Sandbox Tool Command</label>
                  <select
                    value={selectedNode.config.tool || 'python_sandbox'}
                    onChange={e => updateSelectedNodeConfig('tool', e.target.value)}
                    className="learnings-edit-input"
                  >
                    <option value="python_sandbox">🐍 Python Sandbox</option>
                    <option value="web_search">🔍 Brave Web Search</option>
                    <option value="filesystem_list">📁 Filesystem MCP</option>
                  </select>
                </div>
              )}

              <button className="pill btn-unload-pill pad-8 cursor-pointer margin-top-10 w-100" onClick={deleteSelectedNode}>
                Remove Node
              </button>
            </div>
          ) : (
            <div className="text-dim text-125 text-center pad-y-20">
              Select a node on the canvas to configure properties.
            </div>
          )}
        </div>
      </div>

      {/* Bottom Console: Logs output */}
      <div className="console-container">
        <div className="console-hdr">
          <span>CONSOLE LOGS</span>
          <button onClick={() => setExecutionLog([])} className="btn-close-sm">Clear</button>
        </div>
        <div className="console-log-area">
          {executionLog.length === 0 ? (
            <span className="text-dim">Inactive. Click "Run Workflow" to execute pipeline simulation.</span>
          ) : (
            executionLog.map((line, idx) => <span key={idx}>{line}</span>)
          )}
        </div>
      </div>
    </section>
  );
}
