/**
 * Pure incremental graph state.
 *
 * Walks the commits array and maintains a Map of nodes (files) and edges
 * (imports). Each node tracks churn and lastTouchedAt so visualizers can
 * fade old activity and pulse on touch.
 */

export function emptyState() {
  return {
    nodes: new Map(),
    edges: new Map(),
    edgesByFrom: new Map(),
    cluster: new Map(),
    clusters: new Set(),
    commitIndex: -1,
    lastCommit: null,
    undoByCommit: new Map(),
  };
}

export function topLevelDir(path) {
  const parts = path.split('/');
  if (parts.length === 1) return '~root';
  if (parts[0] === 'src' && parts.length > 2) return 'src/' + parts[1];
  if (parts[0] === 'tests' && parts.length > 2) return 'tests/' + parts[1];
  return parts[0];
}

export function fileExt(path) {
  const i = path.lastIndexOf('.');
  if (i < 0) return '';
  return path.slice(i).toLowerCase();
}

function snapshotNode(node) {
  if (!node) return null;
  return {
    path: node.path,
    dir: node.dir,
    ext: node.ext,
    size: node.size,
    churn: node.churn,
    commits: node.commits,
    bornAt: node.bornAt,
    lastTouchedAt: node.lastTouchedAt,
    deleted: node.deleted,
    touchCommits: node.touchCommits ? [...node.touchCommits] : [],
  };
}

function addEdgeIndex(state, key, from) {
  if (!state.edgesByFrom.has(from)) state.edgesByFrom.set(from, new Set());
  state.edgesByFrom.get(from).add(key);
}

function removeEdgeIndex(state, key, from) {
  const set = state.edgesByFrom.get(from);
  if (set) {
    set.delete(key);
    if (set.size === 0) state.edgesByFrom.delete(from);
  }
}

function removeAllEdgesForPath(state, path, undoEdges) {
  const fromKeys = state.edgesByFrom.get(path);
  if (fromKeys) {
    for (const key of [...fromKeys]) {
      const e = state.edges.get(key);
      if (e) undoEdges.push({ type: 'restore', key, edge: { ...e } });
      state.edges.delete(key);
      removeEdgeIndex(state, key, path);
    }
  }
  for (const [key, e] of state.edges) {
    if (e.to === path) {
      undoEdges.push({ type: 'restore', key, edge: { ...e } });
      state.edges.delete(key);
      removeEdgeIndex(state, key, e.from);
    }
  }
}

/**
 * Apply a single commit forward in time. Mutates and returns state.
 */
export function applyCommit(state, commit, commitIdx) {
  state.lastCommit = commit;
  state.commitIndex = commitIdx;

  const undo = { nodes: [], edges: [] };

  for (const ch of commit.changes) {
    const path = ch.path;
    const cluster = topLevelDir(path);
    state.cluster.set(path, cluster);
    state.clusters.add(cluster);

    let node = state.nodes.get(path);
    const existed = !!node;
    const before = snapshotNode(node);

    if (!node) {
      node = {
        path,
        dir: cluster,
        ext: fileExt(path),
        size: 0,
        churn: 0,
        commits: 0,
        bornAt: commitIdx,
        lastTouchedAt: commitIdx,
        deleted: false,
        touchCommits: [],
      };
      state.nodes.set(path, node);
      undo.nodes.push({ type: 'delete', path });
    }

    if (!node.touchCommits) node.touchCommits = [];
    if (!node.touchCommits.includes(commitIdx)) {
      node.touchCommits.push(commitIdx);
      if (node.touchCommits.length > 80) node.touchCommits.shift();
    }

    if (ch.status === 'D') {
      node.deleted = true;
    } else {
      node.deleted = false;
      const delta = (ch.added || 0) - (ch.removed || 0);
      node.size = Math.max(10, node.size + delta);
      node.churn += (ch.added || 0) + (ch.removed || 0);
      node.commits += 1;
      node.lastTouchedAt = commitIdx;
    }

    if (existed) {
      undo.nodes.push({ type: 'restore', path, snapshot: before });
    }

    if (Array.isArray(ch.resolvedImports)) {
      const fromSet = state.edgesByFrom.get(path);
      if (fromSet) {
        for (const key of [...fromSet]) {
          const e = state.edges.get(key);
          if (e && !ch.resolvedImports.includes(e.to)) {
            undo.edges.push({ type: 'restore', key, edge: { ...e } });
            state.edges.delete(key);
            removeEdgeIndex(state, key, path);
          }
        }
      }

      for (const target of ch.resolvedImports) {
        if (target === path) continue;
        const key = `${path}→${target}`;
        const existing = state.edges.get(key);
        if (existing) {
          undo.edges.push({ type: 'restore', key, edge: { ...existing } });
          existing.weight = Math.min(5, existing.weight + 0.5);
        } else {
          const edge = { from: path, to: target, weight: 1, bornAt: commitIdx };
          state.edges.set(key, edge);
          addEdgeIndex(state, key, path);
          undo.edges.push({ type: 'delete', key });
        }
      }
    }
  }

  state.undoByCommit.set(commitIdx, undo);
  return state;
}

/**
 * Revert a single commit (step backward one index).
 */
export function revertCommit(state, commit, commitIdx) {
  const undo = state.undoByCommit.get(commitIdx);
  if (!undo) return state;

  for (let i = undo.edges.length - 1; i >= 0; i--) {
    const op = undo.edges[i];
    if (op.type === 'delete') {
      state.edges.delete(op.key);
      const from = op.key.split('→')[0];
      removeEdgeIndex(state, op.key, from);
    } else if (op.type === 'restore') {
      state.edges.set(op.key, { ...op.edge });
      addEdgeIndex(state, op.key, op.edge.from);
    }
  }

  for (let i = undo.nodes.length - 1; i >= 0; i--) {
    const op = undo.nodes[i];
    if (op.type === 'delete') {
      removeAllEdgesForPath(state, op.path, []);
      state.nodes.delete(op.path);
      state.cluster.delete(op.path);
    } else if (op.type === 'restore' && op.snapshot) {
      state.nodes.set(op.path, { ...op.snapshot });
      state.cluster.set(op.path, op.snapshot.dir);
      state.clusters.add(op.snapshot.dir);
    }
  }

  state.undoByCommit.delete(commitIdx);
  state.commitIndex = commitIdx - 1;
  return state;
}

/**
 * Rebuild state from scratch up to a given commit index.
 */
export function rebuildToCommit(commits, targetIdx) {
  const state = emptyState();
  if (targetIdx < 0) return state;
  for (let i = 0; i <= targetIdx; i++) {
    applyCommit(state, commits[i], i);
  }
  return state;
}

/**
 * Commits that touched a given file path (for inspector).
 */
export function getTouchCommitsForPath(commits, path) {
  const indices = [];
  for (let i = 0; i < commits.length; i++) {
    if (commits[i].changes?.some((c) => c.path === path)) indices.push(i);
  }
  return indices;
}

/**
 * Inbound / outbound edges for a path at current state.
 */
export function getDepsForPath(state, path) {
  const inbound = [];
  const outbound = [];
  for (const [, e] of state.edges) {
    if (e.to === path) inbound.push(e);
    if (e.from === path) outbound.push(e);
  }
  inbound.sort((a, b) => b.weight - a.weight);
  outbound.sort((a, b) => b.weight - a.weight);
  return { inbound, outbound };
}

/** Files directly linked by import edges (depends on + imported in). */
export function getNeighborSet(state, path) {
  const set = new Set();
  if (!path || !state) return set;
  set.add(path);
  const { inbound, outbound } = getDepsForPath(state, path);
  for (const e of outbound) set.add(e.to);
  for (const e of inbound) set.add(e.from);
  return set;
}

/** All folder clusters that appear anywhere in the commit history (stable universe). */
export function collectAllClusters(commits) {
  const set = new Set();
  if (!commits) return set;
  for (const commit of commits) {
    for (const ch of commit.changes || []) {
      if (ch.path) set.add(topLevelDir(ch.path));
    }
  }
  return set;
}

function circularHueDistance(a, b) {
  const d = Math.abs(a - b);
  return Math.min(d, 360 - d);
}

/**
 * Assign one unique color slot per cluster. Uses the full-repo cluster list so
 * hues stay fixed during timeline playback; slots are evenly spaced on the wheel
 * with a second lightness tier when there are more clusters than perceptual hues.
 */
export function clusterPalette(state, allClusters = null) {
  const source = allClusters?.size ? allClusters : state.clusters;
  const universe = [...source].sort();
  const palette = new Map();
  const n = universe.length;
  if (n === 0) return palette;

  const minGap = n <= 1 ? 360 : 360 / n;
  const used = [];

  for (let i = 0; i < n; i++) {
    const cluster = universe[i];
    let hue = ((i + 0.5) * 360) / n;
    const variant = Math.floor(i / 24);
    if (variant > 0) hue = (hue + variant * 13.7) % 360;

    let guard = 0;
    while (guard < 720) {
      const rounded = Math.round(hue * 10) / 10;
      const tooClose = used.some((u) => circularHueDistance(rounded, u) < Math.min(minGap, 18) - 0.01);
      if (!tooClose) {
        used.push(rounded);
        palette.set(cluster, { hue: rounded, variant });
        break;
      }
      hue = (hue + Math.max(18, minGap)) % 360;
      guard++;
    }
    if (!palette.has(cluster)) {
      palette.set(cluster, { hue: (i * 137.508) % 360, variant });
    }
  }
  return palette;
}
