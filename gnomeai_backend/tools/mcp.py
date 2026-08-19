import os
import json
import subprocess
import threading
import queue

class MCPServerConnection:
    """Manages stdio connection and JSON-RPC protocol handling for an individual MCP server process."""

    def __init__(self, name, command, args=None, env=None):
        self.name = name
        self.command = command
        self.args = args or []
        self.env = os.environ.copy()
        if env:
            self.env.update(env)
        self.process = None
        self.read_thread = None
        self.response_queues = {}
        self.next_id = 1
        self.tools = []
        self.initialized = False

    def start(self):
        try:
            full_cmd = [self.command] + self.args
            self.process = subprocess.Popen(
                full_cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                env=self.env
            )
            self.read_thread = threading.Thread(target=self._read_loop, daemon=True)
            self.read_thread.start()
            
            if self._initialize():
                self.initialized = True
                self._list_tools()
                print(f"[MCP] Configured & initialized server: {self.name}")
        except Exception as e:
            print(f"[MCP Error] Failed to start server {self.name}: {e}")

    def _read_loop(self):
        while self.process and self.process.poll() is None:
            line = self.process.stdout.readline()
            if not line:
                break
            try:
                line = line.strip()
                if not line.startswith("{"):
                    idx = line.find("{")
                    if idx != -1:
                        line = line[idx:]
                    else:
                        continue
                msg = json.loads(line)
                if "id" in msg:
                    msg_id = msg["id"]
                    if msg_id in self.response_queues:
                        self.response_queues[msg_id].put(msg)
            except Exception:
                pass

    def _send_request(self, method, params=None, timeout=10):
        if not self.process or self.process.poll() is not None:
            return None
        
        req_id = self.next_id
        self.next_id += 1
        
        req = {
            "jsonrpc": "2.0",
            "id": req_id,
            "method": method
        }
        if params is not None:
            req["params"] = params
            
        res_queue = queue.Queue()
        self.response_queues[req_id] = res_queue
        
        try:
            self.process.stdin.write(json.dumps(req) + "\n")
            self.process.stdin.flush()
            return res_queue.get(timeout=timeout)
        except Exception as e:
            print(f"[MCP Error] Request failed on {self.name}: {e}")
            return None
        finally:
            self.response_queues.pop(req_id, None)

    def _send_notification(self, method, params=None):
        if not self.process or self.process.poll() is not None:
            return
        
        notif = {
            "jsonrpc": "2.0",
            "method": method
        }
        if params is not None:
            notif["params"] = params
            
        try:
            self.process.stdin.write(json.dumps(notif) + "\n")
            self.process.stdin.flush()
        except Exception as e:
            print(f"[MCP Error] Notification failed on {self.name}: {e}")

    def _initialize(self):
        init_params = {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {
                "name": "GnomeAi",
                "version": "1.0.0"
            }
        }
        res = self._send_request("initialize", init_params, timeout=2.0)
        if res and "result" in res:
            self._send_notification("notifications/initialized")
            return True
        return False

    def _list_tools(self):
        res = self._send_request("tools/list", timeout=2.0)
        if res and "result" in res:
            self.tools = res["result"].get("tools", [])
        return self.tools


    def call_tool(self, tool_name, arguments):
        res = self._send_request("tools/call", {"name": tool_name, "arguments": arguments}, timeout=60)
        if res and "result" in res:
            content_list = res["result"].get("content", [])
            text_outs = [c.get("text", "") for c in content_list if c.get("type") == "text"]
            return {"success": not res["result"].get("isError", False), "content": "\n".join(text_outs)}
        elif res and "error" in res:
            return {"success": False, "error": res["error"].get("message", "Unknown error")}
        return {"success": False, "error": "No response from MCP server"}

    def stop(self):
        if self.process:
            self.process.terminate()
            self.process = None

class MCPClientManager:
    """Manages MCP server processes, configuration, tool discovery, and namespaced tool calls."""

    def __init__(self):
        self.servers = {}
        self.config_path = os.path.expanduser("~/.config/gnomeai/mcp_servers.json")
        self._load_config_and_start()

    def _load_config_and_start(self):
        os.makedirs(os.path.dirname(self.config_path), exist_ok=True)
        if not os.path.exists(self.config_path):
            with open(self.config_path, "w") as f:
                json.dump({
                    "mcpServers": {}
                }, f, indent=2)
                
        try:
            with open(self.config_path, "r") as f:
                config = json.load(f)
            
            servers_cfg = config.get("mcpServers", {})
            for name, cfg in servers_cfg.items():
                cmd = cfg.get("command")
                args = cfg.get("args", [])
                env = cfg.get("env", {})
                if cmd:
                    conn = MCPServerConnection(name, cmd, args, env)
                    self.servers[name] = conn
                    threading.Thread(target=conn.start, daemon=True).start()
        except Exception as e:
            print(f"[MCP Manager Error] Failed to load config: {e}")

    def get_all_tools(self):
        all_tools = []
        for s_name, server in self.servers.items():
            if server.initialized:
                for tool in server.tools:
                    namespaced_name = f"{s_name}__{tool['name']}"
                    all_tools.append({
                        "name": namespaced_name,
                        "description": f"[{s_name.upper()}] {tool['description']}",
                        "inputSchema": tool.get("inputSchema", {}),
                        "server_name": s_name,
                        "original_name": tool['name']
                    })
        return all_tools

    def execute_mcp_tool(self, namespaced_name, arguments):
        parts = namespaced_name.split("__", 1)
        if len(parts) != 2:
            return {"error": "Invalid namespaced tool name"}
        s_name, tool_name = parts
        server = self.servers.get(s_name)
        if not server or not server.initialized:
            return {"error": f"MCP server '{s_name}' is not running"}
        return server.call_tool(tool_name, arguments)

    def add_or_update_server(self, name, command, args=None, env=None):
        if name in self.servers:
            try:
                self.servers[name].stop()
            except Exception:
                pass
            self.servers.pop(name, None)
            
        try:
            with open(self.config_path, "r") as f:
                config = json.load(f)
        except Exception:
            config = {"mcpServers": {}}
            
        if "mcpServers" not in config:
            config["mcpServers"] = {}
            
        config["mcpServers"][name] = {
            "command": command,
            "args": args or [],
            "env": env or {}
        }
        
        try:
            with open(self.config_path, "w") as f:
                json.dump(config, f, indent=2)
        except Exception as e:
            print(f"[MCP Manager Error] Failed to write config: {e}")
            
        conn = MCPServerConnection(name, command, args, env)
        conn.start()
        self.servers[name] = conn
        return True

    def delete_server(self, name):
        if name in self.servers:
            try:
                self.servers[name].stop()
            except Exception:
                pass
            self.servers.pop(name, None)
            
        try:
            with open(self.config_path, "r") as f:
                config = json.load(f)
            if "mcpServers" in config and name in config["mcpServers"]:
                config["mcpServers"].pop(name)
                with open(self.config_path, "w") as f:
                    json.dump(config, f, indent=2)
                return True
        except Exception as e:
            print(f"[MCP Manager Error] Failed to delete server config: {e}")
        return False

    def restart_server(self, name):
        try:
            with open(self.config_path, "r") as f:
                config = json.load(f)
            servers_cfg = config.get("mcpServers", {})
            if name in servers_cfg:
                cfg = servers_cfg[name]
                cmd = cfg.get("command")
                args = cfg.get("args", [])
                env = cfg.get("env", {})
                if cmd:
                    if name in self.servers:
                        try:
                            self.servers[name].stop()
                        except Exception:
                            pass
                        self.servers.pop(name, None)
                    conn = MCPServerConnection(name, cmd, args, env)
                    conn.start()
                    self.servers[name] = conn
                    return True
        except Exception as e:
            print(f"[MCP Manager Error] Failed to restart server: {e}")
        return False

    def get_servers_status(self):
        try:
            with open(self.config_path, "r") as f:
                config = json.load(f)
        except Exception:
            config = {"mcpServers": {}}
            
        servers_cfg = config.get("mcpServers", {})
        status_list = []
        for name, cfg in servers_cfg.items():
            conn = self.servers.get(name)
            initialized = conn.initialized if conn else False
            running = (conn.process is not None and conn.process.poll() is None) if conn else False
            tools_count = len(conn.tools) if conn and initialized else 0
            status_list.append({
                "name": name,
                "command": cfg.get("command", ""),
                "args": cfg.get("args", []),
                "env": cfg.get("env", {}),
                "running": running,
                "initialized": initialized,
                "tools_count": tools_count,
                "tools": conn.tools if conn and initialized else []
            })
        return status_list

    def shutdown(self):
        for server in self.servers.values():
            server.stop()

mcp_manager = MCPClientManager()
