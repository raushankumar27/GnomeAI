# GnomeAI - Fluid & Responsive Local AI Desktop Studio

GnomeAI is a high-performance local AI desktop suite built for Linux/GNOME environments. It provides seamless local LLM inference, text-to-speech audio synthesis, voice cloning, workspace developer automation, and open-source model compilation via OpenVINO.

---

## 🚀 One-Click Setup (New Device / Clone)

To set up the environment and download model weights on any new device, clone the repository and run:

```bash
git clone https://github.com/raushankumar27/GnomeAI.git
cd GnomeAI
./scripts/setup.sh
```

### What `setup.sh` Automates:
1. **Frontend Assets**: Installs Node dependencies (`npm install`) and builds production dist UI bundle (`npm run build`).
2. **Python Environment**: Creates Python virtual environment (`venv`) and installs backend dependencies.
3. **Qwen Model Downloader**: Downloads Qwen OpenVINO LLM model weights into `./models/`.
4. **Kokoro TTS Downloader**: Downloads Kokoro ONNX model and voice dataset into `./assets/`.
5. **GNOME Launcher Integration**: Sets up `~/.local/bin/gnomeai-launch` and pins GnomeAI to the GNOME taskbar.

---

## 🖥️ Launching the Application

Once setup is complete, you can launch GnomeAI using any of these 3 methods:

1. **GNOME App Launcher / Taskbar**: Click the **GnomeAi** icon on your taskbar.
2. **Terminal Command**:
   ```bash
   gnomeai-launch
   ```
3. **Direct Script**:
   ```bash
   ./scripts/launch.sh
   ```

---

## 🛠️ Global Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Super + Space` | Toggle floating quick AI overlay |
| `Ctrl + Alt + Space` | Show GnomeAI studio window |
| `Ctrl + Shift + Z` | Toggle Zen focus mode |
| `Ctrl + Scroll` | Zoom chat font size |

---

## 📜 License

Distributed under the MIT License.
