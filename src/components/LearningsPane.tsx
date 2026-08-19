import React, { useState, useMemo } from 'react';

interface LearningsPaneProps {
  learnings: string[];
  newLearning: string;
  setNewLearning: (val: string) => void;
  editingLearningIndex: number | null;
  setEditingLearningIndex: (val: number | null) => void;
  editingLearningValue: string;
  setEditingLearningValue: (val: string) => void;
  handleAddLearning: () => void;
  handleUpdateLearning: (index: number) => void;
  handleDeleteLearning: (index: number) => void;
}

interface GraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
  type: 'concept' | 'fact';
  color: string;
}

interface GraphEdge {
  from: string;
  to: string;
}

export default function LearningsPane({
  learnings,
  newLearning,
  setNewLearning,
  editingLearningIndex,
  setEditingLearningIndex,
  editingLearningValue,
  setEditingLearningValue,
  handleAddLearning,
  handleUpdateLearning,
  handleDeleteLearning
}: LearningsPaneProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Generate interactive knowledge graph nodes and edges from memory strings
  const graphData = useMemo(() => {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    
    // Core desktop concepts to link
    const concepts = ['music', 'workspace', 'editor', 'git', 'terminal', 'python', 'dark mode', 'theme', 'model', 'sound', 'browser'];
    
    // Add concept nodes
    concepts.forEach((concept, idx) => {
      // Circle layout for concept nodes
      const angle = (idx / concepts.length) * 2 * Math.PI;
      const radius = 120;
      nodes.push({
        id: `concept_${concept}`,
        label: concept.toUpperCase(),
        x: 350 + radius * Math.cos(angle),
        y: 180 + radius * Math.sin(angle),
        type: 'concept',
        color: 'var(--accent)'
      });
    });

    // Add fact nodes and draw edges
    learnings.forEach((learning, idx) => {
      // Place fact nodes in a larger outer circle
      const angle = (idx / (learnings.length || 1)) * 2 * Math.PI + 0.3;
      const radius = 200;
      const factId = `fact_${idx}`;
      
      nodes.push({
        id: factId,
        label: learning.length > 25 ? learning.substring(0, 22) + '...' : learning,
        x: 350 + radius * Math.cos(angle),
        y: 180 + radius * Math.sin(angle),
        type: 'fact',
        color: 'rgba(255,255,255,0.75)'
      });

      // Link facts to matching concepts
      concepts.forEach(concept => {
        if (learning.toLowerCase().includes(concept)) {
          edges.push({
            from: `concept_${concept}`,
            to: factId
          });
        }
      });
    });

    return { nodes, edges };
  }, [learnings]);

  // Filter learnings listed in the table if a concept node is clicked
  const filteredLearnings = useMemo(() => {
    if (selectedNodeId && selectedNodeId.startsWith('concept_')) {
      const concept = selectedNodeId.substring(8);
      return learnings
        .map((l, originalIndex) => ({ l, originalIndex }))
        .filter(item => item.l.toLowerCase().includes(concept));
    }
    return learnings.map((l, originalIndex) => ({ l, originalIndex }));
  }, [learnings, selectedNodeId]);

  return (
    <section className="tab-pane active" id="pane-learnings">
      <header className="view-header">
        <span className="view-title">Learnings Database & Semantic Map</span>
      </header>

      <div className="learnings-container pad-20 flex-col gap-20">
        
        {/* Knowledge Graph Card */}
        <div className="graph-card">
          <h3 className="graph-card-title">Memory Connections</h3>
          <p className="graph-card-sub">
            Click concept nodes (indigo) to filter matching facts in the table below. Hover to highlight connections.
          </p>

          <div className="graph-canvas-container">
            <svg className="w-100 h-100">
              {/* Edges */}
              {graphData.edges.map((edge, idx) => {
                const fromNode = graphData.nodes.find(n => n.id === edge.from);
                const toNode = graphData.nodes.find(n => n.id === edge.to);
                if (!fromNode || !toNode) return null;

                const isHighlighted = hoveredNodeId === edge.from || hoveredNodeId === edge.to;
                const isSelected = selectedNodeId === edge.from || selectedNodeId === edge.to;

                return (
                  <line
                    key={idx}
                    x1={fromNode.x}
                    y1={fromNode.y}
                    x2={toNode.x}
                    y2={toNode.y}
                    stroke={isSelected ? 'var(--accent)' : isHighlighted ? 'rgba(129, 140, 248, 0.6)' : 'rgba(255,255,255,0.06)'}
                    strokeWidth={isSelected ? 2 : isHighlighted ? 1.5 : 1}
                  />
                );
              })}

              {/* Nodes */}
              {graphData.nodes.map(node => {
                const isHovered = hoveredNodeId === node.id;
                const isSelected = selectedNodeId === node.id;
                const isConcept = node.type === 'concept';

                return (
                  <g 
                    key={node.id}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                    onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
                  >
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={isConcept ? (isSelected ? 14 : 11) : 7}
                      fill={isConcept ? 'var(--accent)' : 'rgba(255,255,255,0.15)'}
                      stroke={isSelected ? '#fff' : isHovered ? 'var(--accent-hover)' : 'rgba(255,255,255,0.3)'}
                      strokeWidth={isSelected ? 2 : 1}
                    />
                    {/* Node Text Label */}
                    <text
                      x={node.x}
                      y={node.y - (isConcept ? 18 : 12)}
                      textAnchor="middle"
                      fill={isConcept ? 'var(--accent)' : isHovered || isSelected ? '#fff' : 'rgba(255,255,255,0.5)'}
                    >
                      {node.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Learnings Table list */}
        <div className="table-card">
          <div className="table-hdr-row">
            <h3>
              Learnings Records {selectedNodeId && <span className="accent-text text-12"> (filtered by concept)</span>}
            </h3>
            {selectedNodeId && (
              <button className="pill btn-reset-filter" onClick={() => setSelectedNodeId(null)}>
                Reset Filter
              </button>
            )}
          </div>
          <table className="learnings-table">
            <thead>
              <tr>
                <th>Fact / System Note</th>
                <th className="actions-cell-hdr">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLearnings.map(({ l, originalIndex }) => (
                <tr key={originalIndex}>
                  <td className="vertical-align-middle">
                    {editingLearningIndex === originalIndex ? (
                      <input 
                        type="text" 
                        className="learnings-edit-input"
                        value={editingLearningValue}
                        onChange={e => setEditingLearningValue(e.target.value)}
                      />
                    ) : (
                      <span>{l}</span>
                    )}
                  </td>
                  <td className="actions-cell-flex">
                    {editingLearningIndex === originalIndex ? (
                      <>
                        <button 
                          className="pill btn-icon-pill" 
                          title="Save changes" 
                          onClick={() => handleUpdateLearning(originalIndex)}
                        >
                          <svg viewBox="0 0 24 24" width="14" height="14" className="status-dot-green"><path fill="currentColor" d="M15,9H5V5H15M12,19A3,3 0 0,1 9,16A3,3 0 0,1 12,13A3,3 0 0,1 15,16A3,3 0 0,1 12,19M17,3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V7L17,3Z"/></svg>
                        </button>
                        <button 
                          className="pill btn-icon-pill" 
                          title="Cancel" 
                          onClick={() => setEditingLearningIndex(null)}
                        >
                          <svg viewBox="0 0 24 24" width="14" height="14" className="status-dot-red"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                        </button>
                      </>
                    ) : (
                      <>
                        <button 
                          className="pill btn-icon-pill" 
                          title="Edit Fact" 
                          onClick={() => {
                            setEditingLearningIndex(originalIndex);
                            setEditingLearningValue(l);
                          }}
                        >
                          <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.07,6.19L3,17.25Z"/></svg>
                        </button>
                        <button 
                          className="pill btn-icon-pill-danger" 
                          title="Delete Fact" 
                          onClick={() => handleDeleteLearning(originalIndex)}
                        >
                          <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/></svg>
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="add-learning-card">
          <h3>Add Custom Fact</h3>
          <div className="add-row">
            <input 
              type="text" 
              value={newLearning}
              onChange={e => setNewLearning(e.target.value)}
              placeholder="e.g. rhythmbox is the default music player"
            />
            <button className="pill gradient-btn" onClick={handleAddLearning}>Add Fact</button>
          </div>
        </div>
      </div>
    </section>
  );
}
