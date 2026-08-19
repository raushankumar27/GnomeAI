import { useState } from 'react';

export function useLearningsAndSkills(apiFetch: any, showToast?: (msg: string, type?: 'info' | 'success' | 'warning' | 'error') => void) {
  // Learnings CRUD
  const [learnings, setLearnings] = useState<string[]>([]);
  const [newLearning, setNewLearning] = useState<string>('');
  const [editingLearningIndex, setEditingLearningIndex] = useState<number | null>(null);
  const [editingLearningValue, setEditingLearningValue] = useState<string>('');

  // Skills
  const [skills, setSkills] = useState<any[]>([]);
  const [activeSkill, setActiveSkill] = useState<any | null>(null);
  const [skillCode, setSkillCode] = useState<string>('');

  const fetchLearnings = async () => {
    try {
      const data = await apiFetch('/api/learnings');
      if (data && data.learnings) {
        setLearnings(data.learnings);
      }
    } catch (e) {
      console.error('Fetch learnings error:', e);
    }
  };

  const handleAddLearning = async () => {
    if (!newLearning.trim()) return;
    try {
      const res = await apiFetch('/api/learnings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: newLearning.trim() })
      });
      if (res && res.success) {
        setNewLearning('');
        fetchLearnings();
        if (showToast) showToast('Saved new learning memory!', 'success');
      }
    } catch (e: any) {
      if (showToast) showToast(`Failed to add learning: ${e.message}`, 'error');
    }
  };

  const handleDeleteLearning = async (index: number) => {
    try {
      const res = await apiFetch(`/api/learnings/${index}`, { method: 'DELETE' });
      if (res && res.success) {
        fetchLearnings();
        if (showToast) showToast('Deleted learning memory', 'success');
      }
    } catch (e: any) {
      if (showToast) showToast(`Failed to delete learning: ${e.message}`, 'error');
    }
  };

  const handleSaveEditedLearning = async (index: number) => {
    if (!editingLearningValue.trim()) return;
    try {
      const res = await apiFetch(`/api/learnings/${index}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: editingLearningValue.trim() })
      });
      if (res && res.success) {
        setEditingLearningIndex(null);
        setEditingLearningValue('');
        fetchLearnings();
        if (showToast) showToast('Updated learning memory', 'success');
      }
    } catch (e: any) {
      if (showToast) showToast(`Failed to update learning: ${e.message}`, 'error');
    }
  };

  const fetchSkills = async () => {
    try {
      const data = await apiFetch('/api/skills');
      if (data && data.skills) {
        setSkills(data.skills);
      }
    } catch (e) {
      console.error('Fetch skills error:', e);
    }
  };

  return {
    learnings,
    newLearning,
    setNewLearning,
    editingLearningIndex,
    setEditingLearningIndex,
    editingLearningValue,
    setEditingLearningValue,
    fetchLearnings,
    handleAddLearning,
    handleDeleteLearning,
    handleSaveEditedLearning,
    skills,
    activeSkill,
    setActiveSkill,
    skillCode,
    setSkillCode,
    fetchSkills
  };
}
