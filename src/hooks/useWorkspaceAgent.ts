import { useState } from 'react';

export function useWorkspaceAgent(apiFetch: any, showToast?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void) {
  const [workspacePath, setWorkspacePath] = useState<string>('');
  const [workspaceFiles, setWorkspaceFiles] = useState<any[]>([]);
  const [pendingAuthRequest, setPendingAuthRequest] = useState<{ code: string } | null>(null);

  const selectWorkspaceFolder = async () => {
    if (window.electronAPI?.openDirectoryDialog) {
      try {
        const folder = await window.electronAPI.openDirectoryDialog();
        if (folder) {
          setWorkspacePath(folder);
          await setBackendWorkspacePath(folder);
        }
      } catch (err: any) {
        if (showToast) showToast(`Failed to select directory: ${err.message}`, 'error');
      }
    } else {
      const folder = prompt("Enter full absolute path to workspace folder:", "/home/user/my-project");
      if (folder && folder.trim()) {
        setWorkspacePath(folder.trim());
        await setBackendWorkspacePath(folder.trim());
      }
    }
  };

  const setBackendWorkspacePath = async (path: string) => {
    try {
      const res = await apiFetch('/api/code/workspace/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      if (res && res.success) {
        if (showToast) showToast(`📁 Workspace path set to: ${path}`, 'success');
        fetchWorkspaceFiles(path);
      }
    } catch (e: any) {
      if (showToast) showToast(`Failed to set workspace: ${e.message}`, 'error');
    }
  };

  const fetchWorkspaceFiles = async (path: string) => {
    try {
      const res = await apiFetch(`/api/code/workspace/files?path=${encodeURIComponent(path)}`);
      if (res && res.files) {
        setWorkspaceFiles(res.files);
      }
    } catch (e) {
      console.error('Fetch workspace files error:', e);
    }
  };

  const handleApproveCodeAuth = async () => {
    if (!pendingAuthRequest) return;
    setPendingAuthRequest(null);
    try {
      await apiFetch('/api/code/agent/resume', { method: 'POST' });
      if (showToast) showToast('✅ Code execution authorized!', 'success');
    } catch (e: any) {
      if (showToast) showToast(`Authorization error: ${e.message}`, 'error');
    }
  };

  const handleDenyCodeAuth = () => {
    setPendingAuthRequest(null);
    if (showToast) showToast('Execution authorization denied.', 'warning');
  };

  return {
    workspacePath,
    setWorkspacePath,
    workspaceFiles,
    pendingAuthRequest,
    setPendingAuthRequest,
    selectWorkspaceFolder,
    fetchWorkspaceFiles,
    handleApproveCodeAuth,
    handleDenyCodeAuth
  };
}
