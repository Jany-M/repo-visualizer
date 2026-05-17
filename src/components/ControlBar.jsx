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
  autoFit,
  onAutoFitChange,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  branchView,
  onBranchViewChange,
  branchSupported,
  perfMode,
  onPerfModeChange,
  visibleCount,
}) {
  return (
    <div className="control-bar">
      <Timeline commits={commits} index={index} onSeek={onSeek} />
      <div className="control-row">
        <button className="btn" onClick={onRestart} title="Restart" type="button">
          <span className="icon"><RestartIcon /></span>
        </button>
        <button className="btn btn-play" onClick={onTogglePlay} title={playing ? 'Pause' : 'Play'} type="button">
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div className="speed-control">
          <span>SPEED</span>
          <select value={speed} onChange={(e) => onSetSpeed(e.target.value)}>
            {speeds.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="zoom-control" title="Canvas zoom">
          <button type="button" className="btn btn-sm" onClick={onZoomOut}>−</button>
          <button type="button" className="btn btn-sm" onClick={onZoomReset} title="Reset view">◎</button>
          <button type="button" className="btn btn-sm" onClick={onZoomIn}>+</button>
        </div>
        <label className="toggle-chip" title="Auto zoom to fit graph while playing">
          <input type="checkbox" checked={autoFit} onChange={(e) => onAutoFitChange(e.target.checked)} />
          Auto fit
        </label>
        {branchSupported && (
          <label className="toggle-chip" title="Spread merge commits across lanes">
            <input type="checkbox" checked={branchView} onChange={(e) => onBranchViewChange(e.target.checked)} />
            Branches
          </label>
        )}
        <select
          className="perf-select"
          value={perfMode}
          onChange={(e) => onPerfModeChange(e.target.value)}
          title="Performance renderer (WebGL when needed)"
        >
          <option value="auto">Perf: auto</option>
          <option value="on">Perf: on</option>
          <option value="off">Perf: off</option>
        </select>
        <StylePicker style={style} onChange={onStyleChange} />
        <div className="spacer" />
        <div className="commit-counter">
          {index < 0 ? '00' : String(index + 1).padStart(2, '0')}
          <span className="dim"> / {String(commits.length).padStart(2, '0')}</span>
          <span className="dim node-count"> · {visibleCount} nodes</span>
        </div>
      </div>
    </div>
  );
}
