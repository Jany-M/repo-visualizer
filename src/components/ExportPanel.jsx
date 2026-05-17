import { useState } from 'react';

const DEFAULT_OPTS = { format: 'webm', fps: 30, resolution: 1 };

const FORMATS = [
  { value: 'webm', label: 'WebM' },
  { value: 'gif', label: 'GIF' },
  { value: 'png', label: 'PNG' },
];

const FPS_OPTIONS = [
  { value: 24, label: '24' },
  { value: 30, label: '30' },
  { value: 60, label: '60' },
];

const RES_OPTIONS = [
  { value: 1, label: '1×' },
  { value: 1.5, label: '1.5×' },
  { value: 2, label: '2×' },
];

function ToggleRow({ label, options, value, onChange }) {
  return (
    <div className="export-toggle-row">
      <span className="export-toggle-label">{label}</span>
      <div className="export-toggle-group" role="group" aria-label={label}>
        {options.map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            className={`export-toggle-btn${value === opt.value ? ' active' : ''}`}
            aria-pressed={value === opt.value}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ExportPanel({
  open,
  onClose,
  onStartRecord,
  useWebGL,
}) {
  const [opts, setOpts] = useState(DEFAULT_OPTS);

  if (!open) return null;

  const isVideo = opts.format !== 'png';

  return (
    <div className="header-export-panel">
      {useWebGL && (
        <p className="export-panel-warn">Recording uses Hi-Res for full detail.</p>
      )}
      <ToggleRow
        label="Format"
        options={FORMATS}
        value={opts.format}
        onChange={(format) => setOpts((o) => ({ ...o, format }))}
      />
      {isVideo && (
        <>
          <ToggleRow
            label="FPS"
            options={FPS_OPTIONS}
            value={opts.fps}
            onChange={(fps) => setOpts((o) => ({ ...o, fps }))}
          />
          <ToggleRow
            label="Size"
            options={RES_OPTIONS}
            value={opts.resolution}
            onChange={(resolution) => setOpts((o) => ({ ...o, resolution }))}
          />
        </>
      )}
      <div className="export-panel-actions">
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => onStartRecord(opts)}
        >
          {isVideo ? 'Record' : 'Save frame'}
        </button>
      </div>
    </div>
  );
}
