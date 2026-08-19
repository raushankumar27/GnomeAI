import unittest
import os
import json
import shutil
from fastapi.testclient import TestClient

from gnomeai_backend import config, sessions, skills_manager
from gnomeai_backend.server import app, SESSIONS_DIR, CUSTOM_VOICES_DIR

class TestGnomeAIApiV2(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.orig_cwd = os.getcwd()
        root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        os.chdir(root_dir)

        # Backups path
        cls.backup_dir = os.path.abspath("test_api_backup_env")
        if os.path.exists(cls.backup_dir):
            shutil.rmtree(cls.backup_dir)
        os.makedirs(cls.backup_dir)

        # Backup settings.json
        cls.settings_backup_path = os.path.join(cls.backup_dir, "settings.json")
        if os.path.exists("settings.json"):
            shutil.copy("settings.json", cls.settings_backup_path)
            os.remove("settings.json")

        # Backup sessions directory
        cls.sessions_backup_dir = os.path.join(cls.backup_dir, "sessions")
        if os.path.exists("sessions"):
            shutil.copytree("sessions", cls.sessions_backup_dir)
            shutil.rmtree("sessions")

        # Backup skills directory
        cls.skills_backup_dir = os.path.join(cls.backup_dir, "skills")
        if os.path.exists("skills"):
            shutil.copytree("skills", cls.skills_backup_dir)
            shutil.rmtree("skills")

        # Reset module-level settings and initialize clean test environments
        config.app_settings = config.DEFAULT_SETTINGS.copy()
        config.save_settings()

        sessions.init_sessions()
        skills_manager.init_skills()
        cls.client = TestClient(app)

    @classmethod
    def tearDownClass(cls):
        if os.path.exists("settings.json"):
            os.remove("settings.json")
        if os.path.exists("sessions"):
            shutil.rmtree("sessions")
        if os.path.exists("skills"):
            shutil.rmtree("skills")

        # Restore settings
        if os.path.exists(cls.settings_backup_path):
            shutil.copy(cls.settings_backup_path, "settings.json")

        # Restore sessions
        if os.path.exists(cls.sessions_backup_dir):
            shutil.copytree(cls.sessions_backup_dir, "sessions")

        # Restore skills
        if os.path.exists(cls.skills_backup_dir):
            shutil.copytree(cls.skills_backup_dir, "skills")

        shutil.rmtree(cls.backup_dir)
        os.chdir(cls.orig_cwd)

    def test_unified_llm_status_and_available(self):
        """Test GET /api/models/llm and GET /api/models/llm/available"""
        response = self.client.get("/api/models/llm")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertIn("inbuilt", data)
        self.assertIn("lms", data)

        response = self.client.get("/api/models/llm/available")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertIn("inbuilt", data)
        self.assertIn("lms", data)

    def test_unified_voice_and_image_status(self):
        """Test GET /api/models/voice and GET /api/models/image"""
        response = self.client.get("/api/models/voice")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertIn("models", data)

        response = self.client.get("/api/models/image")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertIn("models", data)

    def test_unified_voice_and_image_available(self):
        """Test GET /api/models/voice/available and GET /api/models/image/available"""
        response = self.client.get("/api/models/voice/available")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertIn("models", data)

        response = self.client.get("/api/models/image/available")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertIn("models", data)

    def test_unified_llm_load_unload(self):
        """Test POST /api/models/llm/{id}/load and unload"""
        # Testing unload
        response = self.client.post("/api/models/llm/dummy_model/unload")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])

        # Load returns false/error since dummy_model won't exist or load natively, which is fine, but verifies route exists.
        response = self.client.post("/api/models/llm/dummy_model/load", json={"backend": "inbuilt"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("success", response.json())

    def test_unified_voice_download(self):
        """Test POST /api/models/voice/{id}/download and jobs/status/{job_id}"""
        response = self.client.post("/api/models/voice/kokoro/download")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("job_id", data)
        self.assertEqual(data["status"], "pending")

        job_id = data["job_id"]
        response = self.client.get(f"/api/jobs/status/{job_id}")
        self.assertEqual(response.status_code, 200)
        job_data = response.json()
        self.assertEqual(job_data["job_id"], job_id)
        self.assertIn(job_data["status"], ["pending", "running", "completed", "failed"])

    def test_unified_compile_job(self):
        """Test POST /api/models/llm/{id}/compile job tracking"""
        response = self.client.post("/api/models/llm/dummy_model/compile", json={"precision": "int4"})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("job_id", data)

        job_id = data["job_id"]
        response = self.client.get(f"/api/jobs/status/{job_id}")
        self.assertEqual(response.status_code, 200)
        job_data = response.json()
        self.assertEqual(job_data["job_id"], job_id)

    def test_restful_delete_custom_voice(self):
        """Test DELETE /api/custom_voices/{name}"""
        # Create a dummy custom voice file
        safe_name = "test_voice_delete"
        json_path = os.path.join(CUSTOM_VOICES_DIR, f"{safe_name}.json")
        with open(json_path, "w") as f:
            f.write("{}")

        self.assertTrue(os.path.exists(json_path))

        response = self.client.delete(f"/api/custom_voices/{safe_name}")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])
        self.assertFalse(os.path.exists(json_path))

    def test_restful_delete_skill(self):
        """Test DELETE /api/skills/{id}"""
        # Create a skill
        skills_manager.save_skill("test_skill_delete", "Delete Test", "Desc", [], "pass")
        
        response = self.client.delete("/api/skills/test_skill_delete")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])

    def test_restful_delete_session(self):
        """Test DELETE /api/sessions/{session_id}"""
        # Create a session
        sess = sessions.create_session(title="Delete Session Test")
        sess_id = sess["id"]

        response = self.client.delete(f"/api/sessions/{sess_id}")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])

    def test_restful_delete_message(self):
        """Test DELETE /api/sessions/{session_id}/messages/{message_index}"""
        # Create session with history
        sess = sessions.create_session(title="Delete Message Test")
        sess_id = sess["id"]
        sess["chat_history"] = [
            {"role": "user", "content": "message 1"},
            {"role": "assistant", "content": "response 1"}
        ]
        sessions.save_session(sess_id, sess)

        response = self.client.delete(f"/api/sessions/{sess_id}/messages/0")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])
        self.assertEqual(len(response.json()["chat_history"]), 1)
        self.assertEqual(response.json()["chat_history"][0]["content"], "response 1")

    def test_path_safety_check(self):
        """Test path safety constraints for imports and workspace opens"""
        # /api/code/open with traversal or unsafe path
        response = self.client.post("/api/code/open", json={"path": "../../../etc/passwd"})
        self.assertEqual(response.status_code, 403)
        self.assertIn("error", response.json())
        self.assertEqual(response.json()["error"]["code"], "ERR_403")

        # /api/models/import with traversal or unsafe path
        response = self.client.post("/api/models/import", json={"filepath": "/etc/shadow"})
        self.assertEqual(response.status_code, 403)
        self.assertIn("error", response.json())

    def test_standard_error_envelope(self):
        """Test standard error envelope on 404 and other HTTP exceptions"""
        response = self.client.get("/api/nonexistent_route_abc")
        self.assertEqual(response.status_code, 404)
        data = response.json()
        self.assertIn("error", data)
        self.assertIn("code", data["error"])
        self.assertIn("message", data["error"])

if __name__ == "__main__":
    unittest.main()
