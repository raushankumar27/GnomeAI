import os
import json
import re
import platform

LEARNINGS_FILE = "learnings.json"

class LearningsManager:
    """Manages long-term memory facts, system auto-profiling, and learning extraction."""

    @staticmethod
    def detect_system_info():
        facts = []
        os_name = platform.system()
        facts.append(f"Operating System: {os_name}")
        
        if os_name == "Linux":
            distro = "Unknown Linux"
            if os.path.exists("/etc/os-release"):
                try:
                    with open("/etc/os-release", "r") as f:
                        for line in f:
                            if line.startswith("PRETTY_NAME="):
                                distro = line.split("=")[1].strip().strip('"')
                                break
                            elif line.startswith("NAME="):
                                distro = line.split("=")[1].strip().strip('"')
                except Exception:
                    pass
            facts.append(f"Linux Distribution: {distro}")
            
        de = os.environ.get("XDG_CURRENT_DESKTOP", "")
        if not de:
            de = os.environ.get("GDMSESSION", "")
        if not de:
            de = "GNOME" if "gnome" in os.environ.get("SESSION_MANAGER", "").lower() else "Unknown Desktop Environment"
        facts.append(f"Desktop Environment: {de}")
        
        return facts

    @staticmethod
    def load_learnings():
        learnings = []
        if os.path.exists(LEARNINGS_FILE):
            try:
                with open(LEARNINGS_FILE, "r") as f:
                    learnings = json.load(f)
            except Exception as e:
                print(f"Error loading learnings: {e}")
                
        if not isinstance(learnings, list):
            learnings = []
            
        sys_facts = LearningsManager.detect_system_info()
        modified = False
        for fact in sys_facts:
            prefix = fact.split(":")[0]
            if not any(f.startswith(prefix) for f in learnings):
                learnings.append(fact)
                modified = True
                
        if modified:
            LearningsManager.save_learnings(learnings)
            
        return learnings

    @staticmethod
    def save_learnings(learnings):
        try:
            cleaned = [str(l).strip() for l in learnings if l and str(l).strip()]
            with open(LEARNINGS_FILE, "w") as f:
                json.dump(cleaned, f, indent=4)
            return True
        except Exception as e:
            print(f"Error saving learnings: {e}")
            return False

    @staticmethod
    def extract_learnings_from_session(chat_history):
        if not chat_history:
            return []
            
        history_str = ""
        for msg in chat_history:
            role = msg.get("role", "user").capitalize()
            content = msg.get("content", "")
            clean_content = re.sub(r'<details>.*?</details>', '[details omitted]', content, flags=re.DOTALL)
            clean_content = re.sub(r'```python.*?```', '[code block omitted]', clean_content, flags=re.DOTALL)
            history_str += f"=== {role} ===\n{clean_content}\n\n"
            
        prompt = [
            {"role": "system", "content": "You are a personal assistant learning agent. Your job is to extract useful facts, user preferences, system configurations, script execution guides, files of interest, or personal notes from the conversation history that should be remembered to help the user in future sessions. Output ONLY a valid JSON list of strings."},
            {"role": "user", "content": f"Here is the chat history of a desktop automation session:\n\n{history_str}\n\nAnalyze the chat history and identify general facts, user preferences (e.g. likes, coding styles, language preferences), system configurations, script launching details, files containing specific information, or workflow notes that will be useful in other sessions. Output ONLY a JSON list of strings (e.g. [\"user prefers dark theme stylesheets\", \"the file /home/master/notes.txt contains meeting notes\", \"run compile.sh to compile the go program\"]). If no useful facts are discovered, return []. Output ONLY JSON."}
        ]
        
        try:
            from gnomeai_backend.llm.client import query_llm
            from gnomeai_backend.agents.chat_engine import extract_json
            res_text = query_llm(prompt)
            new_learnings = extract_json(res_text)
            if not isinstance(new_learnings, list) or not new_learnings:
                return []
                
            existing = LearningsManager.load_learnings()
            
            consolidate_prompt = [
                {"role": "system", "content": "You are an expert knowledge consolidator. You group facts logically and filter out redundant or duplicate entries.You provide the list of consolidated facts about user, system or anything in general that can be used in new chats or workflows. Output ONLY a valid JSON list of strings."},
                {"role": "user", "content": f"We have some existing system facts:\n{json.dumps(existing, indent=2)}\n\nAnd some newly extracted facts from the current session:\n{json.dumps(new_learnings, indent=2)}\n\nFilter out any newly extracted facts that are already present or covered in meaning by the existing facts. For the remaining new facts, group and clean them logically (e.g., combining related points or formatting them consistently). Return ONLY the clean, non-redundant new facts that should be added to the list. Output ONLY a JSON list of strings. Output ONLY JSON."}
            ]
            
            consolidate_res_text = query_llm(consolidate_prompt)
            consolidated_learnings = extract_json(consolidate_res_text)
            if isinstance(consolidated_learnings, list):
                return [str(item).strip() for item in consolidated_learnings if item]
                
            return [str(item).strip() for item in new_learnings if item]
        except Exception as e:
            print(f"Failed to extract learnings: {e}")
        return []

detect_system_info = LearningsManager.detect_system_info
load_learnings = LearningsManager.load_learnings
save_learnings = LearningsManager.save_learnings
extract_learnings_from_session = LearningsManager.extract_learnings_from_session
