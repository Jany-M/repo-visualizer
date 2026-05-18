import React, { useMemo, useRef } from 'react';
import { useVisualizerCore } from './useVisualizerCore.js';
import { clusterColorFor } from '../engine/colors.js';
import {
  applyNodeAlpha, drawClusterLabels, drawHighlightLinks, drawInspectNodeLabels,
  drawSelectionRing, linkAlpha,
  nodeDrawRadius, safeRadius, shouldDrawRipple, shouldGlow,
} from './drawHelpers.js';

/**
 * Organic / Bioluminescent visualizer.
 *
 * Aqueous depth, cells that breathe in slow rhythms, soft sonar ripples
 * radiating outward, and connective tissue between feature areas.
 */
export default function OrganicVisualizer({
  state, commitIndex, palette, autoFit, selectedPath, selectedCluster,
  excludePatterns, onNodeClick, cameraApiRef, recordingOverlay,
}) {
  const hostRef = useRef(null);

  // Caustic-like background blobs that drift slowly
  const caustics = useMemo(() => [
    { x: 0.2, y: 0.3, r: 320, color: 'rgba(80, 200, 200, 0.035)' },
    { x: 0.78, y: 0.35, r: 380, color: 'rgba(120, 220, 180, 0.03)' },
    { x: 0.5, y: 0.7, r: 420, color: 'rgba(140, 90, 220, 0.025)' },
  ], []);

  useVisualizerCore({
    hostRef, state, commitIndex, autoFit, selectedPath, selectedCluster,
    excludePatterns, onNodeClick, cameraApiRef, recordingOverlay,
    clearStrategy: 'trail',
    trailAlpha: 0.38,
    background: '#020a10',
    draw: (ctx, frame) => drawOrganic(ctx, frame, { caustics, palette }),
  });

  return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />;
}

function drawOrganic(ctx, frame, { caustics, palette }) {
  const { w, h, now, nodes, links, ripples } = frame;

  // -------- 1. Caustic underwater glow (soft; trail fades avoid blow-out) --------
  ctx.globalCompositeOperation = 'source-over';
  for (const c of caustics) {
    const cx = c.x * w + Math.sin(now * 0.00005 + c.x * 10) * 60;
    const cy = c.y * h + Math.cos(now * 0.00006 + c.y * 10) * 60;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, c.r);
    grad.addColorStop(0, c.color);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // -------- 2. Connective filaments --------
  ctx.globalCompositeOperation = 'source-over';
  for (const link of links) {
    const a = link.source, b = link.target;
    if (!a || !b) continue;
    const la = linkAlpha(frame, a.path, b.path);
    const c = clusterColorFor(palette, a.dir, 'organic');
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const norm = Math.hypot(dx, dy);
    if (norm < 1) continue;
    const offset = norm * 0.12 * Math.sin(now * 0.0008 + a.x * 0.01);
    const cpx = (a.x + b.x) / 2 - (dy / norm) * offset;
    const cpy = (a.y + b.y) / 2 + (dx / norm) * offset;

    ctx.globalAlpha = 0.55 * la;
    ctx.strokeStyle = c.edge;
    ctx.lineWidth = 0.7 + Math.min(1.8, link.weight * 0.4);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(cpx, cpy, b.x, b.y);
    ctx.stroke();

    // Light particle traveling along the filament
    const t = (now * 0.0006 + a.x * 0.002) % 1;
    const px = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * cpx + t * t * b.x;
    const py = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * cpy + t * t * b.y;
    ctx.globalAlpha = 0.35 * la;
    const pGrad = ctx.createRadialGradient(px, py, 0, px, py, 4);
    pGrad.addColorStop(0, c.ripple);
    pGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = pGrad;
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // -------- 3. Cell halos (breathing) --------
  ctx.globalCompositeOperation = 'screen';
  for (const n of nodes) {
    if (!shouldGlow(n, frame)) continue;
    const nodeA = applyNodeAlpha(ctx, n, frame);
    const c = clusterColorFor(palette, n.dir, 'organic');
    const breathe = 0.85 + 0.15 * Math.sin(now * 0.0012 + n.x * 0.013 + n.y * 0.011);
    const r = safeRadius(nodeDrawRadius(n, frame) * breathe, 0.5);
    const haloR = safeRadius(r * 3.2, r);

    ctx.globalAlpha = nodeA * 0.55;
    const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, haloR);
    grad.addColorStop(0, c.glow);
    grad.addColorStop(0.55, c.glowFar);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(n.x, n.y, haloR, 0, Math.PI * 2);
    ctx.fill();
  }

  // -------- 4. Cell cores --------
  ctx.globalCompositeOperation = 'source-over';
  for (const n of nodes) {
    const nodeA = applyNodeAlpha(ctx, n, frame);
    const c = clusterColorFor(palette, n.dir, 'organic');
    const breathe = 0.9 + 0.1 * Math.sin(now * 0.0012 + n.x * 0.013);
    const r = safeRadius(nodeDrawRadius(n, frame) * breathe, 0.5);

    ctx.globalAlpha = nodeA;
    const core = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r);
    core.addColorStop(0, 'rgba(230, 248, 242, 0.75)');
    core.addColorStop(0.5, c.core);
    core.addColorStop(1, c.glow);
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fill();
    drawSelectionRing(ctx, n, frame, 'rgba(200, 255, 240, 0.9)');
  }

  drawHighlightLinks(ctx, frame, palette, 'organic', clusterColorFor);

  // -------- 5. Organic ripples (sonar waves) --------
  ctx.globalCompositeOperation = 'screen';
  const nodeByPath = new Map(nodes.map((n) => [n.path, n]));
  for (const ripple of ripples) {
    if (!shouldDrawRipple(ripple.path, frame)) continue;
    const n = nodeByPath.get(ripple.path);
    if (!n) continue;
    const t = Math.max(0, Math.min(1, ripple.progress ?? 0));
    const easeOut = 1 - Math.pow(1 - t, 3);
    const maxR = 60 + 140 * (ripple.intensity ?? 0);
    const c = clusterColorFor(palette, n.dir, 'organic');

    // Three concentric expanding waves at different phases
    for (let k = 0; k < 3; k++) {
      const phase = (easeOut + k * 0.18) % 1;
      const r = safeRadius(phase * maxR, 0);
      const alpha = (1 - phase) * (1 - t) * 0.38;
      if (alpha <= 0 || r < 0.5) continue;
      ctx.strokeStyle = c.ripple.replace(/,[\d.]+\)$/, `,${alpha.toFixed(3)})`);
      ctx.lineWidth = 1.4 + 1.5 * (1 - phase);
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Initial bloom
    if (t < 0.25) {
      const fa = (1 - t / 0.25);
      const fr = safeRadius(nodeDrawRadius(n, frame) * 4 * (1 + 0.5 * (1 - t / 0.25)), 0.5);
      const fg = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, fr);
      fg.addColorStop(0, `rgba(220, 255, 240, ${fa * 0.35})`);
      fg.addColorStop(0.4, c.ripple);
      fg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(n.x, n.y, fr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawClusterLabels(ctx, frame, palette, 'organic', clusterColorFor);
  drawInspectNodeLabels(ctx, frame, palette, 'organic', clusterColorFor);

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
