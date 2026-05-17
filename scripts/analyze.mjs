#!/usr/bin/env node
/**
 * Repo Visualizer — Git History Analyzer
 *
 * Walks a repository's commit history, parses imports from every changed file,
 * and produces a `history.json` describing the full evolution of the codebase
 * as a sequence of deltas (touched files + import edges).
 *
 * Usage:
 *   node scripts/analyze.mjs <repo-path> [--out=public/data/history.json] [--max=500]
 *   node scripts/analyze.mjs <repo-path> [--config=repovisualizer.config.json]
 *
 * The output is consumed by the React app to drive the cinematic timeline.
 */

import { simpleGit } from 'simple-git';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shouldIncludeFile, setCustomExcludes } from './includeFile.mjs';
import { loadAnalyzeConfig } from './loadConfig.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// ---------- CLI parsing ----------------------------------------------------

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith('--'));
const flags = Object.fromEntries(
  argv
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, ...rest] = a.replace(/^--/, '').split('=');
      return [k, rest.length ? rest.join('=') : true];
    })
);

const repoPath = positional[0] ? path.resolve(positional[0]) : repoRoot;
const outPath = path.resolve(
  flags.out || path.join(repoRoot, 'public', 'data', 'history.json')
);
const maxCommits = flags.max ? parseInt(flags.max, 10) : 0; // 0 = all

if (!existsSync(path.join(repoPath, '.git'))) {
  console.error(`✗ Not a git repository: ${repoPath}`);
  process.exit(1);
}

const analyzeConfig = await loadAnalyzeConfig(repoPath, flags.config);
setCustomExcludes(analyzeConfig.exclude);

console.log(`→ Analyzing repo: ${repoPath}`);
console.log(`→ Output: ${outPath}`);
if (maxCommits) console.log(`→ Limiting to ${maxCommits} most recent commits`);
if (analyzeConfig.configPath) {
  console.log(`→ Config: ${analyzeConfig.configPath} (${analyzeConfig.exclude.length} exclude pattern(s))`);
} else if (analyzeConfig.exclude.length) {
  console.log(`→ Config: ${analyzeConfig.exclude.length} exclude pattern(s) from --config`);
}

// ---------- Import parsers ------------------------------------------------

/**
 * Each parser returns an array of import strings (raw, unresolved).
 * Resolution to actual file paths happens later.
 */
const PARSERS = {
  '.js': parseJsTs,
  '.jsx': parseJsTs,
  '.ts': parseJsTs,
  '.tsx': parseJsTs,
  '.mjs': parseJsTs,
  '.cjs': parseJsTs,
  '.py': parsePython,
  '.go': parseGo,
  '.rs': parseRust,
  '.java': parseJava,
  '.kt': parseJava,
  '.rb': parseRuby,
  '.php': parsePhp,
  '.css': parseCss,
  '.scss': parseCss,
  '.vue': parseJsTs,
  '.svelte': parseJsTs,
};

function parseJsTs(src) {
  const imports = new Set();
  const importRe = /import\s+(?:[^'"`]+?\s+from\s+)?['"`]([^'"`]+)['"`]/g;
  const requireRe = /require\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  const dynImportRe = /import\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  let m;
  while ((m = importRe.exec(src))) imports.add(m[1]);
  while ((m = requireRe.exec(src))) imports.add(m[1]);
  while ((m = dynImportRe.exec(src))) imports.add(m[1]);
  return [...imports];
}

function parsePython(src) {
  const imports = new Set();
  const fromRe = /^\s*from\s+([\w.]+)\s+import/gm;
  const importRe = /^\s*import\s+([\w.,\s]+)/gm;
  let m;
  while ((m = fromRe.exec(src))) imports.add(m[1]);
  while ((m = importRe.exec(src))) {
    m[1].split(',').forEach((n) => imports.add(n.trim().split(' ')[0]));
  }
  return [...imports];
}

function parseGo(src) {
  const imports = new Set();
  const blockRe = /import\s*\(([\s\S]*?)\)/g;
  const singleRe = /import\s+"([^"]+)"/g;
  let m;
  while ((m = blockRe.exec(src))) {
    const inner = m[1];
    const lineRe = /"([^"]+)"/g;
    let n;
    while ((n = lineRe.exec(inner))) imports.add(n[1]);
  }
  while ((m = singleRe.exec(src))) imports.add(m[1]);
  return [...imports];
}

function parseRust(src) {
  const imports = new Set();
  const useRe = /^\s*use\s+([\w:]+)/gm;
  let m;
  while ((m = useRe.exec(src))) imports.add(m[1]);
  return [...imports];
}

function parseJava(src) {
  const imports = new Set();
  const re = /^\s*import\s+([\w.*]+);/gm;
  let m;
  while ((m = re.exec(src))) imports.add(m[1]);
  return [...imports];
}

function parseRuby(src) {
  const imports = new Set();
  const re = /^\s*require(?:_relative)?\s+['"]([^'"]+)['"]/gm;
  let m;
  while ((m = re.exec(src))) imports.add(m[1]);
  return [...imports];
}

function parsePhp(src) {
  const imports = new Set();
  const re = /(?:require|include|use)(?:_once)?\s*\(?\s*['"]?([\w\\/.]+)['"]?\s*\)?/g;
  let m;
  while ((m = re.exec(src))) imports.add(m[1]);
  return [...imports];
}

function parseCss(src) {
  const imports = new Set();
  const re = /@import\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) imports.add(m[1]);
  return [...imports];
}

// ---------- Import path resolution -----------------------------------------

/**
 * Resolve a raw import specifier to an actual file path inside the repo,
 * if possible. External / unresolved imports are kept as raw strings so the
 * visualizer can still render external dependency clouds.
 */
function resolveImport(rawImport, fromFile, allPaths) {
  if (!rawImport) return null;

  // Absolute-from-root style (e.g. "src/foo")
  if (!rawImport.startsWith('.')) {
    const candidates = [
      rawImport,
      rawImport + '.js',
      rawImport + '.ts',
      rawImport + '.tsx',
      rawImport + '/index.js',
      rawImport + '/index.ts',
    ];
    for (const c of candidates) {
      if (allPaths.has(c)) return c;
    }
    return null;
  }

  // Relative import
  const baseDir = path.posix.dirname(fromFile.split(path.sep).join('/'));
  const joined = path.posix.normalize(path.posix.join(baseDir, rawImport));
  const candidates = [
    joined,
    joined + '.js',
    joined + '.jsx',
    joined + '.ts',
    joined + '.tsx',
    joined + '.mjs',
    joined + '.cjs',
    joined + '.py',
    joined + '.go',
    joined + '.rs',
    joined + '.vue',
    joined + '/index.js',
    joined + '/index.ts',
    joined + '/index.tsx',
    joined + '/__init__.py',
    joined + '/mod.rs',
  ];
  for (const c of candidates) {
    if (allPaths.has(c)) return c;
  }
  return null;
}

// ---------- Main analyzer ---------------------------------------------------

async function analyze() {
  const git = simpleGit(repoPath);

  console.log('→ Reading commit log...');
  const logOpts = { '--reverse': null };
  if (maxCommits) logOpts.maxCount = maxCommits;
  const log = await git.log(logOpts);
  let commits = log.all;

  // If maxCount returned newest-first despite --reverse, normalize order.
  if (commits.length > 1) {
    const first = new Date(commits[0].date).getTime();
    const last = new Date(commits[commits.length - 1].date).getTime();
    if (first > last) commits = [...commits].reverse();
  }

  console.log(`→ Found ${commits.length} commits. Walking history...`);

  // Snapshot of all paths ever seen, for import resolution.
  const allPaths = new Set();
  const out = {
    repo: path.basename(repoPath),
    generatedAt: new Date().toISOString(),
    totalCommits: commits.length,
    firstCommit: commits[0]?.hash,
    lastCommit: commits[commits.length - 1]?.hash,
    commits: [],
  };

  let processed = 0;
  for (const commit of commits) {
    processed++;
    if (processed % 25 === 0 || processed === commits.length) {
      process.stdout.write(`\r  · ${processed}/${commits.length} commits`);
    }

    let diffSummary;
    try {
      // For the very first commit there's no parent — diff against empty tree
      diffSummary = await git.diffSummary([
        `${commit.hash}^!`,
      ]).catch(async () => {
        // First commit — diff against the magic empty tree
        return await git.diffSummary([
          '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
          commit.hash,
        ]);
      });
    } catch (e) {
      continue;
    }

    const changes = [];
    for (const f of diffSummary.files) {
      const p = f.file;
      if (!shouldIncludeFile(p)) continue;
      allPaths.add(p);
      const ext = path.extname(p).toLowerCase();
      const parser = PARSERS[ext];

      const change = {
        path: p,
        added: f.insertions ?? 0,
        removed: f.deletions ?? 0,
        binary: !!f.binary,
        status: 'M',
      };

      // Parse imports from current state of the file at this commit.
      if (parser && !f.binary) {
        try {
          const content = await git.show([`${commit.hash}:${p}`]);
          change.imports = parser(content);
        } catch {
          // File may have been deleted in this commit.
          change.status = 'D';
        }
      }

      changes.push(change);
    }

    const parents = (commit.parent || '')
      .split(/\s+/)
      .map((p) => p.trim())
      .filter(Boolean);

    out.commits.push({
      sha: commit.hash,
      shortSha: commit.hash.slice(0, 7),
      date: commit.date,
      author: commit.author_name,
      authorEmail: commit.author_email,
      parents,
      isMerge: parents.length > 1,
      message: commit.message.split('\n')[0].slice(0, 200),
      stats: {
        filesChanged: changes.length,
        insertions: changes.reduce((a, c) => a + c.added, 0),
        deletions: changes.reduce((a, c) => a + c.removed, 0),
      },
      changes,
    });
  }

  process.stdout.write('\n');

  // ---------- Post-process: resolve imports to repo paths -------------------

  console.log('→ Resolving import edges...');
  for (const c of out.commits) {
    for (const ch of c.changes) {
      if (!ch.imports) continue;
      const resolved = [];
      for (const raw of ch.imports) {
        const target = resolveImport(raw, ch.path, allPaths);
        if (target && target !== ch.path) resolved.push(target);
      }
      ch.resolvedImports = resolved;
      // Keep `imports` field for diagnostics but slim it for size
      delete ch.imports;
    }
  }

  // ---------- Write output --------------------------------------------------

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(out));

  const sizeKb = Math.round((await readFile(outPath)).byteLength / 1024);
  console.log(`✓ Wrote ${outPath} (${sizeKb} KB)`);
  console.log(`  ${out.totalCommits} commits, ${allPaths.size} unique files`);
}

analyze().catch((err) => {
  console.error('\n✗ Analysis failed:', err);
  process.exit(1);
});
