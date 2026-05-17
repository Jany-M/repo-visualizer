import React from 'react';

export default function Header({ dataset, source, currentCommit }) {
  if (!dataset) return null;
  const ts = currentCommit ? new Date(currentCommit.date) : null;
  return (
    <header className="header">
      <div className="brand">
        <div className="brand-mark"><span className="dot" />Repo Visualizer</div>
        <div className="brand-sub">A cinematic timeline of your codebase</div>
      </div>
      <div className="repo-meta">
        <div className="repo-name">{dataset.repo}</div>
        <div>
          {dataset.totalCommits} commits
          {source === 'demo' && ' · demo dataset'}
        </div>
        {ts && (
          <div>
            {ts.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
          </div>
        )}
      </div>
    </header>
  );
}
