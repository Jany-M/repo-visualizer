import React, { useRef } from 'react';
import { useVisualizerCore } from './useVisualizerCore.js';
import { clusterColorFor } from '../engine/colors.js';
import {
  applyNodeAlpha, drawClusterLabels, drawHighlightLinks, drawInspectNodeLabels,
  drawSelectionRing, linkAlpha,
  nodeDrawRadius, safeRadius, shouldDrawRipple, shouldGlow,
} from './drawHelpers.js';

/**
 * Minimal / Editorial visualizer.
 *
 * Cream paper background, restrained ink palette, hairline strokes, fine
 * typography labels on the largest nodes. Reads like a New York Times
 * Upshot piece — quiet, considered, information-dense.
 */
export default function MinimalVisualizer({
  state, commitIndex, palette, autoFit, selectedPath, selectedCluster,
  excludePatterns, onNodeClick, cameraApiRef, recordingOverlay,
}) {
  const hostRef = useRef(null);

  useVisualizerCore({
    hostRef, state, commitIndex, autoFit, selectedPath, selectedCluster,
    excludePatterns, onNodeClick, cameraApiRef, recordingOverlay,
    clearStrategy: 'full',
    background: '#f7f5f0',
    draw: (ctx, frame) => drawMinimal(ctx, frame, { palette }),
  });

  return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />;
}

function drawMinimal(ctx, frame, { palette }) {
  const { w, h, nodes, links, ripples, clusters } = frame;

  // -------- 1. Subtle baseline grid --------
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(15, 17, 22, 0.04)';
  ctx.lineWidth = 1;
  const step = 64;
  ctx.beginPath();
  for (let y = step; y < h; y += step) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
  }
  ctx.stroke();

  // -------- 2. Cluster boundary disks (very faint) --------
  for (const [name, center] of clusters) {
    ctx.beginPath();
    ctx.arc(center.x, center.y, 100, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(15, 17, 22, 0.06)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // -------- 3. Edges as hairlines --------
  for (const link of links) {
    const a = link.source, b = link.target;
    if (!a || !b) continue;
    const la = linkAlpha(frame, a.path, b.path);
    ctx.globalAlpha = la;
    ctx.strokeStyle = la > 0.5 ? 'rgba(15, 17, 22, 0.28)' : 'rgba(15, 17, 22, 0.06)';
    ctx.lineWidth = 0.6 + Math.min(1.2, link.weight * 0.25);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // -------- 4. Nodes as ink dots --------
  for (const n of nodes) {
    applyNodeAlpha(ctx, n, frame);
    const c = clusterColorFor(palette, n.dir, 'minimal');
    if (shouldGlow(n, frame)) {
      drawSelectionRing(ctx, n, frame, c.core);
    }
    ctx.fillStyle = c.core;
    const nr = safeRadius(nodeDrawRadius(n, frame) * 0.55, 0.5);
    ctx.beginPath();
    ctx.arc(n.x, n.y, nr, 0, Math.PI * 2);
    ctx.fill();

    // Thin outer outline for the largest nodes for emphasis
    if (n.r > 18) {
      ctx.strokeStyle = c.core;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(n.x, n.y, nr + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawHighlightLinks(ctx, frame, palette, 'minimal', clusterColorFor);

  // -------- 5. Concentric ring ripples (no glow) --------
  const nodeByPath = new Map(nodes.map((n) => [n.path, n]));
  for (const ripple of ripples) {
    if (!shouldDrawRipple(ripple.path, frame)) continue;
    const n = nodeByPath.get(ripple.path);
    if (!n) continue;
    const t = Math.max(0, Math.min(1, ripple.progress ?? 0));
    const easeOut = 1 - Math.pow(1 - t, 3);
    const maxR = 60 + 100 * (ripple.intensity ?? 0);
    const c = clusterColorFor(palette, n.dir, 'minimal');

    for (let k = 0; k < 3; k++) {
      const phase = Math.min(1, easeOut + k * 0.18);
      const r = safeRadius(phase * maxR, 0);
      const alpha = (1 - t) * 0.5 * (1 - phase);
      if (alpha <= 0 || r < 0.5) continue;
      ctx.strokeStyle = c.core.replace(/0\.92\)$/, `${alpha.toFixed(3)})`);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawClusterLabels(ctx, frame, palette, 'minimal', clusterColorFor);
  drawInspectNodeLabels(ctx, frame, palette, 'minimal', clusterColorFor);

  ctx.globalCompositeOperation = 'source-over';
}
