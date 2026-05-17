/**
 * Pure incremental graph state.
 *
 * Walks the commits array and maintains a Map of nodes (files) and edges
 * (imports). Each node tracks churn, churn-since-now, and lastTouchedAt
 * so visualizers can fade old activity and pulse on touch.
 */

export function emptyState() {
  return {
    nodes: new Map(), // path → { ... }
    edges: new Map(), // "from→to" → { from, to, weight }
    cluster: new Map(), // path → top-level dir (cluster id)
    clusters: new Set(),
    commitIndex: -1,
    lastCommit: null,
  };
}

export function topLevelDir(path) {
  const parts = path.split('/');
  if (parts.length === 1) return '~root';
  // Avoid treating "src" as the only cluster — go one level deeper if available.
  if (parts[0] === 'src' && parts.length > 2) return 'src/' + parts[1];
  if (parts[0] === 'tests' && parts.length > 2) return 'tests/' + parts[1];
  return parts[0];
}

export function fileExt(path) {
  const i = path.lastIndexOf('.');
  if (i < 0) return '';
  return path.slice(i).toLowerCase();
}

/**
 * Apply a single commit forward in time. Mutates and returns state.
 * Also pushes ripple records that visualizers consume and clear.
 */
export function applyCommit(state, commit, commitIdx) {
  state.lastCommit = commit;
  state.commitIndex = commitIdx;

  for (const ch of commit.changes) {
    const path = ch.path;
    const cluster = topLevelDir(path);
    state.cluster.set(path, cluster);
    state.clusters.add(cluster);

    let node = state.nodes.get(path);
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
      };
      state.nodes.set(path, node);
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

    // Update import edges
    if (Array.isArray(ch.resolvedImports)) {
      // Remove edges that are no longer present
      for (const [key, e] of state.edges) {
        if (e.from === path && !ch.resolvedImports.includes(e.to)) {
          state.edges.delete(key);
        }
      }
      // Add new edges
      for (const target of ch.resolvedImports) {
        if (target === path) continue;
        const key = `${path}→${target}`;
        const existing = state.edges.get(key);
        if (existing) {
          existing.weight = Math.min(5, existing.weight + 0.5);
        } else {
          state.edges.set(key, {
            from: path,
            to: target,
            weight: 1,
            bornAt: commitIdx,
          });
        }
      }
    }
  }

  return state;
}

/**
 * Rebuild state from scratch up to a given commit index. Used when the
 * user scrubs backward on the timeline.
 */
export function rebuildToCommit(commits, targetIdx) {
  const state = emptyState();
  if (targetIdx < 0) return state;
  for (let i = 0; i <= targetIdx; i++) {
    applyCommit(state, commits[i], i);
  }
  // The final ripples are only for the last commit applied
  return state;
}

/**
 * Compute cluster ordering and stable color hue per cluster.
 * Clusters are sorted by birth time so palette is consistent across plays.
 */
export function clusterPalette(state) {
  const sorted = [...state.clusters].sort();
  const palette = new Map();
  sorted.forEach((cluster, i) => {
    // Distribute hues around the wheel with golden-angle stepping for nice spacing
    const hue = (i * 137.508) % 360;
    palette.set(cluster, hue);
  });
  return palette;
}
