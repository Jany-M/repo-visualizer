import React from 'react';
import { clusterColorFor } from '../engine/colors.js';
import { isClusterActive } from '../engine/excludes.js';
import { isNodeVisible } from '../engine/visibility.js';

export default function Legend({
  state,
  palette,
  style,
  commitIndex = Infinity,
  excludePatterns = [],
  selectedCluster = null,
  onClusterSelect,
}) {
  if (!state) return null;

  const counts = new Map();
  for (const node of state.nodes.values()) {
    if (!isNodeVisible(node, commitIndex)) continue;
    counts.set(node.dir, (counts.get(node.dir) || 0) + 1);
  }

  const items = [...counts.entries()]
    .filter(([cluster, count]) => (
      count > 0 && isClusterActive(state, cluster, commitIndex, excludePatterns)
    ))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  if (!items.length) return null;

  const handleBackdropClick = (ev) => {
    if (ev.target === ev.currentTarget && selectedCluster) {
      onClusterSelect?.(null);
    }
  };

  return (
    <div
      className="legend"
      onClick={handleBackdropClick}
      role="group"
      aria-label="Feature clusters"
    >
      <h4>Feature clusters</h4>
      {items.map(([cluster, count]) => {
        const color = clusterColorFor(palette, cluster, style);
        const active = selectedCluster === cluster;
        return (
          <button
            type="button"
            key={cluster}
            className={`legend-item${active ? ' is-active' : ''}`}
            aria-pressed={active}
            onClick={(ev) => {
              ev.stopPropagation();
              onClusterSelect?.(active ? null : cluster);
            }}
          >
            <span
              className="legend-dot"
              style={{ background: color.swatch ?? color.core }}
            />
            <span className="legend-label">{cluster}</span>
            <span className="legend-count">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
