/**
 * Force-directed layout engine.
 *
 * Wraps d3-force-simulation, keeps it warm across the lifetime of the app,
 * and exposes helpers to (re-)sync nodes and edges from the graph state.
 *
 * Nodes are clustered by top-level directory via a soft forceX/forceY
 * pulling each node toward its cluster center on a ring around the origin.
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

export function createLayout({ width, height }) {
  let nodes = [];
  let links = [];
  const nodeByPath = new Map();
  const clusterCenters = new Map();

  const sim = forceSimulation(nodes)
    .force('charge', forceManyBody().strength(-90).distanceMax(420))
    .force('link', forceLink(links).id((d) => d.path).distance(60).strength(0.18))
    .force('center', forceCenter(width / 2, height / 2).strength(0.04))
    .force('collide', forceCollide().radius((d) => d.r + 2).strength(0.85))
    .force('x', forceX((d) => clusterCenters.get(d.dir)?.x ?? width / 2).strength(0.06))
    .force('y', forceY((d) => clusterCenters.get(d.dir)?.y ?? height / 2).strength(0.06))
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
      const angle = (i / clusters.length) * Math.PI * 2 - Math.PI / 2;
      clusterCenters.set(c, {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        angle,
        radius,
      });
    });
  }

  function sync(state) {
    // Diff against state to add/remove nodes without losing positions.
    const seen = new Set();
    for (const [path, n] of state.nodes) {
      seen.add(path);
      const churnRadius = 6 + Math.min(28, Math.sqrt(Math.max(10, n.size)) * 1.6);
      let node = nodeByPath.get(path);
      if (!node) {
        // Place new nodes near their cluster center so they don't fly in from origin
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
    }

    // Remove gone nodes (deleted files that have been fully purged)
    for (const [path] of nodeByPath) {
      if (!seen.has(path)) {
        const idx = nodes.findIndex((n) => n.path === path);
        if (idx >= 0) nodes.splice(idx, 1);
        nodeByPath.delete(path);
      }
    }

    // Rebuild links list (cheap because it's a fresh array)
    links.length = 0;
    for (const [, e] of state.edges) {
      const from = nodeByPath.get(e.from);
      const to = nodeByPath.get(e.to);
      if (from && to) {
        links.push({ source: from, target: to, weight: e.weight });
      }
    }

    rebuildClusterCenters();

    sim.nodes(nodes);
    sim.force('link').links(links);
    sim.alpha(0.6).restart();
  }

  function getNodes() { return nodes; }
  function getLinks() { return links; }
  function getClusterCenters() { return clusterCenters; }
  function tick() { sim.tick(); }
  function stop() { sim.stop(); }

  return {
    sync,
    resize,
    tick,
    stop,
    getNodes,
    getLinks,
    getClusterCenters,
  };
}
