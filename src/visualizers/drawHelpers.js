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

/**
 * One folder label per cluster, placed outside the node blob along the outward axis.
 */
export function drawClusterLabels(ctx, frame, palette, style, clusterColorForFn) {
  const { w, h, nodes, clusters } = frame;
  if (!nodes?.length) return;

  const canvasCx = w / 2;
  const canvasCy = h / 2;
  const byDir = new Map();
  for (const n of nodes) {
    if (!byDir.has(n.dir)) byDir.set(n.dir, []);
    byDir.get(n.dir).push(n);
  }

  const fontSize = style === 'minimal' ? 10 : 11;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.font = `600 ${fontSize}px "JetBrains Mono", "SF Mono", ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const [dir, clusterNodes] of byDir) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const n of clusterNodes) {
      const r = nodeDrawRadius(n, frame);
      minX = Math.min(minX, n.x - r);
      maxX = Math.max(maxX, n.x + r);
      minY = Math.min(minY, n.y - r);
      maxY = Math.max(maxY, n.y + r);
    }

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    let dx = cx - canvasCx;
    let dy = cy - canvasCy;
    let dist = Math.hypot(dx, dy);
    if (dist < 8) {
      const layoutCenter = clusters?.get?.(dir);
      if (layoutCenter?.angle != null) {
        dx = Math.cos(layoutCenter.angle);
        dy = Math.sin(layoutCenter.angle);
      } else {
        dx = 0;
        dy = -1;
      }
      dist = 1;
    } else {
      dx /= dist;
      dy /= dist;
    }

    const halfW = (maxX - minX) / 2;
    const halfH = (maxY - minY) / 2;
    const extent = Math.hypot(halfW, halfH) + (style === 'minimal' ? 16 : 20);
    const labelX = cx + dx * extent;
    const labelY = cy + dy * extent;

    const c = clusterColorForFn(palette, dir, style);
    const hasHighlight = frame.dimOthers && frame.selectedPath;
    const clusterTouched = hasHighlight
      && clusterNodes.some((n) => frame.neighborSet?.has(n.path));
    ctx.globalAlpha = hasHighlight && !clusterTouched ? 0.22 : 0.95;
    ctx.fillStyle = c.core;
    ctx.fillText(dir, labelX, labelY);
  }

  ctx.restore();
}
