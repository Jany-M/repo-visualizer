import React from 'react';
import Timeline from './Timeline.jsx';
import StylePicker from './StylePicker.jsx';
import PerfModePicker from './PerfModePicker.jsx';

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

const FinalStateIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
    <path d="M3 3h2v10H3V3zm4 0h2v10H7V3zm4 0h5v2h-3v2h3v2h-3v4H9V3z" />
  </svg>
);

export default function ControlBar({
  commits,
  index,
  playing,
  speed,
  speeds,
  onTogglePlay,
  onGoToFinal,
  buildingFinal = false,
  buildProgress = 0,
  atFinal = false,
  onSeek,
  onSetSpeed,
  onRestart,
  style,
  onStyleChange,
  autoFit = true,
  onAutoFitChange,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  perfMode,
  onPerfModeChange,
}) {
  return (
    <div className="control-bar">
      <Timeline commits={commits} index={index} onSeek={onSeek} />
      <div className="control-row control-row--essential">
        <button className="btn" onClick={onRestart} title="Restart" type="button">
          <span className="icon"><RestartIcon /></span>
        </button>
        <button
          className="btn btn-play"
          onClick={onTogglePlay}
          title={playing ? 'Pause' : 'Play'}
          type="button"
          disabled={buildingFinal}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          type="button"
          className={`btn btn-final-state${atFinal ? ' is-active' : ''}`}
          onClick={onGoToFinal}
          disabled={buildingFinal || atFinal || !commits.length}
          title={atFinal ? 'At final state' : 'Load final state (all commits)'}
          aria-busy={buildingFinal}
        >
          <FinalStateIcon />
        </button>
      </div>
      <div className="control-row control-row--extended">
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
        <button
          type="button"
          role="switch"
          aria-checked={autoFit}
          className={`toggle-switch${autoFit ? ' is-on' : ''}`}
          title="Auto zoom to fit graph while playing"
          onClick={() => onAutoFitChange(!autoFit)}
        >
          <span className="toggle-switch-track" aria-hidden="true">
            <span className="toggle-switch-thumb" />
          </span>
          <span className="toggle-switch-label">Auto fit</span>
        </button>
        <div className="perf-control">
          <PerfModePicker perfMode={perfMode} onChange={onPerfModeChange} />
        </div>
        <StylePicker style={style} onChange={onStyleChange} />
        <div className="spacer" />
      </div>
    </div>
  );
}
