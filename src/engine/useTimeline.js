/**
 * Drives playback over a commit list. Returns the current commit index,
 * playback controls, and a stable reference to a "frame info" object the
 * visualizer can read on every animation frame.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyCommit, emptyState, rebuildToCommit } from './graphState.js';

const SPEEDS = {
  '0.5x': 1100,
  '1x':   600,
  '2x':   320,
  '4x':   160,
  '8x':   80,
};

export function useTimeline(dataset) {
  const commits = dataset?.commits ?? [];
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState('1x');
  const stateRef = useRef(emptyState());
  const lastAdvanceRef = useRef(0);
  const onAdvanceListeners = useRef(new Set());

  // Recompute graph state when index changes (handles seek)
  const reseedState = useCallback((targetIdx) => {
    stateRef.current = rebuildToCommit(commits, targetIdx);
  }, [commits]);

  // Imperative step forward — call inside RAF loop
  const stepForward = useCallback(() => {
    if (index >= commits.length - 1) {
      setPlaying(false);
      return false;
    }
    const nextIdx = index + 1;
    applyCommit(stateRef.current, commits[nextIdx], nextIdx);
    setIndex(nextIdx);
    onAdvanceListeners.current.forEach((cb) => cb(nextIdx, stateRef.current));
    return true;
  }, [commits, index]);

  const play  = useCallback(() => {
    if (index >= commits.length - 1) {
      // Restart from beginning
      stateRef.current = emptyState();
      setIndex(-1);
    }
    setPlaying(true);
  }, [commits.length, index]);

  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => {
    if (playing) {
      setPlaying(false);
    } else {
      play();
    }
  }, [playing, play]);

  const seek = useCallback((targetIdx) => {
    const clamped = Math.max(-1, Math.min(commits.length - 1, targetIdx));
    reseedState(clamped);
    setIndex(clamped);
    onAdvanceListeners.current.forEach((cb) => cb(clamped, stateRef.current));
  }, [commits.length, reseedState]);

  const restart = useCallback(() => {
    stateRef.current = emptyState();
    setIndex(-1);
    setPlaying(false);
  }, []);

  // RAF loop for playback timing
  useEffect(() => {
    if (!playing) return;
    let raf;
    let lastTime = performance.now();
    lastAdvanceRef.current = lastTime;
    const tick = (now) => {
      const dur = SPEEDS[speed] ?? 600;
      if (now - lastAdvanceRef.current >= dur) {
        const ok = stepForward();
        lastAdvanceRef.current = now;
        if (!ok) return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, stepForward]);

  const onAdvance = useCallback((cb) => {
    onAdvanceListeners.current.add(cb);
    return () => onAdvanceListeners.current.delete(cb);
  }, []);

  return useMemo(() => ({
    commits,
    index,
    playing,
    speed,
    speeds: Object.keys(SPEEDS),
    state: stateRef.current,
    play,
    pause,
    toggle,
    seek,
    setSpeed,
    restart,
    onAdvance,
    progress: commits.length > 0 ? Math.max(0, (index + 1) / commits.length) : 0,
  }), [commits, index, playing, speed, play, pause, toggle, seek, restart, onAdvance]);
}
