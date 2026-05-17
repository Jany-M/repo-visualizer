import React, { useMemo, useRef } from 'react';

const MAX_TICKS = 64;

/**
 * Interactive scrubber — milestone ticks only (virtualized for large histories).
 */
export default function Timeline({ commits, index, onSeek }) {
  const trackRef = useRef(null);

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

  const seekFromEvent = (ev) => {
    const rect = trackRef.current.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    const idx = Math.round(pct * (commits.length - 1));
    onSeek(idx);
  };

  const handleClick = (ev) => seekFromEvent(ev);

  const handleDrag = (ev) => {
    if (ev.buttons !== 1) return;
    seekFromEvent(ev);
  };

  const progress = index < 0 ? 0 : (index / Math.max(1, commits.length - 1)) * 100;

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
        onMouseDown={handleClick}
        onMouseMove={handleDrag}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={commits.length - 1}
        aria-valuenow={Math.max(0, index)}
      >
        <div className="timeline-progress" style={{ width: `${progress}%` }} />
        <div className="timeline-handle" style={{ left: `${progress}%` }} />
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
