/**
 * Resolve raw import specifiers to repo-relative file paths.
 */

import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const posix = path.posix;

const FILE_EXTS = [
  '', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.php', '.rb', '.java', '.kt',
  '.vue', '.svelte', '.css', '.scss',
];

const INDEX_EXTS = ['/index.js', '/index.ts', '/index.tsx', '/index.jsx', '/index.mjs'];
const PKG_MARKERS = ['/index.js', '/index.ts', '/index.tsx', '/__init__.py', '/mod.rs'];

export function toPosix(p) {
  return p.split(path.sep).join('/');
}

function firstExisting(base, pathSet) {
  const candidates = [];
  for (const ext of FILE_EXTS) candidates.push(base + ext);
  for (const idx of INDEX_EXTS) candidates.push(base + idx);
  for (const pkg of PKG_MARKERS) {
    if (!candidates.includes(base + pkg)) candidates.push(base + pkg);
  }
  for (const c of candidates) {
    if (pathSet.has(c)) return c;
  }
  return null;
}

function buildPythonIndex(pathSet) {
  const moduleToPath = new Map();
  for (const p of pathSet) {
    if (!p.endsWith('.py')) continue;
    if (p.endsWith('/__init__.py')) {
      const pkg = p.slice(0, -'/__init__.py'.length).replace(/\//g, '.');
      if (pkg && !moduleToPath.has(pkg)) moduleToPath.set(pkg, p);
    } else {
      const mod = p.slice(0, -3).replace(/\//g, '.');
      if (!moduleToPath.has(mod)) moduleToPath.set(mod, p);
    }
  }
  return moduleToPath;
}

function buildJavaIndex(pathSet) {
  const classToPath = new Map();
  for (const p of pathSet) {
    if (!p.endsWith('.java') && !p.endsWith('.kt')) continue;
    const base = p.replace(/\.(java|kt)$/, '');
    const className = base.split('/').pop();
    const pkgPath = base.includes('/') ? base.slice(0, base.lastIndexOf('/')).replace(/\//g, '.') : '';
    const fq = pkgPath ? `${pkgPath}.${className}` : className;
    classToPath.set(fq, p);
    classToPath.set(className, p);
  }
  return classToPath;
}

function resolvePhpDotted(raw, pathSet) {
  const norm = raw.replace(/\\/g, '/').replace(/\./g, '/').toLowerCase();
  const direct = firstExisting(norm, pathSet);
  if (direct) return direct;
  const hit = [...pathSet].find((p) => {
    if (!p.endsWith('.php')) return false;
    return p.toLowerCase() === `${norm}.php` || p.toLowerCase().endsWith(`/${norm}.php`);
  });
  return hit || null;
}

function resolvePythonModule(raw, fromFile, pathSet, moduleToPath) {
  const from = toPosix(fromFile);

  if (raw.startsWith('.')) {
    const match = raw.match(/^(\.+)(.*)$/);
    if (!match) return null;
    const dotCount = match[1].length;
    let rest = (match[2] || '').replace(/^\./, '');
    if (rest.startsWith('.')) rest = rest.slice(1);
    rest = rest.replace(/\./g, '/');
    const dirParts = posix.dirname(from).split('/').filter(Boolean);
    const up = dotCount - 1;
    const baseParts = dirParts.slice(0, Math.max(0, dirParts.length - up));
    if (rest) baseParts.push(...rest.split('/').filter(Boolean));
    return firstExisting(baseParts.join('/'), pathSet);
  }

  const parts = raw.split('.');
  for (let len = parts.length; len >= 1; len--) {
    const prefix = parts.slice(0, len).join('.');
    if (moduleToPath.has(prefix)) return moduleToPath.get(prefix);
    const asPath = prefix.replace(/\./g, '/');
    const hit = firstExisting(asPath, pathSet);
    if (hit) return hit;
  }
  return null;
}

function resolveGoImport(raw, pathSet) {
  const segments = raw.split('/');
  for (let i = 0; i < segments.length; i++) {
    const suffix = segments.slice(i).join('/');
    const hit = firstExisting(suffix, pathSet);
    if (hit) return hit;
    for (const p of pathSet) {
      if (p.endsWith('/' + suffix + '.go')) return p;
    }
  }
  return null;
}

function resolveRustImport(raw, fromFile, pathSet) {
  const from = toPosix(fromFile);
  const fromDir = posix.dirname(from);

  if (raw.startsWith('mod:')) {
    const name = raw.slice(4);
    return firstExisting(posix.join(fromDir, name), pathSet);
  }

  let spec = raw.replace(/::/g, '/');
  if (raw.startsWith('crate::') || raw.startsWith('crate/')) {
    spec = spec.replace(/^crate\/?/, '');
    for (const root of ['src', 'lib']) {
      const hit = firstExisting(posix.join(root, spec), pathSet);
      if (hit) return hit;
    }
  }
  if (raw.startsWith('super::') || raw.startsWith('super/')) {
    spec = spec.replace(/^super\/?/, '');
    const parent = posix.dirname(fromDir);
    return firstExisting(posix.join(parent, spec), pathSet);
  }
  if (raw.startsWith('self::') || raw.startsWith('self/')) {
    spec = spec.replace(/^self\/?/, '');
    return firstExisting(posix.join(fromDir, spec), pathSet);
  }
  return firstExisting(spec, pathSet);
}

function resolveJavaImport(raw, javaIndex) {
  if (javaIndex.has(raw)) return javaIndex.get(raw);
  const simple = raw.split('.').pop();
  return javaIndex.get(simple) || null;
}

/**
 * @param {string} repoPath
 * @param {Set<string>} allPaths
 */
export async function loadJsAliases(repoPath) {
  const aliases = [];
  for (const name of ['tsconfig.json', 'jsconfig.json']) {
    const fp = path.join(repoPath, name);
    if (!existsSync(fp)) continue;
    try {
      const text = await readFile(fp, 'utf8');
      const json = JSON.parse(text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''));
      const paths = json.compilerOptions?.paths || {};
      const baseUrl = (json.compilerOptions?.baseUrl || '.').replace(/^\.\//, '');
      for (const [key, targets] of Object.entries(paths)) {
        const pattern = key.replace(/\*$/, '');
        const target = (Array.isArray(targets) ? targets[0] : targets).replace(/\*$/, '');
        const resolvedBase = posix.normalize(posix.join(baseUrl, target.replace(/^\.\//, '')));
        aliases.push({ pattern, target: resolvedBase });
      }
    } catch {
      /* ignore invalid config */
    }
  }
  return aliases;
}

/**
 * @param {Set<string>} allPaths
 * @param {{ jsAliases?: Array<{pattern:string,target:string}> }} options
 */
export function createImportResolver(allPaths, options = {}) {
  const pathSet = new Set([...allPaths].map(toPosix));
  const pythonModules = buildPythonIndex(pathSet);
  const javaIndex = buildJavaIndex(pathSet);
  const jsAliases = options.jsAliases || [];

  function resolveAlias(spec) {
    for (const { pattern, target } of jsAliases) {
      if (spec === pattern || spec.startsWith(pattern)) {
        const rest = spec.slice(pattern.length);
        return posix.normalize(target + rest);
      }
    }
    return null;
  }

  function resolve(rawImport, fromFile) {
    if (!rawImport || !fromFile) return null;
    let raw = String(rawImport).trim().replace(/\\/g, '/');
    if (!raw || raw.startsWith('node:')) return null;

    const from = toPosix(fromFile);
    const ext = posix.extname(from).toLowerCase();

    if (ext === '.py') {
      const py = resolvePythonModule(raw, from, pathSet, pythonModules);
      if (py) return py;
    }

    if (ext === '.php') {
      raw = raw.replace(/^\/+/, '');
      if ((raw.includes('.') || raw.includes('\\')) && !raw.startsWith('.')) {
        const php = resolvePhpDotted(raw.replace(/\\/g, '.'), pathSet);
        if (php) return php;
      }
    }

    if (ext === '.java' || ext === '.kt') {
      const j = resolveJavaImport(raw, javaIndex);
      if (j) return j;
    }

    if (ext === '.go') {
      const g = resolveGoImport(raw, pathSet);
      if (g) return g;
    }

    if (ext === '.rs') {
      const r = resolveRustImport(raw, from, pathSet);
      if (r) return r;
    }

    if (!raw.startsWith('.')) {
      const aliased = resolveAlias(raw);
      if (aliased) {
        const hit = firstExisting(aliased, pathSet);
        if (hit) return hit;
      }
    }

    if (raw.startsWith('.')) {
      const baseDir = posix.dirname(from);
      const joined = posix.normalize(posix.join(baseDir, raw));
      return firstExisting(joined, pathSet);
    }

    return firstExisting(raw, pathSet);
  }

  return { resolve, pathSet };
}

/**
 * @param {Array<{ imports?: string[], path: string }>} changes
 * @param {ReturnType<createImportResolver>} resolver
 */
export function resolveChangeImports(changes, resolver) {
  let resolvedEdges = 0;
  let changesWithEdges = 0;
  for (const ch of changes) {
    if (!ch.imports?.length) {
      ch.resolvedImports = [];
      continue;
    }
    const seen = new Set();
    const resolved = [];
    for (const raw of ch.imports) {
      const target = resolver.resolve(raw, ch.path);
      if (target && target !== ch.path && !seen.has(target)) {
        seen.add(target);
        resolved.push(target);
      }
    }
    ch.resolvedImports = resolved;
    delete ch.imports;
    if (resolved.length > 0) {
      changesWithEdges++;
      resolvedEdges += resolved.length;
    }
  }
  return { resolvedEdges, changesWithEdges };
}
