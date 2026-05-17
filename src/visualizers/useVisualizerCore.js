/**
 * Shared scaffolding for canvas-based visualizers.
 *
 * Responsibilities:
 *   - Attach a canvas to a host <div>
 *   - Maintain DPR and resize the canvas with the window
 *   - Sync the layout simulation with the current graph state
 *   - Track active ripples derived from commit-index advances
 *   - Run a single RAF loop that calls the visualizer's draw function
 *
 * The visualizer just provides a `draw(ctx, frame)` function and optional
 * `clear` strategy ('full' or 'trail') and we handle the rest.
 */

import { useEffect, useRef } from 'react';
import { createLayout } from '../engine/layout.js';

export function useVisualizerCore({
  hostRef,
  state,
  commitIndex,
  draw,
  clearStrategy = 'full',
  trailAlpha = 0.12,
  background = '#05060d',
  onBeforeDraw,
}) {
  const canvasRef = useRef(null);
  const layoutRef = useRef(null);
  const ripplesRef = useRef([]);
  const lastCommitIdxRef = useRef(-1);
  const stateRef = useRef(state);
  const paramsRef = useRef({ draw, onBeforeDraw, clearStrategy, trailAlpha, background });
  paramsRef.current = { draw, onBeforeDraw, clearStrategy, trailAlpha, background };
  stateRef.current = state;

  // Set up the canvas + layout once
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    host.appendChild(canvas);
    canvasRef.current = canvas;

    const layout = createLayout({ width: host.clientWidth, height: host.clientHeight });
    layoutRef.current = layout;

    const ctx = canvas.getContext('2d', { alpha: true });

    let dpr = Math.min(2, window.devicePixelRatio || 1);
    function resize() {
      const w = host.clientWidth;
      const h = host.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layout.resize(w, h);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    let raf;
    let lastTime = performance.now();
    function frameLoop(now) {
      const dt = now - lastTime;
      lastTime = now;
      const w = host.clientWidth;
      const h = host.clientHeight;

      // ----- Background / clear -----
      const p = paramsRef.current;
      if (p.clearStrategy === 'trail') {
        // Fade the previous frame slightly so motion leaves a trail
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = p.background + Math.floor(p.trailAlpha * 255).toString(16).padStart(2, '0').slice(-2);
        // Build rgba string instead
        ctx.fillStyle = withAlpha(p.background, p.trailAlpha);
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = p.background;
        ctx.fillRect(0, 0, w, h);
      }

      // ----- Tick simulation -----
      layout.tick();

      // ----- Decay ripples -----
      const ripples = ripplesRef.current;
      const nowMs = now;
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        const age = nowMs - r.bornAt;
        if (age > r.ttl) {
          ripples.splice(i, 1);
        } else {
          r.progress = age / r.ttl;
        }
      }

      // ----- Optional pre-frame hook -----
      if (p.onBeforeDraw) p.onBeforeDraw(ctx, { w, h, dt, now });

      // ----- Visualizer-specific draw -----
      p.draw(ctx, {
        w, h, dt, now,
        nodes: layout.getNodes(),
        links: layout.getLinks(),
        clusters: layout.getClusterCenters(),
        ripples,
        state: stateRef.current,
      });

      raf = requestAnimationFrame(frameLoop);
    }
    raf = requestAnimationFrame(frameLoop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      layout.stop();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync layout when state changes (commit advance)
  useEffect(() => {
    if (!layoutRef.current || !state) return;
    layoutRef.current.sync(state);
  }, [state, commitIndex]);

  // Track commit transitions to push ripples
  useEffect(() => {
    if (commitIndex === lastCommitIdxRef.current) return;
    if (commitIndex >= 0 && state && state.lastCommit && commitIndex > lastCommitIdxRef.current) {
      // Push a ripple per touched file
      const now = performance.now();
      for (const ch of state.lastCommit.changes) {
        ripplesRef.current.push({
          path: ch.path,
          intensity: Math.min(1, ((ch.added || 0) + (ch.removed || 0)) / 80),
          status: ch.status || 'M',
          bornAt: now,
          ttl: 2400,
          progress: 0,
        });
      }
    }
    lastCommitIdxRef.current = commitIndex;
  }, [commitIndex, state]);

  return { canvasRef, layoutRef };
}

function withAlpha(hexOrRgb, alpha) {
  if (hexOrRgb.startsWith('#')) {
    const h = hexOrRgb.slice(1);
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hexOrRgb;
}
