/**
 * Load optional per-repo analyzer config from the target repository.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const CONFIG_FILENAMES = [
  'repovisualizer.config.json',
  '.repovisualizer.json',
];

/**
 * @param {string} repoPath absolute path to analyzed git repo
 * @param {string|true|undefined} configFlag --config path from CLI
 * @returns {Promise<{ exclude: string[], configPath: string|null }>}
 */
export async function loadAnalyzeConfig(repoPath, configFlag) {
  const candidates = configFlag && configFlag !== true
    ? [path.resolve(String(configFlag))]
    : CONFIG_FILENAMES.map((name) => path.join(repoPath, name));

  for (const configPath of candidates) {
    if (!existsSync(configPath)) continue;
    try {
      const raw = await readFile(configPath, 'utf8');
      const data = JSON.parse(raw);
      const exclude = normalizeExcludeList(data?.exclude);
      return { exclude, configPath };
    } catch (err) {
      throw new Error(`Failed to read config ${configPath}: ${err.message}`);
    }
  }

  return { exclude: [], configPath: null };
}

function normalizeExcludeList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .filter((v) => typeof v === 'string')
      .map((v) => v.trim().replace(/\\/g, '/').replace(/^\.\//, ''))
      .filter(Boolean),
  )];
}
