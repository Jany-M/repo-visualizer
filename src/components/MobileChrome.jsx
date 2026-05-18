import React from 'react';

/** Sliders — playback / view controls */
function ControlsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M2 4.5h1.5M7 4.5h7M2 8h4M9 8h5M2 11.5h6M11 11.5h3" strokeLinecap="round" />
      <circle cx="5.5" cy="4.5" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="11" cy="8" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="9.5" cy="11.5" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="8" cy="8" r="6" />
      <path d="M8 7.2V11M8 5.2h.01" strokeLinecap="round" />
    </svg>
  );
}

export default function MobileChrome({
  layout,
  controlsOpen,
  infoOpen,
  onToggleControls,
  onToggleInfo,
}) {
  if (layout === 'desktop') return null;

  return (
    <div className="mobile-chrome" role="toolbar" aria-label="Panel toggles">
      <button
        type="button"
        className={`mobile-chrome-btn${controlsOpen ? ' is-active' : ''}`}
        aria-pressed={controlsOpen}
        aria-label={controlsOpen ? 'Hide controls' : 'Show controls'}
        title={controlsOpen ? 'Hide controls' : 'Show controls'}
        onClick={onToggleControls}
      >
        <ControlsIcon />
        <span className="mobile-chrome-label">Controls</span>
      </button>
      <button
        type="button"
        className={`mobile-chrome-btn${infoOpen ? ' is-active' : ''}`}
        aria-pressed={infoOpen}
        aria-label={infoOpen ? 'Hide info' : 'Show info'}
        title={infoOpen ? 'Hide info' : 'Show info'}
        onClick={onToggleInfo}
      >
        <InfoIcon />
        <span className="mobile-chrome-label">Info</span>
      </button>
    </div>
  );
}
