/** Shared draw helpers for canvas visualizers */

/** Canvas arc/gradient radii must be non-negative finite numbers. */
export function safeRadius(value, min = 0.5) {
  const r = Number(value);
  if (!Number.isFinite(r) || r < min) return min;
  return r;
}

export function shouldGlow(n, frame) {
  if (!frame.dimOthers || !frame.selectedPath) return true;
  return frame.neighborSet?.has(n.path) ?? false;
}

export function shouldDrawRipple(path, frame) {
  if (!frame.dimOthers || !frame.selectedPath) return true;
  return frame.neighborSet?.has(path) ?? false;
}

export function linkAlpha(frame, pathA, pathB) {
  if (!frame.dimOthers || !frame.selectedPath) return 1;
  const { neighborSet } = frame;
  if (neighborSet.has(pathA) && neighborSet.has(pathB)) return 1;
  return 0.07;
}

export function applyNodeAlpha(ctx, n, frame) {
  const { selectedPath, neighborSet, dimOthers, nodeOpacity } = frame;
  let alpha = nodeOpacity ? nodeOpacity(n) : 1;
  if (dimOthers && selectedPath) {
    if (n.path === selectedPath) alpha = 1;
    else if (neighborSet.has(n.path)) alpha = Math.max(alpha, 0.9);
    else alpha = 0.08;
  }
  ctx.globalAlpha = alpha;
  return alpha;
}

export function neighborBoostRadius(n, frame) {
  if (!frame.dimOthers || !frame.selectedPath) return 1;
  if (n.path === frame.selectedPath) return 1.35;
  if (frame.neighborSet?.has(n.path)) return 1.2;
  return 1;
}

export function nodeDrawRadius(n, frame) {
  return safeRadius((n.r ?? 6) * neighborBoostRadius(n, frame), 0.5);
}

/** Bright import edges for the inspected node (drawn on top). */
export function drawHighlightLinks(ctx, frame, palette, style, clusterColorFor) {
  const { highlightLinks } = frame;
  if (!highlightLinks?.length) return;

  ctx.save();
  ctx.globalCompositeOperation = style === 'minimal' ? 'source-over' : 'lighter';
  for (const link of highlightLinks) {
    const a = link.source;
    const b = link.target;
    if (!a || !b) continue;
    const c = clusterColorFor(palette, a.dir, style);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const norm = Math.hypot(dx, dy) || 1;
    const offset = norm * 0.1;
    const cpx = mx - (dy / norm) * offset;
    const cpy = my + (dx / norm) * offset;

    ctx.globalAlpha = style === 'minimal' ? 0.55 : 0.9;
    ctx.strokeStyle = c.core;
    ctx.lineWidth = style === 'minimal' ? 1.4 : 2.4;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(cpx, cpy, b.x, b.y);
    ctx.stroke();

    if (style !== 'minimal') {
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 5;
      ctx.strokeStyle = c.glow;
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawSelectionRing(ctx, n, frame, stroke = 'rgba(255, 255, 255, 0.92)') {
  if (frame.selectedPath !== n.path) return;
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(n.x, n.y, safeRadius((n.r ?? 6) + 7, 0.5), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
