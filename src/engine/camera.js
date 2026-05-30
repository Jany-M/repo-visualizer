/**
 * 2D camera for canvas visualizers: pan, zoom, auto-fit.
 */

const MIN_SCALE = 0.15;
const MAX_SCALE = 8;
const DEFAULT_PADDING = 80;

export function createCamera() {
  return {
    scale: 1,
    tx: 0,
    ty: 0,
    targetScale: 1,
    targetTx: 0,
    targetTy: 0,
    userAdjusted: false,
  };
}

export function screenToWorld(cam, sx, sy) {
  return {
    x: (sx - cam.tx) / cam.scale,
    y: (sy - cam.ty) / cam.scale,
  };
}

export function worldToScreen(cam, wx, wy) {
  return {
    x: wx * cam.scale + cam.tx,
    y: wy * cam.scale + cam.ty,
  };
}

export function zoomAt(cam, sx, sy, factor) {
  const wx = (sx - cam.tx) / cam.scale;
  const wy = (sy - cam.ty) / cam.scale;
  const nextScale = clamp(cam.scale * factor, MIN_SCALE, MAX_SCALE);
  cam.scale = nextScale;
  cam.targetScale = nextScale;
  cam.tx = sx - wx * nextScale;
  cam.ty = sy - wy * nextScale;
  cam.targetTx = cam.tx;
  cam.targetTy = cam.ty;
  cam.userAdjusted = true;
}

export function panBy(cam, dx, dy) {
  cam.tx += dx;
  cam.ty += dy;
  cam.targetTx = cam.tx;
  cam.targetTy = cam.ty;
  cam.userAdjusted = true;
}

export function resetCamera(cam, w, h) {
  cam.scale = 1;
  cam.tx = 0;
  cam.ty = 0;
  cam.targetScale = 1;
  cam.targetTx = 0;
  cam.targetTy = 0;
  cam.userAdjusted = false;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Compute scale/translation to fit all points in viewport.
 */
export function fitBounds(cam, points, w, h, padding = DEFAULT_PADDING) {
  if (!points.length) {
    cam.targetScale = 1;
    cam.targetTx = 0;
    cam.targetTy = 0;
    return;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x == null || p.y == null) continue;
    const pad = (p.r ?? 8) + 12;
    minX = Math.min(minX, p.x - pad);
    minY = Math.min(minY, p.y - pad);
    maxX = Math.max(maxX, p.x + pad);
    maxY = Math.max(maxY, p.y + pad);
  }
  if (!Number.isFinite(minX)) return;

  const bw = Math.max(60, maxX - minX);
  const bh = Math.max(60, maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const scale = clamp(
    Math.min((w - padding * 2) / bw, (h - padding * 2) / bh),
    MIN_SCALE,
    MAX_SCALE,
  );

  cam.targetScale = scale;
  cam.targetTx = w / 2 - cx * scale;
  cam.targetTy = h / 2 - cy * scale;
}

/** Snap camera to fit target immediately (e.g. after resize). */
export function snapCamera(cam) {
  cam.scale = cam.targetScale;
  cam.tx = cam.targetTx;
  cam.ty = cam.targetTy;
}

/** Smooth lerp toward target (auto-fit while playing). */
export function lerpCamera(cam, dt, speed = 0.08) {
  const t = 1 - Math.pow(1 - speed, dt / 16);
  cam.scale += (cam.targetScale - cam.scale) * t;
  cam.tx += (cam.targetTx - cam.tx) * t;
  cam.ty += (cam.targetTy - cam.ty) * t;
}

/**
 * Compose DPR scaling with camera pan/zoom (all in CSS pixel space).
 */
export function applyCameraTransform(ctx, cam, dpr = 1) {
  const s = cam.scale * dpr;
  ctx.setTransform(s, 0, 0, s, cam.tx * dpr, cam.ty * dpr);
}
