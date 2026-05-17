import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDataset } from './engine/useDataset.js';
import { useTimeline } from './engine/useTimeline.js';
import { clusterPalette } from './engine/graphState.js';
import Header from './components/Header.jsx';
import CommitCard from './components/CommitCard.jsx';
import ControlBar from './components/ControlBar.jsx';
import Legend from './components/Legend.jsx';
import ExportModal from './components/ExportModal.jsx';
import GalaxyVisualizer from './visualizers/GalaxyVisualizer.jsx';
import OrganicVisualizer from './visualizers/OrganicVisualizer.jsx';
import NeuralVisualizer from './visualizers/NeuralVisualizer.jsx';
import MinimalVisualizer from './visualizers/MinimalVisualizer.jsx';
import { startRecording } from './engine/recorder.js';

const VISUALIZERS = {
  galaxy:  GalaxyVisualizer,
  organic: OrganicVisualizer,
  neural:  NeuralVisualizer,
  minimal: MinimalVisualizer,
};

export default function App() {
  const { dataset, source } = useDataset();
  const timeline = useTimeline(dataset);
  const [style, setStyle] = useState('galaxy');
  const [exportOpen, setExportOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const stageRef = useRef(null);
  // Keep a live ref to the timeline so the recorder's isComplete callback
  // always sees the current index, not the index captured at click time.
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;

  const currentCommit = timeline.index >= 0 ? timeline.commits[timeline.index] : null;
  const palette = useMemo(() => clusterPalette(timeline.state), [timeline.state, timeline.index]);
  const Visualizer = VISUALIZERS[style];

  // Keyboard shortcuts: space = play/pause, arrows = seek, 1-4 = style
  useEffect(() => {
    const onKey = (ev) => {
      if (ev.target.matches('input, select, textarea')) return;
      if (ev.code === 'Space') { ev.preventDefault(); timeline.toggle(); }
      else if (ev.code === 'ArrowRight') timeline.seek(timeline.index + 1);
      else if (ev.code === 'ArrowLeft')  timeline.seek(timeline.index - 1);
      else if (ev.code === 'Digit1') setStyle('galaxy');
      else if (ev.code === 'Digit2') setStyle('organic');
      else if (ev.code === 'Digit3') setStyle('neural');
      else if (ev.code === 'Digit4') setStyle('minimal');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [timeline]);

  const handleStartRecord = async (opts) => {
    const canvas = stageRef.current?.querySelector('canvas');
    if (!canvas) {
      console.warn('No canvas found for recording');
      return;
    }
    setRecording(true);
    timeline.restart();
    setTimeout(() => timeline.play(), 200);

    const total = timeline.commits.length;
    await startRecording({
      canvas,
      opts,
      onProgress: (p) => setRecordingProgress(p),
      isComplete: () => timelineRef.current.index >= total - 1,
      repo: dataset.repo,
    });
    setRecording(false);
    setRecordingProgress(0);
    setExportOpen(false);
  };

  if (!dataset) {
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
        <Visualizer
          state={timeline.state}
          commitIndex={timeline.index}
          palette={palette}
        />
      </div>

      <Header dataset={dataset} source={source} currentCommit={currentCommit} />
      <CommitCard commit={currentCommit} />
      <Legend state={timeline.state} palette={palette} style={style} />

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
        onOpenExport={() => setExportOpen(true)}
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
