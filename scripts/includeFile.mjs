/**
 * Paths excluded from graph analysis (not application code evolution).
 */

import path from 'node:path';
import { matchesExcludePattern } from './matchExclude.mjs';

const DOC_EXTENSIONS = new Set([
  '.md',
  '.mdx',
  '.markdown',
  '.rst',
  '.adoc',
  '.asciidoc',
]);

/** Path prefixes / segments to skip (CI, templates, etc.) */
const SKIP_SEGMENTS = new Set([
  '.github',
]);

/** User-defined patterns from repovisualizer.config.json */
let customExcludePatterns = [];

/** @param {string[]} patterns */
export function setCustomExcludes(patterns) {
  customExcludePatterns = Array.isArray(patterns) ? patterns : [];
}

/** @returns {string[]} */
export function getCustomExcludes() {
  return customExcludePatterns;
}

/** @param {string} filePath repo-relative path */
export function shouldIncludeFile(filePath) {
  const norm = filePath.split(path.sep).join('/').replace(/^\.\//, '');
  const ext = path.extname(norm).toLowerCase();
  if (DOC_EXTENSIONS.has(ext)) return false;
  if (norm === '.github' || norm.startsWith('.github/')) return false;
  const parts = norm.split('/');
  if (parts.some((seg) => SKIP_SEGMENTS.has(seg))) return false;
  if (matchesExcludePattern(norm, customExcludePatterns)) return false;
  return true;
}
