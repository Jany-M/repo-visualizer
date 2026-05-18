/**
 * Pointer / touch gestures for canvas and WebGL graph views: pan, pinch-zoom, tap.
 */

import { panBy, screenToWorld, zoomAt } from './camera.js';
import { isNodeVisible } from './visibility.js';

const TAP_MOVE_PX = 8;

function localPoint(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    sx: clientX - rect.left,
    sy: clientY - rect.top,
  };
}

function pointerDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointerCenter(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function hitTestNode(layout, camera, sx, sy, commitIndex) {
  const world = screenToWorld(camera, sx, sy);
  const nodes = layout.getNodes();
  let best = null;
  let bestD = Infinity;
  for (const n of nodes) {
    if (!isNodeVisible(n, commitIndex)) continue;
    const d = Math.hypot(n.x - world.x, n.y - world.y);
    const hit = n.r + 6 / camera.scale;
    if (d < hit && d < bestD) {
      bestD = d;
      best = n.path;
    }
  }
  return best;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{
 *   getCamera: () => object,
 *   getLayout: () => object,
 *   getCommitIndex: () => number,
 *   onNodeClick?: (path: string | null) => void,
 * }} options
 */
export function attachCanvasGestures(canvas, options) {
  const pointers = new Map();
  let drag = null;
  let pinch = null;

  const onWheel = (ev) => {
    ev.preventDefault();
    const { sx, sy } = localPoint(canvas, ev.clientX, ev.clientY);
    const factor = ev.deltaY < 0 ? 1.1 : 1 / 1.1;
    zoomAt(options.getCamera(), sx, sy, factor);
  };

  const onPointerDown = (ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    try {
      canvas.setPointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const center = pointerCenter(a, b);
      const { sx, sy } = localPoint(canvas, center.x, center.y);
      pinch = {
        lastDist: pointerDistance(a, b),
        cx: sx,
        cy: sy,
      };
      drag = null;
    } else if (pointers.size === 1) {
      drag = {
        startX: ev.clientX,
        startY: ev.clientY,
        x: ev.clientX,
        y: ev.clientY,
        panning: true,
      };
      pinch = null;
    }
  };

  const onPointerMove = (ev) => {
    if (!pointers.has(ev.pointerId)) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (pointers.size >= 2) {
      const pts = [...pointers.values()];
      const dist = pointerDistance(pts[0], pts[1]);
      if (pinch && pinch.lastDist > 0 && dist > 0) {
        const center = pointerCenter(pts[0], pts[1]);
        const { sx, sy } = localPoint(canvas, center.x, center.y);
        const factor = dist / pinch.lastDist;
        zoomAt(options.getCamera(), sx, sy, factor);
        pinch.lastDist = dist;
        pinch.cx = sx;
        pinch.cy = sy;
      }
      ev.preventDefault();
      return;
    }

    if (drag?.panning && pointers.size === 1) {
      const dx = ev.clientX - drag.x;
      const dy = ev.clientY - drag.y;
      drag.x = ev.clientX;
      drag.y = ev.clientY;
      panBy(options.getCamera(), dx, dy);
      if (ev.pointerType !== 'mouse') ev.preventDefault();
    }
  };

  const finishPointer = (ev) => {
    const wasDrag = drag;
    const moved = wasDrag
      ? Math.hypot(ev.clientX - wasDrag.startX, ev.clientY - wasDrag.startY)
      : 0;

    pointers.delete(ev.pointerId);
    try {
      canvas.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }

    if (pointers.size < 2) pinch = null;

    if (pointers.size === 0) {
      if (wasDrag?.panning && moved < TAP_MOVE_PX && options.onNodeClick) {
        const { sx, sy } = localPoint(canvas, ev.clientX, ev.clientY);
        const path = hitTestNode(
          options.getLayout(),
          options.getCamera(),
          sx,
          sy,
          options.getCommitIndex(),
        );
        options.onNodeClick(path);
      }
      drag = null;
    } else if (pointers.size === 1 && !pinch) {
      const p = [...pointers.values()][0];
      drag = {
        startX: p.x,
        startY: p.y,
        x: p.x,
        y: p.y,
        panning: true,
      };
    }
  };

  const onPointerUp = (ev) => finishPointer(ev);
  const onPointerCancel = (ev) => finishPointer(ev);

  canvas.style.touchAction = 'none';
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove, { passive: false });
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);

  return () => {
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerCancel);
    pointers.clear();
    drag = null;
    pinch = null;
  };
}
