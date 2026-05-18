/**
 * Timeline visibility — only show nodes/edges that exist at commitIndex.
 */

export function isNodeVisible(node, commitIndex) {
  if (!node || node.deleted) return false;
  if (commitIndex < 0) return false;
  return node.bornAt <= commitIndex;
}

export function isEdgeVisible(edge, commitIndex) {
  if (!edge || commitIndex < 0) return false;
  return (edge.bornAt ?? 0) <= commitIndex;
}

export function countVisibleNodes(state, commitIndex) {
  let n = 0;
  for (const [, node] of state.nodes) {
    if (isNodeVisible(node, commitIndex)) n++;
  }
  return n;
}

export function filterVisibleNodes(nodes, commitIndex) {
  const out = [];
  for (const n of nodes) {
    if (isNodeVisible(n, commitIndex)) out.push(n);
  }
  return out;
}

export function filterVisibleLinks(links, commitIndex) {
  const out = [];
  for (const l of links) {
    const from = l.source?.bornAt ?? l.source?.bornAt;
    if (!isNodeVisible(l.source, commitIndex) || !isNodeVisible(l.target, commitIndex)) continue;
    if (l.bornAt != null && l.bornAt > commitIndex) continue;
    out.push(l);
  }
  return out;
}

function nodeAge(node, commitIndex) {
  if (commitIndex < 0) return Infinity;
  const born = typeof node.bornAt === 'number' ? node.bornAt : 0;
  return commitIndex - born;
}

/** Fade-in for nodes born within the last few commits */
export function nodeOpacity(node, commitIndex, fadeWindow = 4) {
  if (commitIndex < 0) return 0;
  const age = nodeAge(node, commitIndex);
  if (age >= fadeWindow) return 1;
  return 0.35 + (age / fadeWindow) * 0.65;
}

/**
 * Transient birth bloom for large halos (1 = newborn, 0 = settled).
 * Separate from nodeOpacity so cores can reach full brightness while halos shrink.
 */
export function nodeBirthGlow(node, commitIndex, settleWindow = 10) {
  if (commitIndex < 0) return 0;
  const age = nodeAge(node, commitIndex);
  if (age >= settleWindow) return 0;
  return 1 - age / settleWindow;
}
