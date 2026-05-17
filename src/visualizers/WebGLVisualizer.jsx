/**
 * Optional WebGL renderer (Galaxy-style). Used only when node count exceeds threshold.
 */

import React, { useEffect, useRef } from 'react';
import { createLayout } from '../engine/layout.js';
import {
  createCamera, zoomAt, panBy, fitBounds, lerpCamera, snapCamera, screenToWorld,
} from '../engine/camera.js';
import { getNeighborSet } from '../engine/graphState.js';
import { isNodeVisible } from '../engine/visibility.js';
import { clusterColor, paletteEntry } from '../engine/colors.js';

const VS = `#version 300 es
in vec2 a_pos;
in float a_size;
in vec3 a_color;
uniform vec2 u_resolution;
uniform vec3 u_camera;
out vec3 v_color;
void main() {
  vec2 p = (a_pos * u_camera.z + u_camera.xy) / u_resolution * 2.0 - 1.0;
  p.y *= -1.0;
  gl_Position = vec4(p, 0, 1);
  gl_PointSize = a_size * u_camera.z;
  v_color = a_color;
}`;

const FS = `#version 300 es
precision mediump float;
in vec3 v_color;
out vec4 outColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.1, d);
  outColor = vec4(v_color, a * 0.85);
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
  onNodeClick,
  branchLanes = null,
  onInitFailed,
}) {
  const hostRef = useRef(null);
  const propsRef = useRef({
    state, commitIndex, palette, autoFit, selectedPath, onNodeClick, branchLanes,
  });
  propsRef.current = {
    state, commitIndex, palette, autoFit, selectedPath, onNodeClick, branchLanes,
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let canvas;
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
      canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      host.appendChild(canvas);
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
      layout.resize(w, h);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const dragRef = { current: null };

    const onWheel = (ev) => {
      ev.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomAt(camera, ev.clientX - rect.left, ev.clientY - rect.top, ev.deltaY < 0 ? 1.1 : 1 / 1.1);
    };

    const onPointerDown = (ev) => {
      if (ev.button !== 0) return;
      dragRef.current = { x: ev.clientX, y: ev.clientY, panning: true };
    };

    const onPointerMove = (ev) => {
      if (!dragRef.current?.panning) return;
      panBy(camera, ev.clientX - dragRef.current.x, ev.clientY - dragRef.current.y);
      dragRef.current.x = ev.clientX;
      dragRef.current.y = ev.clientY;
    };

    const onPointerUp = (ev) => {
      if (!dragRef.current) return;
      const moved = Math.hypot(ev.clientX - dragRef.current.x, ev.clientY - dragRef.current.y);
      const p = propsRef.current;
      if (dragRef.current.panning && moved < 4 && p.onNodeClick) {
        const rect = canvas.getBoundingClientRect();
        const world = screenToWorld(camera, ev.clientX - rect.left, ev.clientY - rect.top);
        const nodes = layout.getNodes().filter((n) => isNodeVisible(n, p.commitIndex));
        let best = null;
        let bestD = Infinity;
        for (const n of nodes) {
          const d = Math.hypot(n.x - world.x, n.y - world.y);
          const hit = n.r + 6 / camera.scale;
          if (d < hit && d < bestD) {
            bestD = d;
            best = n.path;
          }
        }
        p.onNodeClick(best);
      }
      dragRef.current = null;
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    let last = performance.now();
    function frame(now) {
      const dt = now - last;
      last = now;
      const w = host.clientWidth;
      const h = host.clientHeight;
      const p = propsRef.current;

      layout.sync(p.state, p.commitIndex, { branchLanes: p.branchLanes });
      layout.tick();

      if (p.autoFit && !camera.userAdjusted) {
        const pts = layout.getNodes().filter((n) => isNodeVisible(n, p.commitIndex));
        fitBounds(camera, pts, w, h);
        if (pts.length > 0 && !camera._fitted) {
          snapCamera(camera);
          camera._fitted = true;
        }
      }
      lerpCamera(camera, dt);

      const nodes = layout.getNodes().filter((n) => isNodeVisible(n, p.commitIndex));
      const neighborSet = p.selectedPath
        ? getNeighborSet(p.state, p.selectedPath)
        : null;
      const positions = new Float32Array(nodes.length * 2);
      const sizes = new Float32Array(nodes.length);
      const colors = new Float32Array(nodes.length * 3);

      nodes.forEach((n, i) => {
        positions[i * 2] = n.x;
        positions[i * 2 + 1] = n.y;
        let [r, g, b] = hueToRgb(p.palette, n.dir);
        let size = Math.max(4, n.r * 2);
        if (neighborSet) {
          if (!neighborSet.has(n.path)) {
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
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      layout.stop();
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, [onInitFailed]);

  return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />;
}
