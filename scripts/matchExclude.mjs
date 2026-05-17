/**
 * Match repo-relative paths against exclude patterns from repovisualizer.config.json
 *
 * Patterns:
 *   - "vendor" or "vendor/" — prefix or path segment
 *   - "src/foo/**" — glob (* = one segment, ** = any depth)
 */

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

/**
 * @param {string} filePath repo-relative path
 * @param {string[]} patterns from config exclude[]
 */
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
