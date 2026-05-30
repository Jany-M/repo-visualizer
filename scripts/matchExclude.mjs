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
 *
 * Supported pattern forms:
 *   - ".ext"           — bare extension shorthand (e.g. ".json", ".yaml")
 *   - "folder"         — folder name prefix / segment
 *   - "src/foo/**"     — glob (* = one segment, ** = any depth)
 */
export function matchesExcludePattern(filePath, patterns) {
  if (!patterns?.length) return false;
  const norm = filePath.split('\\').join('/').replace(/^\.\//,  '');
  const fileExt = (() => {
    const i = norm.lastIndexOf('.');
    return i >= 0 ? norm.slice(i).toLowerCase() : '';
  })();
  for (const pattern of patterns) {
    if (!pattern) continue;
    // Bare extension shorthand: ".json", ".yaml", etc.
    if (/^\.[a-zA-Z0-9]+$/.test(pattern)) {
      if (fileExt === pattern.toLowerCase()) return true;
      continue;
    }
    if (pattern.includes('*')) {
      if (globToRegExp(pattern).test(norm)) return true;
    } else if (matchesLiteral(norm, pattern)) {
      return true;
    }
  }
  return false;
}
