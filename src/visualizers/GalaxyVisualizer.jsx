import React, { useEffect, useMemo, useRef } from 'react';
import { useVisualizerCore } from './useVisualizerCore.js';
import { clusterColor } from '../engine/colors.js';

/**
 * Galaxy / Cosmic visualizer.
 *
 * Deep space background, soft nebula gradients, additive-blended glowing
 * star-nodes, luminous orbital connection lines, and supernova-style ripples
 * radiating from each commit's touched files.
 */
export default function GalaxyVisualizer({ state, commitIndex, palette }) {
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
    draw: (ctx, frame) => drawGalaxy(ctx, frame, { stars, nebulae, palette }),
  });

  return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />;
}

function drawGalaxy(ctx, frame, { stars, nebulae, palette }) {
  const { w, h, now, nodes, links, ripples } = frame;

  // -------- 1. Nebula bloom background --------
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

  // -------- 2. Starfield --------
  ctx.globalCompositeOperation = 'lighter';
  for (const s of stars) {
    const drift = (now * 0.00001 * s.z) % 1;
    const sx = ((s.x + drift) % 1) * w;
    const sy = s.y * h;
    const twinkle = 0.55 + 0.45 * Math.sin(now * 0.001 + s.twinkle);
    const alpha = (0.25 + 0.5 * s.z) * twinkle;
    ctx.fillStyle = `rgba(${200 + Math.floor(s.z * 55)}, ${210 + Math.floor(s.z * 35)}, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(sx, sy, s.r * s.z, 0, Math.PI * 2);
    ctx.fill();
  }

  // -------- 3. Edge connections (glowing arcs) --------
  ctx.globalCompositeOperation = 'lighter';
  for (const link of links) {
    const a = link.source;
    const b = link.target;
    if (!a || !b) continue;
    const hueA = palette.get(a.dir) ?? 0;
    const hueB = palette.get(b.dir) ?? 0;
    const cA = clusterColor(hueA, 'galaxy');
    const cB = clusterColor(hueB, 'galaxy');
    const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    grad.addColorStop(0, cA.edge);
    grad.addColorStop(1, cB.edge);
    ctx.strokeStyle = grad;
    ctx.lineWidth = 0.6 + Math.min(2.2, link.weight * 0.6);
    ctx.globalAlpha = 0.8;
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

  // -------- 4. Node glow halos (additive) --------
  ctx.globalCompositeOperation = 'lighter';
  for (const n of nodes) {
    if (n.deleted) continue;
    const hue = palette.get(n.dir) ?? 0;
    const c = clusterColor(hue, 'galaxy');
    const r = n.r;
    const haloR = r * 5.5;

    const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, haloR);
    grad.addColorStop(0, c.glow);
    grad.addColorStop(0.45, c.glowFar);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(n.x, n.y, haloR, 0, Math.PI * 2);
    ctx.fill();
  }

  // -------- 5. Node cores --------
  ctx.globalCompositeOperation = 'lighter';
  for (const n of nodes) {
    if (n.deleted) continue;
    const hue = palette.get(n.dir) ?? 0;
    const c = clusterColor(hue, 'galaxy');
    const r = n.r;

    // Bright inner core gradient
    const core = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r);
    core.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    core.addColorStop(0.4, c.core);
    core.addColorStop(1, c.glow);
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // -------- 6. Ripple shockwaves --------
  ctx.globalCompositeOperation = 'lighter';
  const nodeByPath = new Map(nodes.map((n) => [n.path, n]));
  for (const ripple of ripples) {
    const n = nodeByPath.get(ripple.path);
    if (!n) continue;
    const t = ripple.progress;
    const ease = 1 - Math.pow(1 - t, 2);
    const maxR = 50 + 120 * ripple.intensity;
    const r = ease * maxR;
    const alpha = (1 - t) * (0.6 + 0.4 * ripple.intensity);
    const hue = palette.get(n.dir) ?? 0;
    const c = clusterColor(hue, 'galaxy');

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
      const flashR = n.r * 3 * (1 + (1 - t));
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

  // -------- 7. Vignette darkening at edges --------
  ctx.globalCompositeOperation = 'multiply';
  const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
  vignette.addColorStop(0, 'rgba(255, 255, 255, 1)');
  vignette.addColorStop(1, 'rgba(40, 45, 80, 1)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = 'source-over';
}
