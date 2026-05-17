/**
 * Probe WebGL availability once — never throws.
 */

let cached = null;

export function isWebGLAvailable() {
  if (cached !== null) return cached;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) {
      cached = false;
      return false;
    }
    cached = true;
    return true;
  } catch {
    cached = false;
    return false;
  }
}

export const WEBGL_NODE_THRESHOLD = 1500;
export const WEBGL_NODE_HYSTERESIS = 1200;
