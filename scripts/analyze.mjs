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
import { shouldIncludeFile, setCustomExcludes, getDefaultExcludes } from './includeFile.mjs';
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
  console.log(`→ Config: ${analyzeConfig.configPath} (+${analyzeConfig.exclude.length} custom exclude pattern(s))`);
} else if (analyzeConfig.exclude.length) {
  console.log(`→ Config: +${analyzeConfig.exclude.length} custom exclude pattern(s) from --config`);
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

  console.log(`→ Found ${commits.length} commits. Walking history...`);

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
      diffSummary = await git.diffSummary([
        `${commit.hash}^!`,
      ]).catch(async () => {
        return await git.diffSummary([
          '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
          commit.hash,
        ]);
      });
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

      const change = {
        path: p,
        added: f.insertions ?? 0,
        removed: f.deletions ?? 0,
        binary: !!f.binary,
        status: 'M',
      };

      if (parser && !f.binary) {
        try {
          const content = await git.show([`${commit.hash}:${p}`]);
          change.imports = parser(content);
        } catch {
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
