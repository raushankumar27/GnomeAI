declare global {
  interface Window {
    electronAPI?: {
      send?: (channel: string, data?: any) => void;
      on?: (channel: string, func: (...args: any[]) => void) => void;
      minimizeWindow?: () => void;
      maximizeWindow?: () => void;
      closeWindow?: () => void;
    };
  }
}

export class ElectronIpcService {
  isElectron(): boolean {
    return typeof window !== "undefined" && !!window.electronAPI;
  }

  minimize(): void {
    if (window.electronAPI?.minimizeWindow) {
      window.electronAPI.minimizeWindow();
    }
  }

  maximize(): void {
    if (window.electronAPI?.maximizeWindow) {
      window.electronAPI.maximizeWindow();
    }
  }

  close(): void {
    if (window.electronAPI?.closeWindow) {
      window.electronAPI.closeWindow();
    }
  }
}

export const electronIpcService = new ElectronIpcService();
