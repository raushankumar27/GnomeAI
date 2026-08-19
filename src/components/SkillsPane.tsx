import React from 'react';

interface SkillsPaneProps {
  skills: any[];
  activeSkill: any | null;
  setActiveSkill: (skill: any) => void;
  skillCode: string;
  setSkillCode: (code: string) => void;
  handleSaveSkill: () => void;
}

export default function SkillsPane({
  skills,
  activeSkill,
  setActiveSkill,
  skillCode,
  setSkillCode,
  handleSaveSkill
}: SkillsPaneProps) {
  return (
    <section className="tab-pane active" id="pane-skills">
      <header className="view-header">
        <span className="view-title">Skills Vault</span>
      </header>
      <div className="pane-split-container">
        <div className="split-left">
          <div className="vault-grid">
            {skills.map(s => (
              <div 
                key={s.id}
                className={`skill-vault-card cursor-pointer ${activeSkill?.id === s.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveSkill(s);
                  setSkillCode(s.code || '');
                }}
              >
                <div className="skill-vault-name">{s.name}</div>
                <div className="skill-vault-desc">{s.description}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="split-right">
          <div className={`editor-container ${activeSkill ? '' : 'opacity-50'}`}>
            <div className="editor-header">
              <span className="editor-title">{activeSkill ? activeSkill.name : 'Select a Skill'}</span>
              <button className="pill save-btn" onClick={handleSaveSkill} disabled={!activeSkill}>
                Save Changes
              </button>
            </div>
            <div className="editor-wrapper">
              <textarea 
                placeholder="Select a skill to view and edit its code..."
                value={skillCode}
                onChange={e => setSkillCode(e.target.value)}
                disabled={!activeSkill}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
