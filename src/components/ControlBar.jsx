import React from 'react';
import Timeline from './Timeline.jsx';
import StylePicker from './StylePicker.jsx';

const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4 3 L13 8 L4 13 Z" />
  </svg>
);

const PauseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="4" y="3" width="3" height="10" />
    <rect x="9" y="3" width="3" height="10" />
  </svg>
);

const RestartIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 8a6 6 0 1 0 1.7-4.2" />
    <path d="M2 2v3h3" />
  </svg>
);

const ExportIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 11V2" />
    <path d="M4 6l4-4 4 4" />
    <rect x="2" y="11" width="12" height="3" rx="1" />
  </svg>
);

export default function ControlBar({
  commits,
  index,
  playing,
  speed,
  speeds,
  onTogglePlay,
  onSeek,
  onSetSpeed,
  onRestart,
  style,
  onStyleChange,
  onOpenExport,
}) {
  return (
    <div className="control-bar">
      <Timeline commits={commits} index={index} onSeek={onSeek} />
      <div className="control-row">
        <button className="btn" onClick={onRestart} title="Restart">
          <span className="icon"><RestartIcon /></span>
        </button>
        <button className="btn btn-play" onClick={onTogglePlay} title={playing ? 'Pause' : 'Play'}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div className="speed-control">
          <span>SPEED</span>
          <select value={speed} onChange={(e) => onSetSpeed(e.target.value)}>
            {speeds.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <StylePicker style={style} onChange={onStyleChange} />
        <div className="spacer" />
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)' }}>
          {index < 0 ? '00' : String(index + 1).padStart(2, '0')}
          <span style={{ color: 'var(--fg-dim)' }}> / {String(commits.length).padStart(2, '0')}</span>
        </div>
        <button className="btn export-btn" onClick={onOpenExport}>
          <span className="icon"><ExportIcon /></span>
          Export
        </button>
      </div>
    </div>
  );
}
