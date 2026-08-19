#!/bin/bash
# ==============================================================================
# GnomeAI One-Click Environment Setup & Qwen Model Downloader
# ==============================================================================

set -e

SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
PROJECT_DIR="$( cd "$( dirname "$SCRIPT_PATH" )/.." >/dev/null 2>&1 && pwd )"
cd "$PROJECT_DIR"

echo "================================================================="
echo "🚀 Starting GnomeAI Environment Setup & Qwen Model Provisioning"
echo "================================================================="
echo "📁 Project Directory: $PROJECT_DIR"
echo ""

# 1. System Requirements Verification
echo "[1/6] 🔍 Verifying system requirements..."

if ! command -v node >/dev/null 2>&1; then
    echo "❌ Error: Node.js is not installed. Please install Node.js (v18+) and try again."
    exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
    echo "❌ Error: Python 3 is not installed. Please install Python 3.10+ and try again."
    exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "⚠️ Warning: ffmpeg is not found. Installing ffmpeg is recommended for audio features."
fi

echo "  ✓ Node.js: $(node -v)"
echo "  ✓ Python:  $(python3 --version)"
echo ""

# 2. Frontend Dependencies Installation & Vite Asset Build
echo "[2/6] 📦 Installing Node dependencies and building frontend dist assets..."
npm install
npm run build
echo "  ✓ Frontend assets compiled successfully."
echo ""

# 3. Python Virtual Environment Setup
echo "[3/6] 🐍 Provisioning Python virtual environment & backend packages..."
if [ ! -d "venv" ]; then
    echo "  Creating new Python virtual environment in ./venv..."
    python3 -m venv venv
fi

source venv/bin/activate
pip install --upgrade pip setuptools wheel --quiet
if [ -f "requirements.txt" ]; then
    pip install -r requirements.txt
else
    pip install fastapi uvicorn requests huggingface_hub openvino optimum[openvino] transformers torch soundfile pydantic websockets gdown
fi
echo "  ✓ Python virtual environment ready."
echo ""

# 4. Qwen LLM Model Download
echo "[4/6] 🤖 Downloading Qwen LLM Model weights from Hugging Face..."
python3 -c "
import os
from huggingface_hub import snapshot_download

model_dir = os.path.join('$PROJECT_DIR', 'models', 'Qwen2.5-0.5B-Instruct-OpenVINO-INT4')
os.makedirs(model_dir, exist_ok=True)

repo_id = 'Qwen/Qwen2.5-0.5B-Instruct-OpenVINO-INT4'
print(f'  Downloading model {repo_id} to {model_dir}...')

try:
    snapshot_download(repo_id=repo_id, local_dir=model_dir, local_dir_use_symlinks=False)
    print('  ✓ Qwen LLM model downloaded successfully!')
except Exception as e:
    print(f'  ⚠️ Primary model download warning: {e}')
    print('  Fallback: Hugging Face snapshot will auto-download on first load.')
"
echo ""

# 5. Kokoro TTS ONNX Assets Download
echo "[5/6] 🔊 Provisioning Kokoro Text-To-Speech ONNX assets..."
mkdir -p "$PROJECT_DIR/assets"
python3 -c "
import os, urllib.request

assets_dir = os.path.join('$PROJECT_DIR', 'assets')
onnx_path = os.path.join(assets_dir, 'kokoro.onnx')
voices_path = os.path.join(assets_dir, 'voices.bin')

if not os.path.exists(onnx_path):
    print('  Downloading kokoro.onnx model...')
    try:
        url = 'https://huggingface.co/hexgrad/Kokoro-82M/resolve/main/kokoro-v0_19.onnx'
        urllib.request.urlretrieve(url, onnx_path)
        print('  ✓ kokoro.onnx downloaded!')
    except Exception as e:
        print(f'  ⚠️ Kokoro ONNX download warning: {e}')

if not os.path.exists(voices_path):
    print('  Downloading voices.bin dataset...')
    try:
        url = 'https://huggingface.co/hexgrad/Kokoro-82M/resolve/main/voices/voices.bin'
        urllib.request.urlretrieve(url, voices_path)
        print('  ✓ voices.bin downloaded!')
    except Exception as e:
        print(f'  ⚠️ Voices binary download warning: {e}')
"
echo ""

# 6. Desktop Application Launcher Setup & Taskbar Pinning
echo "[6/6] 🖥️ Configuring Desktop launcher & GNOME taskbar integration..."
chmod +x "$PROJECT_DIR/scripts/launch.sh"
chmod +x "$PROJECT_DIR/scripts/setup.sh"

BIN_DIR="$HOME/.local/bin"
DESKTOP_DIR="$HOME/.local/share/applications"

mkdir -p "$BIN_DIR"
mkdir -p "$DESKTOP_DIR"

LAUNCH_LINK="$BIN_DIR/gnomeai-launch"
rm -f "$LAUNCH_LINK"
ln -s "$PROJECT_DIR/scripts/launch.sh" "$LAUNCH_LINK"
chmod +x "$LAUNCH_LINK"

DESKTOP_FILE="$DESKTOP_DIR/org.gnome.gnomeai.desktop"
cat << EOF > "$DESKTOP_FILE"
[Desktop Entry]
Version=1.0
Name=GnomeAi
Comment=Launch GnomeAi App
Exec=$LAUNCH_LINK
Icon=$PROJECT_DIR/assets/icon.png
Terminal=false
Type=Application
Categories=Development;Utility;
StartupWMClass=org-gnome-gnomeai
EOF
chmod 755 "$DESKTOP_FILE"

# Pin to GNOME Shell taskbar favorites
python3 -c '
import subprocess, ast
try:
    res = subprocess.check_output(["gsettings", "get", "org.gnome.shell", "favorite-apps"]).decode("utf-8").strip()
    favs = ast.literal_eval(res)
    if "gnomeai.desktop" in favs:
        favs = [x for x in favs if x != "gnomeai.desktop"]
    if "org.gnome.gnomeai.desktop" not in favs:
        favs.append("org.gnome.gnomeai.desktop")
    subprocess.check_call(["gsettings", "set", "org.gnome.shell", "favorite-apps", str(favs)])
    print("  ✓ App icon pinned to GNOME taskbar favorites!")
except Exception as e:
    print(f"  Note: Desktop launcher installed at {e}")
'

echo ""
echo "================================================================="
echo "🎉 GnomeAI Setup Complete!"
echo "================================================================="
echo "You can launch the app by:"
echo " 1. Clicking GnomeAi in your GNOME App Launcher / Taskbar"
echo " 2. Running executable command: gnomeai-launch"
echo " 3. Running script: ./scripts/launch.sh"
echo "================================================================="
