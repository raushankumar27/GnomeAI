#!/bin/bash
SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
DIR="$( cd "$( dirname "$SCRIPT_PATH" )/.." >/dev/null 2>&1 && pwd )"
cd "$DIR" || exit 1

# Fast Node/NPM PATH discovery to bypass slow nvm.sh sourcing
NODE_VER_DIR=$(ls -d "$HOME/.nvm/versions/node/"* 2>/dev/null | tail -n 1)
if [ -n "$NODE_VER_DIR" ]; then
    export PATH="$NODE_VER_DIR/bin:$PATH"
elif [ -s "$HOME/.nvm/nvm.sh" ]; then
    export NVM_DIR="$HOME/.nvm"
    \. "$NVM_DIR/nvm.sh"
fi

# Ensure GnomeAi is pinned to the GNOME taskbar in background and has correct StartupWMClass
DESKTOP_FILE="$HOME/.local/share/applications/org.gnome.gnomeai.desktop"
(
python3 -c '
import subprocess, ast, os
desktop_dir = os.path.expanduser("~/.local/share/applications")
old_desktop = os.path.join(desktop_dir, "gnomeai.desktop")
new_desktop = os.path.join(desktop_dir, "org.gnome.gnomeai.desktop")

if os.path.exists(old_desktop):
    if os.path.exists(new_desktop):
        os.remove(old_desktop)
    else:
        os.rename(old_desktop, new_desktop)

os.makedirs(desktop_dir, exist_ok=True)
content = """[Desktop Entry]
Version=1.0
Name=GnomeAi
Comment=Launch GnomeAi App
Exec=/home/master/.local/bin/gnomeai-launch
Icon=/home/master/Codes/linux Scripts/GnomeAi/assets/icon.png
Terminal=false
Type=Application
Categories=Development;Utility;
StartupWMClass=org-gnome-gnomeai
"""

should_write = True
if os.path.exists(new_desktop):
    try:
        with open(new_desktop, "r") as f:
            if f.read().strip() == content.strip():
                should_write = False
    except Exception:
        pass

if should_write:
    with open(new_desktop, "w") as f:
        f.write(content)
    os.chmod(new_desktop, 0o755)

try:
    res = subprocess.check_output(["gsettings", "get", "org.gnome.shell", "favorite-apps"]).decode("utf-8").strip()
    favs = ast.literal_eval(res)
    if "gnomeai.desktop" in favs:
        favs = [x for x in favs if x != "gnomeai.desktop"]
    if "org.gnome.gnomeai.desktop" not in favs:
        favs.append("org.gnome.gnomeai.desktop")
    subprocess.check_call(["gsettings", "set", "org.gnome.shell", "favorite-apps", str(favs)])
except Exception as e:
    with open("/home/master/Codes/linux Scripts/GnomeAi/app.log", "a") as f:
        f.write(f"Taskbar pin error: {e}\n")
'
) &

if [ ! -f "$DIR/dist/index.html" ]; then
    echo "Building frontend dist assets..." >> "$DIR/app.log"
    npm run build >> "$DIR/app.log" 2>&1
fi

ELECTRON_BIN="$DIR/node_modules/.bin/electron"
if [ -x "$ELECTRON_BIN" ]; then
    exec "$ELECTRON_BIN" . --no-sandbox --disable-gpu --disable-vulkan --ozone-platform=x11 --class=org-gnome-gnomeai > "$DIR/app.log" 2>&1
else
    exec npm start > "$DIR/app.log" 2>&1
fi



