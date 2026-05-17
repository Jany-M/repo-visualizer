/**
 * Shared scaffolding for canvas-based visualizers.
 */

import { useEffect, useRef } from 'react';
import { createLayout } from '../engine/layout.js';
import {
  createCamera,
  applyCameraTransform,
  screenToWorld,
  zoomAt,
  panBy,
  resetCamera,
  fitBounds,
  lerpCamera,
  snapCamera,
} from '../engine/camera.js';
import { isNodeVisible, nodeOpacity } from '../engine/visibility.js';
import { getDepsForPath, getNeighborSet } from '../engine/graphState.js';

export function useVisualizerCore({
  hostRef,
  state,
  commitIndex,
  draw,
  clearStrategy = 'full',
  trailAlpha = 0.12,
  background = '#05060d',
  onBeforeDraw,
  autoFit = true,
  selectedPath = null,
  onNodeClick,
  branchLanes = null,
  cameraApiRef,
}) {
  const canvasRef = useRef(null);
  const layoutRef = useRef(null);
  const cameraRef = useRef(createCamera());
  const ripplesRef = useRef([]);
  const lastCommitIdxRef = useRef(-1);
  const stateRef = useRef(state);
  const dragRef = useRef(null);
  const paramsRef = useRef({
    draw, onBeforeDraw, clearStrategy, trailAlpha, background,
    autoFit, selectedPath, onNodeClick, commitIndex, branchLanes,
  });
  paramsRef.current = {
    draw, onBeforeDraw, clearStrategy, trailAlpha, background,
    autoFit, selectedPath, onNodeClick, commitIndex, branchLanes,
  };
  stateRef.current = state;

  if (cameraApiRef) {
    cameraApiRef.current = {
      zoomIn: () => {
        const host = hostRef.current;
        if (!host) return;
        zoomAt(cameraRef.current, host.clientWidth / 2, host.clientHeight / 2, 1.2);
      },
      zoomOut: () => {
        const host = hostRef.current;
        if (!host) return;
        zoomAt(cameraRef.current, host.clientWidth / 2, host.clientHeight / 2, 1 / 1.2);
      },
      reset: () => {
        const host = hostRef.current;
        const layout = layoutRef.current;
        if (!host || !layout) return;
        const cam = cameraRef.current;
        const w = host.clientWidth;
        const h = host.clientHeight;
        resetCamera(cam, w, h);
        const idx = paramsRef.current.commitIndex;
        const pts = layout.getNodes().filter((n) => isNodeVisible(n, idx));
        fitBounds(cam, pts, w, h);
        snapCamera(cam);
      },
    };
  }

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.cursor = 'grab';
    host.appendChild(canvas);
    canvasRef.current = canvas;

    const layout = createLayout({ width: host.clientWidth, height: host.clientHeight });
    layoutRef.current = layout;

    const ctx = canvas.getContext('2d', { alpha: true });
    let dpr = Math.min(2, window.devicePixelRatio || 1);

    function resize() {
      const w = host.clientWidth;
      const h = host.clientHeight;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      layout.resize(w, h);
      const cam = cameraRef.current;
      if (paramsRef.current.autoFit && !cam.userAdjusted) {
        const idx = paramsRef.current.commitIndex;
        const pts = layout.getNodes().filter((n) => isNodeVisible(n, idx));
        fitBounds(cam, pts, w, h);
        snapCamera(cam);
      }
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const onWheel = (ev) => {
      ev.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = ev.clientX - rect.left;
      const sy = ev.clientY - rect.top;
      const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomAt(cameraRef.current, sx, sy, factor);
    };

    const onPointerDown = (ev) => {
      if (ev.button !== 0) return;
      dragRef.current = { x: ev.clientX, y: ev.clientY, panning: true };
      canvas.style.cursor = 'grabbing';
    };

    const onPointerMove = (ev) => {
      if (!dragRef.current?.panning) return;
      const dx = ev.clientX - dragRef.current.x;
      const dy = ev.clientY - dragRef.current.y;
      dragRef.current.x = ev.clientX;
      dragRef.current.y = ev.clientY;
      panBy(cameraRef.current, dx, dy);
    };

    const onPointerUp = (ev) => {
      if (!dragRef.current) return;
      const moved = Math.hypot(ev.clientX - dragRef.current.x, ev.clientY - dragRef.current.y);
      if (dragRef.current.panning && moved < 4 && paramsRef.current.onNodeClick) {
        const rect = canvas.getBoundingClientRect();
        const sx = ev.clientX - rect.left;
        const sy = ev.clientY - rect.top;
        const world = screenToWorld(cameraRef.current, sx, sy);
        const nodes = layout.getNodes();
        const idx = paramsRef.current.commitIndex;
        let best = null;
        let bestD = Infinity;
        for (const n of nodes) {
          if (!isNodeVisible(n, idx)) continue;
          const d = Math.hypot(n.x - world.x, n.y - world.y);
          const hit = n.r + 6 / cameraRef.current.scale;
          if (d < hit && d < bestD) {
            bestD = d;
            best = n.path;
          }
        }
        paramsRef.current.onNodeClick(best);
      }
      dragRef.current = null;
      canvas.style.cursor = 'grab';
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    let raf;
    let lastTime = performance.now();
    function frameLoop(now) {
      const dt = now - lastTime;
      lastTime = now;
      const w = host.clientWidth;
      const h = host.clientHeight;
      const p = paramsRef.current;
      const cam = cameraRef.current;

      if (p.autoFit && !cam.userAdjusted) {
        const pts = layout.getNodes().filter((n) => isNodeVisible(n, p.commitIndex));
        fitBounds(cam, pts, w, h);
        if (pts.length > 0 && !cam._fitted) {
          snapCamera(cam);
          cam._fitted = true;
        }
      }
      lerpCamera(cam, dt);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (p.clearStrategy === 'trail') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = withAlpha(p.background, p.trailAlpha);
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = p.background;
        ctx.fillRect(0, 0, w, h);
      }

      layout.tick();

      const ripples = ripplesRef.current;
      const nowMs = now;
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        const age = nowMs - r.bornAt;
        if (age > r.ttl) ripples.splice(i, 1);
        else r.progress = Math.max(0, Math.min(1, age / r.ttl));
      }

      ctx.save();
      applyCameraTransform(ctx, cam, dpr);

      if (p.onBeforeDraw) p.onBeforeDraw(ctx, { w, h, dt, now });

      const allNodes = layout.getNodes();
      const allLinks = layout.getLinks();
      const idx = p.commitIndex;
      const nodes = allNodes.filter((n) => isNodeVisible(n, idx));
      const nodeSet = new Set(nodes.map((n) => n.path));
      const links = allLinks.filter(
        (l) => nodeSet.has(l.source.path) && nodeSet.has(l.target.path),
      );

      const neighborSet = p.selectedPath
        ? getNeighborSet(stateRef.current, p.selectedPath)
        : new Set();

      const pathToNode = new Map(nodes.map((n) => [n.path, n]));
      const highlightLinks = [];
      if (p.selectedPath && stateRef.current) {
        const { inbound, outbound } = getDepsForPath(stateRef.current, p.selectedPath);
        for (const e of [...outbound, ...inbound]) {
          const from = pathToNode.get(e.from);
          const to = pathToNode.get(e.to);
          if (from && to) highlightLinks.push({ source: from, target: to, weight: e.weight });
        }
      }

      p.draw(ctx, {
        w, h, dt, now,
        nodes,
        links,
        highlightLinks,
        clusters: layout.getClusterCenters(),
        ripples,
        state: stateRef.current,
        commitIndex: idx,
        selectedPath: p.selectedPath,
        neighborSet,
        nodeOpacity: (n) => nodeOpacity(n, idx),
        dimOthers: !!p.selectedPath,
      });

      ctx.restore();
      raf = requestAnimationFrame(frameLoop);
    }
    raf = requestAnimationFrame(frameLoop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      layout.stop();
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, []);

  useEffect(() => {
    if (!layoutRef.current || !state) return;
    layoutRef.current.sync(state, commitIndex, {
      branchLanes,
      forceRestart: commitIndex === 0,
    });
  }, [state, commitIndex, branchLanes]);

  useEffect(() => {
    if (commitIndex === lastCommitIdxRef.current) return;
    if (paramsRef.current.selectedPath) return;
    if (commitIndex >= 0 && state?.lastCommit && commitIndex > lastCommitIdxRef.current) {
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
      const host = hostRef.current;
      if (host && paramsRef.current.autoFit) {
        const cam = cameraRef.current;
        cam.userAdjusted = false;
        cam._fitted = false;
      }
    }
    lastCommitIdxRef.current = commitIndex;
  }, [commitIndex, state, hostRef]);

  return { canvasRef, layoutRef, cameraRef };
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
