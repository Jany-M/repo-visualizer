/**
 * Exclude matching for the web app (mirrors scripts/matchExclude.mjs).
 */

import { isNodeVisible } from './visibility.js';

function globToRegExp(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function matchesLiteral(norm, pattern) {
  const p = pattern.replace(/\/$/, '');
  if (!p) return false;
  if (norm === p) return true;
  if (norm.startsWith(`${p}/`)) return true;
  return norm.split('/').includes(p);
}

export function matchesExcludePattern(filePath, patterns) {
  if (!patterns?.length) return false;
  const norm = filePath.split('\\').join('/').replace(/^\.\//, '');
  for (const pattern of patterns) {
    if (!pattern) continue;
    if (pattern.includes('*')) {
      if (globToRegExp(pattern).test(norm)) return true;
    } else if (matchesLiteral(norm, pattern)) {
      return true;
    }
  }
  return false;
}

/** Repo-relative file path excluded from the graph. */
export function isPathExcluded(filePath, patterns) {
  return matchesExcludePattern(filePath, patterns);
}

/** Feature cluster / top-level folder excluded (e.g. docs, public). */
export function isClusterExcluded(cluster, patterns) {
  if (!cluster || cluster === '~root' || !patterns?.length) return false;
  return isPathExcluded(cluster, patterns)
    || isPathExcluded(`${cluster}/.`, patterns);
}

export function resolveExcludePatterns(dataset, configExclude = []) {
  if (dataset?.exclude?.length) return dataset.exclude;
  if (configExclude.length) return configExclude;
  return [];
}

/** Legend + labels: cluster has at least one visible, non-excluded node. */
export function isClusterActive(state, cluster, commitIndex, excludePatterns) {
  if (!cluster || isClusterExcluded(cluster, excludePatterns)) return false;
  for (const node of state.nodes.values()) {
    if (node.dir !== cluster) continue;
    if (isNodeVisible(node, commitIndex)) return true;
  }
  return false;
}
