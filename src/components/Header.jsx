import React from 'react';
import ExportPanel from './ExportPanel.jsx';
import MobileChrome from './MobileChrome.jsx';

const GITHUB_URL = 'https://github.com/Jany-M/repo-visualizer';
const AUTHOR_URL = 'https://www.shambix.com/';

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 11V2" />
      <path d="M4 6l4-4 4 4" />
      <rect x="2" y="11" width="12" height="3" rx="1" />
    </svg>
  );
}

function formatTimelinePosition(index, total) {
  const cur = index < 0 ? '00' : String(index + 1).padStart(2, '0');
  const max = String(total).padStart(2, '0');
  return { cur, max };
}

export default function Header({
  dataset,
  source,
  commitIndex = -1,
  commitCount = 0,
  currentCommit,
  exportOpen,
  onToggleExport,
  onCloseExport,
  recording,
  recordingProgress,
  encoding,
  encodeProgress,
  encodeFormat,
  recordingPlaying,
  onStartRecord,
  onStopRecord,
  onPauseRecord,
  useWebGL,
  layout = 'desktop',
  mobileControlsOpen = false,
  mobileInfoOpen = false,
  onToggleMobileControls,
  onToggleMobileInfo,
}) {
  if (!dataset) return null;
  const ts = currentCommit ? new Date(currentCommit.date) : null;
  const { cur, max } = formatTimelinePosition(commitIndex, commitCount || dataset.commits?.length || 0);
  const recPct = Math.round(Math.min(1, Math.max(0, recordingProgress)) * 100);
  const encPct = Math.round(Math.min(1, Math.max(0, encodeProgress)) * 100);
  const encodeLabel = encodeFormat === 'gif' ? 'GIF' : 'video';

  return (
    <header className="header">
      <div className="header-start">
        <div className="brand">
          <div className="brand-title-row">
            <div className="brand-mark"><span className="dot" />Repo Visualizer</div>
            <a
              className="brand-github"
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              title="View source on GitHub"
              aria-label="GitHub repository"
            >
              <GitHubIcon />
            </a>
          </div>
          <div className="brand-sub">
            A cinematic timeline of your codebase
            <span className="brand-sep"> · by </span>
            <a className="brand-author" href={AUTHOR_URL} target="_blank" rel="noopener noreferrer">
              Jany Martelli
            </a>
          </div>
        </div>
        <div className="header-repo-mobile">
          <div className="repo-name">{dataset.repo}</div>
        </div>
      </div>

      <div className="header-right">
        <div className="repo-meta">
          <div className="repo-name-row">
            <div className="repo-name">{dataset.repo}</div>
          </div>
          <div className="repo-meta-detail repo-meta-timeline" aria-live="polite">
            <span>{cur}</span>
            <span className="repo-meta-dim"> / {max}</span>
            {source === 'demo' && <span className="repo-meta-dim"> · demo</span>}
          </div>
          {ts && (
            <div className="repo-meta-detail">
              {ts.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
            </div>
          )}
        </div>

        <div className="header-toolbar">
          <div className="header-export-wrap">
            <div className="header-export-toolbar">
              {encoding ? (
                <div className="header-export-encoding" aria-live="polite">
                  <span className="header-export-encoding-label">
                    Creating {encodeLabel}… {encPct}%
                  </span>
                  <div
                    className="header-export-encoding-bar"
                    role="progressbar"
                    aria-valuenow={encPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className="header-export-encoding-bar-fill"
                      style={{ width: `${encPct}%` }}
                    />
                  </div>
                </div>
              ) : recording ? (
                <>
                  <button
                    type="button"
                    className="btn export-btn header-export-btn is-recording"
                    disabled
                    aria-live="polite"
                  >
                    <span className="rec-pulse" aria-hidden />
                    <span className="header-export-label">Recording {recPct}%</span>
                  </button>
                  <button
                    type="button"
                    className="btn header-export-btn"
                    onClick={onPauseRecord}
                    title={recordingPlaying ? 'Pause timeline' : 'Resume timeline'}
                  >
                    {recordingPlaying ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    type="button"
                    className="btn header-export-btn btn-danger"
                    onClick={onStopRecord}
                    title="Stop and download"
                  >
                    Stop
                  </button>
                </>
              ) : (
                onToggleExport && (
                  <button
                    type="button"
                    className={`btn export-btn header-export-btn${exportOpen ? ' is-active' : ''}`}
                    onClick={onToggleExport}
                    title="Export timeline as video or GIF"
                    aria-label="Export timeline"
                  >
                    <span className="icon"><ExportIcon /></span>
                    <span className="header-export-label">Export</span>
                  </button>
                )
              )}
            </div>
            {!recording && !encoding && (
              <ExportPanel
                open={exportOpen}
                onClose={onCloseExport}
                onStartRecord={onStartRecord}
                useWebGL={useWebGL}
              />
            )}
          </div>

          <MobileChrome
            layout={layout}
            controlsOpen={mobileControlsOpen}
            infoOpen={mobileInfoOpen}
            onToggleControls={onToggleMobileControls}
            onToggleInfo={onToggleMobileInfo}
          />
        </div>
      </div>
    </header>
  );
}
