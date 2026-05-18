import React, { useEffect, useRef, useState } from 'react';

/** perfMode values: auto | off (canvas) | on (WebGL) */
export const PERF_MODES = [
  {
    value: 'auto',
    label: 'Auto-Res',
    title: 'Use fast GPU rendering only when the graph is very large',
  },
  {
    value: 'off',
    label: 'Hi-Res',
    title: 'Full canvas — import lines, effects, and richest visuals',
  },
  {
    value: 'on',
    label: 'Low-Res',
    title: 'Fast GPU points — best for huge repos, fewer visual details',
  },
];

export default function PerfModePicker({ perfMode, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const active = PERF_MODES.find((m) => m.value === perfMode) ?? PERF_MODES[0];
  const alternatives = PERF_MODES.filter((m) => m.value !== perfMode);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const selectMode = (value) => {
    onChange(value);
    setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className={`perf-mode-picker${open ? ' is-open' : ''}`}
      role="group"
      aria-label="Rendering quality"
    >
      <button
        type="button"
        className="perf-mode-btn perf-mode-btn--current active"
        aria-expanded={open}
        aria-haspopup="true"
        title={active.title}
        onClick={() => setOpen((v) => !v)}
      >
        {active.label}
      </button>
      <div className="perf-mode-picker-alts" aria-hidden={!open}>
        {alternatives.map((mode) => (
          <button
            key={mode.value}
            type="button"
            className="perf-mode-btn"
            title={mode.title}
            tabIndex={open ? 0 : -1}
            onClick={() => selectMode(mode.value)}
          >
            {mode.label}
          </button>
        ))}
      </div>
    </div>
  );
}
