/**
 * Drives playback over a commit list. Returns the current commit index,
 * playback controls, and a stable reference to graph state.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyCommit, cloneStateForCache, emptyState, rebuildToCommitAsync, revertCommit,
} from './graphState.js';

const SPEEDS = {
  '0.5x': 2200,
  '1x':   1200,
  '2x':   640,
  '4x':   320,
  '8x':   160,
};

const INCREMENTAL_SEEK_MAX = 40;
// Maximum number of timeline positions to keep in the in-memory seek cache.
// The cache is keyed by commit index and destroyed when the page closes.
const MAX_SEEK_CACHE = 50;

/** Stable fallback so effect deps do not change every render while dataset is loading. */
const EMPTY_LIST = Object.freeze([]);

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
  const commits = dataset?.commits ?? EMPTY_LIST;
  const excludePatterns = dataset?.exclude ?? EMPTY_LIST;
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
  const [seeking, setSeeking] = useState(false);
  const [seekProgress, setSeekProgress] = useState(0);
  const stateRef = useRef(emptyState());
  const lastAdvanceRef = useRef(0);
  const onAdvanceListeners = useRef(new Set());
  const buildCancelRef = useRef(false);
  const seekGenRef = useRef(0);
  // In-memory cache of graph states at previously-computed commit indices.
  // Allows seeking to already-visited timeline positions without a full rebuild.
  // Entries are never written to disk — automatically destroyed on page close.
  const snapshotCache = useRef(new Map());

  const bumpState = useCallback(() => setStateVersion((v) => v + 1), []);

  const cancelBuild = useCallback(() => {
    buildCancelRef.current = true;
  }, []);

  // Reset when dataset changes
  useEffect(() => {
    cancelBuild();
    seekGenRef.current++;
    stateRef.current = emptyState();
    snapshotCache.current.clear();
    setIndex(-1);
    setPlaying(false);
    setBuildingFinal(false);
    setBuildProgress(0);
    setSeeking(false);
    bumpState();
  }, [dataset?.repo, commits.length, dataset?.exclude, bumpState, cancelBuild]);

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

  const seek = useCallback(async (targetIdx) => {
    const list = commitsRef.current;
    const clamped = Math.max(-1, Math.min(list.length - 1, targetIdx));
    // Read from the mutable ref so double-fires (mousedown + mouseup both calling
    // seek before React re-renders) see the already-updated position and bail out
    // early, preventing double-application of commits on the sync path.
    const current = stateRef.current.commitIndex;

    if (clamped === current) return;

    const gen = ++seekGenRef.current; // invalidates any prior async seek
    cancelBuild();                     // cancels any goToFinal in progress

    const delta = clamped - current;

    // _revertFloor is the lowest commitIndex reachable via incremental revert on
    // this state object.  States built from a cache clone have a floor equal to
    // the cache point's commitIndex; states built from scratch have floor = -1.
    const revertFloor = stateRef.current._revertFloor ?? -1;

    if (delta > 0 && delta <= INCREMENTAL_SEEK_MAX) {
      // Small forward jump — apply directly on current state.
      for (let i = current + 1; i <= clamped; i++) {
        applyCommit(stateRef.current, list[i], i, excludeRef.current);
      }
      stateRef.current.lastCommit = clamped >= 0 ? list[clamped] : null;
      setIndex(clamped);
      bumpState();
      onAdvanceListeners.current.forEach((cb) => cb(clamped, stateRef.current));
    } else if (delta < 0 && -delta <= INCREMENTAL_SEEK_MAX && clamped >= revertFloor) {
      // Small backward revert — safe because undo records exist down to revertFloor.
      for (let i = current; i > clamped; i--) {
        revertCommit(stateRef.current, list[i], i, excludeRef.current);
      }
      stateRef.current.lastCommit = clamped >= 0 ? list[clamped] : null;
      setIndex(clamped);
      bumpState();
      onAdvanceListeners.current.forEach((cb) => cb(clamped, stateRef.current));
    } else {
      // Large jump, or backward jump that would cross the revert floor —
      // async chunked rebuild from the nearest cached checkpoint (if any).
      let cacheHit = null;
      for (const [idx, s] of snapshotCache.current) {
        if (idx <= clamped && (!cacheHit || idx > cacheHit.idx)) {
          cacheHit = { idx, state: s };
        }
      }
      const stepsFromCache = cacheHit ? clamped - cacheHit.idx : Infinity;
      const stepsFromScratch = clamped + 1; // rebuild commits 0..clamped
      const useCacheStart = cacheHit && stepsFromCache < stepsFromScratch;

      setSeeking(true);
      setSeekProgress(0);
      try {
        const built = await rebuildToCommitAsync(
          list,
          clamped,
          excludeRef.current,
          {
            startState: useCacheStart ? cacheHit.state : null,
            startIdx: useCacheStart ? cacheHit.idx : -1,
            onProgress: (p) => { if (seekGenRef.current === gen) setSeekProgress(p); },
            shouldCancel: () => seekGenRef.current !== gen,
            yieldToMain,
          },
        );
        if (built && seekGenRef.current === gen) {
          built.lastCommit = clamped >= 0 ? list[clamped] : null;
          stateRef.current = built;
          setIndex(clamped);
          bumpState();
          onAdvanceListeners.current.forEach((cb) => cb(clamped, stateRef.current));
          // Cache result so future seeks to this area are instant or near-instant.
          if (snapshotCache.current.size >= MAX_SEEK_CACHE) {
            snapshotCache.current.delete(snapshotCache.current.keys().next().value);
          }
          snapshotCache.current.set(clamped, cloneStateForCache(built));
        }
      } finally {
        if (seekGenRef.current === gen) setSeeking(false);
      }
    }
  }, [bumpState, cancelBuild]);

  const restart = useCallback(() => {
    cancelBuild();
    seekGenRef.current++;
    stateRef.current = emptyState();
    setIndex(-1);
    setPlaying(false);
    setSeeking(false);
    bumpState();
  }, [bumpState, cancelBuild]);

  const goToFinal = useCallback(async () => {
    const list = commitsRef.current;
    if (!list.length || buildingFinal) return;

    const target = list.length - 1;
    if (index === target) return;

    cancelBuild();
    seekGenRef.current++; // cancel any in-flight seek
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
        // Cache final state so scrubbing back to it later is instant.
        if (snapshotCache.current.size >= MAX_SEEK_CACHE) {
          snapshotCache.current.delete(snapshotCache.current.keys().next().value);
        }
        snapshotCache.current.set(target, cloneStateForCache(built));
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
    seeking,
    seekProgress,
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
    commits, index, playing, speed, stateVersion, buildingFinal, buildProgress, seeking, seekProgress, atFinal,
    play, pause, toggle, seek, stepBackward, restart, goToFinal, onAdvance,
  ]);
}
