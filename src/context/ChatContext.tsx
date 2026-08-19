import React, { createContext, useContext, useState } from 'react';
import { SessionType } from '../types';

interface ChatContextType {
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  sessions: SessionType[];
  setSessions: React.Dispatch<React.SetStateAction<SessionType[]>>;
  chatHistory: any[];
  setChatHistory: React.Dispatch<React.SetStateAction<any[]>>;
  activeMode: 'chat' | 'agent' | 'code' | 'auto' | 'story_reader';
  setActiveMode: (mode: 'chat' | 'agent' | 'code' | 'auto' | 'story_reader') => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionType[]>([]);
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [activeMode, setActiveMode] = useState<'chat' | 'agent' | 'code' | 'auto' | 'story_reader'>('auto');

  return (
    <ChatContext.Provider value={{
      activeSessionId,
      setActiveSessionId,
      sessions,
      setSessions,
      chatHistory,
      setChatHistory,
      activeMode,
      setActiveMode
    }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) throw new Error('useChat must be used within a ChatProvider');
  return context;
};
