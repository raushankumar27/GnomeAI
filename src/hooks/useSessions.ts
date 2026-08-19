import { useState, useEffect } from 'react';
import { SessionType } from '../types';

export function useSessions(apiFetch: any, contextLimit: number = 2048) {
  const [sessions, setSessions] = useState<SessionType[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeSessionDetails, setActiveSessionDetails] = useState<any>(null);
  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [contextEstimate, setContextEstimate] = useState<string>('0 / 2048 ctx');
  
  // Session inline-rename state
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingSessionTitle, setEditingSessionTitle] = useState<string>('');

  const fetchSessions = async () => {
    try {
      const data = await apiFetch('/api/sessions');
      if (data && data.sessions) {
        setSessions(data.sessions);
        if (data.active_session_id && !activeSessionId) {
          setActiveSessionId(data.active_session_id);
        }
      }
    } catch (e) {
      console.error('Fetch sessions error:', e);
    }
  };

  const fetchSessionDetails = async (id: string) => {
    try {
      const data = await apiFetch(`/api/sessions/${id}`);
      if (data && data.session) {
        setActiveSessionDetails(data.session);
        setChatHistory(data.session.history || []);
      }
    } catch (e) {
      console.error(`Fetch session details error for ${id}:`, e);
    }
  };

  useEffect(() => {
    if (activeSessionId) {
      fetchSessionDetails(activeSessionId);
    }
  }, [activeSessionId]);

  useEffect(() => {
    if (!activeSessionId) return;
    const textContent = chatHistory.map(m => m.content || '').join(' ');
    const wordCount = textContent.split(/\s+/).filter(Boolean).length;
    const approxTokens = Math.round(wordCount * 1.3);
    setContextEstimate(`${approxTokens} / ${contextLimit} ctx`);
  }, [chatHistory, contextLimit, activeSessionId]);

  const handleCreateNewChat = async (type: string = 'general') => {
    try {
      const data = await apiFetch('/api/sessions/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type })
      });
      if (data && data.session_id) {
        await fetchSessions();
        setActiveSessionId(data.session_id);
      }
    } catch (e) {
      console.error('Create new chat error:', e);
    }
  };

  const handleDeleteSession = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const data = await apiFetch(`/api/sessions/${id}`, { method: 'DELETE' });
      if (data && data.success) {
        await fetchSessions();
        if (activeSessionId === id) {
          const remaining = sessions.filter(s => s.id !== id);
          if (remaining.length > 0) {
            setActiveSessionId(remaining[0].id);
          } else {
            setActiveSessionId(null);
            setChatHistory([]);
            setActiveSessionDetails(null);
          }
        }
      }
    } catch (err) {
      console.error('Delete session error:', err);
    }
  };

  const handleRenameSession = async (id: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    try {
      const data = await apiFetch(`/api/sessions/${id}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() })
      });
      if (data && data.success) {
        setEditingSessionId(null);
        fetchSessions();
      }
    } catch (err) {
      console.error('Rename session error:', err);
    }
  };

  return {
    sessions,
    setSessions,
    activeSessionId,
    setActiveSessionId,
    activeSessionDetails,
    chatHistory,
    setChatHistory,
    contextEstimate,
    editingSessionId,
    setEditingSessionId,
    editingSessionTitle,
    setEditingSessionTitle,
    fetchSessions,
    fetchSessionDetails,
    handleCreateNewChat,
    handleDeleteSession,
    handleRenameSession
  };
}
