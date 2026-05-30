/**
 * Load optional per-repo analyzer config from the target repository.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Root of this repo-visualizer installation. */
const VISUALIZER_ROOT = path.resolve(__dirname, '..');

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
  // Explicit --config flag: only check that one path, no fallback.
  if (configFlag && configFlag !== true) {
    const configPath = path.resolve(String(configFlag));
    if (!existsSync(configPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }
    return parseConfigFile(configPath);
  }

  // 1. Look in the target repo itself.
  for (const name of CONFIG_FILENAMES) {
    const configPath = path.join(repoPath, name);
    if (!existsSync(configPath)) continue;
    return parseConfigFile(configPath);
  }

  // 2. Fall back to the visualizer's own root config (if the target repo is
  //    different from the visualizer — avoids double-applying in self-analysis).
  if (path.resolve(repoPath) !== VISUALIZER_ROOT) {
    for (const name of CONFIG_FILENAMES) {
      const configPath = path.join(VISUALIZER_ROOT, name);
      if (!existsSync(configPath)) continue;
      const result = await parseConfigFile(configPath);
      return { ...result, isFallback: true };
    }
  }

  return { exclude: [], configPath: null };
}

async function parseConfigFile(configPath) {
  try {
    const raw = await readFile(configPath, 'utf8');
    const data = JSON.parse(raw);
    const exclude = normalizeExcludeList(data?.exclude);
    return { exclude, configPath };
  } catch (err) {
    throw new Error(`Failed to read config ${configPath}: ${err.message}`);
  }
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
