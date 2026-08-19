import subprocess
import os
import json
import urllib.request
import urllib.error
import urllib.parse
import re
from typing import Dict, Any
from gnomeai_backend.interfaces.tool import BaseTool, tool_registry

class RunCommandTool(BaseTool):
    name = "run_command"
    description = "Executes bash command in workspace terminal."

    def execute(self, command: str = "", **kwargs: Any) -> Dict[str, Any]:
        dangerous_patterns = [";", "&&", "||", "|", "`", "$("]
        for pattern in dangerous_patterns:
            if pattern in command:
                return {
                    "stdout": "",
                    "stderr": f"Command rejected: dangerous chaining operator '{pattern}' detected.",
                    "exit_code": -1
                }
        try:
            result = subprocess.run(
                command,
                shell=True,
                text=True,
                capture_output=True,
                timeout=60
            )
            return {
                "stdout": result.stdout,
                "stderr": result.stderr,
                "exit_code": result.returncode
            }
        except subprocess.TimeoutExpired:
            return {"stdout": "", "stderr": "Command execution timed out after 60 seconds.", "exit_code": -1}
        except Exception as e:
            return {"stdout": "", "stderr": str(e), "exit_code": -99}

class ReadFileTool(BaseTool):
    name = "read_file"
    description = "Reads contents of a file at specified path."

    def execute(self, path: str = "", **kwargs: Any) -> Dict[str, Any]:
        try:
            abs_path = os.path.abspath(path)
            if not os.path.exists(abs_path):
                return {"error": f"File does not exist: {path}"}
            if os.path.isdir(abs_path):
                return {"error": f"Path is a directory, not a file: {path}"}
            with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read(15000)
                if len(content) >= 15000:
                    content += "\n... [Content Truncated due to size] ..."
            return {"content": content}
        except Exception as e:
            return {"error": str(e)}

class WriteFileTool(BaseTool):
    name = "write_file"
    description = "Creates or overwrites a file with content."

    def execute(self, path: str = "", content: str = "", **kwargs: Any) -> Dict[str, Any]:
        try:
            abs_path = os.path.abspath(path)
            os.makedirs(os.path.dirname(abs_path), exist_ok=True)
            with open(abs_path, "w", encoding="utf-8") as f:
                f.write(content)
            return {"success": True, "message": f"Successfully wrote file to {path}"}
        except Exception as e:
            return {"error": str(e)}

class UpdateFileTool(BaseTool):
    name = "update_file"
    description = "Replaces target text segment in a file."

    def execute(self, path: str = "", target_text: str = "", replacement_text: str = "", **kwargs: Any) -> Dict[str, Any]:
        try:
            abs_path = os.path.abspath(path)
            if not os.path.exists(abs_path):
                return {"error": f"File does not exist: {path}"}
            with open(abs_path, "r", encoding="utf-8") as f:
                content = f.read()
            if target_text not in content:
                return {"error": "Target text not found in file."}
            new_content = content.replace(target_text, replacement_text, 1)
            with open(abs_path, "w", encoding="utf-8") as f:
                f.write(new_content)
            return {"success": True, "message": f"Successfully updated file {path}"}
        except Exception as e:
            return {"error": str(e)}

class ListDirTool(BaseTool):
    name = "list_dir"
    description = "Lists files and subdirectories at specified directory path."

    def execute(self, path: str = ".", **kwargs: Any) -> Dict[str, Any]:
        try:
            target_path = os.path.abspath(path if path else ".")
            if not os.path.exists(target_path):
                return {"error": f"Directory does not exist: {path}"}
            if not os.path.isdir(target_path):
                return {"error": f"Path is not a directory: {path}"}
            items = []
            for entry in os.scandir(target_path):
                stat = entry.stat()
                items.append({
                    "name": entry.name,
                    "is_dir": entry.is_dir(),
                    "size": stat.st_size if entry.is_file() else 0
                })
            items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
            return {"directory": target_path, "items": items}
        except Exception as e:
            return {"error": str(e)}

class ControlSystemTool(BaseTool):
    name = "control_system"
    description = "Controls system volume or launches desktop applications."

    def execute(self, action: str = "", app_name: str = None, **kwargs: Any) -> Dict[str, Any]:
        try:
            if action == "volume_up":
                res = RunCommandTool().execute(command="pactl set-sink-volume @DEFAULT_SINK@ +5%")
                if res["exit_code"] != 0:
                    res = RunCommandTool().execute(command="amixer sset Master 5%+")
                return {"success": res["exit_code"] == 0, "output": res}
            elif action == "volume_down":
                res = RunCommandTool().execute(command="pactl set-sink-volume @DEFAULT_SINK@ -5%")
                if res["exit_code"] != 0:
                    res = RunCommandTool().execute(command="amixer sset Master 5%-")
                return {"success": res["exit_code"] == 0, "output": res}
            elif action == "volume_mute":
                res = RunCommandTool().execute(command="pactl set-sink-mute @DEFAULT_SINK@ toggle")
                if res["exit_code"] != 0:
                    res = RunCommandTool().execute(command="amixer sset Master toggle")
                return {"success": res["exit_code"] == 0, "output": res}
            elif action == "launch_app":
                if not app_name:
                    return {"error": "app_name is required for launch_app"}
                subprocess.Popen(
                    [app_name],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    start_new_session=True
                )
                return {"success": True, "message": f"Launched application: {app_name}"}
            else:
                return {"error": f"Unknown system control action: {action}"}
        except Exception as e:
            return {"error": str(e)}

class FetchUrlTool(BaseTool):
    name = "fetch_url"
    description = "Fetches and cleans HTML text content from a web URL."

    def execute(self, url: str = "", **kwargs: Any) -> Dict[str, Any]:
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    )
                }
            )
            with urllib.request.urlopen(req, timeout=30) as response:
                html = response.read().decode("utf-8", errors="ignore")
            html = re.sub(r"<script.*?>.*?</script>", "", html, flags=re.DOTALL | re.IGNORECASE)
            html = re.sub(r"<style.*?>.*?</style>", "", html, flags=re.DOTALL | re.IGNORECASE)
            text = re.sub(r"<.*?>", " ", html)
            text = re.sub(r"\s+", " ", text).strip()
            if len(text) > 10000:
                text = text[:10000] + "\n... [Content Truncated] ..."
            return {"url": url, "content": text}
        except Exception as e:
            return {"error": str(e)}

class SearchWebTool(BaseTool):
    name = "search_web"
    description = "Searches web via DuckDuckGo and parses text search results."

    def execute(self, query: str = "", **kwargs: Any) -> Dict[str, Any]:
        try:
            url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    )
                }
            )
            with urllib.request.urlopen(req, timeout=15) as response:
                html = response.read().decode("utf-8", errors="ignore")
            results = []
            links = re.findall(r'<a\s+[^>]*class="result__a"[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', html, re.DOTALL | re.IGNORECASE)
            snippets = re.findall(r'<a\s+[^>]*class="result__snippet"[^>]*>(.*?)</a>', html, re.DOTALL | re.IGNORECASE)
            for i in range(min(len(links), len(snippets), 5)):
                href, anchor_text = links[i]
                parsed_url = urllib.parse.urlparse(href)
                query_params = urllib.parse.parse_qs(parsed_url.query)
                target_url = href
                if 'uddg' in query_params:
                    target_url = query_params['uddg'][0]
                elif href.startswith("//"):
                    target_url = "https:" + href
                title_text = re.sub(r'<.*?>', '', anchor_text).strip()
                snippet_text = re.sub(r'<.*?>', '', snippets[i]).strip()
                results.append(f"{i+1}. {title_text}\n   Link: {target_url}\n   Snippet: {snippet_text}")
            if not results:
                return {"query": query, "results": "No results found."}
            return {"query": query, "results": "\n\n".join(results)}
        except Exception as e:
            return {"error": str(e)}

class GitStatusTool(BaseTool):
    name = "git_status"
    description = "Runs git status in workspace."

    def execute(self, **kwargs: Any) -> Dict[str, Any]:
        res = RunCommandTool().execute(command="git status")
        return {"status": res.get("stdout") or res.get("stderr")}

class GitDiffTool(BaseTool):
    name = "git_diff"
    description = "Runs git diff in workspace."

    def execute(self, **kwargs: Any) -> Dict[str, Any]:
        res = RunCommandTool().execute(command="git diff")
        return {"diff": res.get("stdout") or res.get("stderr")}

class SummonSubagentTool(BaseTool):
    name = "summon_subagent"
    description = "Summons an independent subagent worker to run a subtask."

    def execute(self, instruction: str = "", **kwargs: Any) -> Dict[str, Any]:
        from gnomeai_backend.agents.subagent import run_subagent
        return run_subagent(instruction)

# Register default core tools
tool_registry.register(RunCommandTool())
tool_registry.register(ReadFileTool())
tool_registry.register(WriteFileTool())
tool_registry.register(UpdateFileTool())
tool_registry.register(ListDirTool())
tool_registry.register(ControlSystemTool())
tool_registry.register(FetchUrlTool())
tool_registry.register(SearchWebTool())
tool_registry.register(GitStatusTool())
tool_registry.register(GitDiffTool())
tool_registry.register(SummonSubagentTool())

# Legacy procedural wrappers for full backward compatibility inside backend imports
run_command = lambda cmd: RunCommandTool().execute(command=cmd)
read_file = lambda p: ReadFileTool().execute(path=p)
write_file = lambda p, c: WriteFileTool().execute(path=p, content=c)
update_file = lambda p, t, r: UpdateFileTool().execute(path=p, target_text=t, replacement_text=r)
list_dir = lambda p: ListDirTool().execute(path=p)
control_system = lambda a, app=None: ControlSystemTool().execute(action=a, app_name=app)
fetch_url = lambda u: FetchUrlTool().execute(url=u)
search_web = lambda q: SearchWebTool().execute(query=q)
git_status = lambda: GitStatusTool().execute()
git_diff = lambda: GitDiffTool().execute()

def execute_tool(tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
    if "__" in tool_name:
        from gnomeai_backend.tools.mcp import mcp_manager
        return mcp_manager.execute_mcp_tool(tool_name, args)
    return tool_registry.execute_tool(tool_name, args)

def parse_tool_call(text: str):
    code_block_match = re.search(r"```(?:tool|json)\s*(.*?)\s*```", text, re.DOTALL | re.IGNORECASE)
    if code_block_match:
        json_str = code_block_match.group(1)
        try:
            parsed = json.loads(json_str)
            if "tool" in parsed:
                thought = text[:code_block_match.start()].strip()
                return parsed, thought
        except Exception:
            pass

    stack = []
    candidates = []
    for i, char in enumerate(text):
        if char == '{':
            stack.append(i)
        elif char == '}' and stack:
            start_idx = stack.pop()
            candidates.append((start_idx, i + 1))
            
    candidates.sort(key=lambda x: x[1] - x[0], reverse=True)
    for start_idx, end_idx in candidates:
        candidate_json = text[start_idx:end_idx]
        try:
            parsed = json.loads(candidate_json)
            if "tool" in parsed:
                thought = text[:start_idx].strip()
                return parsed, thought
        except Exception:
            pass
                    
    return None, text

def get_cpu_usage():
    try:
        with open("/proc/loadavg", "r") as f:
            load = f.read().split()
        load_1m = float(load[0])
        cores = os.cpu_count() or 1
        pct = min(100.0, (load_1m / cores) * 100.0)
        return round(pct, 1)
    except Exception:
        return 0.0

def get_ram_usage():
    try:
        meminfo = {}
        with open("/proc/meminfo", "r") as f:
            for line in f:
                parts = line.split(":")
                if len(parts) == 2:
                    name = parts[0].strip()
                    val = parts[1].split()[0].strip()
                    meminfo[name] = int(val)
        total = meminfo.get("MemTotal", 1)
        avail = meminfo.get("MemAvailable", total)
        used = total - avail
        pct = (used / total) * 100.0
        return {
            "total_gb": round(total / (1024 * 1024), 2),
            "used_gb": round(used / (1024 * 1024), 2),
            "percentage": round(pct, 1)
        }
    except Exception:
        return {"total_gb": 0, "used_gb": 0, "percentage": 0.0}

def get_system_uptime():
    try:
        with open("/proc/uptime", "r") as f:
            uptime_seconds = float(f.read().split()[0])
        days = int(uptime_seconds // 86400)
        hours = int((uptime_seconds % 86400) // 3600)
        minutes = int((uptime_seconds % 3600) // 60)
        parts = []
        if days > 0: parts.append(f"{days}d")
        if hours > 0 or days > 0: parts.append(f"{hours}h")
        parts.append(f"{minutes}m")
        return " ".join(parts)
    except Exception:
        return "Unknown"

def get_volume_status():
    try:
        vol_res = subprocess.run(
            ["pactl", "get-sink-volume", "@DEFAULT_SINK@"],
            capture_output=True, text=True, timeout=2
        )
        vol_pct = 0
        is_muted = False
        if vol_res.returncode == 0:
            match = re.search(r"(\d+)%", vol_res.stdout)
            if match: vol_pct = int(match.group(1))
            mute_res = subprocess.run(
                ["pactl", "get-sink-mute", "@DEFAULT_SINK@"],
                capture_output=True, text=True, timeout=2
            )
            if mute_res.returncode == 0:
                is_muted = "yes" in mute_res.stdout.lower()
        return {"percentage": vol_pct, "muted": is_muted}
    except Exception:
        return {"percentage": 0, "muted": False}
