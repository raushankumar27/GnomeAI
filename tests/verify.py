import unittest
import os
import json
import shutil
import time
from gnomeai_backend import config, sessions, skills_manager, chat_engine, learnings

class TestGnomeAIPythonModules(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # We need to run tests relative to the root directory
        cls.orig_cwd = os.getcwd()
        root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        os.chdir(root_dir)

        # Backups path
        cls.backup_dir = os.path.abspath("test_backup_env")
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

    @classmethod
    def tearDownClass(cls):
        # Clean up any test artifacts
        if os.path.exists("settings.json"):
            os.remove("settings.json")
        if os.path.exists("sessions"):
            shutil.rmtree("sessions")
        if os.path.exists("skills"):
            shutil.rmtree("skills")
        if os.path.exists("temp_script.py"):
            try:
                os.remove("temp_script.py")
            except Exception:
                pass

        # Restore settings
        if os.path.exists(cls.settings_backup_path):
            shutil.copy(cls.settings_backup_path, "settings.json")

        # Restore sessions
        if os.path.exists(cls.sessions_backup_dir):
            shutil.copytree(cls.sessions_backup_dir, "sessions")

        # Restore skills
        if os.path.exists(cls.skills_backup_dir):
            shutil.copytree(cls.skills_backup_dir, "skills")

        # Remove backup directory
        shutil.rmtree(cls.backup_dir)

        # Restore CWD
        os.chdir(cls.orig_cwd)

    def test_settings_config(self):
        """Test configuration loading, modifying, and saving."""
        config.app_settings["model_name"] = "test-model-abc"
        config.app_settings["lm_studio_url"] = "http://localhost:9999/v1"
        config.save_settings()

        # Reset and load to check persistence
        config.app_settings = {}
        config.load_settings()

        self.assertEqual(config.app_settings.get("model_name"), "test-model-abc")
        self.assertEqual(config.app_settings.get("lm_studio_url"), "http://localhost:9999/v1")

    def test_session_lifecycle(self):
        """Test session creation, retrieval, modification, and deletion."""
        # Create a new session
        sess = sessions.create_session(title="Test Unit Session")
        sess_id = sess["id"]
        self.assertIsNotNone(sess_id)
        self.assertEqual(sess["title"], "Test Unit Session")
        self.assertEqual(sessions.get_active_session_id(), sess_id)

        # Retrieve/Load session
        loaded = sessions.load_session(sess_id)
        self.assertIsNotNone(loaded)
        self.assertEqual(loaded["title"], "Test Unit Session")

        # Modify history and save
        loaded["chat_history"].append({"role": "user", "content": "hello world"})
        sessions.save_session(sess_id, loaded)

        # Reload and check history
        reloaded = sessions.load_session(sess_id)
        self.assertEqual(len(reloaded["chat_history"]), 1)
        self.assertEqual(reloaded["chat_history"][0]["content"], "hello world")

        # Delete session
        path = sessions.get_session_path(sess_id)
        self.assertTrue(os.path.exists(path))
        os.remove(path)
        self.assertFalse(os.path.exists(path))

    def test_skills_management(self):
        """Test creating, retrieval, updating, matching, and deletion of skills."""
        skill_id = "test_volume_control"
        name = "Set Volume"
        description = "Adjusts system volume output."
        keywords = ["volume", "sound", "speaker"]
        code = "print('Volume set to 50%')"

        # Save skill
        success, saved_id = skills_manager.save_skill(skill_id, name, description, keywords, code)
        self.assertTrue(success)
        self.assertEqual(saved_id, skill_id)

        # Verify on disk
        skills = skills_manager.load_skills()
        self.assertIn(skill_id, skills)
        self.assertEqual(skills[skill_id]["name"], name)

        # Verify retrieved code
        loaded_code = skills_manager.get_skill_code(skill_id)
        self.assertEqual(loaded_code, code)

        # Test local matching
        matched = skills_manager.match_skill_local("decrease the speaker volume please")
        self.assertIsNotNone(matched)
        self.assertEqual(matched["id"], skill_id)

        # Test updating code
        new_code = "print('Volume set to 75%')"
        up_success, up_msg = skills_manager.update_skill_code(skill_id, new_code)
        self.assertTrue(up_success)
        self.assertEqual(skills_manager.get_skill_code(skill_id), new_code)

        # Test deleting skill
        del_success, del_msg = skills_manager.delete_skill(skill_id)
        self.assertTrue(del_success)
        self.assertNotIn(skill_id, skills_manager.load_skills())
        self.assertIsNone(skills_manager.get_skill_code(skill_id))

    def test_chat_engine_sandbox(self):
        """Test Python code sandbox compilation and execution."""
        # 1. Valid execution
        valid_code = "import sys\nprint('Execution successful')\nsys.exit(0)"
        success, stdout, stderr = chat_engine.execute_script_sandbox(valid_code)
        self.assertTrue(success)
        self.assertEqual(stdout.strip(), "Execution successful")
        self.assertEqual(stderr.strip(), "")

        # 2. Syntax Error
        invalid_code = "print('missing parenthesis"
        success, stdout, stderr = chat_engine.execute_script_sandbox(invalid_code)
        self.assertFalse(success)
        self.assertIn("Syntax Error", stderr)

        # 3. Runtime Error
        runtime_err_code = "raise ValueError('Sandbox error test')"
        success, stdout, stderr = chat_engine.execute_script_sandbox(runtime_err_code)
        self.assertFalse(success)
        self.assertIn("ValueError: Sandbox error test", stderr)

    def test_execute_script_sandbox_with_wrapper(self):
        """Test executing parameterized python functions using the dynamic wrapper."""
        code = (
            "def calculate_sum(a, b):\n"
            "    print(f'Result: {a + b}')\n"
        )
        func_name = "calculate_sum"
        args = {"a": 25, "b": 17}
        wrapped_code = code + f"\n\nif __name__ == '__main__':\n    {func_name}(**{repr(args)})\n"
        
        success, stdout, stderr = chat_engine.execute_script_sandbox(wrapped_code)
        self.assertTrue(success)
        self.assertEqual(stdout.strip(), "Result: 42")
        self.assertEqual(stderr.strip(), "")

    def test_learnings_system(self):
        """Test loadings, savings, system profiling and fact extraction of learnings."""
        # 1. Clean up any existing test learnings file if it exists
        test_file = "learnings.json"
        if os.path.exists(test_file):
            os.remove(test_file)
            
        try:
            # 2. Check loading defaults (profile OS details)
            facts = learnings.load_learnings()
            self.assertTrue(len(facts) >= 2) # At least OS and Desktop env should be detected
            self.assertTrue(any(f.startswith("Operating System:") for f in facts))
            
            # 3. Save custom facts and verify
            facts.append("Custom Test Fact 1")
            learnings.save_learnings(facts)
            
            reloaded = learnings.load_learnings()
            self.assertIn("Custom Test Fact 1", reloaded)
            
            # 4. Extract learnings from mock history
            empty_facts = learnings.extract_learnings_from_session([])
            self.assertEqual(empty_facts, [])
            
        finally:
            if os.path.exists(test_file):
                os.remove(test_file)

    def test_dbus_learnings_context(self):
        """Test that build_learnings_context injects the default MPRIS, Dark Mode, and Notify DBus recipes."""
        context = chat_engine.build_learnings_context()
        self.assertIn("MediaPlayer2.Player.PlayPause", context)
        self.assertIn("org.gnome.desktop.interface color-scheme", context)
        self.assertIn("org.freedesktop.Notifications.Notify", context)

    def test_multi_model_config(self):
        """Test loading and saving settings containing fast_model_name and cloud_model_name."""
        config.app_settings["fast_model_name"] = "test-fast-model"
        config.app_settings["cloud_model_name"] = "test-cloud-model"
        config.save_settings()

        config.app_settings = {}
        config.load_settings()

        self.assertEqual(config.app_settings.get("fast_model_name"), "test-fast-model")
        self.assertEqual(config.app_settings.get("cloud_model_name"), "test-cloud-model")

    def test_rag_search(self):
        """Test RAG document indexing and search retrieval."""
        from gnomeai_backend.rag_manager import RAGManager
        
        # Create a temp directory inside workspace
        temp_dir = os.path.abspath("temp_rag_test_dir")
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
        os.makedirs(temp_dir)
        
        try:
            # Create a couple of mock files
            file_a = os.path.join(temp_dir, "recipe.txt")
            with open(file_a, "w") as f:
                f.write("To make a perfect cup of coffee, grind fresh beans and use boiling water.")
                
            file_b = os.path.join(temp_dir, "notes.md")
            with open(file_b, "w") as f:
                f.write("Meeting notes: project GnomeAI requires implementing voice activation and D-Bus monitors.")
                
            # Initialize RAG manager targeting our temp directory
            manager = RAGManager(target_dirs=[temp_dir])
            manager.build_index()
            
            # Query 1
            res_coffee = manager.search("coffee beans")
            self.assertEqual(len(res_coffee), 1)
            self.assertEqual(res_coffee[0]["filename"], "recipe.txt")
            self.assertIn("grind fresh beans", res_coffee[0]["snippet"])
            
            # Query 2
            res_voice = manager.search("voice activation")
            self.assertEqual(len(res_voice), 1)
            self.assertEqual(res_voice[0]["filename"], "notes.md")
            self.assertIn("GnomeAI requires implementing", res_voice[0]["snippet"])
            
        finally:
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)

    def test_app_discovery(self):
        """Test environment-aware application discovery by parsing mock desktop files."""
        from unittest.mock import patch, mock_open
        from gnomeai_backend.chat_engine import get_installed_applications
        
        mock_desktop_content = (
            "[Desktop Entry]\n"
            "Name=VLC Media Player\n"
            "Exec=/usr/bin/vlc %U\n"
            "Comment=Read media files\n"
            "Type=Application\n"
            "Categories=AudioVideo;\n"
        )
        
        with patch("os.path.exists", return_value=True), \
             patch("os.listdir", return_value=["vlc.desktop"]), \
             patch("builtins.open", mock_open(read_data=mock_desktop_content)):
            
            apps = get_installed_applications()
            self.assertEqual(len(apps), 1)
            self.assertEqual(apps[0]["name"], "VLC Media Player")
            self.assertEqual(apps[0]["exec"], "vlc")
            self.assertEqual(apps[0]["comment"], "Read media files")

    def test_rag_cosine_similarity(self):
        """Test that RAG index uses TF-IDF cosine similarity to rank more relevant files higher."""
        from gnomeai_backend.rag_manager import RAGManager
        
        temp_dir = os.path.abspath("temp_rag_cosine_dir")
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
        os.makedirs(temp_dir)
        
        try:
            # File A: High term frequency for query
            with open(os.path.join(temp_dir, "doc_high.txt"), "w") as f:
                f.write("coffee coffee coffee beans beans fresh beans coffee")
            
            # File B: Low term frequency
            with open(os.path.join(temp_dir, "doc_low.txt"), "w") as f:
                f.write("coffee tea milk beverage")
                
            # File C: Unrelated
            with open(os.path.join(temp_dir, "doc_unrelated.txt"), "w") as f:
                f.write("gardening soil plants flowers tomatoes")
                
            manager = RAGManager(target_dirs=[temp_dir])
            manager.build_index()
            
            results = manager.search("coffee beans", top_n=3)
            
            self.assertTrue(len(results) >= 2)
            self.assertEqual(results[0]["filename"], "doc_high.txt")
            self.assertEqual(results[1]["filename"], "doc_low.txt")
            self.assertTrue(results[0]["score"] > results[1]["score"])
            
            # Unrelated document should not be in results or should have very low rank/score
            filenames = [r["filename"] for r in results]
            if "doc_unrelated.txt" in filenames:
                unrelated_idx = filenames.index("doc_unrelated.txt")
                self.assertEqual(unrelated_idx, len(results) - 1)
                
        finally:
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)

    def test_ast_parser(self):
        """Test AST parsing of Python signatures."""
        try:
            from main_gtk import parse_python_signature
        except ImportError:
            return
        code = (
            "def test_func(a, b=10, c='hello'):\n"
            "    pass\n"
            "def _private_func():\n"
            "    pass\n"
        )
        funcs = parse_python_signature(code)
        self.assertEqual(len(funcs), 1)
        self.assertEqual(funcs[0]["name"], "test_func")
        self.assertEqual(len(funcs[0]["args"]), 3)
        self.assertEqual(funcs[0]["args"][0], {"name": "a", "default": None})
        self.assertEqual(funcs[0]["args"][1], {"name": "b", "default": 10})
        self.assertEqual(funcs[0]["args"][2], {"name": "c", "default": "hello"})

    def test_ansi_to_pango(self):
        """Test translation of ANSI color/weight escapes to Pango markup."""
        try:
            from main_gtk import ansi_to_pango
        except ImportError:
            return
        ansi_str = "\033[1mBold Text\033[0m Normal \033[31mRed Text\033[0m"
        pango_str = ansi_to_pango(ansi_str)
        self.assertEqual(pango_str, "<b>Bold Text</b> Normal <span foreground='#e01b24'>Red Text</span>")

    def test_fuzzy_ngram_matching(self):
        """Test fuzzy Jaccard 3-gram and substring similarity."""
        from gnomeai_backend.rag_manager import rag_manager
        # "volume" and "vol"
        sim1 = rag_manager.get_word_similarity("volume", "vol")
        self.assertTrue(sim1 > 0.0)
        self.assertEqual(sim1, 3/6) # substring len("vol")/len("volume") = 3/6 = 0.5
        
        # Test 3-gram similarity for words with spelling difference, e.g. "coffee" vs "cofee"
        sim2 = rag_manager.get_word_similarity("coffee", "cofee")
        self.assertTrue(sim2 > 0.0)

    def test_chatbot_intent_classification(self):
        """Test that is_conversational_request correctly distinguishes chat from automation requests."""
        from unittest.mock import patch
        from gnomeai_backend.chat_engine import is_conversational_request
        
        # Test 1: Chat request
        with patch("gnomeai_backend.chat_engine.query_llm", return_value='{"is_chat": true, "reason": "greeting"}'):
            self.assertTrue(is_conversational_request("hello there, how are you?"))
            
        # Test 2: Automation request
        with patch("gnomeai_backend.chat_engine.query_llm", return_value='{"is_chat": false, "reason": "wants to mute"}'):
            self.assertFalse(is_conversational_request("mute my system volume"))

    def test_sessions_fork_and_delete_message(self):
        """Test session forking and message deletion."""
        sess = sessions.create_session(title="Original Conversation")
        sess_id = sess["id"]
        
        sess["chat_history"] = [
            {"role": "user", "content": "message 1"},
            {"role": "assistant", "content": "response 1"},
            {"role": "user", "content": "message 2"},
            {"role": "assistant", "content": "response 2"},
        ]
        sessions.save_session(sess_id, sess)

        # Test fork at message index 1 (assistant response 1)
        import time
        from gnomeai_backend.server import SESSIONS_DIR, load_session, save_session, get_session_path
        
        # Check behavior of load_session and fork logic
        orig = load_session(sess_id)
        self.assertEqual(len(orig["chat_history"]), 4)
        
        # Simulating fork behavior from server handler
        forked_history = orig["chat_history"][:2]
        forked_session_id = f"session_test_fork_{int(time.time() * 1000)}"
        new_sess = {
            "id": forked_session_id,
            "title": f"Fork of {orig['title']}",
            "chat_history": forked_history,
            "pending_action": None,
            "created_at": time.time()
        }
        save_session(forked_session_id, new_sess)
        
        forked_loaded = load_session(forked_session_id)
        self.assertIsNotNone(forked_loaded)
        self.assertEqual(len(forked_loaded["chat_history"]), 2)
        self.assertEqual(forked_loaded["chat_history"][0]["content"], "message 1")
        self.assertEqual(forked_loaded["chat_history"][1]["content"], "response 1")
        
        # Clean up fork session
        os.remove(get_session_path(forked_session_id))
        
        # Test delete message
        history = orig["chat_history"]
        history.pop(2) # Remove "message 2"
        orig["chat_history"] = history
        save_session(sess_id, orig)
        
        deleted_loaded = load_session(sess_id)
        self.assertEqual(len(deleted_loaded["chat_history"]), 3)
        self.assertEqual(deleted_loaded["chat_history"][2]["content"], "response 2")
        
        # Clean up original session
        os.remove(get_session_path(sess_id))

if __name__ == "__main__":
    unittest.main()

