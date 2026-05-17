import React from 'react';
import { clusterColor } from '../engine/colors.js';

export default function Legend({ state, palette, style }) {
  if (!state || !state.clusters.size) return null;

  // Count nodes per cluster
  const counts = new Map();
  for (const node of state.nodes.values()) {
    if (node.deleted) continue;
    counts.set(node.dir, (counts.get(node.dir) || 0) + 1);
  }

  const items = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <div className="legend">
      <h4>Feature clusters</h4>
      {items.map(([cluster, count]) => {
        const hue = palette.get(cluster) ?? 0;
        const color = clusterColor(hue, style);
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
