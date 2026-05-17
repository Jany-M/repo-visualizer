import React from 'react';
import { clusterColorFor } from '../engine/colors.js';
import { isNodeVisible } from '../engine/visibility.js';

export default function Legend({ state, palette, style, commitIndex = Infinity }) {
  if (!state || !state.clusters.size) return null;

  const counts = new Map();
  for (const node of state.nodes.values()) {
    if (!isNodeVisible(node, commitIndex)) continue;
    counts.set(node.dir, (counts.get(node.dir) || 0) + 1);
  }

  const items = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <div className="legend">
      <h4>Feature clusters</h4>
      {items.map(([cluster, count]) => {
        const color = clusterColorFor(palette, cluster, style);
        return (
          <div className="legend-item" key={cluster}>
            <span className="legend-dot" style={{ background: color.core, color: color.core }} />
            <span className="legend-label">{cluster}</span>
            <span className="legend-count">{count}</span>
          </div>
        );
      })}
    </div>
  );
}
