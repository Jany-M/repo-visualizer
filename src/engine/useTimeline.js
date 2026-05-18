/**
 * Drives playback over a commit list. Returns the current commit index,
 * playback controls, and a stable reference to graph state.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyCommit, emptyState, rebuildToCommit, rebuildToCommitAsync, revertCommit,
} from './graphState.js';

const SPEEDS = {
  '0.5x': 2200,
  '1x':   1200,
  '2x':   640,
  '4x':   320,
  '8x':   160,
};

const INCREMENTAL_SEEK_MAX = 40;

function yieldToMain() {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => resolve(), { timeout: 48 });
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export function useTimeline(dataset) {
  const commits = dataset?.commits ?? [];
  const excludePatterns = dataset?.exclude ?? [];
  const commitsRef = useRef(commits);
  const excludeRef = useRef(excludePatterns);
  commitsRef.current = commits;
  excludeRef.current = excludePatterns;

  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState('1x');
  const [stateVersion, setStateVersion] = useState(0);
  const [buildingFinal, setBuildingFinal] = useState(false);
  const [buildProgress, setBuildProgress] = useState(0);
  const stateRef = useRef(emptyState());
  const lastAdvanceRef = useRef(0);
  const onAdvanceListeners = useRef(new Set());
  const buildCancelRef = useRef(false);

  const bumpState = useCallback(() => setStateVersion((v) => v + 1), []);

  const cancelBuild = useCallback(() => {
    buildCancelRef.current = true;
  }, []);

  // Reset when dataset changes
  useEffect(() => {
    cancelBuild();
    stateRef.current = emptyState();
    setIndex(-1);
    setPlaying(false);
    setBuildingFinal(false);
    setBuildProgress(0);
    bumpState();
  }, [dataset?.repo, commits.length, excludePatterns, bumpState, cancelBuild]);

  const stepForward = useCallback(() => {
    const list = commitsRef.current;
    if (index >= list.length - 1) {
      setPlaying(false);
      return false;
    }
    const nextIdx = index + 1;
    applyCommit(stateRef.current, list[nextIdx], nextIdx, excludeRef.current);
    setIndex(nextIdx);
    bumpState();
    onAdvanceListeners.current.forEach((cb) => cb(nextIdx, stateRef.current));
    return true;
  }, [index, bumpState]);

  const stepBackward = useCallback(() => {
    const list = commitsRef.current;
    if (index < 0) return false;
    revertCommit(stateRef.current, list[index], index, excludeRef.current);
    const prev = index - 1;
    stateRef.current.lastCommit = prev >= 0 ? list[prev] : null;
    setIndex(prev);
    bumpState();
    onAdvanceListeners.current.forEach((cb) => cb(prev, stateRef.current));
    return true;
  }, [index, bumpState]);

  const play = useCallback(() => {
    if (index >= commitsRef.current.length - 1) {
      stateRef.current = emptyState();
      setIndex(-1);
      bumpState();
    }
    setPlaying(true);
  }, [index, bumpState]);

  const pause = useCallback(() => setPlaying(false), []);

  const toggle = useCallback(() => {
    if (playing) pause();
    else play();
  }, [playing, play, pause]);

  const seek = useCallback((targetIdx) => {
    cancelBuild();
    const list = commitsRef.current;
    const clamped = Math.max(-1, Math.min(list.length - 1, targetIdx));
    const current = index;

    if (clamped === current) return;

    const delta = clamped - current;

    if (Math.abs(delta) <= INCREMENTAL_SEEK_MAX) {
      if (delta > 0) {
        for (let i = current + 1; i <= clamped; i++) {
          applyCommit(stateRef.current, list[i], i, excludeRef.current);
        }
      } else {
        for (let i = current; i > clamped; i--) {
          revertCommit(stateRef.current, list[i], i, excludeRef.current);
        }
      }
    } else {
      stateRef.current = rebuildToCommit(list, clamped, excludeRef.current);
    }

    stateRef.current.lastCommit = clamped >= 0 ? list[clamped] : null;
    setIndex(clamped);
    bumpState();
    onAdvanceListeners.current.forEach((cb) => cb(clamped, stateRef.current));
  }, [index, bumpState, cancelBuild]);

  const restart = useCallback(() => {
    cancelBuild();
    stateRef.current = emptyState();
    setIndex(-1);
    setPlaying(false);
    bumpState();
  }, [bumpState, cancelBuild]);

  const goToFinal = useCallback(async () => {
    const list = commitsRef.current;
    if (!list.length || buildingFinal) return;

    const target = list.length - 1;
    if (index === target) return;

    cancelBuild();
    buildCancelRef.current = false;
    setPlaying(false);
    setBuildingFinal(true);
    setBuildProgress(index < 0 ? 0 : (index + 1) / list.length);

    try {
      const built = await rebuildToCommitAsync(
        list,
        target,
        excludeRef.current,
        {
          onProgress: setBuildProgress,
          shouldCancel: () => buildCancelRef.current,
          yieldToMain,
        },
      );

      if (built && !buildCancelRef.current) {
        built.lastCommit = list[target];
        stateRef.current = built;
        setIndex(target);
        bumpState();
        onAdvanceListeners.current.forEach((cb) => cb(target, stateRef.current));
      }
    } finally {
      setBuildingFinal(false);
    }
  }, [index, buildingFinal, bumpState, cancelBuild]);

  useEffect(() => {
    if (!playing || buildingFinal) return;
    let raf;
    const tick = (now) => {
      const dur = SPEEDS[speed] ?? 1200;
      if (now - lastAdvanceRef.current >= dur) {
        const ok = stepForward();
        lastAdvanceRef.current = now;
        if (!ok) return;
      }
      raf = requestAnimationFrame(tick);
    };
    lastAdvanceRef.current = performance.now();
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, stepForward, buildingFinal]);

  const onAdvance = useCallback((cb) => {
    onAdvanceListeners.current.add(cb);
    return () => onAdvanceListeners.current.delete(cb);
  }, []);

  const atFinal = commits.length > 0 && index === commits.length - 1;

  return useMemo(() => ({
    commits,
    index,
    playing,
    speed,
    speeds: Object.keys(SPEEDS),
    state: stateRef.current,
    stateVersion,
    buildingFinal,
    buildProgress,
    atFinal,
    play,
    pause,
    toggle,
    seek,
    stepBackward,
    setSpeed,
    restart,
    goToFinal,
    onAdvance,
    progress: commits.length > 0 ? Math.max(0, (index + 1) / commits.length) : 0,
  }), [
    commits, index, playing, speed, stateVersion, buildingFinal, buildProgress, atFinal,
    play, pause, toggle, seek, stepBackward, restart, goToFinal, onAdvance,
  ]);
}
