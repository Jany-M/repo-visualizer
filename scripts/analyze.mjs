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
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  shouldIncludeFile,
  setCustomExcludes,
  getDefaultExcludes,
  getEffectiveExcludes,
} from './includeFile.mjs';
import { loadAnalyzeConfig } from './loadConfig.mjs';
import { PARSERS, ANALYZER_LANGUAGES } from './importParsers.mjs';
import { createImportResolver, loadJsAliases, resolveChangeImports } from './importResolve.mjs';

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

// ---------- Helpers --------------------------------------------------------

/**
 * Returns a map of { filePath: 'D' | 'A' | 'M' } for a commit using the
 * reliable two-tree form `git diff --name-status --no-renames PARENT CHILD`.
 * --no-renames means renames always appear as 'D' on the old path and 'A' on
 * the new path — no combined rename notation, no R/C entries.
 */
async function getNameStatusMap(git, hash, parentHash) {
  const map = {};
  try {
    const raw = await git.raw([
      'diff', '--name-status', '--no-renames',
      parentHash, hash,
    ]);
    for (const line of raw.split('\n')) {
      const parts = line.trim().split('\t');
      if (parts.length < 2 || !parts[0]) continue;
      if (parts[1]) map[parts[1]] = parts[0][0]; // D, A, M, T, U
    }
  } catch {
    // Silently fall back — status will be treated as 'M' for all files.
  }
  return map;
}
const maxCommits = flags.max ? parseInt(flags.max, 10) : 0; // 0 = all

if (!existsSync(path.join(repoPath, '.git'))) {
  console.error(`✗ Not a git repository: ${repoPath}`);
  process.exit(1);
}

const analyzeConfig = await loadAnalyzeConfig(repoPath, flags.config);
setCustomExcludes(analyzeConfig.exclude);

const langSummary = ANALYZER_LANGUAGES.map((l) => l.name).join(', ');

console.log(`→ Analyzing repo: ${repoPath}`);
console.log(`→ Output: ${outPath}`);
console.log(`→ Import parsers: ${langSummary}`);
console.log(`→ Built-in excludes: ${getDefaultExcludes().length} pattern(s) (deps, build output, tests, …)`);
if (maxCommits) console.log(`→ Limiting to ${maxCommits} most recent commits`);
if (analyzeConfig.configPath) {
  const tag = analyzeConfig.isFallback ? ' [visualizer fallback]' : '';
  console.log(`→ Config: ${analyzeConfig.configPath}${tag} (+${analyzeConfig.exclude.length} custom exclude pattern(s))`);
}

// ---------- Main analyzer ---------------------------------------------------

async function analyze() {
  const git = simpleGit(repoPath);

  console.log('→ Reading commit log...');
  const logOpts = { '--reverse': null };
  if (maxCommits) logOpts.maxCount = maxCommits;
  const log = await git.log(logOpts);
  let commits = log.all;

  if (commits.length > 1) {
    const first = new Date(commits[0].date).getTime();
    const last = new Date(commits[commits.length - 1].date).getTime();
    if (first > last) commits = [...commits].reverse();
  }

  // Build a map of commit hash → first parent hash so we can always use the
  // reliable two-tree form `git diff PARENT CHILD` instead of `CHILD^!`.
  // On Windows (and some git configurations), `HASH^!` for a root commit does
  // NOT throw but silently diffs against the working tree, producing hundreds
  // of spurious file changes that poison the first commit's change list.
  const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  const parentMap = new Map(); // childHash → parentHash (or EMPTY_TREE for roots)
  {
    const rawParents = await git.raw([
      'log', '--format=%H %P',
      ...(maxCommits ? ['-n', String(maxCommits)] : []),
    ]);
    for (const line of rawParents.split('\n')) {
      const parts = line.trim().split(' ');
      if (parts.length < 1 || !parts[0]) continue;
      const child = parts[0];
      const parent = parts[1] || EMPTY_TREE; // empty = root commit
      parentMap.set(child, parent);
    }
  }

  console.log(`→ Found ${commits.length} commits. Walking history...`);

  const allPaths = new Set();
  const out = {
    repo: path.basename(repoPath),
    generatedAt: new Date().toISOString(),
    totalCommits: commits.length,
    firstCommit: commits[0]?.hash,
    lastCommit: commits[commits.length - 1]?.hash,
    exclude: getEffectiveExcludes(),
    commits: [],
  };

  let processed = 0;
  for (const commit of commits) {
    processed++;
    if (processed % 25 === 0 || processed === commits.length) {
      process.stdout.write(`\r  · ${processed}/${commits.length} commits`);
    }

    let diffSummary;
    let nameStatusMap;
    try {
      [diffSummary, nameStatusMap] = await Promise.all([
        git
          // --no-renames prevents git from emitting combined diff paths like
          // "src/{Old => New}/file.css". Without this, renamed directories
          // produce paths that (a) can't be resolved via git.show and (b)
          // create ghost nodes that persist indefinitely in the graph for
          // file types with no import parser (CSS, images, binary, etc.).
          // With --no-renames the old path appears as a plain 'D' entry and
          // the new path as a plain 'A' entry, which our pipeline handles
          // correctly via nameStatusMap.
          //
          // We always use the explicit PARENT..CHILD two-tree form rather than
          // HASH^! because on Windows, HASH^! for a root commit (no parent)
          // silently diffs against the working tree instead of throwing, which
          // injects hundreds of spurious file changes into the first commit.
          .diffSummary([parentMap.get(commit.hash) ?? EMPTY_TREE, commit.hash, '--no-renames']),
        getNameStatusMap(git, commit.hash, parentMap.get(commit.hash) ?? EMPTY_TREE),
      ]);
    } catch {
      continue;
    }

    const changes = [];
    for (const f of diffSummary.files) {
      const p = f.file;
      if (!shouldIncludeFile(p)) continue;
      allPaths.add(p);
      const ext = path.extname(p).toLowerCase();
      const parser = PARSERS[ext];

      // Use git --name-status for reliable deletion detection across all file types.
      const isDeleted = nameStatusMap[p] === 'D';

      const change = {
        path: p,
        added: f.insertions ?? 0,
        removed: f.deletions ?? 0,
        binary: !!f.binary,
        status: isDeleted ? 'D' : 'M',
      };

      if (parser && !f.binary && !isDeleted) {
        try {
          const content = await git.show([`${commit.hash}:${p}`]);
          change.imports = parser(content);
        } catch {
          // git.show failed despite name-status not flagging deletion
          // (e.g. submodule, partial clone). Treat as deleted to be safe.
          change.status = 'D';
        }
      }

      changes.push(change);
    }

    // Safety-net: emit explicit entries for any paths in nameStatusMap that
    // weren't already covered by diffSummary (possible edge cases: zero-byte
    // files, binary renames on some git versions, etc.).
    //   'D' → deletion that diffSummary missed → mark node deleted in the graph
    //   'A' → addition that diffSummary missed → add node (with import parse attempt)
    const processedPaths = new Set(changes.map((c) => c.path));
    for (const [p, st] of Object.entries(nameStatusMap)) {
      if (processedPaths.has(p) || !shouldIncludeFile(p)) continue;
      if (st === 'D') {
        changes.push({ path: p, added: 0, removed: 0, binary: false, status: 'D' });
      } else if (st === 'A') {
        allPaths.add(p);
        const ext = path.extname(p).toLowerCase();
        const parser = PARSERS[ext];
        const change = { path: p, added: 0, removed: 0, binary: false, status: 'M' };
        if (parser) {
          try {
            const content = await git.show([`${commit.hash}:${p}`]);
            change.imports = parser(content);
          } catch {
            change.status = 'D';
          }
        }
        changes.push(change);
      }
    }

    out.commits.push({
      sha: commit.hash,
      shortSha: commit.hash.slice(0, 7),
      date: commit.date,
      author: commit.author_name,
      authorEmail: commit.author_email,
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

  console.log('→ Building path index...');
  const jsAliases = await loadJsAliases(repoPath);
  if (jsAliases.length) console.log(`  · ${jsAliases.length} JS/TS path alias(es) from tsconfig/jsconfig`);

  const resolver = createImportResolver(allPaths, { jsAliases });

  console.log('→ Resolving import edges...');
  let totalChangesWithImports = 0;
  let totalResolvedEdges = 0;
  let totalChangesWithEdges = 0;

  for (const c of out.commits) {
    const batch = c.changes.filter((ch) => ch.imports?.length);
    totalChangesWithImports += batch.length;
    const stats = resolveChangeImports(c.changes, resolver);
    totalResolvedEdges += stats.resolvedEdges;
    totalChangesWithEdges += stats.changesWithEdges;
  }

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(out));

  if (analyzeConfig.configPath) {
    const publicConfig = path.join(repoRoot, 'public', 'repovisualizer.config.json');
    await copyFile(analyzeConfig.configPath, publicConfig);
  }

  const sizeKb = Math.round((await readFile(outPath)).byteLength / 1024);
  console.log(`✓ Wrote ${outPath} (${sizeKb} KB)`);
  console.log(`  ${out.totalCommits} commits, ${allPaths.size} unique files`);
  console.log(
    `  ${totalChangesWithEdges} file changes with resolved imports`
    + ` (${totalResolvedEdges} edges from ${totalChangesWithImports} parsed)`,
  );
}

analyze().catch((err) => {
  console.error('\n✗ Analysis failed:', err);
  process.exit(1);
});
