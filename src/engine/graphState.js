/**
 * Pure incremental graph state.
 *
 * Walks the commits array and maintains a Map of nodes (files) and edges
 * (imports). Each node tracks churn and lastTouchedAt so visualizers can
 * fade old activity and pulse on touch.
 */

import { isPathExcluded, isClusterExcluded } from './excludes.js';
import { isNodeVisible } from './visibility.js';

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
function syncClustersSet(state, excludePatterns = []) {
  state.clusters.clear();
  for (const node of state.nodes.values()) {
    if (!node.deleted && !isClusterExcluded(node.dir, excludePatterns)) {
      state.clusters.add(node.dir);
    }
  }
}

export function applyCommit(state, commit, commitIdx, excludePatterns = []) {
  state.lastCommit = commit;
  state.commitIndex = commitIdx;

  const undo = { nodes: [], edges: [] };

  for (const ch of commit.changes) {
    const path = ch.path;
    if (isPathExcluded(path, excludePatterns)) continue;

    const cluster = topLevelDir(path);
    state.cluster.set(path, cluster);

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
      // Remove all edges to/from this path so they don't linger in state.
      // The removed edges are captured in undo.edges so backward seek restores them.
      removeAllEdgesForPath(state, path, undo.edges);
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
        if (target === path || isPathExcluded(target, excludePatterns)) continue;
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

  syncClustersSet(state, excludePatterns);
  state.undoByCommit.set(commitIdx, undo);
  return state;
}

/**
 * Revert a single commit (step backward one index).
 */
export function revertCommit(state, commit, commitIdx, excludePatterns = []) {
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
  syncClustersSet(state, excludePatterns);
  return state;
}

export function pruneExcludedGraph(state, excludePatterns = []) {
  if (!excludePatterns.length) return state;
  for (const [path, node] of [...state.nodes]) {
    if (!isPathExcluded(path, excludePatterns) && !isClusterExcluded(node.dir, excludePatterns)) {
      continue;
    }
    removeAllEdgesForPath(state, path, []);
    state.nodes.delete(path);
    state.cluster.delete(path);
  }
  for (const [key, e] of [...state.edges]) {
    if (isPathExcluded(e.from, excludePatterns) || isPathExcluded(e.to, excludePatterns)) {
      state.edges.delete(key);
      removeEdgeIndex(state, key, e.from);
    }
  }
  syncClustersSet(state, excludePatterns);
  return state;
}

/**
 * Rebuild state from scratch up to a given commit index.
 */
export function rebuildToCommit(commits, targetIdx, excludePatterns = []) {
  const state = emptyState();
  if (targetIdx < 0) return state;
  for (let i = 0; i <= targetIdx; i++) {
    applyCommit(state, commits[i], i, excludePatterns);
  }
  return state;
}

/** Chunk size for async rebuild — smaller chunks on very long histories. */
export function pickRebuildChunkSize(commitCount) {
  if (commitCount <= 80) return commitCount;
  if (commitCount <= 300) return 24;
  if (commitCount <= 1200) return 40;
  return 64;
}

/**
 * Rebuild graph state in chunks, yielding to the main thread between batches.
 * Builds into a fresh state object so the UI can show progress without layout thrash.
 */
export async function rebuildToCommitAsync(
  commits,
  targetIdx,
  excludePatterns = [],
  {
    onProgress,
    shouldCancel,
    chunkSize = pickRebuildChunkSize(targetIdx + 1),
    yieldToMain = () => new Promise((resolve) => setTimeout(resolve, 0)),
  } = {},
) {
  const state = emptyState();
  if (targetIdx < 0) {
    onProgress?.(1);
    return state;
  }

  const total = targetIdx + 1;
  let done = 0;

  while (done <= targetIdx) {
    if (shouldCancel?.()) return null;

    const end = Math.min(targetIdx, done + chunkSize - 1);
    for (let i = done; i <= end; i++) {
      applyCommit(state, commits[i], i, excludePatterns);
    }
    done = end + 1;
    onProgress?.(done / total);
    if (done <= targetIdx) await yieldToMain();
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
    // Skip edges whose endpoints have been deleted.
    if (state.nodes.get(e.from)?.deleted || state.nodes.get(e.to)?.deleted) continue;
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

/** Visible file paths in a top-level folder cluster at the current commit. */
export function getClusterFocusSet(state, cluster, commitIndex, excludePatterns = []) {
  const set = new Set();
  if (!state || !cluster || isClusterExcluded(cluster, excludePatterns)) return set;
  for (const [path, node] of state.nodes) {
    if (node.dir === cluster && isNodeVisible(node, commitIndex)) set.add(path);
  }
  return set;
}

/** Node selection takes precedence over folder focus for graph dimming. */
export function resolveFocusSet(state, commitIndex, selectedPath, selectedCluster, excludePatterns = []) {
  if (selectedPath) return getNeighborSet(state, selectedPath);
  if (selectedCluster) return getClusterFocusSet(state, selectedCluster, commitIndex, excludePatterns);
  return new Set();
}

/** How many files import each path (inbound edge count at current state). */
export function getInboundCounts(state) {
  const counts = new Map();
  if (!state) return counts;
  for (const [, e] of state.edges) {
    counts.set(e.to, (counts.get(e.to) || 0) + 1);
  }
  return counts;
}

/** All folder clusters that appear anywhere in the commit history (stable universe). */
export function collectAllClusters(commits, excludePatterns = []) {
  const set = new Set();
  if (!commits) return set;
  for (const commit of commits) {
    for (const ch of commit.changes || []) {
      if (!ch.path || isPathExcluded(ch.path, excludePatterns)) continue;
      const dir = topLevelDir(ch.path);
      if (!isClusterExcluded(dir, excludePatterns)) set.add(dir);
    }
  }
  return set;
}

function circularHueDistance(a, b) {
  const d = Math.abs(a - b);
  return Math.min(d, 360 - d);
}

/** Hand-picked hues (°) that read clearly apart on dark backgrounds. */
const DISTINCT_HUES = [
  8, 38, 68, 98, 128, 158, 188, 218, 248, 278, 308, 338,
];

/**
 * Spread `n` hues around the wheel with a minimum perceptual gap so neighbors
 * do not collapse into the same cyan/purple band.
 */
function buildDistinctHues(n) {
  if (n <= 0) return [];
  if (n <= DISTINCT_HUES.length) return DISTINCT_HUES.slice(0, n);

  const minSep = Math.max(32, (360 / n) * 1.15);
  const hues = [];

  for (let i = 0; i < n; i++) {
    let h = (i * 137.508 + 21) % 360;
    let guard = 0;
    while (guard < 240) {
      const rounded = Math.round(h * 10) / 10;
      const ok = hues.every((u) => circularHueDistance(rounded, u) >= minSep - 0.5);
      if (ok) {
        hues.push(rounded);
        break;
      }
      h = (h + minSep) % 360;
      guard++;
    }
    if (hues.length === i) hues.push(Math.round(((i * 137.508) + 21) % 360));
  }

  return hues;
}

/**
 * Assign one unique color slot per cluster. Uses the full-repo cluster list so
 * hues stay fixed during timeline playback.
 */
export function clusterPalette(state, allClusters = null) {
  const source = allClusters?.size ? allClusters : state.clusters;
  const universe = [...source].sort();
  const palette = new Map();
  const n = universe.length;
  if (n === 0) return palette;

  const hues = buildDistinctHues(n);

  for (let i = 0; i < n; i++) {
    palette.set(universe[i], {
      hue: hues[i],
      variant: i % 5,
    });
  }

  return palette;
}
