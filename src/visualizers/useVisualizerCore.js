/**
 * Shared scaffolding for canvas-based visualizers.
 */

import { useEffect, useRef } from 'react';
import { createLayout } from '../engine/layout.js';
import {
  createCamera,
  applyCameraTransform,
  zoomAt,
  resetCamera,
  fitBounds,
  lerpCamera,
  snapCamera,
} from '../engine/camera.js';
import { attachCanvasGestures } from '../engine/canvasGestures.js';
import { isNodeVisible, nodeOpacity } from '../engine/visibility.js';
import { getDepsForPath, resolveFocusSet } from '../engine/graphState.js';
import { drawRecordingOverlay } from '../engine/recordingOverlay.js';

export function useVisualizerCore({
  hostRef,
  state,
  commitIndex,
  draw,
  clearStrategy = 'full',
  trailAlpha = 0.12,
  background = '#05060d',
  onBeforeDraw,
  onScreenDraw,
  onScreenOverlay,
  autoFit = true,
  selectedPath = null,
  selectedCluster = null,
  excludePatterns = [],
  onNodeClick,
  cameraApiRef,
  recordingOverlay = null,
}) {
  const canvasRef = useRef(null);
  const layoutRef = useRef(null);
  const cameraRef = useRef(createCamera());
  const ripplesRef = useRef([]);
  const lastCommitIdxRef = useRef(-1);
  const stateRef = useRef(state);
  const paramsRef = useRef({
    draw, onBeforeDraw, onScreenDraw, onScreenOverlay, clearStrategy, trailAlpha, background,
    autoFit, selectedPath, selectedCluster, excludePatterns, onNodeClick, commitIndex,
    recordingOverlay,
  });
  paramsRef.current = {
    draw, onBeforeDraw, onScreenDraw, onScreenOverlay, clearStrategy, trailAlpha, background,
    autoFit, selectedPath, selectedCluster, excludePatterns, onNodeClick, commitIndex,
    recordingOverlay,
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
    host.style.touchAction = 'none';
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

    const detachGestures = attachCanvasGestures(canvas, {
      getCamera: () => cameraRef.current,
      getLayout: () => layoutRef.current,
      getCommitIndex: () => paramsRef.current.commitIndex,
      onNodeClick: (path) => paramsRef.current.onNodeClick?.(path),
    });

    const onPointerDownCursor = () => { canvas.style.cursor = 'grabbing'; };
    const onPointerUpCursor = () => { canvas.style.cursor = 'grab'; };
    canvas.addEventListener('pointerdown', onPointerDownCursor);
    canvas.addEventListener('pointerup', onPointerUpCursor);
    canvas.addEventListener('pointercancel', onPointerUpCursor);

    let raf;
    let lastTime = performance.now();
    function frameLoop(now) {
      const dt = now - lastTime;
      lastTime = now;
      const w = host.clientWidth;
      const h = host.clientHeight;
      const p = paramsRef.current;
      const cam = cameraRef.current;

      const hasFocus = !!(p.selectedPath || p.selectedCluster);
      const focusKey = `${p.selectedPath ?? ''}|${p.selectedCluster ?? ''}|${p.commitIndex}`;

      if (p.autoFit && !cam.userAdjusted) {
        const allPts = layout.getNodes().filter((n) => isNodeVisible(n, p.commitIndex));
        let fitPts = allPts;
        if (hasFocus && stateRef.current) {
          const focusSet = resolveFocusSet(
            stateRef.current,
            p.commitIndex,
            p.selectedPath,
            p.selectedCluster,
            p.excludePatterns,
          );
          if (focusSet.size > 0) {
            fitPts = allPts.filter((n) => focusSet.has(n.path));
          }
        }
        if (fitPts.length > 0) {
          const refit = !hasFocus || focusKey !== cam._focusFitKey;
          if (refit) {
            fitBounds(cam, fitPts, w, h);
            if (!hasFocus) {
              if (!cam._fitted) snapCamera(cam);
              cam._fitted = true;
            } else {
              snapCamera(cam);
              cam._focusFitKey = focusKey;
            }
          }
        }
      } else if (!hasFocus) {
        cam._focusFitKey = null;
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

      if (p.onScreenDraw) p.onScreenDraw(ctx, { w, h, dt, now });

      if (!hasFocus && layout.getAlpha() > 0.0008) layout.tick();

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

      const focusSet = resolveFocusSet(
        stateRef.current,
        idx,
        p.selectedPath,
        p.selectedCluster,
        p.excludePatterns,
      );

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
        selectedCluster: p.selectedCluster,
        focusSet,
        nodeOpacity: (n) => nodeOpacity(n, idx),
        dimOthers: focusSet.size > 0,
        cameraScale: cam.scale,
        excludePatterns: p.excludePatterns,
      });

      ctx.restore();

      if (p.onScreenOverlay) p.onScreenOverlay(ctx, { w, h, dt, now });

      if (p.recordingOverlay) {
        drawRecordingOverlay(ctx, { w, h, dpr }, p.recordingOverlay, p.background);
      }

      raf = requestAnimationFrame(frameLoop);
    }
    raf = requestAnimationFrame(frameLoop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      layout.stop();
      detachGestures();
      canvas.removeEventListener('pointerdown', onPointerDownCursor);
      canvas.removeEventListener('pointerup', onPointerUpCursor);
      canvas.removeEventListener('pointercancel', onPointerUpCursor);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, []);

  useEffect(() => {
    if (!layoutRef.current || !state) return;
    layoutRef.current.sync(state, commitIndex, {
      forceRestart: commitIndex === 0,
      excludePatterns,
    });
  }, [state, commitIndex, excludePatterns]);

  useEffect(() => {
    if (commitIndex === lastCommitIdxRef.current) return;
    if (paramsRef.current.selectedPath || paramsRef.current.selectedCluster) return;
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
