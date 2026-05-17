/**
 * Simple lane assignment for branch-aware layout (toggle, default off).
 */

export function computeBranchLanes(commits, commitIndex, enabled) {
  if (!enabled || commitIndex < 0) return null;

  const lanes = new Map();
  let lane = 0;

  for (let i = 0; i <= commitIndex && i < commits.length; i++) {
    const c = commits[i];
    const norm = 0.5 + ((lane % 5) - 2) * 0.12;

    for (const ch of c.changes || []) {
      lanes.set(ch.path, norm);
    }

    if (c.isMerge && Array.isArray(c.parents) && c.parents.length > 1) {
      lane += 1;
    }
  }

  return lanes;
}

export function datasetSupportsBranches(dataset) {
  return dataset?.commits?.some((c) => Array.isArray(c.parents));
}
