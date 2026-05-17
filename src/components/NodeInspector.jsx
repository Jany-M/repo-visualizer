import React from 'react';
import { getDepsForPath, getTouchCommitsForPath } from '../engine/graphState.js';

function DepList({ items, emptyLabel, onSelect }) {
  if (items.length === 0) {
    return <ul><li className="muted">{emptyLabel}</li></ul>;
  }
  return (
    <ul className="node-inspector-deps">
      {items.map((path) => (
        <li key={path}>
          <button type="button" className="dep-link" onClick={() => onSelect(path)}>
            <span className="dep-name">{path.split('/').pop()}</span>
            <span className="dep-path">{path}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function NodeInspector({
  path,
  state,
  commits,
  onSeek,
  onSelectPath,
  onClose,
}) {
  if (!path || !state) return null;

  const graphNode = state.nodes.get(path);
  const { inbound, outbound } = getDepsForPath(state, path);
  const touches = getTouchCommitsForPath(commits, path).slice(-12).reverse();

  const dependsOn = outbound.map((e) => e.to).slice(0, 16);
  const importedIn = inbound.map((e) => e.from).slice(0, 16);
  const hasGraph = outbound.length + inbound.length > 0;

  return (
    <aside className="node-inspector" role="dialog" aria-label="File details">
      <div className="node-inspector-header">
        <h3 className="node-inspector-path">{path}</h3>
        <button type="button" className="node-inspector-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      {graphNode && (
        <div className="node-inspector-meta">
          <span>{graphNode.dir}</span>
          <span>{graphNode.commits} commits</span>
          <span>churn {Math.round(graphNode.churn)}</span>
        </div>
      )}
      {!hasGraph && (
        <p className="node-inspector-empty">
          No import links for this file at the current commit. Scrub the timeline toward the end
          of the project, or re-run{' '}
          <code>npm run analyze -- /path/to/repo</code> so changes include{' '}
          <code>resolvedImports</code> (JS/TS, Python, Go, and other supported languages).
        </p>
      )}
      {hasGraph && (
        <p className="node-inspector-hint node-inspector-focus-hint">
          Connected files glow on the graph; everything else is dimmed.
        </p>
      )}
      <section className="node-inspector-section">
        <h4>Depends on ({outbound.length})</h4>
        <p className="node-inspector-hint">Files this module imports</p>
        <DepList
          items={dependsOn}
          emptyLabel="No imports resolved"
          onSelect={onSelectPath}
        />
      </section>
      <section className="node-inspector-section">
        <h4>Imported in ({inbound.length})</h4>
        <p className="node-inspector-hint">Files that import this module</p>
        <DepList
          items={importedIn}
          emptyLabel="Nothing imports this file yet"
          onSelect={onSelectPath}
        />
      </section>
      <section className="node-inspector-section">
        <h4>Recent touches</h4>
        <ul className="node-inspector-commits">
          {touches.map((idx) => {
            const c = commits[idx];
            if (!c) return null;
            return (
              <li key={c.sha}>
                <button type="button" onClick={() => onSeek(idx)}>
                  <span className="sha">{c.shortSha}</span>
                  <span className="msg">{c.message}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </aside>
  );
}
