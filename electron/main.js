const { app, BrowserWindow, ipcMain, Tray, Menu, clipboard, Notification, dialog, globalShortcut } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

function saveRuntimePort(port) {
  try {
    const dir = path.join(app.getPath('home'), '.config', 'gnomeai');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(path.join(dir, 'runtime_port.json'), JSON.stringify({ port }));
  } catch (e) {
    console.error('Failed to save runtime port:', e);
  }
}

let mainWindow;
let overlayWindow;
let backendProcess = null;
let tray = null;
let backendPort = 8095;
let isLoaded = false;
let activeModelName = '';

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('class', 'org-gnome-gnomeai');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-vulkan');
app.commandLine.appendSwitch('in-process-gpu');


app.commandLine.appendSwitch('ozone-platform', 'x11');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-breakpad');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-domain-reliability');
app.commandLine.appendSwitch('disable-print-preview');
app.commandLine.appendSwitch('disable-speech-api');
app.commandLine.appendSwitch('disable-sync');
app.commandLine.appendSwitch('no-default-browser-check');
app.commandLine.appendSwitch('no-pings');
app.commandLine.appendSwitch('disable-features', 'Translate,AutofillServerCommunication,MediaRouter,OptimizationHints');
app.setName('org-gnome-gnomeai');
app.setAppUserModelId('org-gnome-gnomeai');
app.desktopName = 'org.gnome.gnomeai.desktop';

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      showMainWindow();
    }
  });
}

// Function to call backend APIs directly from Main Process
function callBackend(apiPath, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: backendPort,
      path: apiPath,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ success: res.statusCode === 200 });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Helper to show main window and notify backend to preserve model
function showMainWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    callBackend('/api/inbuilt_llm/touch', 'POST').catch(() => {});
  }
}

// Update Tray context menu dynamically
function updateTrayMenu() {
  if (!tray) return;

  const menuTemplate = [
    { label: 'GnomeAI Studio', enabled: false },
    { label: isLoaded ? `Active LLM: ${activeModelName}` : 'No Model Loaded', enabled: false },
    { type: 'separator' },
    {
      label: 'Quit and Unload Model',
      click: async () => {
        try {
          await callBackend('/api/inbuilt_llm/unload', 'POST');
        } catch (e) {
          console.error('Failed to unload model on exit:', e);
        }
        app.isQuitting = true;
        app.quit();
      }
    }
  ];

  const contextMenu = Menu.buildFromTemplate(menuTemplate);
  tray.setContextMenu(contextMenu);
}

ipcMain.on('update-tray-models', (event, { activeModel }) => {
  isLoaded = !!activeModel;
  activeModelName = activeModel || '';
  updateTrayMenu();
});

ipcMain.on('hide-overlay', () => {
  if (overlayWindow) {
    overlayWindow.hide();
    overlayWindow.setSize(600, 90);
  }
});

ipcMain.on('resize-overlay', (event, { width, height }) => {
  if (overlayWindow) {
    overlayWindow.setSize(width, height);
  }
});

ipcMain.on('show-studio', () => {
  showMainWindow();
});

ipcMain.on('expand-session', (event, sessionId) => {
  showMainWindow();
  if (mainWindow && sessionId) {
    mainWindow.webContents.send('open-session', sessionId);
  }
});

ipcMain.handle('get-backend-port', () => backendPort);

ipcMain.handle('open-directory-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'GGUF Models', extensions: ['gguf'] }
    ]
  });
  return result.filePaths[0] || null;
});

function checkExistingBackend(port = 8095) {
  return new Promise((resolve) => {
    const net = require('net');
    const socket = new net.Socket();
    socket.setTimeout(150);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });
}

async function startBackendOrConnect() {
  console.log('Checking if GnomeAI backend server is already running on port 8095...');
  const isRunning = await checkExistingBackend(8095);
  if (isRunning) {
    console.log('✨ GnomeAI backend is already active on port 8095! Connecting frontend to existing backend server...');
    backendPort = 8095;
    saveRuntimePort(backendPort);
    if (mainWindow) {
      mainWindow.webContents.send('backend-port-updated', backendPort);
    }
    return;
  }

  console.log('No active GnomeAI backend detected on port 8095. Spawning new Python backend process...');
  startBackend();
}

function startBackend() {
  console.log('Spawning GnomeAI Python backend...');
  const pythonExecutable = 'python3';
  const rootDir = path.join(__dirname, '..');
  const backendScript = path.join(rootDir, 'backend.py');
  let portCaptured = false;
  let backendStderrLogs = '';

  backendProcess = spawn(pythonExecutable, [backendScript], {
    cwd: rootDir,
    env: { ...process.env, PYTHONUNBUFFERED: '1' }
  });

  backendProcess.stdout.on('data', (data) => {
    const text = data.toString().trim();
    console.log(`[Python Backend] ${text}`);
    
    const match = text.match(/Starting backend server on port (\d+)/);
    if (match) {
      portCaptured = true;
      backendPort = parseInt(match[1]);
      saveRuntimePort(backendPort);
      console.log(`Main process registered active backend port: ${backendPort}`);
      if (mainWindow) {
        mainWindow.webContents.send('backend-port-updated', backendPort);
      }
    }
  });

  backendProcess.stderr.on('data', (data) => {
    const text = data.toString().trim();
    backendStderrLogs += text + '\n';
    console.error(`[Python Backend Error] ${text}`);
  });

  backendProcess.on('close', (code) => {
    console.log(`Backend process exited with code ${code}`);
    backendProcess = null;
    
    if (!portCaptured) {
      dialog.showErrorBox(
        'Backend Server Crash',
        `The Python backend crashed on startup (Exit code: ${code}).\n\nMake sure python3, OpenVINO, and all packages in requirements are installed.\n\nError Log:\n${backendStderrLogs || 'No error logs captured.'}`
      );
      app.quit();
    }
  });
}

function createWindow() {
  const rootDir = path.join(__dirname, '..');
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 650,
    title: 'GnomeAI Studio',
    icon: path.join(rootDir, 'assets', 'icon.png'),
    backgroundColor: '#151619',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }

  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] [Level ${level}] ${message} (${sourceId}:${line})`);
  });
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.log('[Renderer Process Gone]', details);
  });

  mainWindow.loadFile(path.join(rootDir, 'dist/index.html'));


  // Intercept window close: hide to background tray if a model is loaded, else quit app
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      if (isLoaded) {
        e.preventDefault();
        mainWindow.hide();
      } else {
        app.isQuitting = true;
        app.quit();
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createOverlayWindow() {
  const rootDir = path.join(__dirname, '..');
  overlayWindow = new BrowserWindow({
    width: 600,
    height: 90,
    minWidth: 400,
    minHeight: 90,
    maxWidth: 1200,
    maxHeight: 800,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }

  });

  const overlayPath = fs.existsSync(path.join(rootDir, 'dist/overlay.html'))
    ? path.join(rootDir, 'dist/overlay.html')
    : path.join(rootDir, 'dist/electron/overlay.html');
  overlayWindow.loadFile(overlayPath);

  overlayWindow.on('blur', () => {
    overlayWindow.hide();
  });
}

function showOverlayWindow(triggerVoice = false) {
  if (!overlayWindow) {
    createOverlayWindow();
  }

  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  const x = Math.floor((width - 600) / 2);
  const y = Math.floor(height * 0.15);

  overlayWindow.setPosition(x, y);
  overlayWindow.show();
  overlayWindow.focus();

  if (triggerVoice) {
    setTimeout(() => {
      overlayWindow.webContents.send('trigger-voice');
    }, 150);
  }
}

async function runClipboardScript() {
  const clipboardText = clipboard.readText().trim();
  if (!clipboardText) {
    new Notification({ title: 'GnomeAI Studio', body: 'Clipboard is empty.' }).show();
    return;
  }

  new Notification({ title: 'GnomeAI Studio', body: 'Executing script in Python sandbox...' }).show();
  try {
    // Read active session to append to history
    let sessionId = null;
    const sessionList = await callBackend('/api/sessions');
    if (sessionList.sessions && sessionList.sessions.length > 0) {
      sessionId = sessionList.sessions[0].id;
    }

    const res = await callBackend('/api/chat', 'POST', {
      message: `Please run the following code snippet from my clipboard in the sandbox:\n\n\`\`\`python\n${clipboardText}\n\`\`\``,
      session_id: sessionId
    });
    
    new Notification({ title: 'GnomeAI Studio', body: 'Sandbox script execution completed!' }).show();
    if (mainWindow && mainWindow.isVisible()) {
      // This channel is also used by the tray's "Load Model" flow, which passes
      // a real model name. Here we only want a UI refresh, so pass null
      // explicitly rather than nothing, so the renderer can tell the two apart.
      mainWindow.webContents.send('tray-load-model', null); // Triggers refresh
    }
  } catch (e) {
    new Notification({ title: 'GnomeAI Studio', body: 'Failed to run clipboard script.' }).show();
  }
}

async function learnFromClipboard() {
  const clipboardText = clipboard.readText().trim();
  if (!clipboardText) {
    new Notification({ title: 'GnomeAI Studio', body: 'Clipboard is empty.' }).show();
    return;
  }

  new Notification({ title: 'GnomeAI Studio', body: 'Extracting memories from clipboard text...' }).show();
  try {
    let sessionId = null;
    const sessionList = await callBackend('/api/sessions');
    if (sessionList.sessions && sessionList.sessions.length > 0) {
      sessionId = sessionList.sessions[0].id;
    }

    // First add to session history
    await callBackend('/api/chat', 'POST', {
      message: `Learn the following details from my clipboard:\n\n${clipboardText}`,
      session_id: sessionId
    });

    // Run active learning
    const res = await callBackend('/api/sessions/learn', 'POST', {
      session_id: sessionId
    });

    if (res.new_learnings && res.new_learnings.length > 0) {
      new Notification({ title: 'GnomeAI Studio', body: `Memory updated: Learned ${res.new_learnings.length} new facts!` }).show();
    } else {
      new Notification({ title: 'GnomeAI Studio', body: 'Analyzed text. No new preferences/facts found.' }).show();
    }
  } catch (e) {
    new Notification({ title: 'GnomeAI Studio', body: 'Failed to extract learnings from clipboard.' }).show();
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  startBackendOrConnect();

  // Defer secondary overlay window creation after main window displays
  setTimeout(() => {
    if (!overlayWindow) {
      createOverlayWindow();
    }
  }, 1000);

  // Create System Tray
  try {
    const rootDir = path.join(__dirname, '..');
    const iconPath = path.join(rootDir, 'assets', 'icon.png');
    tray = new Tray(iconPath);
    tray.setToolTip('GnomeAI Studio');
    tray.on('click', () => {
      showMainWindow();
    });
    updateTrayMenu();
  } catch (err) {
    console.error('Failed to initialize tray:', err);
  }

  // Register global shortcuts for toggling spotlight overlay
  try {
    const toggleOverlay = () => {
      if (overlayWindow) {
        if (overlayWindow.isVisible()) {
          console.log('[Shortcut] Hiding overlay window');
          overlayWindow.hide();
        } else {
          console.log('[Shortcut] Showing overlay window');
          showOverlayWindow(false);
        }
      }
    };

    const shortcuts = ['Super+Space', 'Ctrl+Alt+Space', 'Super+Alt+Space'];
    for (const shortcut of shortcuts) {
      try {
        const registered = globalShortcut.register(shortcut, toggleOverlay);
        if (registered) {
          console.log(`[Shortcut] Registered global key: ${shortcut}`);
        } else {
          console.warn(`[Shortcut] Failed to register: ${shortcut} (might be occupied by OS)`);
        }
      } catch (err) {
        console.error(`[Shortcut] Error registering ${shortcut}:`, err);
      }
    }
  } catch (err) {
    console.error('Error during global shortcut registration:', err);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (!isLoaded) {
    app.quit();
  }
});

// Clean up child process and shortcuts on exit
app.on('will-quit', () => {
  try {
    globalShortcut.unregisterAll();
  } catch (e) {}
  if (backendProcess) {
    try {
      backendProcess.kill('SIGTERM');
      backendProcess.kill('SIGKILL');
    } catch (e) {}
  }
});