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
import { getInboundCounts } from './graphState.js';
import { isPathExcluded, isClusterExcluded } from './excludes.js';
import { isNodeVisible, isEdgeVisible } from './visibility.js';

function layoutRadius(n, inbound) {
  const sizeR = 6 + Math.min(22, Math.sqrt(Math.max(10, n.size)) * 1.35);
  const importBoost = Math.min(5, Math.sqrt(inbound) * 0.65);
  return sizeR + importBoost;
}

function applyDegrees(nodes, links) {
  for (const n of nodes) {
    n._degree = 0;
  }
  for (const l of links) {
    const s = l.source;
    const t = l.target;
    if (s?._degree != null) s._degree += 1;
    if (t?._degree != null) t._degree += 1;
  }
}

export function createLayout({ width, height }) {
  let nodes = [];
  let links = [];
  const nodeByPath = new Map();
  const clusterCenters = new Map();
  let syncCount = 0;
  let lastClusterKey = '';
  let lastVisibleCount = 0;
  let lastLinkCount = 0;

  const sim = forceSimulation(nodes)
    .force('charge', forceManyBody()
      .strength((d) => {
        const deg = d._degree || 1;
        return -72 / Math.sqrt(deg);
      })
      .distanceMax(380))
    .force('link', forceLink(links)
      .id((d) => d.path)
      .distance((l) => {
        const ds = l.source._degree || 1;
        const dt = l.target._degree || 1;
        return 52 + 18 / Math.sqrt(ds + dt);
      })
      .strength((l) => {
        const ds = l.source._degree || 1;
        const dt = l.target._degree || 1;
        return 0.14 / Math.sqrt(ds * dt);
      }))
    .force('center', forceCenter(width / 2, height / 2).strength(0.035))
    .force('collide', forceCollide()
      .radius((d) => d.r + 1.5)
      .strength(0.72))
    .force('x', forceX((d) => clusterCenters.get(d.dir)?.x ?? width / 2).strength(0.045))
    .force('y', forceY((d) => clusterCenters.get(d.dir)?.y ?? height / 2).strength(0.045))
    .alpha(0.32)
    .alphaDecay(0.022)
    .alphaTarget(0)
    .velocityDecay(0.38);

  function scaleForSize() {
    const n = nodes.length;
    if (n > 200) {
      sim.velocityDecay(0.42);
    } else if (n > 80) {
      sim.velocityDecay(0.4);
    } else {
      sim.velocityDecay(0.38);
    }
  }

  function resize(w, h) {
    width = w;
    height = h;
    sim.force('center', forceCenter(w / 2, h / 2).strength(0.035));
    rebuildClusterCenters(true);
    sim.alpha(0.22).restart();
  }

  function rebuildClusterCenters(force = false) {
    const clusters = [...new Set(nodes.map((n) => n.dir))].sort();
    const key = clusters.join('\0');
    if (!force && key === lastClusterKey) return;
    lastClusterKey = key;

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
    const { forceRestart = false, excludePatterns = [] } = options;
    syncCount++;
    const inboundCounts = getInboundCounts(state);
    const prevVisible = lastVisibleCount;
    const prevLinks = lastLinkCount;

    const seen = new Set();
    for (const [path, n] of state.nodes) {
      if (isPathExcluded(path, excludePatterns) || isClusterExcluded(n.dir, excludePatterns)) {
        if (nodeByPath.has(path)) {
          const idx = nodes.findIndex((nd) => nd.path === path);
          if (idx >= 0) nodes.splice(idx, 1);
          nodeByPath.delete(path);
        }
        continue;
      }
      if (!isNodeVisible(n, commitIndex)) {
        if (nodeByPath.has(path)) {
          const idx = nodes.findIndex((nd) => nd.path === path);
          if (idx >= 0) nodes.splice(idx, 1);
          nodeByPath.delete(path);
        }
        continue;
      }

      seen.add(path);
      const inbound = inboundCounts.get(path) || 0;
      const targetR = layoutRadius(n, inbound);
      let node = nodeByPath.get(path);
      if (!node) {
        const center = clusterCenters.get(n.dir) || { x: width / 2, y: height / 2 };
        const jitter = 22 + Math.random() * 28;
        const a = Math.random() * Math.PI * 2;
        node = {
          path,
          dir: n.dir,
          ext: n.ext,
          r: targetR,
          _targetR: targetR,
          x: center.x + Math.cos(a) * jitter,
          y: center.y + Math.sin(a) * jitter,
          vx: 0,
          vy: 0,
        };
        nodeByPath.set(path, node);
        nodes.push(node);
      } else {
        node._targetR = targetR;
        node.dir = n.dir;
      }
      node.size = n.size;
      node.churn = n.churn;
      node.commits = n.commits;
      node.lastTouchedAt = n.lastTouchedAt;
      node.bornAt = n.bornAt;
      node.deleted = n.deleted;
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
      if (isPathExcluded(e.from, excludePatterns) || isPathExcluded(e.to, excludePatterns)) {
        continue;
      }
      const from = nodeByPath.get(e.from);
      const to = nodeByPath.get(e.to);
      if (from && to) {
        links.push({ source: from, target: to, weight: e.weight, bornAt: e.bornAt });
      }
    }

    applyDegrees(nodes, links);
    rebuildClusterCenters();
    sim.nodes(nodes);
    sim.force('link').links(links);
    scaleForSize();

    const visibleCount = seen.size;
    const linkCount = links.length;
    const nodesAdded = Math.max(0, visibleCount - prevVisible);
    const nodesRemoved = Math.max(0, prevVisible - visibleCount);
    const linksChanged = linkCount !== prevLinks;
    const topologyChanged = nodesAdded > 0 || nodesRemoved > 0 || linksChanged
      || forceRestart || syncCount <= 1;

    lastVisibleCount = visibleCount;
    lastLinkCount = linkCount;

    if (!topologyChanged) {
      return;
    }

    const large = linkCount > 80;
    let heat;
    if (forceRestart) {
      heat = large ? 0.28 : 0.38;
    } else if (nodesAdded <= 2 && nodesRemoved === 0 && large) {
      heat = 0.045;
    } else if (nodesAdded <= 5 && nodesRemoved <= 2) {
      heat = large ? 0.07 : 0.12;
    } else {
      heat = large ? 0.1 : 0.18;
    }

    sim.alpha(Math.max(sim.alpha(), heat)).restart();
  }

  function getNodes() { return nodes; }
  function getLinks() { return links; }
  function getClusterCenters() { return clusterCenters; }
  function getAlpha() { return sim.alpha(); }

  function tick() {
    if (sim.alpha() < 0.0008) {
      sim.stop();
      for (const n of nodes) {
        if (n._targetR != null) n.r = n._targetR;
        n.vx = 0;
        n.vy = 0;
      }
      return;
    }

    for (const n of nodes) {
      if (n._targetR != null && n.r !== n._targetR) {
        n.r += (n._targetR - n.r) * 0.14;
        if (Math.abs(n.r - n._targetR) < 0.15) n.r = n._targetR;
      }
      const deg = n._degree || 1;
      const cap = deg > 12 ? 1.8 : deg > 6 ? 2.4 : 3.2;
      if (n.vx) n.vx = Math.max(-cap, Math.min(cap, n.vx));
      if (n.vy) n.vy = Math.max(-cap, Math.min(cap, n.vy));
    }

    sim.tick();
  }

  function stop() { sim.stop(); }

  return {
    sync, resize, tick, stop, getNodes, getLinks, getClusterCenters, getAlpha,
  };
}
