/**
 * Paths excluded from graph analysis (not application code evolution).
 */

import path from 'node:path';
import { matchesExcludePattern } from './matchExclude.mjs';
import { DEFAULT_EXCLUDE_PATTERNS, DEFAULT_SKIP_SEGMENTS } from './defaultExcludes.mjs';

const DOC_EXTENSIONS = new Set([
  '.md',
  '.mdx',
  '.markdown',
  '.rst',
  '.adoc',
  '.asciidoc',
  '.txt',
  '.log',
]);

const SKIP_SEGMENTS = new Set(DEFAULT_SKIP_SEGMENTS);

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

/** Built-in patterns applied on every analyze run. */
export function getDefaultExcludes() {
  return [...DEFAULT_EXCLUDE_PATTERNS];
}

/** Built-in + repovisualizer.config.json patterns (stored in history.json for the app). */
export function getEffectiveExcludes() {
  return [...DEFAULT_EXCLUDE_PATTERNS, ...customExcludePatterns];
}

/** @param {string} filePath repo-relative path */
export function shouldIncludeFile(filePath) {
  const norm = filePath.split(path.sep).join('/').replace(/^\.\//, '');
  const ext = path.extname(norm).toLowerCase();
  if (DOC_EXTENSIONS.has(ext)) return false;
  const parts = norm.split('/');
  if (parts.some((seg) => SKIP_SEGMENTS.has(seg))) return false;
  if (matchesExcludePattern(norm, DEFAULT_EXCLUDE_PATTERNS)) return false;
  if (matchesExcludePattern(norm, customExcludePatterns)) return false;
  return true;
}
