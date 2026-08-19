import React, { createContext, useContext, useState, useEffect } from 'react';
import { SettingsType, Toast } from '../types';

interface AppContextType {
  backendPort: number;
  setBackendPort: (port: number) => void;
  settings: SettingsType;
  setSettings: React.Dispatch<React.SetStateAction<SettingsType>>;
  theme: 'lm-studio' | 'dark' | 'light';
  setTheme: (t: 'lm-studio' | 'dark' | 'light') => void;
  toasts: Toast[];
  showToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [backendPort, setBackendPort] = useState<number>(8095);
  const [theme, setTheme] = useState<'lm-studio' | 'dark' | 'light'>(() => {
    return (localStorage.getItem('theme') as 'lm-studio' | 'dark' | 'light') || 'lm-studio';
  });
  
  const [settings, setSettings] = useState<SettingsType>({
    lm_studio_url: 'http://localhost:1234/v1',
    model_name: '',
    inbuilt_model_id: '',
    inbuilt_device: 'auto',
    tts_speed: 1.0,
    enable_dbus_monitor: false,
    enable_tts: false,
    llm_backend: 'inbuilt',
    cpu_threads: 4,
    top_k: 40,
    top_p: 0.95,
    min_p: 0.05,
    extension_model_id: '',
    chat_font_size: 14.5
  });

  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'success') => {
    const id = Date.now().toString() + Math.random().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const fontSize = settings.chat_font_size ?? 14.5;
    document.documentElement.style.setProperty('--chat-font-size', `${fontSize}px`);
  }, [settings.chat_font_size]);

  return (
    <AppContext.Provider value={{
      backendPort,
      setBackendPort,
      settings,
      setSettings,
      theme,
      setTheme,
      toasts,
      showToast
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
