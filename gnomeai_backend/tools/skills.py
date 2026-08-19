import os
import json
import time
import re

SKILLS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "skills"))
METADATA_FILE = os.path.join(SKILLS_DIR, "skills.json")

class SkillsManager:
    """Manages creation, execution, updating, and deletion of custom python skills."""

    @staticmethod
    def init_skills():
        if not os.path.exists(SKILLS_DIR):
            os.makedirs(SKILLS_DIR)
        
        if not os.path.exists(METADATA_FILE):
            with open(METADATA_FILE, "w") as f:
                json.dump({"skills": []}, f, indent=4)

    @staticmethod
    def load_skills():
        SkillsManager.init_skills()
        try:
            with open(METADATA_FILE, "r") as f:
                data = json.load(f)
                skills_dict = {}
                for skill in data.get("skills", []):
                    skills_dict[skill["id"]] = skill
                return skills_dict
        except Exception as e:
            print(f"Error loading skills metadata: {e}")
            return {}

    @staticmethod
    def save_skill(skill_id, name, description, keywords, code_content):
        SkillsManager.init_skills()
        skill_id = re.sub(r'[^a-zA-Z0-9_]', '_', skill_id).lower()
        script_path = os.path.join(SKILLS_DIR, f"{skill_id}.py")
        with open(script_path, "w") as f:
            f.write(code_content)
            
        skills = SkillsManager.load_skills()
        skills[skill_id] = {
            "id": skill_id,
            "name": name,
            "description": description,
            "keywords": [k.strip().lower() for k in keywords if k.strip()],
            "script_name": f"{skill_id}.py",
            "created_at": time.time()
        }
        
        try:
            with open(METADATA_FILE, "w") as f:
                json.dump({"skills": list(skills.values())}, f, indent=4)
            return True, skill_id
        except Exception as e:
            return False, str(e)

    @staticmethod
    def delete_skill(skill_id):
        skills = SkillsManager.load_skills()
        if skill_id not in skills:
            return False, f"Skill {skill_id} not found."
        
        skill = skills[skill_id]
        script_path = os.path.join(SKILLS_DIR, skill.get("script_name", f"{skill_id}.py"))
        
        if os.path.exists(script_path):
            try:
                os.remove(script_path)
            except Exception as e:
                print(f"Error removing script file: {e}")
                
        del skills[skill_id]
        try:
            with open(METADATA_FILE, "w") as f:
                json.dump({"skills": list(skills.values())}, f, indent=4)
            return True, f"Skill {skill_id} deleted."
        except Exception as e:
            return False, str(e)

    @staticmethod
    def get_skill_code(skill_id):
        skills = SkillsManager.load_skills()
        if skill_id not in skills:
            return None
        
        script_path = os.path.join(SKILLS_DIR, skills[skill_id].get("script_name", f"{skill_id}.py"))
        if not os.path.exists(script_path):
            return None
            
        try:
            with open(script_path, "r") as f:
                return f.read()
        except Exception as e:
            print(f"Error reading script for skill {skill_id}: {e}")
            return None

    @staticmethod
    def update_skill_code(skill_id, code_content):
        skills = SkillsManager.load_skills()
        if skill_id not in skills:
            return False, f"Skill {skill_id} not found."
        
        script_path = os.path.join(SKILLS_DIR, skills[skill_id].get("script_name", f"{skill_id}.py"))
        try:
            with open(script_path, "w") as f:
                f.write(code_content)
            return True, f"Skill {skill_id} code updated."
        except Exception as e:
            return False, str(e)

    @staticmethod
    def match_skill_local(user_command):
        skills = SkillsManager.load_skills()
        cmd_lower = user_command.lower().strip()
        
        question_indicators = ["what is", "how to", "why does", "explain", "who is", "where is", "search for", "google", "tell me about"]
        if any(q in cmd_lower for q in question_indicators):
            return None

        action_verbs = ["open", "play", "run", "start", "launch", "show", "toggle", "turn on", "turn off", "change", "set", "adjust", "go to"]

        for skill in skills.values():
            skill_name_clean = skill.get("name", "").lower().strip()
            if cmd_lower == skill_name_clean or cmd_lower.startswith(skill_name_clean):
                return skill
                
            for keyword in skill.get("keywords", []):
                if not keyword:
                    continue
                pattern = r'\b' + re.escape(keyword) + r'\b'
                if re.search(pattern, cmd_lower):
                    if cmd_lower == keyword:
                        return skill
                    if any(verb in cmd_lower for verb in action_verbs):
                        return skill
                    
        return None

init_skills = SkillsManager.init_skills
load_skills = SkillsManager.load_skills
save_skill = SkillsManager.save_skill
delete_skill = SkillsManager.delete_skill
get_skill_code = SkillsManager.get_skill_code
update_skill_code = SkillsManager.update_skill_code
match_skill_local = SkillsManager.match_skill_local
