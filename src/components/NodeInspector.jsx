import React from 'react';
import { getDepsForPath, getTouchCommitsForPath, topLevelDir } from '../engine/graphState.js';
import { clusterColorFor } from '../engine/colors.js';

const NO_IMPORTS_HELP =
  'No import links for this file at the current commit. Scrub the timeline toward the end of the project, or re-run npm run analyze -- /path/to/repo so changes include resolvedImports (JS/TS, Python, Go, and other supported languages).';

function clusterForPath(state, filePath) {
  return state.nodes.get(filePath)?.dir
    ?? state.cluster.get(filePath)
    ?? topLevelDir(filePath);
}

function folderBadgeStyle(palette, cluster, style) {
  const c = clusterColorFor(palette, cluster, style);
  return {
    background: c.core,
    color: style === 'minimal' ? 'rgba(255, 255, 255, 0.92)' : 'rgba(6, 6, 13, 0.88)',
    borderColor: c.edge,
  };
}

function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.25" />
      <path d="M8 7.25V11" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      <circle cx="8" cy="5.25" r="0.75" fill="currentColor" />
    </svg>
  );
}

function ImportInfoIcon() {
  return (
    <span className="node-inspector-info-wrap">
      <button
        type="button"
        className="node-inspector-info"
        aria-label={NO_IMPORTS_HELP}
      >
        <InfoIcon />
      </button>
      <span className="node-inspector-info-tip" role="tooltip">
        {NO_IMPORTS_HELP}
      </span>
    </span>
  );
}

function DepList({ items, onSelect, state, palette, style }) {
  if (items.length === 0) return null;
  return (
    <ul className="node-inspector-deps">
      {items.map((filePath) => {
        const folder = clusterForPath(state, filePath);
        return (
          <li key={filePath}>
            <button type="button" className="dep-link" onClick={() => onSelect(filePath)}>
              <span className="dep-row">
                <span
                  className="dep-folder-badge"
                  style={folderBadgeStyle(palette, folder, style)}
                  title={folder}
                >
                  {folder}
                </span>
                <span className="dep-name">{filePath.split('/').pop()}</span>
              </span>
              <span className="dep-path">{filePath}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default function NodeInspector({
  path,
  state,
  commits,
  palette,
  style,
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
        <div className="node-inspector-title-row">
          <h3 className="node-inspector-path">{path}</h3>
          {!hasGraph && <ImportInfoIcon />}
        </div>
        <button type="button" className="node-inspector-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="node-inspector-scroll">
      {graphNode && (
        <div className="node-inspector-meta">
          <span>{graphNode.dir}</span>
          <span>{graphNode.commits} commits</span>
          <span>churn {Math.round(graphNode.churn)}</span>
        </div>
      )}
      {dependsOn.length > 0 && (
        <section className="node-inspector-section">
          <h4>Depends on ({dependsOn.length})</h4>
          <p className="node-inspector-hint">Files this module imports</p>
          <DepList
            items={dependsOn}
            onSelect={onSelectPath}
            state={state}
            palette={palette}
            style={style}
          />
        </section>
      )}
      {importedIn.length > 0 && (
        <section className="node-inspector-section">
          <h4>Imported in ({importedIn.length})</h4>
          <p className="node-inspector-hint">Files that import this module</p>
          <DepList
            items={importedIn}
            onSelect={onSelectPath}
            state={state}
            palette={palette}
            style={style}
          />
        </section>
      )}
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
      </div>
    </aside>
  );
}
