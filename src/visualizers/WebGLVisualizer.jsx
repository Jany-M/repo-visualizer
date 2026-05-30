/**
 * Optional WebGL renderer (Galaxy-style). Used only when node count exceeds threshold.
 */

import React, { useEffect, useRef } from 'react';
import { createLayout } from '../engine/layout.js';
import {
  applyCameraTransform,
  createCamera, fitBounds, lerpCamera, snapCamera,
} from '../engine/camera.js';
import { attachCanvasGestures } from '../engine/canvasGestures.js';
import { resolveFocusSet } from '../engine/graphState.js';
import { isNodeVisible } from '../engine/visibility.js';
import { clusterColor, clusterColorFor, paletteEntry } from '../engine/colors.js';
import { drawClusterLabels, drawInspectNodeLabels } from './drawHelpers.js';

const VS = `#version 300 es
in vec2 a_pos;
in float a_size;
in vec3 a_color;
uniform vec2 u_resolution;
uniform vec3 u_camera;
out vec3 v_color;
out float v_size;
void main() {
  vec2 p = (a_pos * u_camera.z + u_camera.xy) / u_resolution * 2.0 - 1.0;
  p.y *= -1.0;
  gl_PointSize = a_size * u_camera.z;
  gl_Position = vec4(p, 0, 1);
  v_color = a_color;
  v_size = gl_PointSize;
}`;

const FS = `#version 300 es
precision mediump float;
in vec3 v_color;
in float v_size;
out vec4 outColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  // t=0: soft galaxy glow (small/zoomed-out); t=1: crisp filled circle (zoomed-in)
  float t = clamp((v_size - 10.0) / 16.0, 0.0, 1.0);
  // Galaxy dot style
  float gc = smoothstep(0.14, 0.0, d);
  float gco = smoothstep(0.5, 0.06, d) * 0.32;
  float ga = gc * 0.95 + gco * (1.0 - gc * 0.7);
  vec3 gcol = mix(v_color, vec3(1.0), gc * 0.9);
  // Crisp filled circle: ~2px AA ring + subtle centre highlight
  float aa = 2.0 / max(v_size, 2.0);
  float cc = smoothstep(0.5, 0.5 - aa, d);
  float ci = smoothstep(0.22, 0.0, d) * 0.22;
  float ca = cc * 0.92 + ci * (1.0 - cc);
  vec3 ccol = mix(v_color, vec3(1.0), ci * 1.2);
  outColor = vec4(mix(gcol, ccol, t), mix(ga, ca, t));
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s));
  }
  return s;
}

function hueToRgb(palette, dir) {
  const { hue, variant } = paletteEntry(palette, dir);
  const c = clusterColor(hue, 'galaxy', variant);
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c.core) || /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c.glow);
  if (m) return [+m[1] / 255, +m[2] / 255, +m[3] / 255];
  return [0.7, 0.8, 1];
}

export default function WebGLVisualizer({
  state,
  commitIndex,
  palette,
  autoFit = true,
  selectedPath = null,
  selectedCluster = null,
  excludePatterns = [],
  onNodeClick,
  onInitFailed,
}) {
  const hostRef = useRef(null);
  const propsRef = useRef({
    state, commitIndex, palette, autoFit, selectedPath, selectedCluster, excludePatterns, onNodeClick,
  });
  propsRef.current = {
    state, commitIndex, palette, autoFit, selectedPath, selectedCluster, excludePatterns, onNodeClick,
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let canvas;
    let labelCanvas;
    let labelCtx;
    let gl;
    let program;
    let layout;
    let camera;
    let aPos;
    let aSize;
    let aColor;
    let uRes;
    let uCam;
    let posBuf;
    let sizeBuf;
    let colBuf;
    let raf;
    let failed = false;

    try {
      host.style.position = 'relative';
      canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      host.appendChild(canvas);
      labelCanvas = document.createElement('canvas');
      labelCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
      host.appendChild(labelCanvas);
      labelCtx = labelCanvas.getContext('2d');
      gl = canvas.getContext('webgl2', { alpha: true, antialias: true })
        || canvas.getContext('webgl', { alpha: true });
      if (!gl) throw new Error('WebGL unavailable');
      program = gl.createProgram();
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VS));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program));
      }
    } catch (e) {
      console.warn('WebGL init failed:', e);
      failed = true;
      onInitFailed?.();
      return undefined;
    }

    layout = createLayout({ width: host.clientWidth, height: host.clientHeight });
    camera = createCamera();

    aPos = gl.getAttribLocation(program, 'a_pos');
    aSize = gl.getAttribLocation(program, 'a_size');
    aColor = gl.getAttribLocation(program, 'a_color');
    uRes = gl.getUniformLocation(program, 'u_resolution');
    uCam = gl.getUniformLocation(program, 'u_camera');
    posBuf = gl.createBuffer();
    sizeBuf = gl.createBuffer();
    colBuf = gl.createBuffer();

    function resize() {
      const w = host.clientWidth;
      const h = host.clientHeight;
      const dpr = Math.min(2, devicePixelRatio || 1);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      labelCanvas.width = Math.floor(w * dpr);
      labelCanvas.height = Math.floor(h * dpr);
      layout.resize(w, h);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const detachGestures = attachCanvasGestures(canvas, {
      getCamera: () => camera,
      getLayout: () => layout,
      getCommitIndex: () => propsRef.current.commitIndex,
      onNodeClick: (path) => propsRef.current.onNodeClick?.(path),
    });

    let last = performance.now();
    let lastSyncKey = '';
    function frame(now) {
      const dt = now - last;
      last = now;
      const w = host.clientWidth;
      const h = host.clientHeight;
      const p = propsRef.current;

      const syncKey = `${p.commitIndex}|${p.state?.commitIndex ?? -1}|${p.excludePatterns?.join('\0') ?? ''}`;
      if (syncKey !== lastSyncKey) {
        layout.sync(p.state, p.commitIndex, {
          forceRestart: p.commitIndex === 0,
          excludePatterns: p.excludePatterns,
        });
        lastSyncKey = syncKey;
      }

      const hasFocus = !!(p.selectedPath || p.selectedCluster);
      const focusKey = `${p.selectedPath ?? ''}|${p.selectedCluster ?? ''}|${p.commitIndex}`;
      if (!hasFocus && layout.getAlpha() > 0.0008) layout.tick();

      if (p.autoFit && !camera.userAdjusted) {
        const allPts = layout.getNodes().filter((n) => isNodeVisible(n, p.commitIndex));
        let fitPts = allPts;
        if (hasFocus && p.state) {
          const focusSet = resolveFocusSet(
            p.state,
            p.commitIndex,
            p.selectedPath,
            p.selectedCluster,
            p.excludePatterns,
          );
          if (focusSet.size > 0) {
            fitPts = allPts.filter((n) => focusSet.has(n.path));
          }
        }
        if (fitPts.length > 0) {
          const refit = !hasFocus || focusKey !== camera._focusFitKey;
          if (refit) {
            fitBounds(camera, fitPts, w, h);
            if (!hasFocus) {
              if (!camera._fitted) snapCamera(camera);
              camera._fitted = true;
            } else {
              snapCamera(camera);
              camera._focusFitKey = focusKey;
            }
          }
        }
      } else if (!hasFocus) {
        camera._focusFitKey = null;
      }
      lerpCamera(camera, dt);

      const nodes = layout.getNodes().filter((n) => isNodeVisible(n, p.commitIndex));
      const focusSet = resolveFocusSet(
        p.state,
        p.commitIndex,
        p.selectedPath,
        p.selectedCluster,
        p.excludePatterns,
      );
      const dimOthers = focusSet.size > 0;
      const positions = new Float32Array(nodes.length * 2);
      const sizes = new Float32Array(nodes.length);
      const colors = new Float32Array(nodes.length * 3);

      nodes.forEach((n, i) => {
        positions[i * 2] = n.x;
        positions[i * 2 + 1] = n.y;
        let [r, g, b] = hueToRgb(p.palette, n.dir);
        let size = Math.max(6, n.r * 3.4);
        if (dimOthers) {
          if (!focusSet.has(n.path)) {
            r *= 0.15;
            g *= 0.15;
            b *= 0.15;
            size *= 0.85;
          } else if (n.path === p.selectedPath) {
            size = Math.max(8, n.r * 3);
          }
        }
        sizes[i] = size;
        colors[i * 3] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
      });

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0.01, 0.015, 0.04, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.useProgram(program);
      gl.uniform2f(uRes, w, h);
      gl.uniform3f(uCam, camera.tx, camera.ty, camera.scale);

      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuf);
      gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(aSize);
      gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
      gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(aColor);
      gl.vertexAttribPointer(aColor, 3, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.POINTS, 0, nodes.length);

      const dpr = Math.min(2, devicePixelRatio || 1);
      labelCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      labelCtx.clearRect(0, 0, w, h);
      labelCtx.save();
      applyCameraTransform(labelCtx, camera, dpr);
      drawClusterLabels(labelCtx, {
        w,
        h,
        nodes,
        clusters: layout.getClusterCenters(),
        selectedPath: p.selectedPath,
        selectedCluster: p.selectedCluster,
        focusSet,
        dimOthers,
        excludePatterns: p.excludePatterns,
      }, p.palette, 'galaxy', clusterColorFor);
      drawInspectNodeLabels(labelCtx, {
        w,
        h,
        nodes,
        clusters: layout.getClusterCenters(),
        selectedPath: p.selectedPath,
        selectedCluster: p.selectedCluster,
        focusSet,
        dimOthers,
        excludePatterns: p.excludePatterns,
      }, p.palette, 'galaxy', clusterColorFor);
      labelCtx.restore();

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      layout.stop();
      detachGestures();
      if (labelCanvas?.parentNode) labelCanvas.parentNode.removeChild(labelCanvas);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, [onInitFailed]);

  return <div ref={hostRef} style={{ width: '100%', height: '100%', touchAction: 'none' }} />;
}
