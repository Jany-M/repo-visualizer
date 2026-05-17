/**
 * Language-specific import extractors (raw specifiers, unresolved).
 */

export function parseJsTs(src) {
  const imports = new Set();
  const patterns = [
    /import\s+(?:[^'"`]+?\s+from\s+)?['"`]([^'"`]+)['"`]/g,
    /export\s+(?:\{[^}]*\}|\*\s*(?:\s+as\s+\w+)?|\w+)\s+from\s+['"`]([^'"`]+)['"`]/g,
    /require\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    /import\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src))) imports.add(m[1]);
  }
  return [...imports];
}

export function parsePython(src) {
  const imports = new Set();
  const fromRe = /^\s*from\s+(\.+[\w.]*|[\w.]+)\s+import/gm;
  const importRe = /^\s*import\s+([\w.]+(?:\s+as\s+\w+)?(?:\s*,\s*[\w.]+(?:\s+as\s+\w+)?)*)/gm;
  let m;
  while ((m = fromRe.exec(src))) imports.add(m[1]);
  while ((m = importRe.exec(src))) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name) imports.add(name);
    }
  }
  return [...imports];
}

export function parseGo(src) {
  const imports = new Set();
  const blockRe = /import\s*\(([\s\S]*?)\)/g;
  const singleRe = /import\s+"([^"]+)"/g;
  let m;
  while ((m = blockRe.exec(src))) {
    const lineRe = /"([^"]+)"/g;
    let n;
    while ((n = lineRe.exec(m[1]))) imports.add(n[1]);
  }
  while ((m = singleRe.exec(src))) imports.add(m[1]);
  return [...imports];
}

export function parseRust(src) {
  const imports = new Set();
  const useRe = /^\s*use\s+((?:crate|super|self|self)::)?([\w:*{}]+)/gm;
  let m;
  while ((m = useRe.exec(src))) {
    const prefix = m[1] || '';
    const path = m[2].split('{')[0].replace(/::\*$/, '').trim();
    if (path) imports.add(prefix + path);
  }
  const modRe = /^\s*mod\s+([\w]+)\s*;/gm;
  while ((m = modRe.exec(src))) imports.add(`mod:${m[1]}`);
  return [...imports];
}

export function parseJava(src) {
  const imports = new Set();
  const re = /^\s*import\s+(?:static\s+)?([\w.*]+);/gm;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1];
    if (!name.startsWith('java.') && !name.startsWith('javax.')) imports.add(name);
  }
  return [...imports];
}

export function parseRuby(src) {
  const imports = new Set();
  const patterns = [
    /^\s*require(?:_relative)?\s+['"]([^'"]+)['"]/gm,
    /^\s*load(?:_relative)?\s+['"]([^'"]+)['"]/gm,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src))) imports.add(m[1]);
  }
  return [...imports];
}

export function parsePhp(src) {
  const imports = new Set();
  const patterns = [
    /^\s*use\s+([\w\\]+)/gm,
    /(?:require|include)(?:_once)?\s*\(?\s*['"]([^'"]+)['"]/g,
    /__DIR__\s*\.\s*['"]([^'"]+)['"]/g,
    /(?:require|include)(?:_once)?\s*\(?\s*__DIR__\s*\.\s*['"]([^'"]+)['"]/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src))) imports.add(m[1]);
  }
  return [...imports];
}

export function parseCss(src) {
  const imports = new Set();
  const re = /@import\s+(?:url\()?['"]?([^'")\s;]+)['"]?\)?/g;
  let m;
  while ((m = re.exec(src))) imports.add(m[1]);
  return [...imports];
}

/** Human-readable language list (single source of truth for README + CLI). */
export const ANALYZER_LANGUAGES = [
  {
    name: 'JavaScript / TypeScript',
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte'],
    parse: parseJsTs,
    resolution: 'Relative paths; `tsconfig` / `jsconfig` `paths` aliases',
  },
  {
    name: 'Python',
    extensions: ['.py'],
    parse: parsePython,
    resolution: 'Relative (`from .`, `from ..`), dotted modules, `__init__.py` package index',
  },
  {
    name: 'Go',
    extensions: ['.go'],
    parse: parseGo,
    resolution: 'Import path suffix → file under repo',
  },
  {
    name: 'Rust',
    extensions: ['.rs'],
    parse: parseRust,
    resolution: '`use` / `mod`; `crate::`, `super::`, `self::`',
  },
  {
    name: 'Java / Kotlin',
    extensions: ['.java', '.kt'],
    parse: parseJava,
    resolution: 'FQCN and simple class name',
  },
  {
    name: 'Ruby',
    extensions: ['.rb'],
    parse: parseRuby,
    resolution: '`require` / `require_relative`',
  },
  {
    name: 'PHP',
    extensions: ['.php'],
    parse: parsePhp,
    resolution: '`use`, `require`/`include`, `__DIR__` joins, dotted namespace paths',
  },
  {
    name: 'CSS / SCSS / Sass / Less',
    extensions: ['.css', '.scss', '.sass', '.less'],
    parse: parseCss,
    resolution: '`@import`',
  },
];

export const PARSERS = Object.fromEntries(
  ANALYZER_LANGUAGES.flatMap((lang) =>
    lang.extensions.map((ext) => [ext, lang.parse]),
  ),
);
