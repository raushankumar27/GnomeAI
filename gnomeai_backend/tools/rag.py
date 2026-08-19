import os
import re
import math
import threading
import sqlite3
import json
import numpy as np

DB_FILE = os.path.expanduser("~/.cache/gnomeai/rag_index.db")

class LocalEmbedder:
    """Generates sentence embeddings via MiniLM for local document RAG."""

    def __init__(self):
        self.model_name = "sentence-transformers/all-MiniLM-L6-v2"
        self.tokenizer = None
        self.model = None
        self.device = None

    def _load(self):
        if self.model is None:
            import torch
            from transformers import AutoTokenizer, AutoModel
            if self.device is None:
                self.device = "cuda" if torch.cuda.is_available() else "cpu"
            print(f"[RAG] Loading embedding model '{self.model_name}' on {self.device}...", flush=True)
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            self.model = AutoModel.from_pretrained(self.model_name).to(self.device)

    def get_embedding(self, text: str) -> np.ndarray:
        try:
            self._load()
            import torch
            inputs = self.tokenizer(text, padding=True, truncation=True, return_tensors="pt", max_length=512)
            inputs = {k: v.to(self.device) for k, v in inputs.items()}
            with torch.no_grad():
                outputs = self.model(**inputs)
            
            attention_mask = inputs['attention_mask']
            token_embeddings = outputs[0]
            input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
            sum_embeddings = torch.sum(token_embeddings * input_mask_expanded, 1)
            sum_mask = torch.clamp(input_mask_expanded.sum(1), min=1e-9)
            embedding = sum_embeddings / sum_mask
            return embedding[0].cpu().numpy()
        except Exception as e:
            print(f"[RAG] Embedding generation error: {e}", flush=True)
            return np.zeros(384, dtype=np.float32)

class RAGManager:
    """Manages document vector indexing, SQLite persistence, and cosine-similarity search."""

    def __init__(self, target_dirs=None):
        if target_dirs is None:
            self.target_dirs = [os.getcwd()]
        else:
            self.target_dirs = target_dirs
            
        self.documents = []
        self.index_built = False
        self.indexing_thread = None
        self.indexing_lock = threading.Lock()
        self.embedder = LocalEmbedder()
        
        os.makedirs(os.path.dirname(DB_FILE), exist_ok=True)
        self._init_db()

    def _init_db(self):
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                path TEXT PRIMARY KEY,
                filename TEXT,
                content TEXT,
                tf TEXT,
                vector BLOB,
                mtime REAL
            )
        """)
        conn.commit()
        conn.close()

    def build_index(self):
        with self.indexing_lock:
            if self.indexing_thread and self.indexing_thread.is_alive():
                return
            self.indexing_thread = threading.Thread(target=self._build_index_sync, daemon=True)
            self.indexing_thread.start()

    def _build_index_sync(self):
        ignored_dirs = {'.git', 'node_modules', '__pycache__', 'sessions', 'dist'}
        allowed_exts = {'.txt', '.md', '.py', '.json', '.sh'}
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()

        cursor.execute("SELECT path, mtime FROM documents")
        cache = {row[0]: row[1] for row in cursor.fetchall()}
        
        updated_paths = set()
        
        for base_dir in self.target_dirs:
            if not os.path.exists(base_dir):
                continue
                
            for root, dirs, files in os.walk(base_dir):
                dirs[:] = [d for d in dirs if d not in ignored_dirs]
                
                for file in files:
                    _, ext = os.path.splitext(file)
                    if ext.lower() not in allowed_exts:
                        continue
                        
                    file_path = os.path.abspath(os.path.join(root, file))
                    updated_paths.add(file_path)
                    
                    try:
                        mtime = os.path.getmtime(file_path)
                        if file_path in cache and cache[file_path] == mtime:
                            continue
                            
                        if os.path.getsize(file_path) > 64 * 1024:
                            continue
                            
                        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                            content = f.read()
                            
                        if not content.strip():
                            continue
                            
                        embedding = self.embedder.get_embedding(content)
                        vector_blob = sqlite3.Binary(embedding.tobytes())
                        
                        cursor.execute(
                            "INSERT OR REPLACE INTO documents (path, filename, content, vector, mtime) VALUES (?, ?, ?, ?, ?)",
                            (file_path, file, content, vector_blob, mtime)
                        )
                    except Exception as e:
                        print(f"[RAG Index Error] Failed to index {file}: {e}", flush=True)
        
        for path in cache:
            if path not in updated_paths:
                cursor.execute("DELETE FROM documents WHERE path = ?", (path,))

        conn.commit()

        cursor.execute("SELECT path, filename, content, vector FROM documents")
        self.documents = []
        
        for row in cursor.fetchall():
            path, filename, content, vec_blob = row
            if vec_blob:
                vector = np.frombuffer(vec_blob, dtype=np.float32)
            else:
                vector = np.zeros(384, dtype=np.float32)
                
            self.documents.append({
                "path": path,
                "filename": filename,
                "content": content,
                "vector": vector
            })
            
        conn.close()
        self.index_built = True
        print(f"[RAG] Index built successfully with {len(self.documents)} documents.", flush=True)

    def search(self, query, top_n=3):
        if not self.index_built or not self.documents:
            self._build_index_sync()
            
        if not self.documents:
            return []
            
        query_vector = self.embedder.get_embedding(query)
        q_norm = np.linalg.norm(query_vector)
        
        query_terms = set(re.findall(r'\w+', query.lower()))
        
        scores = []
        for doc in self.documents:
            doc_vector = doc["vector"]
            doc_norm = np.linalg.norm(doc_vector)
            
            # Dense Vector Score
            dense_score = 0.0
            if q_norm > 0 and doc_norm > 0:
                dense_score = max(0.0, float(np.dot(query_vector, doc_vector) / (q_norm * doc_norm)))
                
            # BM25 Keyword Match Score
            content_lower = doc["content"].lower()
            bm25_matches = sum(1 for term in query_terms if term in content_lower)
            bm25_score = min(1.0, bm25_matches / max(1, len(query_terms))) if query_terms else 0.0
            
            # Hybrid combined score
            hybrid_score = (0.6 * dense_score) + (0.4 * bm25_score)
            
            if hybrid_score > 0:
                scores.append((doc, hybrid_score))
                
        scores.sort(key=lambda x: x[1], reverse=True)
        
        results = []
        for doc, score in scores[:top_n]:
            content = doc["content"]
            snippet = content[:150].strip().replace("\n", " ") + "..."
            
            results.append({
                "path": doc["path"],
                "filename": doc["filename"],
                "snippet": snippet,
                "score": float(score)
            })
            
        return results


rag_manager = RAGManager()
