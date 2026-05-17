import React, { useEffect, useState } from 'react';

export default function CommitCard({ commit }) {
  const [entering, setEntering] = useState(false);
  useEffect(() => {
    setEntering(true);
    const id = setTimeout(() => setEntering(false), 30);
    return () => clearTimeout(id);
  }, [commit?.sha]);

  if (!commit) {
    return (
      <div className="commit-card">
        <div className="commit-sha">·</div>
        <div className="commit-message" style={{ color: 'var(--fg-muted)' }}>
          Press play to begin the journey
        </div>
        <div className="commit-byline">
          The timeline will trace the codebase from its first line to its latest state.
        </div>
      </div>
    );
  }

  const initials = (commit.author || '?').split(' ').map((n) => n[0]).slice(0, 2).join('');

  return (
    <div className={`commit-card ${entering ? 'entering' : ''}`}>
      <div className="commit-sha">{commit.shortSha}</div>
      <div className="commit-message">{commit.message}</div>
      <div className="commit-byline">
        <span className="avatar">{initials}</span>
        <span>{commit.author}</span>
        <span style={{ color: 'var(--fg-dim)' }}>·</span>
        <span>{new Date(commit.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
      </div>
      <div className="stats">
        <span>{commit.stats.filesChanged} file{commit.stats.filesChanged === 1 ? '' : 's'}</span>
        <span className="ins">+{commit.stats.insertions}</span>
        <span className="del">−{commit.stats.deletions}</span>
      </div>
      <div className="changes-list">
        {commit.changes.slice(0, 8).map((c) => (
          <div className="change-row" key={c.path}>
            <span className={`status ${c.status || 'M'}`}>{c.status || 'M'}</span>
            <span className="path" title={c.path}>{c.path}</span>
          </div>
        ))}
        {commit.changes.length > 8 && (
          <div style={{ color: 'var(--fg-dim)', paddingTop: 4 }}>
            + {commit.changes.length - 8} more…
          </div>
        )}
      </div>
    </div>
  );
}
