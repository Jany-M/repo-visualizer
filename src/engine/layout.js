/**
 * Force-directed layout engine.
 */

import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceX,
  forceY,
  forceCollide,
} from 'd3-force';
import { isNodeVisible, isEdgeVisible } from './visibility.js';

export function createLayout({ width, height }) {
  let nodes = [];
  let links = [];
  const nodeByPath = new Map();
  const clusterCenters = new Map();
  let syncCount = 0;
  let branchLaneStrength = 0;

  const sim = forceSimulation(nodes)
    .force('charge', forceManyBody().strength(-90).distanceMax(420))
    .force('link', forceLink(links).id((d) => d.path).distance(60).strength(0.18))
    .force('center', forceCenter(width / 2, height / 2).strength(0.04))
    .force('collide', forceCollide().radius((d) => d.r + 2).strength(0.85))
    .force('x', forceX((d) => clusterCenters.get(d.dir)?.x ?? width / 2).strength(0.06))
    .force('y', forceY((d) => {
      const base = clusterCenters.get(d.dir)?.y ?? height / 2;
      if (branchLaneStrength > 0 && d.lane != null) {
        return base + (d.lane - 0.5) * height * 0.35 * branchLaneStrength;
      }
      return base;
    }).strength(0.06))
    .alpha(0.4)
    .alphaDecay(0.012)
    .velocityDecay(0.22);

  function resize(w, h) {
    width = w;
    height = h;
    sim.force('center', forceCenter(w / 2, h / 2).strength(0.04));
    rebuildClusterCenters();
    sim.alpha(0.4).restart();
  }

  function rebuildClusterCenters() {
    const clusters = [...new Set(nodes.map((n) => n.dir))].sort();
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.32;
    clusterCenters.clear();
    clusters.forEach((c, i) => {
      const angle = (clusters.length > 0 ? i / clusters.length : 0) * Math.PI * 2 - Math.PI / 2;
      clusterCenters.set(c, {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        angle,
        radius,
      });
    });
  }

  function sync(state, commitIndex = Infinity, options = {}) {
    const { branchLanes = null, forceRestart = false } = options;
    branchLaneStrength = branchLanes ? 1 : 0;
    syncCount++;

    const seen = new Set();
    for (const [path, n] of state.nodes) {
      if (!isNodeVisible(n, commitIndex)) {
        if (nodeByPath.has(path)) {
          const idx = nodes.findIndex((nd) => nd.path === path);
          if (idx >= 0) nodes.splice(idx, 1);
          nodeByPath.delete(path);
        }
        continue;
      }

      seen.add(path);
      const churnRadius = 6 + Math.min(28, Math.sqrt(Math.max(10, n.size)) * 1.6);
      let node = nodeByPath.get(path);
      if (!node) {
        const center = clusterCenters.get(n.dir) || { x: width / 2, y: height / 2 };
        const jitter = 30 + Math.random() * 40;
        const a = Math.random() * Math.PI * 2;
        node = {
          path,
          dir: n.dir,
          ext: n.ext,
          r: churnRadius,
          x: center.x + Math.cos(a) * jitter,
          y: center.y + Math.sin(a) * jitter,
          vx: 0,
          vy: 0,
        };
        nodeByPath.set(path, node);
        nodes.push(node);
      } else {
        node.r = churnRadius;
        node.dir = n.dir;
      }
      node.size = n.size;
      node.churn = n.churn;
      node.commits = n.commits;
      node.lastTouchedAt = n.lastTouchedAt;
      node.bornAt = n.bornAt;
      node.deleted = n.deleted;
      node.lane = branchLanes?.get(path) ?? 0.5;
    }

    for (const [path] of nodeByPath) {
      if (!seen.has(path)) {
        const idx = nodes.findIndex((n) => n.path === path);
        if (idx >= 0) nodes.splice(idx, 1);
        nodeByPath.delete(path);
      }
    }

    links.length = 0;
    for (const [, e] of state.edges) {
      if (!isEdgeVisible(e, commitIndex)) continue;
      const from = nodeByPath.get(e.from);
      const to = nodeByPath.get(e.to);
      if (from && to) {
        links.push({ source: from, target: to, weight: e.weight, bornAt: e.bornAt });
      }
    }

    rebuildClusterCenters();
    sim.nodes(nodes);
    sim.force('link').links(links);

    const soft = !forceRestart && syncCount % 3 !== 0 && links.length > 80;
    sim.alpha(soft ? 0.15 : 0.6).restart();
  }

  function getNodes() { return nodes; }
  function getLinks() { return links; }
  function getClusterCenters() { return clusterCenters; }
  function tick() { sim.tick(); }
  function stop() { sim.stop(); }

  return { sync, resize, tick, stop, getNodes, getLinks, getClusterCenters };
}
