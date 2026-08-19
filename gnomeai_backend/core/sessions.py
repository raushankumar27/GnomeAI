import os
import json
import time

SESSIONS_DIR = 'sessions'
active_session_id = None
transient_sessions = {}

class SessionManager:
    """Manages active session state, transient memory sessions, and disk JSON persistence."""
    
    @staticmethod
    def get_active_session_id():
        global active_session_id
        return active_session_id

    @staticmethod
    def set_active_session_id(session_id):
        global active_session_id
        active_session_id = session_id
        try:
            from .workspace import workspace_manager
            session = SessionManager.load_session(session_id)
            if session and session.get("workspace_path"):
                wpath = session["workspace_path"]
                if os.path.exists(wpath) and os.path.isdir(wpath):
                    workspace_manager.set_workspace(wpath)
                else:
                    workspace_manager.workspace_path = None
                    workspace_manager.pending_diffs = {}
            else:
                workspace_manager.workspace_path = None
                workspace_manager.pending_diffs = {}
        except Exception as e:
            print(f"Error auto-restoring workspace for session {session_id}: {e}")

    @staticmethod
    def get_session_path(session_id):
        return os.path.join(SESSIONS_DIR, f"{session_id}.json")

    @staticmethod
    def save_session(session_id, data):
        if not data.get("chat_history"):
            transient_sessions[session_id] = data
            path = SessionManager.get_session_path(session_id)
            if os.path.exists(path):
                try:
                    os.remove(path)
                except Exception:
                    pass
            return
            
        transient_sessions.pop(session_id, None)
        try:
            path = SessionManager.get_session_path(session_id)
            os.makedirs(SESSIONS_DIR, exist_ok=True)
            with open(path, "w") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"Error saving session {session_id}: {e}")

    @staticmethod
    def load_session(session_id):
        if session_id in transient_sessions:
            return transient_sessions[session_id]
            
        path = SessionManager.get_session_path(session_id)
        if os.path.exists(path):
            try:
                with open(path, "r") as f:
                    return json.load(f)
            except Exception as e:
                print(f"Error loading session {session_id}: {e}")
        return None

    @staticmethod
    def create_session(session_id=None, title="New Conversation"):
        global active_session_id
        if not session_id:
            session_id = f"session_{int(time.time() * 1000)}"
        
        from gnomeai_backend.config import app_settings
        data = {
            "id": session_id,
            "title": title,
            "chat_history": [],
            "pending_action": None,
            "created_at": time.time(),
            "active_model": None,
            "system_prompt": app_settings.get("system_prompt", "You are GnomeAI, a helpful, intelligent Linux desktop assistant. Answer the user's questions or chat with them directly."),
            "temperature": float(app_settings.get("temperature", 0.7))
        }
        
        transient_sessions[session_id] = data
        active_session_id = session_id
        return data

    @staticmethod
    def init_sessions():
        global active_session_id
        os.makedirs(SESSIONS_DIR, exist_ok=True)

        existing = sorted(
            [f for f in os.listdir(SESSIONS_DIR) if f.endswith('.json')],
            key=lambda f: os.path.getmtime(os.path.join(SESSIONS_DIR, f)),
            reverse=True
        )
        if existing:
            sess_id = existing[0].replace('.json', '')
            active_session_id = sess_id
            print(f"[Sessions] Restored last session: {sess_id}")
        else:
            new_sess = SessionManager.create_session(title="New Conversation")
            active_session_id = new_sess["id"]
            print("[Sessions] No existing sessions found. Created a new one.")

# Function aliases for backward compatibility
get_active_session_id = SessionManager.get_active_session_id
set_active_session_id = SessionManager.set_active_session_id
get_session_path = SessionManager.get_session_path
save_session = SessionManager.save_session
load_session = SessionManager.load_session
create_session = SessionManager.create_session
init_sessions = SessionManager.init_sessions
