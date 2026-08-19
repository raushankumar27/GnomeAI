import os
import re
import json
import math
import difflib

class WorkspaceManager:
    """Manages active workspace path, file tree scanning, indexing cache, and git diff preview/apply/discard."""

    def __init__(self, workspace_path=None):
        self.workspace_path = workspace_path
        self.ignored_dirs = {
            '.git', 'node_modules', 'venv', '.venv', '__pycache__', 
            'sessions', '.idea', '.vscode', 'build', 'dist'
        }
        self.allowed_exts = {
            '.py', '.js', '.ts', '.json', '.sh', '.html', 
            '.css', '.md', '.txt', '.yaml', '.yml', '.ini', '.cfg'
        }
        self.pending_diffs = {}  # rel_path -> proposed_content
        self.config = {
            "test_command": "pytest",
            "build_command": "",
            "ignore_patterns": []
        }

    def set_workspace(self, path):
        if not os.path.exists(path) or not os.path.isdir(path):
            raise ValueError("Workspace path must be an existing directory.")
        self.workspace_path = os.path.abspath(path)
        self.pending_diffs = {}
        
        config_path = os.path.join(self.workspace_path, ".gnomeai.json")
        if os.path.exists(config_path):
            try:
                with open(config_path, 'r', encoding='utf-8') as f:
                    self.config.update(json.load(f))
            except Exception:
                pass
        
        import hashlib
        h = hashlib.md5(self.workspace_path.encode('utf-8')).hexdigest()
        self.cache_dir = os.path.join("sessions", "workspace_indexes")
        os.makedirs(self.cache_dir, exist_ok=True)
        self.cache_file = os.path.join(self.cache_dir, f"index_{h}.json")
        self.index_data = self._load_index_cache()

    def _load_index_cache(self):
        if hasattr(self, 'cache_file') and os.path.exists(self.cache_file):
            try:
                with open(self.cache_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass
        return {"files": {}, "last_scanned": 0}

    def _save_index_cache(self):
        if hasattr(self, 'cache_file'):
            try:
                with open(self.cache_file, 'w', encoding='utf-8') as f:
                    json.dump(self.index_data, f, indent=2)
            except Exception:
                pass

    def is_safe_path(self, target_path):
        if not self.workspace_path:
            return False
        abs_target = os.path.abspath(target_path)
        return abs_target.startswith(self.workspace_path)

    def list_files(self):
        if not self.workspace_path:
            return []
        
        file_list = []
        cache_updated = False
        
        for root, dirs, files in os.walk(self.workspace_path):
            dirs[:] = [d for d in dirs if d not in self.ignored_dirs]
            
            for file in files:
                ext = os.path.splitext(file)[1].lower()
                if ext in self.allowed_exts:
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, self.workspace_path)
                    
                    try:
                        mtime = os.path.getmtime(full_path)
                        size = os.path.getsize(full_path)
                        
                        cached_entry = self.index_data.get("files", {}).get(rel_path)
                        if cached_entry and cached_entry.get("mtime") == mtime and cached_entry.get("size") == size:
                            file_info = {
                                "filename": file,
                                "rel_path": rel_path,
                                "size_bytes": size,
                                "line_count": cached_entry.get("line_count", 0),
                                "imports": cached_entry.get("imports", []),
                                "functions": cached_entry.get("functions", [])
                            }
                        else:
                            line_count = 0
                            imports = []
                            functions = []
                            
                            with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                                for line in f:
                                    line_count += 1
                                    line_strip = line.strip()
                                    if line_strip.startswith(("import ", "from ")):
                                        imports.append(line_strip[:80])
                                    elif line_strip.startswith("def ") or line_strip.startswith("class "):
                                        functions.append(line_strip[:80])
                                        
                            imports = list(set(imports))[:15]
                            functions = functions[:25]
                            
                            new_entry = {
                                "mtime": mtime,
                                "size": size,
                                "line_count": line_count,
                                "imports": imports,
                                "functions": functions
                            }
                            self.index_data.setdefault("files", {})[rel_path] = new_entry
                            cache_updated = True
                            
                            file_info = {
                                "filename": file,
                                "rel_path": rel_path,
                                "size_bytes": size,
                                "line_count": line_count,
                                "imports": imports,
                                "functions": functions
                            }
                        
                        file_list.append(file_info)
                    except Exception:
                        pass
                        
        if cache_updated:
            self._save_index_cache()
            
        return file_list

    def read_file(self, rel_path):
        if not self.workspace_path:
            raise ValueError("No active workspace selected.")
        
        if rel_path in self.pending_diffs:
            return self.pending_diffs[rel_path]
            
        full_path = os.path.join(self.workspace_path, rel_path)
        if not self.is_safe_path(full_path):
            raise PermissionError("Access denied: path is outside active workspace.")
        
        if not os.path.exists(full_path) or os.path.isdir(full_path):
            raise FileNotFoundError(f"File not found: {rel_path}")
            
        with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
            return f.read()

    def propose_file_change(self, rel_path, proposed_content):
        if not self.workspace_path:
            raise ValueError("No active workspace selected.")
            
        full_path = os.path.join(self.workspace_path, rel_path)
        if not self.is_safe_path(full_path):
            raise PermissionError("Access denied: path is outside active workspace.")
            
        original_content = ""
        if os.path.exists(full_path) and not os.path.isdir(full_path):
            with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                original_content = f.read()
                
        orig_lines = original_content.splitlines(keepends=True)
        new_lines = proposed_content.splitlines(keepends=True)
        
        diff = difflib.unified_diff(
            orig_lines, new_lines,
            fromfile=f"a/{rel_path}", tofile=f"b/{rel_path}"
        )
        diff_str = "".join(diff)
        
        self.pending_diffs[rel_path] = proposed_content
        return diff_str if diff_str else "No changes detected."

    def write_file(self, rel_path, content):
        if not self.workspace_path:
            raise ValueError("No active workspace selected.")
        
        full_path = os.path.join(self.workspace_path, rel_path)
        if not self.is_safe_path(full_path):
            raise PermissionError("Access denied: path is outside active workspace.")
            
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(content)
        if rel_path in self.pending_diffs:
            del self.pending_diffs[rel_path]
        return True

    def apply_all_diffs(self):
        for rel_path, content in list(self.pending_diffs.items()):
            self.write_file(rel_path, content)
        self.pending_diffs.clear()

    def discard_all_diffs(self):
        self.pending_diffs.clear()

    def search_code(self, query):
        if not self.workspace_path:
            return []
        
        query_regex = re.compile(re.escape(query), re.IGNORECASE)
        results = []
        files = self.list_files()
        
        for f_info in files:
            rel_path = f_info["rel_path"]
            try:
                content = self.read_file(rel_path)
                matches = []
                for i, line in enumerate(content.splitlines(), 1):
                    if query_regex.search(line):
                        matches.append({"line_num": i, "content": line.strip()})
                if matches:
                    results.append({
                        "rel_path": rel_path,
                        "matches": matches[:10]
                    })
            except Exception:
                pass
        return results

    def semantic_search(self, query, top_n=5):
        if not self.workspace_path:
            return []

        chunks = []
        files = self.list_files()
        stopwords = {'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'to', 'from', 'in', 'of', 'for', 'by', 'with'}
        
        def tokenize(text):
            tokens = re.findall(r'[a-zA-Z0-9_]+', text.lower())
            return [t for t in tokens if len(t) > 1 and t not in stopwords]

        for f_info in files:
            rel_path = f_info["rel_path"]
            try:
                content = self.read_file(rel_path)
                lines = content.splitlines()
                chunk_size = 40
                overlap = 10
                i = 0
                while i < len(lines):
                    chunk_lines = lines[i : i + chunk_size]
                    chunk_text = "\n".join(chunk_lines)
                    tokens = tokenize(chunk_text)
                    if tokens:
                        chunks.append({
                            "rel_path": rel_path,
                            "start_line": i + 1,
                            "end_line": min(len(lines), i + chunk_size),
                            "text": chunk_text,
                            "tokens": tokens
                        })
                    i += (chunk_size - overlap)
            except Exception:
                pass

        if not chunks:
            return []

        doc_count = len(chunks)
        vocab = set()
        df = {}
        
        for ch in chunks:
            terms = set(ch["tokens"])
            for t in terms:
                vocab.add(t)
                df[t] = df.get(t, 0) + 1

        idf = {}
        for t in vocab:
            idf[t] = math.log(1 + (doc_count / df[t]))

        for ch in chunks:
            vector = {}
            tfs = {}
            for t in ch["tokens"]:
                tfs[t] = tfs.get(t, 0) + 1
            length = len(ch["tokens"])
            for t, count in tfs.items():
                vector[t] = (count / length) * idf.get(t, 0.0)
            ch["vector"] = vector
            ch["norm"] = math.sqrt(sum(v * v for v in vector.values()))

        q_tokens = tokenize(query)
        if not q_tokens:
            return []
        
        q_tfs = {}
        for t in q_tokens:
            q_tfs[t] = q_tfs.get(t, 0) + 1
        q_length = len(q_tokens)
        q_vector = {}
        for t, count in q_tfs.items():
            if t in idf:
                q_vector[t] = (count / q_length) * idf[t]
        
        q_norm = math.sqrt(sum(v * v for v in q_vector.values()))
        if q_norm == 0:
            return []

        scores = []
        for ch in chunks:
            if ch["norm"] == 0:
                continue
            dot = 0.0
            for t, val in q_vector.items():
                if t in ch["vector"]:
                    dot += val * ch["vector"][t]
            cos_sim = dot / (q_norm * ch["norm"])
            if cos_sim > 0.05:
                scores.append((ch, cos_sim))

        scores.sort(key=lambda x: x[1], reverse=True)
        
        results = []
        for ch, score in scores[:top_n]:
            results.append({
                "rel_path": ch["rel_path"],
                "start_line": ch["start_line"],
                "end_line": ch["end_line"],
                "snippet": ch["text"],
                "score": score
            })
        return results

    def get_file_symbols(self, rel_path):
        if not self.workspace_path:
            return []
            
        full_path = os.path.join(self.workspace_path, rel_path)
        if not self.is_safe_path(full_path) or not os.path.exists(full_path):
            return []
            
        try:
            import ast
            with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                source = f.read()
                
            tree = ast.parse(source, filename=rel_path)
            symbols = []
            
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.ClassDef, ast.AsyncFunctionDef)):
                    start_line = node.lineno
                    end_line = start_line
                    if hasattr(node, 'end_lineno') and node.end_lineno:
                        end_line = node.end_lineno
                    else:
                        for child in ast.walk(node):
                            if hasattr(child, 'lineno'):
                                end_line = max(end_line, child.lineno)
                            
                    symbols.append({
                        "name": node.name,
                        "type": "class" if isinstance(node, ast.ClassDef) else "function",
                        "start_line": start_line,
                        "end_line": end_line
                    })
            return symbols
        except Exception:
            return []

    def read_symbol_content(self, rel_path, symbol_name):
        symbols = self.get_file_symbols(rel_path)
        target = next((s for s in symbols if s["name"] == symbol_name), None)
        if not target:
            raise ValueError(f"Symbol '{symbol_name}' not found in file '{rel_path}'")
            
        full_path = os.path.join(self.workspace_path, rel_path)
        with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
            
        start = target["start_line"] - 1
        end = target["end_line"]
        return "".join(lines[start:end])

workspace_manager = WorkspaceManager()
