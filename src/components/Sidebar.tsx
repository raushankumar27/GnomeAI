import React, { useState } from 'react';
import { SessionType } from '../types';

interface SidebarProps {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  activeTab: 'chat' | 'skills' | 'learnings' | 'models' | 'settings' | 'voices' | 'images' | 'mcp' | 'canvas';
  setActiveTab: (tab: 'chat' | 'skills' | 'learnings' | 'models' | 'settings' | 'voices' | 'images' | 'mcp' | 'canvas') => void;
  sessions: SessionType[];
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  editingSessionId: string | null;
  setEditingSessionId: (id: string | null) => void;
  editingSessionTitle: string;
  setEditingSessionTitle: (title: string) => void;
  handleCreateNewChat: () => void;
  handleRenameSession: (id: string) => void;
  handleDeleteSession: (id: string) => void;
  startEditingSession: (id: string, title: string) => void;
  theme: 'lm-studio' | 'dark' | 'light';
  setTheme: (theme: 'lm-studio' | 'dark' | 'light') => void;
}

export default function Sidebar({
  sidebarCollapsed,
  setSidebarCollapsed,
  activeTab,
  setActiveTab,
  sessions,
  activeSessionId,
  setActiveSessionId,
  editingSessionId,
  setEditingSessionId,
  editingSessionTitle,
  setEditingSessionTitle,
  handleCreateNewChat,
  handleRenameSession,
  handleDeleteSession,
  startEditingSession,
  theme,
  setTheme
}: SidebarProps) {
  const [compactView, setCompactView] = useState<boolean>(() => {
    const saved = localStorage.getItem('gnomeai_sidebar_compact');
    return saved !== 'false';
  });

  const toggleCompactView = () => {
    const next = !compactView;
    setCompactView(next);
    localStorage.setItem('gnomeai_sidebar_compact', String(next));
  };

  const handleNextTheme = () => {
    if (theme === 'lm-studio') setTheme('dark');
    else if (theme === 'dark') setTheme('light');
    else setTheme('lm-studio');
  };

  return (
    <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header sidebar-header-flex">
        <div className={`logo-area logo-area-flex ${sidebarCollapsed ? 'hidden' : ''}`}>
          <svg className="logo-icon" viewBox="0 0 24 24" width="32" height="32">
            <path fill="currentColor" d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9Z" />
          </svg>

          <h1>GnomeAI</h1>
        </div>
        <button 
          className={`logs-toggle-btn ${sidebarCollapsed ? 'collapsed' : ''}`} 
          title="Toggle sidebar size" 
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        >
          <svg viewBox="0 0 24 24" width="14" height="14">
            <path fill="currentColor" d="M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z" />
          </svg>
        </button>
      </div>

      <button className="btn-new-chat" onClick={handleCreateNewChat}>
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path fill="currentColor" d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z"/>
        </svg>
        {sidebarCollapsed ? '' : 'New Chat'}
      </button>

      <nav className="sidebar-nav">
        <button className={`nav-btn ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path fill="currentColor" d="M20,2H4A2,2 0 0,0 2,4V22L6,18H20A2,2 0 0,0 22,16V4A2,2 0 0,0 20,2M20,16H5.17L4,17.17V4H20V16Z"/>
          </svg>
          {sidebarCollapsed ? '' : 'Chat Studio'}
        </button>
        <button className={`nav-btn ${activeTab === 'skills' ? 'active' : ''}`} onClick={() => setActiveTab('skills')}>
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path fill="currentColor" d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8Z"/>
          </svg>
          {sidebarCollapsed ? '' : 'Skills Vault'}
        </button>
        <button className={`nav-btn ${activeTab === 'learnings' ? 'active' : ''}`} onClick={() => setActiveTab('learnings')}>
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path fill="currentColor" d="M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12A9,9 0 0,0 12,3M12,19A7,7 0 0,1 5,12A7,7 0 0,1 12,5A7,7 0 0,1 19,12A7,7 0 0,1 12,19M11,7H13V13H11V7M11,15H13V17H11V15Z"/>
          </svg>
          {sidebarCollapsed ? '' : 'Learnings'}
        </button>
        <button className={`nav-btn ${activeTab === 'voices' ? 'active' : ''}`} onClick={() => setActiveTab('voices')}>
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path fill="currentColor" d="M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 12,14A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z"/>
          </svg>
          {sidebarCollapsed ? '' : 'Voice Studio'}
        </button>
        <button className={`nav-btn ${activeTab === 'images' ? 'active' : ''}`} onClick={() => setActiveTab('images')}>
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path fill="currentColor" d="M21,19V5C21,3.89 20.1,3 19,3H5C3.89,3 3,3.89 3,5V19C3,20.1 3.89,21 5,21H19C20.1,21 21,20.1 21,19M8.5,13.5L11,16.5L14.5,12L19,18H5L8.5,13.5Z"/>
          </svg>
          {sidebarCollapsed ? '' : 'Image Studio'}
        </button>

        <button className={`nav-btn ${activeTab === 'models' ? 'active' : ''}`} onClick={() => setActiveTab('models')}>
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path fill="currentColor" d="M12 2C6.48 2 2 4.02 2 6.5S6.48 11 12 11S22 8.98 22 6.5S17.52 2 12 2M2 9.5C2 12 6.48 14 12 14S22 12 22 9.5V12C2 12.52 6.48 17 12 17S22 14.52 22 12M2 15C2 17.5 6.48 19.5 12 19.5S22 17.5 22 15V17.5C2 18.02 6.48 22.5 12 22.5S22 20.02 22 17.5Z"/>
          </svg>
          {sidebarCollapsed ? '' : 'Model Manager'}
        </button>
        <button className={`nav-btn ${activeTab === 'mcp' ? 'active' : ''}`} onClick={() => setActiveTab('mcp')}>
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path fill="currentColor" d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M17,14H13V18H11V14H7V12H11V8H13V12H17V14Z"/>
          </svg>
          {sidebarCollapsed ? '' : 'MCP Registry'}
        </button>
        <button className={`nav-btn ${activeTab === 'canvas' ? 'active' : ''}`} onClick={() => setActiveTab('canvas')}>
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path fill="currentColor" d="M19,3H5C3.89,3 3,3.89 3,5V19C3,20.1 3.89,21 5,21H19C20.1,21 21,20.1 21,19V5C21,3.89 20.1,3 19,3M19,19H5V5H19V19M17,12H7V10H17V12M17,16H7V14H17V16M13,8H7V6H13V8Z"/>
          </svg>
          {sidebarCollapsed ? '' : 'Agent Canvas'}
        </button>
        <button className={`nav-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path fill="currentColor" d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.47,5.34 14.86,5.08L14.48,2.42C14.44,2.18 14.23,2 14,2H10C9.77,2 9.56,2.18 9.52,2.42L9.14,5.08C8.53,5.34 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.95C7.96,18.34 8.53,18.66 9.14,18.92L9.52,21.58C9.56,21.82 9.77,22 10,22H14C14.23,22 14.44,21.82 14.48,21.58L14.86,18.92C15.47,18.66 16.04,18.34 16.56,17.95L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z"/>
          </svg>
          {sidebarCollapsed ? '' : 'Settings'}
        </button>
        <button className="nav-btn theme-toggle-btn" onClick={handleNextTheme} title={sidebarCollapsed ? `Current Theme: ${theme}` : ''}>
          {theme === 'lm-studio' ? (
            <>
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path fill="currentColor" d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4M12,6A6,6 0 0,1 18,12A6,6 0 0,1 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9Z" />
              </svg>
              {sidebarCollapsed ? '' : 'LM Studio Theme'}
            </>
          ) : theme === 'dark' ? (
            <>
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path fill="currentColor" d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8Z" />
              </svg>
              {sidebarCollapsed ? '' : 'OLED Dark'}
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path fill="currentColor" d="M12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,2A1,1 0 0,1 13,3V5A1,1 0 0,1 11,5V3A1,1 0 0,1 12,2M12,19A1,1 0 0,1 13,20V22A1,1 0 0,1 11,22V20A1,1 0 0,1 12,19M2,12A1,1 0 0,1 3,11H5A1,1 0 0,1 5,13H3A1,1 0 0,1 2,12M19,12A1,1 0 0,1 20,11H22A1,1 0 0,1 22,13H20A1,1 0 0,1 19,12M5.64,17.29A1,1 0 0,1 7.05,17.29L8.46,18.7A1,1 0 0,1 7.05,20.11L5.64,18.7A1,1 0 0,1 5.64,17.29M15.54,7.39A1,1 0 0,1 16.95,5.98L18.36,7.39A1,1 0 0,1 16.95,8.8L15.54,7.39M5.64,6.7A1,1 0 0,1 7.05,5.29L8.46,6.7A1,1 0 0,1 7.05,8.11L5.64,6.7M15.54,16.6A1,1 0 0,1 16.95,15.19L18.36,16.6A1,1 0 0,1 16.95,18.01L15.54,16.6Z" />
              </svg>
              {sidebarCollapsed ? '' : 'Light Mode'}
            </>
          )}
        </button>
      </nav>

      {!sidebarCollapsed && (
        <div className="sidebar-section">
          <div className="sidebar-section-hdr">
            <h3>RECENT CHATS</h3>
          </div>
          <div className={`session-list ${compactView ? 'compact' : ''}`}>
            {sessions.map(s => {
              const isEditing = editingSessionId === s.id;
              return (
                <div
                  key={s.id}
                  className={`session-card ${activeSessionId === s.id ? 'active' : ''}`}
                  onClick={() => { if (!isEditing) setActiveSessionId(s.id); }}
                >
                  {isEditing ? (
                    <>
                      <input
                        autoFocus
                        className="session-rename-input"
                        value={editingSessionTitle}
                        onChange={e => setEditingSessionTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); handleRenameSession(s.id); }
                          if (e.key === 'Escape') { e.preventDefault(); setEditingSessionId(null); }
                        }}
                        onClick={e => e.stopPropagation()}
                      />
                      <button
                        title="Save title"
                        className="btn-save-session-rename"
                        onClick={e => { e.stopPropagation(); handleRenameSession(s.id); }}
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"/></svg>
                      </button>
                      <button
                        title="Cancel"
                        className="btn-cancel-session-rename"
                        onClick={e => { e.stopPropagation(); setEditingSessionId(null); }}
                      >
                        <svg viewBox="0 0 24 24" width="13" height="13"><path fill="currentColor" d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/></svg>
                      </button>
                    </>
                  ) : (
                    <>
                      <span
                        className="session-title"
                        title="Double-click to rename"
                        onDoubleClick={e => { e.stopPropagation(); startEditingSession(s.id, s.title); }}
                      >{s.title}</span>
                      <button
                        className="btn-rename-session"
                        title="Rename session"
                        onClick={e => { e.stopPropagation(); startEditingSession(s.id, s.title); }}
                      >
                        <svg viewBox="0 0 24 24" width="12" height="12" className="accent-icon"><path fill="currentColor" d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z"/></svg>
                      </button>
                      <button
                        className="btn-delete-session"
                        title="Delete session"
                        onClick={e => { e.stopPropagation(); handleDeleteSession(s.id); }}
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" className="error-icon"><path fill="currentColor" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
}
