import React, { useEffect, useMemo, useRef } from 'react';
import { useVisualizerCore } from './useVisualizerCore.js';
import { clusterColorFor } from '../engine/colors.js';
import { nodeBirthGlow } from '../engine/visibility.js';
import {
  applyNodeAlpha, drawClusterLabels, drawHighlightLinks, drawInspectNodeLabels,
  drawSelectionRing, linkAlpha,
  nodeDrawRadius, safeRadius, shouldDrawRipple,
} from './drawHelpers.js';

/**
 * Galaxy / Cosmic visualizer.
 *
 * Deep space background, soft nebula gradients, additive-blended glowing
 * star-nodes, luminous orbital connection lines, and supernova-style ripples
 * radiating from each commit's touched files.
 */
export default function GalaxyVisualizer({
  state,
  commitIndex,
  palette,
  autoFit,
  selectedPath,
  selectedCluster,
  excludePatterns,
  onNodeClick,
  cameraApiRef,
  recordingOverlay,
}) {
  const hostRef = useRef(null);

  // Pre-generate a deterministic starfield once. The same stars persist
  // across all frames so the background drifts slowly without churn.
  const stars = useMemo(() => {
    const arr = [];
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xFFFFFFFF;
    };
    for (let i = 0; i < 380; i++) {
      arr.push({
        x: rand(),
        y: rand(),
        z: 0.2 + rand() * 0.8,
        r: 0.4 + rand() * 1.4,
        twinkle: rand() * Math.PI * 2,
      });
    }
    return arr;
  }, []);

  // Nebula color spots — large, soft, slowly drifting blobs
  const nebulae = useMemo(() => [
    { x: 0.18, y: 0.32, r: 380, color: 'rgba(140, 90, 220, 0.10)' },
    { x: 0.82, y: 0.22, r: 420, color: 'rgba(60, 110, 220, 0.10)' },
    { x: 0.62, y: 0.78, r: 460, color: 'rgba(220, 90, 160, 0.08)' },
    { x: 0.32, y: 0.85, r: 400, color: 'rgba(90, 220, 180, 0.07)' },
  ], []);

  useVisualizerCore({
    hostRef,
    state,
    commitIndex,
    clearStrategy: 'full',
    background: '#03040a',
    autoFit,
    selectedPath,
    selectedCluster,
    excludePatterns,
    onNodeClick,
    cameraApiRef,
    recordingOverlay,
    onScreenDraw: (ctx, meta) => drawGalaxyScreen(ctx, meta, { stars, nebulae }),
    onScreenOverlay: (ctx, meta) => drawGalaxyVignette(ctx, meta),
    draw: (ctx, frame) => drawGalaxy(ctx, frame, { palette }),
  });

  return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />;
}

/** Nebula + stars in screen space (behind pan/zoom). */
function drawGalaxyScreen(ctx, { w, h, now }, { stars, nebulae }) {
  ctx.globalCompositeOperation = 'screen';
  for (const n of nebulae) {
    const cx = n.x * w + Math.sin(now * 0.00002 + n.x * 8) * 24;
    const cy = n.y * h + Math.cos(now * 0.00002 + n.y * 8) * 24;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, n.r);
    grad.addColorStop(0, n.color);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  ctx.globalCompositeOperation = 'lighter';
  for (const s of stars) {
    const drift = (now * 0.00001 * s.z) % 1;
    const sx = ((s.x + drift) % 1) * w;
    const sy = s.y * h;
    const twinkle = 0.55 + 0.45 * Math.sin(now * 0.001 + s.twinkle);
    const alpha = (0.25 + 0.5 * s.z) * twinkle;
    ctx.fillStyle = `rgba(${200 + Math.floor(s.z * 55)}, ${210 + Math.floor(s.z * 35)}, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(sx, sy, safeRadius(s.r * s.z, 0.1), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

/** Edge vignette in screen space (covers full viewport). */
function drawGalaxyVignette(ctx, { w, h }) {
  ctx.globalCompositeOperation = 'multiply';
  const vignette = ctx.createRadialGradient(
    w / 2, h / 2, Math.min(w, h) * 0.3,
    w / 2, h / 2, Math.max(w, h) * 0.7,
  );
  vignette.addColorStop(0, 'rgba(255, 255, 255, 1)');
  vignette.addColorStop(1, 'rgba(40, 45, 80, 1)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
}

function drawGalaxy(ctx, frame, { palette }) {
  const { nodes, links, ripples, now } = frame;

  // -------- Edge connections (glowing arcs) --------
  ctx.globalCompositeOperation = 'lighter';
  for (const link of links) {
    const a = link.source;
    const b = link.target;
    if (!a || !b) continue;
    const la = linkAlpha(frame, a.path, b.path);
    if (la < 0.05) continue;
    const cA = clusterColorFor(palette, a.dir, 'galaxy');
    const cB = clusterColorFor(palette, b.dir, 'galaxy');
    const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    grad.addColorStop(0, cA.edge);
    grad.addColorStop(1, cB.edge);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 0.6 + Math.min(2.2, link.weight * 0.6);
    ctx.globalAlpha = 0.8 * la;
    // Slightly curved line for arc feel
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const norm = Math.hypot(dx, dy);
    const offset = norm * 0.08;
    const cpx = mx - (dy / norm) * offset;
    const cpy = my + (dx / norm) * offset;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(cpx, cpy, b.x, b.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const idx = frame.commitIndex ?? 0;
  for (const n of nodes) {
    drawGalaxyStarNode(ctx, n, frame, palette, idx, now);
  }

  drawHighlightLinks(ctx, frame, palette, 'galaxy', clusterColorFor);

  // -------- Ripple shockwaves --------
  ctx.globalCompositeOperation = 'lighter';
  const nodeByPath = new Map(nodes.map((n) => [n.path, n]));
  for (const ripple of ripples) {
    if (!shouldDrawRipple(ripple.path, frame)) continue;
    const n = nodeByPath.get(ripple.path);
    if (!n) continue;
    const t = Math.max(0, Math.min(1, ripple.progress ?? 0));
    const ease = 1 - Math.pow(1 - t, 2);
    const maxR = 50 + 120 * (ripple.intensity ?? 0);
    const r = safeRadius(ease * maxR, 0);
    if (r < 0.5) continue;
    const alpha = Math.max(0, (1 - t) * (0.6 + 0.4 * (ripple.intensity ?? 0)));
    const c = clusterColorFor(palette, n.dir, 'galaxy');

    // Outer wave
    ctx.strokeStyle = c.ripple.replace(/,[\d.]+\)$/, `,${alpha.toFixed(3)})`);
    ctx.lineWidth = 1.6 + 2 * (1 - t);
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.stroke();

    // Inner bright wave
    if (r > 5) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${(1 - t) * 0.5})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r * 0.65, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Brief flash sprite on the node itself for the first 20% of the ripple
    if (t < 0.2) {
      const flashAlpha = (1 - t / 0.2);
      const flashR = safeRadius(nodeDrawRadius(n, frame) * (1.8 + (1 - t) * 1.2), 0.5);
      const flashGrad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, flashR);
      flashGrad.addColorStop(0, `rgba(255, 255, 255, ${flashAlpha * 0.85})`);
      flashGrad.addColorStop(0.4, c.ripple);
      flashGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = flashGrad;
      ctx.beginPath();
      ctx.arc(n.x, n.y, flashR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalCompositeOperation = 'source-over';
  drawClusterLabels(ctx, frame, palette, 'galaxy', clusterColorFor);
  drawInspectNodeLabels(ctx, frame, palette, 'galaxy', clusterColorFor);
}

/**
 * Star / planet node: wide transparent corona, optional tinted disk, hot pinpoint core.
 */
function drawGalaxyStarNode(ctx, n, frame, palette, commitIndex, now) {
  const nodeA = applyNodeAlpha(ctx, n, frame);
  if (nodeA < 0.02) return;

  const c = clusterColorFor(palette, n.dir, 'galaxy');
  const baseR = nodeDrawRadius(n, frame);
  const birth = nodeBirthGlow(n, commitIndex);
  const twinkle = 0.9 + 0.1 * Math.sin(now * 0.0018 + n.x * 0.04 + n.y * 0.035);
  const isPlanet = baseR >= 7;

  ctx.globalCompositeOperation = 'lighter';

  // Transparent atmospheric corona (always present; stronger on birth).
  // Cap in screen space so the glow doesn't dominate when zoomed in.
  const cameraScale = frame.cameraScale ?? 1;
  const rawCorona = baseR * (5.5 + birth * 3);
  const coronaR = safeRadius(Math.min(rawCorona, 40 / cameraScale), baseR * 0.5);
  ctx.globalAlpha = nodeA * (0.07 + birth * 0.14) * twinkle;
  const corona = ctx.createRadialGradient(n.x, n.y, baseR * 0.15, n.x, n.y, coronaR);
  corona.addColorStop(0, 'rgba(0, 0, 0, 0)');
  corona.addColorStop(0.25, c.glowFar);
  corona.addColorStop(0.55, c.glow);
  corona.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = corona;
  ctx.beginPath();
  ctx.arc(n.x, n.y, coronaR, 0, Math.PI * 2);
  ctx.fill();

  // Larger files read as planets: soft colored sphere behind the stellar core
  if (isPlanet) {
    const diskR = safeRadius(baseR * 0.95, baseR * 0.5);
    ctx.globalAlpha = nodeA * 0.38 * twinkle;
    const disk = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, diskR);
    disk.addColorStop(0, c.disk);
    disk.addColorStop(0.65, c.glow);
    disk.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = disk;
    ctx.beginPath();
    ctx.arc(n.x, n.y, diskR, 0, Math.PI * 2);
    ctx.fill();
  }

  // Diffraction spikes on brighter stars / newborn nodes
  if (baseR >= 5 || birth > 0.35) {
    const spikeLen = baseR * (1.4 + birth * 1.8);
    const spikeA = nodeA * (0.12 + birth * 0.35) * twinkle;
    ctx.globalAlpha = spikeA;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 0.45;
    const rot = now * 0.00004 + n.x * 0.01;
    for (let i = 0; i < 4; i++) {
      const a = rot + (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(n.x, n.y);
      ctx.lineTo(n.x + Math.cos(a) * spikeLen, n.y + Math.sin(a) * spikeLen);
      ctx.stroke();
    }
  }

  // Hot stellar core — small bright point, not a filled blob
  const coreR = safeRadius(baseR * (isPlanet ? 0.32 : 0.42), 0.35);
  ctx.globalAlpha = nodeA * (0.85 + birth * 0.15);
  const core = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, coreR);
  core.addColorStop(0, 'rgba(255, 255, 255, 1)');
  core.addColorStop(0.35, c.core);
  core.addColorStop(0.75, c.glow);
  core.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(n.x, n.y, coreR, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  drawSelectionRing(ctx, n, frame);
}
