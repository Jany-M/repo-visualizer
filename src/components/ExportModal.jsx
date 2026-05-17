import React, { useState } from 'react';

export default function ExportModal({ open, onClose, onStartRecord, recording, recordingProgress }) {
  const [format, setFormat] = useState('webm');
  const [fps, setFps] = useState(30);
  const [resolution, setResolution] = useState('1080');

  if (!open) return null;

  const start = () => {
    onStartRecord({ format, fps: Number(fps), resolution: Number(resolution) });
  };

  return (
    <div className="modal-backdrop" onClick={recording ? null : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Export your timeline</h2>
        <p className="lead">
          Records the visualization at full quality while it plays. The browser captures the canvas
          directly, so what you see is what you get.
        </p>

        <div className="field">
          <label htmlFor="fmt">Format</label>
          <select id="fmt" value={format} onChange={(e) => setFormat(e.target.value)} disabled={recording}>
            <option value="webm">WebM video (mp4-compatible)</option>
            <option value="gif">Animated GIF</option>
            <option value="png">PNG snapshot (current frame)</option>
          </select>
        </div>

        {format !== 'png' && (
          <div className="field">
            <label htmlFor="fps">Frame rate</label>
            <select id="fps" value={fps} onChange={(e) => setFps(e.target.value)} disabled={recording}>
              <option value="24">24 fps · cinematic</option>
              <option value="30">30 fps · standard</option>
              <option value="60">60 fps · smooth</option>
            </select>
          </div>
        )}

        <div className="field">
          <label htmlFor="res">Resolution</label>
          <select id="res" value={resolution} onChange={(e) => setResolution(e.target.value)} disabled={recording}>
            <option value="720">1280 × 720</option>
            <option value="1080">1920 × 1080</option>
            <option value="1440">2560 × 1440</option>
          </select>
        </div>

        {recording && (
          <div className="modal-recording">
            <span className="rec-pulse" />
            Recording… {Math.round(recordingProgress * 100)}%
          </div>
        )}

        <div className="actions">
          <button className="btn" onClick={onClose} disabled={recording}>Close</button>
          <button className="btn btn-primary" onClick={start} disabled={recording}>
            {recording ? 'Recording…' : 'Start recording'}
          </button>
        </div>
      </div>
    </div>
  );
}
