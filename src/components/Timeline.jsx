import React, { useMemo, useRef } from 'react';

/**
 * Interactive scrubber that shows the full commit history as a track with
 * a draggable progress handle. Ticks mark milestones (every 10th commit).
 */
export default function Timeline({ commits, index, onSeek }) {
  const trackRef = useRef(null);

  const ticks = useMemo(() => {
    const out = [];
    if (!commits.length) return out;
    for (let i = 0; i < commits.length; i++) {
      const isMajor = i % 10 === 0 || i === commits.length - 1;
      out.push({ i, isMajor, pct: (i / Math.max(1, commits.length - 1)) * 100 });
    }
    return out;
  }, [commits.length]);

  const handleClick = (ev) => {
    const rect = trackRef.current.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    const idx = Math.round(pct * (commits.length - 1));
    onSeek(idx);
  };

  const handleDrag = (ev) => {
    if (ev.buttons !== 1) return;
    handleClick(ev);
  };

  const progress = index < 0 ? 0 : ((index) / Math.max(1, commits.length - 1)) * 100;

  const firstDate = commits[0]?.date && new Date(commits[0].date);
  const lastDate = commits[commits.length - 1]?.date && new Date(commits[commits.length - 1].date);
  const midDate = commits[Math.floor(commits.length / 2)]?.date && new Date(commits[Math.floor(commits.length / 2)].date);

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
