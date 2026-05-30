import React, { useState, useMemo } from 'react';
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
  onSelectPath,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');

  const trimmedQuery = query.trim().toLowerCase();

  const searchResults = useMemo(() => {
    if (!state || !trimmedQuery) return [];
    const results = [];
    for (const [path, node] of state.nodes.entries()) {
      if (!isNodeVisible(node, commitIndex)) continue;
      if (path.toLowerCase().includes(trimmedQuery)) results.push(path);
      if (results.length >= 10) break;
    }
    return results.sort((a, b) => {
      const aStarts = a.split('/').pop().toLowerCase().startsWith(trimmedQuery) ? 0 : 1;
      const bStarts = b.split('/').pop().toLowerCase().startsWith(trimmedQuery) ? 0 : 1;
      return aStarts - bStarts;
    });
  }, [state, commitIndex, trimmedQuery]);

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

  const handleSelectFile = (path) => {
    setQuery('');
    onSelectPath?.(path);
  };

  return (
    <div
      className={`legend${collapsed ? ' is-collapsed' : ''}`}
      onClick={handleBackdropClick}
      role="group"
      aria-label="Feature clusters"
    >
      <div className="legend-header">
        <h4>Feature clusters</h4>
        <button
          type="button"
          className="legend-collapse-btn"
          onClick={(ev) => { ev.stopPropagation(); setCollapsed((c) => !c); }}
          aria-label={collapsed ? 'Expand' : 'Collapse'}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="legend-search">
            <input
              type="text"
              className="legend-search-input"
              placeholder="Search files…"
              value={query}
              onChange={(ev) => setQuery(ev.target.value)}
              onClick={(ev) => ev.stopPropagation()}
              aria-label="Search files in graph"
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button
                type="button"
                className="legend-search-clear"
                onClick={(ev) => { ev.stopPropagation(); setQuery(''); }}
                aria-label="Clear search"
              >×</button>
            )}
          </div>

          {trimmedQuery ? (
            <ul className="legend-search-results" role="listbox">
              {searchResults.length === 0 ? (
                <li className="legend-search-empty">No matches</li>
              ) : searchResults.map((path) => {
                const dir = state.nodes.get(path)?.dir ?? path.split('/')[0];
                const color = clusterColorFor(palette, dir, style);
                return (
                  <li key={path}>
                    <button
                      type="button"
                      className="legend-search-item"
                      onClick={(ev) => { ev.stopPropagation(); handleSelectFile(path); }}
                      title={path}
                    >
                      <span className="legend-search-row">
                        <span
                          className="legend-search-dot"
                          style={{ background: color.swatch ?? color.core }}
                        />
                        <span className="legend-search-name">{path.split('/').pop()}</span>
                      </span>
                      <span className="legend-search-path">{path}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            items.map(([cluster, count]) => {
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
            })
          )}
        </>
      )}
    </div>
  );
}
