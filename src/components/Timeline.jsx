import React, { useEffect, useMemo, useRef, useState } from 'react';

const MAX_TICKS = 64;

/**
 * Interactive scrubber — milestone ticks only (virtualized for large histories).
 *
 * The handle tracks the pointer immediately for instant visual feedback.
 * The actual onSeek is debounced during drag so large async rebuilds don't
 * pile up on every mouse-move frame; it always fires immediately on release.
 */
export default function Timeline({ commits, index, onSeek }) {
  const trackRef = useRef(null);
  // Visual position during drag (null = use committed index).
  const [pendingIdx, setPendingIdx] = useState(null);
  const pendingIdxRef = useRef(null);
  const draggingRef = useRef(false);
  const debounceRef = useRef(null);

  const ticks = useMemo(() => {
    if (!commits.length) return [];
    const n = commits.length;
    const step = Math.max(1, Math.ceil(n / MAX_TICKS));
    const out = [];
    for (let i = 0; i < n; i += step) {
      const isMajor = i % 10 === 0 || i === n - 1 || i === 0;
      out.push({ i, isMajor, pct: (i / Math.max(1, n - 1)) * 100 });
    }
    if (out[out.length - 1]?.i !== n - 1) {
      out.push({ i: n - 1, isMajor: true, pct: 100 });
    }
    return out;
  }, [commits.length]);

  const idxFromEvent = (ev) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = ev.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    return Math.round(pct * (commits.length - 1));
  };

  const setPending = (idx) => {
    pendingIdxRef.current = idx;
    setPendingIdx(idx);
  };

  const handleMouseDown = (ev) => {
    draggingRef.current = true;
    const idx = idxFromEvent(ev);
    if (idx === null) return;
    clearTimeout(debounceRef.current);
    setPending(idx);
    onSeek(idx); // immediate on initial click
  };

  const handleMouseMove = (ev) => {
    if (!draggingRef.current || ev.buttons !== 1) return;
    const idx = idxFromEvent(ev);
    if (idx === null) return;
    setPending(idx); // move handle instantly
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSeek(idx), 180);
  };

  // Catch mouseup anywhere in the window so releasing outside the track works.
  useEffect(() => {
    const onMouseUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      clearTimeout(debounceRef.current);
      const finalIdx = pendingIdxRef.current;
      pendingIdxRef.current = null;
      setPendingIdx(null);
      if (finalIdx !== null) onSeek(finalIdx);
    };
    window.addEventListener('mouseup', onMouseUp);
    return () => window.removeEventListener('mouseup', onMouseUp);
  }, [onSeek]);

  const handleClick = (ev) => {
    // handled by mouseDown — suppress to avoid double-fire
    ev.preventDefault();
  };

  const progress = (pendingIdx ?? (index < 0 ? -1 : index));
  const progressPct = progress < 0 ? 0 : (progress / Math.max(1, commits.length - 1)) * 100;

  const firstDate = commits[0]?.date && new Date(commits[0].date);
  const lastDate = commits[commits.length - 1]?.date && new Date(commits[commits.length - 1].date);
  const midDate = commits[Math.floor(commits.length / 2)]?.date
    && new Date(commits[Math.floor(commits.length / 2)].date);

  const fmt = (d) => d ? d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : '';

  return (
    <div className="timeline">
      <div
        className="timeline-track"
        ref={trackRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={commits.length - 1}
        aria-valuenow={Math.max(0, index)}
      >
        <div className="timeline-progress" style={{ width: `${progressPct}%` }} />
        <div className="timeline-handle" style={{ left: `${progressPct}%` }} />
        <div className="timeline-ticks">
          {ticks.map((t) => (
            <div
              key={t.i}
              className={`timeline-tick${t.isMajor ? ' large' : ''}`}
              style={{ left: `${t.pct}%`, opacity: t.isMajor ? 1 : 0.35 }}
            />
          ))}
        </div>
        <div className="timeline-date" style={{ left: '0%', transform: 'translateX(0)' }}>{fmt(firstDate)}</div>
        <div className="timeline-date" style={{ left: '50%' }}>{fmt(midDate)}</div>
        <div className="timeline-date" style={{ left: '100%', transform: 'translateX(-100%)' }}>{fmt(lastDate)}</div>
      </div>
    </div>
  );
}
