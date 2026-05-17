import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDataset } from './engine/useDataset.js';
import { useTimeline } from './engine/useTimeline.js';
import { clusterPalette, collectAllClusters } from './engine/graphState.js';
import { countVisibleNodes } from './engine/visibility.js';
import { computeBranchLanes, datasetSupportsBranches } from './engine/branchLanes.js';
import {
  isWebGLAvailable,
  WEBGL_NODE_THRESHOLD,
  WEBGL_NODE_HYSTERESIS,
} from './engine/webglSupport.js';
import Header from './components/Header.jsx';
import CommitCard from './components/CommitCard.jsx';
import ControlBar from './components/ControlBar.jsx';
import Legend from './components/Legend.jsx';
import ExportModal from './components/ExportModal.jsx';
import NodeInspector from './components/NodeInspector.jsx';
import GalaxyVisualizer from './visualizers/GalaxyVisualizer.jsx';
import OrganicVisualizer from './visualizers/OrganicVisualizer.jsx';
import NeuralVisualizer from './visualizers/NeuralVisualizer.jsx';
import MinimalVisualizer from './visualizers/MinimalVisualizer.jsx';
import WebGLVisualizer from './visualizers/WebGLVisualizer.jsx';
import { startRecording } from './engine/recorder.js';

const CANVAS_VISUALIZERS = {
  galaxy: GalaxyVisualizer,
  organic: OrganicVisualizer,
  neural: NeuralVisualizer,
  minimal: MinimalVisualizer,
};

function loadBool(key, defaultVal) {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return defaultVal;
    return v === 'true';
  } catch {
    return defaultVal;
  }
}

export default function App() {
  const { dataset, source, loading } = useDataset();
  const timeline = useTimeline(dataset);
  const [style, setStyle] = useState('galaxy');
  const [exportOpen, setExportOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [selectedPath, setSelectedPath] = useState(null);
  const wasPlayingRef = useRef(false);
  const [branchView, setBranchView] = useState(false);
  const [autoFit, setAutoFit] = useState(() => loadBool('rv-auto-fit', true));
  const [perfMode, setPerfMode] = useState('auto');
  const [useWebGL, setUseWebGL] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const stageRef = useRef(null);
  const timelineRef = useRef(timeline);
  const cameraApiRef = useRef(null);
  timelineRef.current = timeline;

  const branchSupported = datasetSupportsBranches(dataset);
  const branchLanes = useMemo(
    () => computeBranchLanes(timeline.commits, timeline.index, branchView && branchSupported),
    [timeline.commits, timeline.index, branchView, branchSupported],
  );

  const visibleCount = useMemo(
    () => countVisibleNodes(timeline.state, timeline.index),
    [timeline.state, timeline.index, timeline.stateVersion],
  );

  useEffect(() => {
    if (perfMode === 'off') {
      setUseWebGL(false);
      return;
    }
    if (perfMode === 'on') {
      setUseWebGL(isWebGLAvailable() && !webglFailed);
      return;
    }
    const want = visibleCount >= WEBGL_NODE_THRESHOLD
      || (useWebGL && visibleCount >= WEBGL_NODE_HYSTERESIS);
    setUseWebGL(want && isWebGLAvailable() && !webglFailed);
  }, [visibleCount, perfMode, webglFailed, useWebGL]);

  const currentCommit = timeline.index >= 0 ? timeline.commits[timeline.index] : null;
  const allClusters = useMemo(
    () => collectAllClusters(timeline.commits),
    [timeline.commits],
  );
  const palette = useMemo(
    () => clusterPalette(timeline.state, allClusters),
    [timeline.state, allClusters],
  );

  const handleCloseInspector = useCallback(() => {
    setSelectedPath(null);
    if (wasPlayingRef.current) {
      wasPlayingRef.current = false;
      timeline.play();
    }
  }, [timeline]);

  const handleNodeClick = useCallback((path) => {
    if (path) {
      if (timeline.playing) {
        wasPlayingRef.current = true;
        timeline.pause();
      }
      setSelectedPath(path);
    } else {
      handleCloseInspector();
    }
  }, [timeline, handleCloseInspector]);

  const CanvasVisualizer = CANVAS_VISUALIZERS[style];
  const showWebGL = useWebGL && style === 'galaxy';

  const visProps = {
    state: timeline.state,
    commitIndex: timeline.index,
    palette,
    autoFit,
    selectedPath,
    onNodeClick: handleNodeClick,
    branchLanes,
    cameraApiRef,
  };

  useEffect(() => {
    localStorage.setItem('rv-auto-fit', String(autoFit));
  }, [autoFit]);

  useEffect(() => {
    const onKey = (ev) => {
      if (ev.target.matches('input, select, textarea')) return;
      if (ev.code === 'Escape') handleCloseInspector();
      else if (ev.code === 'Space' && !selectedPath) { ev.preventDefault(); timeline.toggle(); }
      else if (ev.code === 'ArrowRight') timeline.seek(timeline.index + 1);
      else if (ev.code === 'ArrowLeft') timeline.seek(timeline.index - 1);
      else if (ev.code === 'Digit1') setStyle('galaxy');
      else if (ev.code === 'Digit2') setStyle('organic');
      else if (ev.code === 'Digit3') setStyle('neural');
      else if (ev.code === 'Digit4') setStyle('minimal');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [timeline, selectedPath, handleCloseInspector]);

  const handleStartRecord = async (opts) => {
    const canvas = stageRef.current?.querySelector('canvas');
    if (!canvas) return;
    setRecording(true);
    timeline.restart();
    setTimeout(() => timeline.play(), 200);
    const total = timeline.commits.length;
    await startRecording({
      canvas,
      opts,
      onProgress: setRecordingProgress,
      isComplete: () => timelineRef.current.index >= total - 1,
      repo: dataset.repo,
    });
    setRecording(false);
    setRecordingProgress(0);
    setExportOpen(false);
  };

  const handleWebGLFailed = useCallback(() => {
    setWebglFailed(true);
    setUseWebGL(false);
  }, []);

  if (loading || !dataset) {
    return (
      <div className="loader">
        <div className="spinner" />
        <div>Loading repository history…</div>
      </div>
    );
  }

  return (
    <div className="app" data-style={style}>
      <div className="stage" ref={stageRef}>
        {showWebGL ? (
          <WebGLVisualizer
            {...visProps}
            onInitFailed={handleWebGLFailed}
          />
        ) : (
          <CanvasVisualizer {...visProps} />
        )}
      </div>

      {webglFailed && !bannerDismissed && (
        <div className="notice-banner">
          <span>High-performance renderer unavailable — using standard view.</span>
          <button type="button" onClick={() => setBannerDismissed(true)} aria-label="Dismiss">×</button>
        </div>
      )}

      <Header
        dataset={dataset}
        source={source}
        currentCommit={currentCommit}
        onOpenExport={() => setExportOpen(true)}
        recording={recording}
      />
      <CommitCard commit={currentCommit} />
      <Legend state={timeline.state} palette={palette} style={style} commitIndex={timeline.index} />

      {selectedPath && (
        <NodeInspector
          path={selectedPath}
          state={timeline.state}
          commits={timeline.commits}
          onSeek={timeline.seek}
          onSelectPath={setSelectedPath}
          onClose={handleCloseInspector}
        />
      )}

      <ControlBar
        commits={timeline.commits}
        index={timeline.index}
        playing={timeline.playing}
        speed={timeline.speed}
        speeds={timeline.speeds}
        onTogglePlay={timeline.toggle}
        onSeek={timeline.seek}
        onSetSpeed={timeline.setSpeed}
        onRestart={timeline.restart}
        style={style}
        onStyleChange={setStyle}
        autoFit={autoFit}
        onAutoFitChange={setAutoFit}
        onZoomIn={() => cameraApiRef.current?.zoomIn()}
        onZoomOut={() => cameraApiRef.current?.zoomOut()}
        onZoomReset={() => cameraApiRef.current?.reset()}
        branchView={branchView}
        onBranchViewChange={setBranchView}
        branchSupported={branchSupported}
        perfMode={perfMode}
        onPerfModeChange={setPerfMode}
        visibleCount={visibleCount}
      />

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onStartRecord={handleStartRecord}
        recording={recording}
        recordingProgress={recordingProgress}
      />
    </div>
  );
}

