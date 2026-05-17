import React, { useRef } from 'react';
import { useVisualizerCore } from './useVisualizerCore.js';
import { clusterColor } from '../engine/colors.js';

/**
 * Neural / Circuit visualizer.
 *
 * Sharp neon geometry on a dark grid. Data pulses travel along edges,
 * octagonal nodes light up and emit hexagonal shockwaves on commits.
 * High-contrast, tech-forward, dashboard-grade aesthetic.
 */
export default function NeuralVisualizer({ state, commitIndex, palette }) {
  const hostRef = useRef(null);

  useVisualizerCore({
    hostRef,
    state,
    commitIndex,
    clearStrategy: 'full',
    background: '#04060c',
    draw: (ctx, frame) => drawNeural(ctx, frame, { palette }),
  });

  return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />;
}

function drawNeural(ctx, frame, { palette }) {
  const { w, h, now, nodes, links, ripples } = frame;

  // -------- 1. Grid background --------
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(0, 255, 234, 0.04)';
  ctx.lineWidth = 1;
  const step = 48;
  ctx.beginPath();
  for (let x = step; x < w; x += step) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
  }
  for (let y = step; y < h; y += step) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
  }
  ctx.stroke();

  // -------- 2. Highlight grid spots near nodes --------
  ctx.globalCompositeOperation = 'lighter';
  for (const n of nodes) {
    if (n.deleted) continue;
    const gx = Math.round(n.x / step) * step;
    const gy = Math.round(n.y / step) * step;
    const dist = Math.hypot(n.x - gx, n.y - gy);
    if (dist < 24) {
      ctx.fillStyle = 'rgba(0, 255, 234, 0.18)';
      ctx.fillRect(gx - 2, gy - 2, 4, 4);
    }
  }

  // -------- 3. Connection wires --------
  for (const link of links) {
    const a = link.source, b = link.target;
    if (!a || !b) continue;
    const hue = palette.get(a.dir) ?? 0;
    const c = clusterColor(hue, 'neural');

    ctx.strokeStyle = c.edge;
    ctx.lineWidth = 1 + Math.min(1.6, link.weight * 0.4);
    ctx.beginPath();
    // Manhattan-style routing for tech feel
    const midX = (a.x + b.x) / 2;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(midX, a.y);
    ctx.lineTo(midX, b.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    // Data pulse traveling along the wire
    const t = (now * 0.0008 + (a.x + a.y) * 0.001) % 1;
    let px, py;
    const len1 = Math.abs(midX - a.x);
    const len2 = Math.abs(b.y - a.y);
    const len3 = Math.abs(b.x - midX);
    const total = len1 + len2 + len3 || 1;
    const tt = t * total;
    if (tt < len1) {
      px = a.x + (midX - a.x) * (tt / len1);
      py = a.y;
    } else if (tt < len1 + len2) {
      px = midX;
      py = a.y + (b.y - a.y) * ((tt - len1) / len2);
    } else {
      px = midX + (b.x - midX) * ((tt - len1 - len2) / len3);
      py = b.y;
    }
    const pulseGrad = ctx.createRadialGradient(px, py, 0, px, py, 8);
    pulseGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    pulseGrad.addColorStop(0.4, c.core);
    pulseGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = pulseGrad;
    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  // -------- 4. Node glow --------
  ctx.globalCompositeOperation = 'lighter';
  for (const n of nodes) {
    if (n.deleted) continue;
    const hue = palette.get(n.dir) ?? 0;
    const c = clusterColor(hue, 'neural');
    const r = n.r;
    const haloR = r * 4.5;
    const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, haloR);
    grad.addColorStop(0, c.glow);
    grad.addColorStop(0.4, c.glowFar);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(n.x, n.y, haloR, 0, Math.PI * 2);
    ctx.fill();
  }

  // -------- 5. Hex / octagon nodes --------
  ctx.globalCompositeOperation = 'source-over';
  for (const n of nodes) {
    if (n.deleted) continue;
    const hue = palette.get(n.dir) ?? 0;
    const c = clusterColor(hue, 'neural');
    drawHex(ctx, n.x, n.y, n.r, c);
  }

  // -------- 6. Hexagonal shockwaves --------
  ctx.globalCompositeOperation = 'lighter';
  const nodeByPath = new Map(nodes.map((n) => [n.path, n]));
  for (const ripple of ripples) {
    const n = nodeByPath.get(ripple.path);
    if (!n) continue;
    const t = ripple.progress;
    const ease = 1 - Math.pow(1 - t, 2);
    const maxR = 60 + 130 * ripple.intensity;
    const r = ease * maxR;
    const alpha = (1 - t) * 0.9;
    const hue = palette.get(n.dir) ?? 0;
    const c = clusterColor(hue, 'neural');

    ctx.strokeStyle = c.ripple.replace(/,[\d.]+\)$/, `,${alpha.toFixed(3)})`);
    ctx.lineWidth = 1.5;
    drawHexRing(ctx, n.x, n.y, r);

    if (r > 8) {
      ctx.strokeStyle = `rgba(255, 255, 255, ${(1 - t) * 0.45})`;
      ctx.lineWidth = 0.8;
      drawHexRing(ctx, n.x, n.y, r * 0.7);
    }
  }

  // -------- 7. HUD scan lines --------
  ctx.globalCompositeOperation = 'lighter';
  const scanY = ((now * 0.04) % (h + 200)) - 100;
  const scanGrad = ctx.createLinearGradient(0, scanY - 40, 0, scanY + 40);
  scanGrad.addColorStop(0, 'rgba(0, 255, 234, 0)');
  scanGrad.addColorStop(0.5, 'rgba(0, 255, 234, 0.05)');
  scanGrad.addColorStop(1, 'rgba(0, 255, 234, 0)');
  ctx.fillStyle = scanGrad;
  ctx.fillRect(0, scanY - 40, w, 80);

  ctx.globalCompositeOperation = 'source-over';
}

function drawHex(ctx, cx, cy, r, c) {
  ctx.fillStyle = c.core;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Bright center
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

function drawHexRing(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}
