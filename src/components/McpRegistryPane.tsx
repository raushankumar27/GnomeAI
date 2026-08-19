import React, { useState, useEffect } from 'react';

interface MCPServer {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  running: boolean;
  initialized: boolean;
  tools_count: number;
  tools: any[];
}

interface McpRegistryPaneProps {
  backendPort: number;
}

export default function McpRegistryPane({ backendPort }: McpRegistryPaneProps) {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  // Add server form state
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [argsStr, setArgsStr] = useState('');
  const [envStr, setEnvStr] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const serverUrl = `http://localhost:${backendPort}`;

  const fetchServers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${serverUrl}/api/mcp/servers`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setServers(data.servers);
        }
      }
    } catch (err) {
      console.error('Failed to fetch MCP servers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServers();
  }, [backendPort]);

  const handleAddServer = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    
    if (!name.trim() || !command.trim()) {
      setMessage({ text: 'Name and Command are required.', type: 'error' });
      return;
    }

    let parsedArgs: string[] = [];
    if (argsStr.trim()) {
      try {
        // Try parsing as JSON array
        if (argsStr.trim().startsWith('[')) {
          parsedArgs = JSON.parse(argsStr);
        } else {
          // Fallback to comma separation
          parsedArgs = argsStr.split(',').map(a => a.trim()).filter(Boolean);
        }
      } catch (err) {
        setMessage({ text: 'Invalid JSON format for arguments. Use e.g. ["arg1", "arg2"]', type: 'error' });
        return;
      }
    }

    let parsedEnv: Record<string, string> = {};
    if (envStr.trim()) {
      try {
        parsedEnv = JSON.parse(envStr);
      } catch (err) {
        setMessage({ text: 'Invalid JSON format for environment variables. Use e.g. {"KEY": "VALUE"}', type: 'error' });
        return;
      }
    }

    try {
      const res = await fetch(`${serverUrl}/api/mcp/servers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          command: command.trim(),
          args: parsedArgs,
          env: parsedEnv
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setMessage({ text: `Successfully registered MCP server: ${name}`, type: 'success' });
          setName('');
          setCommand('');
          setArgsStr('');
          setEnvStr('');
          fetchServers();
        } else {
          setMessage({ text: 'Failed to add MCP server.', type: 'error' });
        }
      }
    } catch (err) {
      setMessage({ text: `API Connection failed: ${err}`, type: 'error' });
    }
  };

  const handleDeleteServer = async (serverName: string) => {
    if (!confirm(`Are you sure you want to remove MCP server '${serverName}'?`)) return;
    try {
      const res = await fetch(`${serverUrl}/api/mcp/servers/${serverName}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchServers();
      }
    } catch (err) {
      console.error('Failed to delete server:', err);
    }
  };

  const handleRestartServer = async (serverName: string) => {
    try {
      const res = await fetch(`${serverUrl}/api/mcp/servers/${serverName}/restart`, {
        method: 'POST'
      });
      if (res.ok) {
        fetchServers();
      }
    } catch (err) {
      console.error('Failed to restart server:', err);
    }
  };

  return (
    <section className="tab-pane active" id="pane-mcp">
      <header className="view-header">
        <span className="view-title">Model Context Protocol (MCP) Registry</span>
      </header>

      <div className="mcp-grid-container">
        
        {/* Left Column: Server List */}
        <div className="flex-col gap-15">
          <h2 className="text-16 font-600 text-primary margin-0 margin-bottom-5">Registered MCP Servers</h2>
          
          {loading ? (
            <div className="text-dim pad-20 text-center">Loading servers...</div>
          ) : servers.length === 0 ? (
            <div className="bg-subtle-card border-dashed-subtle round-12 pad-y-40 pad-x-20 text-center text-dim">
              No MCP servers registered yet. Add a server using the form on the right to expand your LLM's toolset.
            </div>
          ) : (
            servers.map(server => (
              <div key={server.name} className="interactive-widgets-frame widget-card">
                <div className="flex-between">
                  <div className="flex-center gap-10">
                    <span className="text-15 font-600 text-white">{server.name}</span>
                    <span className={server.initialized ? 'status-badge-green' : 'status-badge-red'}>
                      {server.initialized ? 'Active' : 'Offline'}
                    </span>
                  </div>
                  <div className="flex-center gap-8">
                    <button className="pill btn-icon-subtle pad-y-4 pad-x-10 text-12" onClick={() => handleRestartServer(server.name)}>
                      🔄 Restart
                    </button>
                    <button className="pill btn-delete-pill pad-y-4 pad-x-10 text-12" onClick={() => handleDeleteServer(server.name)}>
                      🗑 Delete
                    </button>
                  </div>
                </div>

                <div className="cmd-box">
                  <strong>Cmd:</strong> {server.command} {server.args.join(' ')}
                </div>

                {server.initialized && server.tools.length > 0 && (
                  <div className="flex-col gap-6">
                    <span className="text-12 font-600 text-primary">Exposed Tools ({server.tools_count}):</span>
                    <div className="flex-wrap-gap gap-6">
                      {server.tools.map(tool => (
                        <span key={tool.name} title={tool.description} className="tool-tag">
                          🛠️ {tool.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Right Column: Add Form */}
        <div className="mcp-form-card">
          <h2 className="text-15 font-600 text-white margin-0">Register New MCP Server</h2>
          
          <form onSubmit={handleAddServer} className="flex-col gap-12">
            <div className="flex-col gap-5">
              <label className="text-12 text-dim font-500">Connection Name</label>
              <input
                type="text"
                placeholder="e.g. filesystem"
                value={name}
                onChange={e => setName(e.target.value)}
                className="mcp-input-text"
              />
            </div>

            <div className="flex-col gap-5">
              <label className="text-12 text-dim font-500">Executable Command</label>
              <input
                type="text"
                placeholder="e.g. npx"
                value={command}
                onChange={e => setCommand(e.target.value)}
                className="mcp-input-text"
              />
            </div>

            <div className="flex-col gap-5">
              <label className="text-12 text-dim font-500">Arguments (JSON array or comma list)</label>
              <input
                type="text"
                placeholder='e.g. ["-y", "@modelcontextprotocol/server-filesystem", "/path"]'
                value={argsStr}
                onChange={e => setArgsStr(e.target.value)}
                className="mcp-input-text"
              />
            </div>

            <div className="flex-col gap-5">
              <label className="text-12 text-dim font-500">Environment Overrides (JSON Object)</label>
              <textarea
                placeholder='e.g. {"API_KEY": "secret_here"}'
                rows={3}
                value={envStr}
                onChange={e => setEnvStr(e.target.value)}
                className="mcp-input-textarea"
              />
            </div>

            {message && (
              <div className={message.type === 'success' ? 'badge-strength-green w-100 pad-8' : 'badge-strength-amber w-100 pad-8'}>
                {message.text}
              </div>
            )}

            <button type="submit" className="pill gradient-btn pad-y-8 pad-x-16 font-600 w-100 round-6 cursor-pointer border-none">
              Register Server
            </button>
          </form>
        </div>

      </div>
    </section>
  );
}
