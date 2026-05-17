#!/usr/bin/env node
/**
 * Generate a synthetic demo dataset that simulates a believable startup
 * codebase being built from scratch over ~60 commits. This lets the app
 * render a beautiful timeline out of the box, with no real repo required.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.resolve(__dirname, '..', 'public', 'data', 'demo.json');

const AUTHORS = [
  ['Ada Voss',     'ada@example.com'],
  ['Kai Mendez',   'kai@example.com'],
  ['Nia Okafor',   'nia@example.com'],
  ['Theo Brandt',  'theo@example.com'],
];

let day = 0;
function nextDate() {
  day += 1 + Math.random() * 2;
  const d = new Date(Date.UTC(2024, 0, 1));
  d.setUTCDate(d.getUTCDate() + Math.floor(day));
  d.setUTCHours(9 + Math.floor(Math.random() * 9));
  return d.toISOString();
}

function rng() { return Math.random(); }
function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }

const commits = [];
let shaCounter = 0;
function sha() {
  shaCounter++;
  return 'demo' + String(shaCounter).padStart(4, '0') + 'abcd' + Math.floor(rng() * 1e8).toString(16).padStart(8, '0');
}

function commit(message, changes) {
  const stats = {
    filesChanged: changes.length,
    insertions: changes.reduce((a, c) => a + (c.added || 0), 0),
    deletions:  changes.reduce((a, c) => a + (c.removed || 0), 0),
  };
  const author = pick(AUTHORS);
  commits.push({
    sha: sha(),
    shortSha: '',
    date: nextDate(),
    author: author[0],
    authorEmail: author[1],
    message,
    stats,
    changes: changes.map((c) => ({
      path: c.path,
      added: c.added ?? Math.floor(20 + rng() * 60),
      removed: c.removed ?? 0,
      binary: false,
      status: c.status || 'M',
      resolvedImports: c.imports || [],
    })),
  });
}

// ── Sprint 0: Project bootstrap ──────────────────────────────────────────
commit('Initial commit — README and license', [
  { path: 'README.md', added: 40, status: 'A' },
  { path: 'LICENSE',   added: 21, status: 'A' },
  { path: 'package.json', added: 18, status: 'A' },
]);
commit('Add build configuration', [
  { path: 'vite.config.js', added: 14, status: 'A' },
  { path: '.eslintrc.json', added: 22, status: 'A' },
  { path: 'tsconfig.json', added: 24, status: 'A' },
]);

// ── Sprint 1: Core scaffolding ───────────────────────────────────────────
commit('Bootstrap application entrypoint', [
  { path: 'src/index.ts',    added: 30, status: 'A' },
  { path: 'src/app.ts',      added: 50, status: 'A', imports: ['src/index.ts'] },
  { path: 'src/config.ts',   added: 25, status: 'A' },
]);
commit('Add core utilities', [
  { path: 'src/utils/logger.ts',   added: 60, status: 'A' },
  { path: 'src/utils/errors.ts',   added: 45, status: 'A' },
  { path: 'src/utils/result.ts',   added: 30, status: 'A' },
  { path: 'src/app.ts', added: 12, removed: 4, imports: ['src/utils/logger.ts', 'src/utils/errors.ts'] },
]);

// ── Sprint 2: Database layer ─────────────────────────────────────────────
commit('Set up database connection', [
  { path: 'src/db/client.ts',  added: 80, status: 'A', imports: ['src/utils/logger.ts', 'src/config.ts'] },
  { path: 'src/db/schema.ts',  added: 120, status: 'A' },
  { path: 'src/db/index.ts',   added: 15, status: 'A', imports: ['src/db/client.ts', 'src/db/schema.ts'] },
]);
commit('Add migration runner', [
  { path: 'src/db/migrations/001_init.sql', added: 40, status: 'A' },
  { path: 'src/db/migrate.ts',              added: 70, status: 'A', imports: ['src/db/client.ts', 'src/utils/logger.ts'] },
]);
commit('Migration: add users table', [
  { path: 'src/db/migrations/002_users.sql', added: 25, status: 'A' },
]);
commit('Migration: add sessions and tokens', [
  { path: 'src/db/migrations/003_sessions.sql', added: 30, status: 'A' },
]);

// ── Sprint 3: Auth feature ───────────────────────────────────────────────
commit('Auth: password hashing primitives', [
  { path: 'src/auth/crypto.ts',  added: 65, status: 'A', imports: ['src/utils/errors.ts'] },
]);
commit('Auth: JWT signing and verification', [
  { path: 'src/auth/jwt.ts',     added: 90, status: 'A', imports: ['src/auth/crypto.ts', 'src/config.ts'] },
  { path: 'src/auth/types.ts',   added: 25, status: 'A' },
]);
commit('Auth: signup endpoint', [
  { path: 'src/auth/signup.ts',  added: 100, status: 'A', imports: ['src/auth/crypto.ts', 'src/db/index.ts', 'src/auth/jwt.ts', 'src/utils/result.ts'] },
]);
commit('Auth: login endpoint', [
  { path: 'src/auth/login.ts',   added: 85, status: 'A', imports: ['src/auth/crypto.ts', 'src/db/index.ts', 'src/auth/jwt.ts', 'src/utils/result.ts'] },
]);
commit('Auth: session middleware', [
  { path: 'src/auth/middleware.ts', added: 70, status: 'A', imports: ['src/auth/jwt.ts', 'src/db/index.ts'] },
  { path: 'src/auth/index.ts',      added: 20, status: 'A', imports: ['src/auth/signup.ts', 'src/auth/login.ts', 'src/auth/middleware.ts'] },
]);
commit('Auth: refresh token rotation', [
  { path: 'src/auth/refresh.ts',    added: 95, status: 'A', imports: ['src/auth/jwt.ts', 'src/db/index.ts'] },
  { path: 'src/auth/index.ts',      added: 4,  removed: 2, imports: ['src/auth/signup.ts', 'src/auth/login.ts', 'src/auth/middleware.ts', 'src/auth/refresh.ts'] },
]);
commit('Auth: harden against timing attacks', [
  { path: 'src/auth/crypto.ts',  added: 12, removed: 6 },
  { path: 'src/auth/login.ts',   added: 8,  removed: 4 },
]);

// ── Sprint 4: API layer ──────────────────────────────────────────────────
commit('API: Express server bootstrap', [
  { path: 'src/api/server.ts',  added: 75, status: 'A', imports: ['src/utils/logger.ts', 'src/auth/middleware.ts'] },
  { path: 'src/api/router.ts',  added: 40, status: 'A', imports: ['src/auth/index.ts'] },
]);
commit('API: request validation', [
  { path: 'src/api/validate.ts', added: 60, status: 'A', imports: ['src/utils/errors.ts'] },
  { path: 'src/api/router.ts',   added: 10, removed: 2, imports: ['src/auth/index.ts', 'src/api/validate.ts'] },
]);
commit('API: error handler', [
  { path: 'src/api/error-handler.ts', added: 55, status: 'A', imports: ['src/utils/errors.ts', 'src/utils/logger.ts'] },
  { path: 'src/api/server.ts',        added: 6, removed: 2, imports: ['src/utils/logger.ts', 'src/auth/middleware.ts', 'src/api/error-handler.ts'] },
]);

// ── Sprint 5: Users feature ──────────────────────────────────────────────
commit('Users: profile model', [
  { path: 'src/users/model.ts',  added: 70, status: 'A', imports: ['src/db/index.ts'] },
]);
commit('Users: list and get endpoints', [
  { path: 'src/users/handlers.ts', added: 90, status: 'A', imports: ['src/users/model.ts', 'src/api/validate.ts', 'src/utils/result.ts'] },
  { path: 'src/users/index.ts',    added: 18, status: 'A', imports: ['src/users/handlers.ts', 'src/users/model.ts'] },
  { path: 'src/api/router.ts',     added: 8,  removed: 2, imports: ['src/auth/index.ts', 'src/api/validate.ts', 'src/users/index.ts'] },
]);
commit('Users: update profile endpoint', [
  { path: 'src/users/handlers.ts', added: 30, removed: 4, imports: ['src/users/model.ts', 'src/api/validate.ts', 'src/utils/result.ts'] },
]);
commit('Users: avatar upload', [
  { path: 'src/users/avatar.ts',   added: 110, status: 'A', imports: ['src/users/model.ts', 'src/utils/errors.ts'] },
  { path: 'src/users/index.ts',    added: 4,  removed: 1, imports: ['src/users/handlers.ts', 'src/users/model.ts', 'src/users/avatar.ts'] },
]);

// ── Sprint 6: Payments feature ───────────────────────────────────────────
commit('Payments: Stripe client wrapper', [
  { path: 'src/payments/stripe-client.ts', added: 95, status: 'A', imports: ['src/config.ts', 'src/utils/logger.ts'] },
]);
commit('Payments: subscription model', [
  { path: 'src/payments/subscriptions.ts', added: 130, status: 'A', imports: ['src/db/index.ts', 'src/payments/stripe-client.ts', 'src/users/model.ts'] },
]);
commit('Payments: checkout flow', [
  { path: 'src/payments/checkout.ts',      added: 105, status: 'A', imports: ['src/payments/stripe-client.ts', 'src/payments/subscriptions.ts', 'src/utils/result.ts'] },
  { path: 'src/payments/index.ts',         added: 16,  status: 'A', imports: ['src/payments/checkout.ts', 'src/payments/subscriptions.ts'] },
  { path: 'src/api/router.ts',             added: 6, removed: 1, imports: ['src/auth/index.ts', 'src/api/validate.ts', 'src/users/index.ts', 'src/payments/index.ts'] },
]);
commit('Payments: webhook handler', [
  { path: 'src/payments/webhook.ts',       added: 120, status: 'A', imports: ['src/payments/stripe-client.ts', 'src/payments/subscriptions.ts', 'src/db/index.ts'] },
]);
commit('Payments: invoice PDF generation', [
  { path: 'src/payments/invoice.ts',       added: 140, status: 'A', imports: ['src/payments/subscriptions.ts', 'src/users/model.ts'] },
]);

// ── Sprint 7: Web UI ─────────────────────────────────────────────────────
commit('UI: design tokens', [
  { path: 'src/web/tokens.ts',     added: 65, status: 'A' },
  { path: 'src/web/index.html',    added: 30, status: 'A' },
]);
commit('UI: component library — Button, Input', [
  { path: 'src/web/components/Button.tsx', added: 60, status: 'A', imports: ['src/web/tokens.ts'] },
  { path: 'src/web/components/Input.tsx',  added: 55, status: 'A', imports: ['src/web/tokens.ts'] },
  { path: 'src/web/components/index.ts',   added: 8, status: 'A', imports: ['src/web/components/Button.tsx', 'src/web/components/Input.tsx'] },
]);
commit('UI: signup and login forms', [
  { path: 'src/web/forms/SignupForm.tsx',  added: 100, status: 'A', imports: ['src/web/components/index.ts', 'src/web/api-client.ts'] },
  { path: 'src/web/forms/LoginForm.tsx',   added: 90,  status: 'A', imports: ['src/web/components/index.ts', 'src/web/api-client.ts'] },
  { path: 'src/web/api-client.ts',         added: 70,  status: 'A', imports: ['src/web/tokens.ts'] },
]);
commit('UI: dashboard page', [
  { path: 'src/web/pages/Dashboard.tsx',   added: 130, status: 'A', imports: ['src/web/components/index.ts', 'src/web/api-client.ts'] },
]);
commit('UI: billing settings page', [
  { path: 'src/web/pages/Billing.tsx',     added: 120, status: 'A', imports: ['src/web/components/index.ts', 'src/web/api-client.ts'] },
]);
commit('UI: router and shell', [
  { path: 'src/web/router.tsx',            added: 80, status: 'A', imports: ['src/web/pages/Dashboard.tsx', 'src/web/pages/Billing.tsx', 'src/web/forms/SignupForm.tsx', 'src/web/forms/LoginForm.tsx'] },
  { path: 'src/web/main.tsx',              added: 20, status: 'A', imports: ['src/web/router.tsx'] },
]);

// ── Sprint 8: Testing ────────────────────────────────────────────────────
commit('Tests: auth unit tests', [
  { path: 'tests/auth/jwt.test.ts',     added: 60, status: 'A', imports: ['src/auth/jwt.ts'] },
  { path: 'tests/auth/crypto.test.ts',  added: 45, status: 'A', imports: ['src/auth/crypto.ts'] },
  { path: 'tests/auth/login.test.ts',   added: 75, status: 'A', imports: ['src/auth/login.ts'] },
]);
commit('Tests: payment flow integration', [
  { path: 'tests/payments/checkout.test.ts', added: 100, status: 'A', imports: ['src/payments/checkout.ts', 'src/payments/subscriptions.ts'] },
  { path: 'tests/payments/webhook.test.ts',  added: 80,  status: 'A', imports: ['src/payments/webhook.ts'] },
]);
commit('Tests: UI snapshot tests', [
  { path: 'tests/web/Dashboard.test.tsx',    added: 50, status: 'A', imports: ['src/web/pages/Dashboard.tsx'] },
  { path: 'tests/web/Billing.test.tsx',      added: 50, status: 'A', imports: ['src/web/pages/Billing.tsx'] },
]);

// ── Sprint 9: Observability ──────────────────────────────────────────────
commit('Observability: structured logging upgrade', [
  { path: 'src/utils/logger.ts',  added: 40, removed: 25 },
  { path: 'src/observability/metrics.ts', added: 70, status: 'A', imports: ['src/config.ts'] },
]);
commit('Observability: distributed tracing', [
  { path: 'src/observability/tracing.ts', added: 95, status: 'A', imports: ['src/config.ts', 'src/utils/logger.ts'] },
  { path: 'src/api/server.ts', added: 8, removed: 1, imports: ['src/utils/logger.ts', 'src/auth/middleware.ts', 'src/api/error-handler.ts', 'src/observability/tracing.ts'] },
]);

// ── Sprint 10: Refactor + polish ─────────────────────────────────────────
commit('Refactor: extract shared validation schemas', [
  { path: 'src/schemas/user.ts',    added: 45, status: 'A' },
  { path: 'src/schemas/payment.ts', added: 50, status: 'A' },
  { path: 'src/users/handlers.ts',  added: 4, removed: 18, imports: ['src/users/model.ts', 'src/api/validate.ts', 'src/utils/result.ts', 'src/schemas/user.ts'] },
  { path: 'src/payments/checkout.ts', added: 4, removed: 15, imports: ['src/payments/stripe-client.ts', 'src/payments/subscriptions.ts', 'src/utils/result.ts', 'src/schemas/payment.ts'] },
]);
commit('Performance: connection pooling for db client', [
  { path: 'src/db/client.ts', added: 22, removed: 9 },
  { path: 'src/db/pool.ts',   added: 60, status: 'A', imports: ['src/db/client.ts', 'src/config.ts'] },
]);
commit('Caching layer with Redis', [
  { path: 'src/cache/redis-client.ts', added: 65, status: 'A', imports: ['src/config.ts', 'src/utils/logger.ts'] },
  { path: 'src/cache/index.ts',        added: 30, status: 'A', imports: ['src/cache/redis-client.ts'] },
  { path: 'src/users/model.ts', added: 12, removed: 4, imports: ['src/db/index.ts', 'src/cache/index.ts'] },
]);
commit('Docs: developer onboarding guide', [
  { path: 'docs/getting-started.md', added: 120, status: 'A' },
  { path: 'docs/architecture.md',    added: 200, status: 'A' },
  { path: 'docs/api.md',             added: 180, status: 'A' },
]);
commit('Add feature flags system', [
  { path: 'src/flags/index.ts',     added: 80, status: 'A', imports: ['src/db/index.ts', 'src/cache/index.ts'] },
  { path: 'src/flags/admin.ts',     added: 45, status: 'A', imports: ['src/flags/index.ts', 'src/auth/middleware.ts'] },
]);
commit('Email notifications', [
  { path: 'src/notifications/email.ts',   added: 90,  status: 'A', imports: ['src/config.ts', 'src/utils/logger.ts'] },
  { path: 'src/notifications/templates/welcome.html', added: 30, status: 'A' },
  { path: 'src/notifications/templates/receipt.html', added: 40, status: 'A' },
  { path: 'src/auth/signup.ts',     added: 6, removed: 1, imports: ['src/auth/crypto.ts', 'src/db/index.ts', 'src/auth/jwt.ts', 'src/utils/result.ts', 'src/notifications/email.ts'] },
]);
commit('Admin dashboard', [
  { path: 'src/web/pages/Admin.tsx',     added: 150, status: 'A', imports: ['src/web/components/index.ts', 'src/web/api-client.ts'] },
  { path: 'src/web/router.tsx',          added: 4,  removed: 1, imports: ['src/web/pages/Dashboard.tsx', 'src/web/pages/Billing.tsx', 'src/web/forms/SignupForm.tsx', 'src/web/forms/LoginForm.tsx', 'src/web/pages/Admin.tsx'] },
]);

// Fill in shortSha
for (const c of commits) c.shortSha = c.sha.slice(0, 7);

const out = {
  repo: 'demo-saas',
  generatedAt: new Date().toISOString(),
  totalCommits: commits.length,
  firstCommit: commits[0].sha,
  lastCommit: commits[commits.length - 1].sha,
  commits,
};

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(out));
console.log(`✓ Wrote demo dataset → ${outPath}`);
console.log(`  ${commits.length} commits across ${new Set(commits.flatMap(c => c.changes.map(ch => ch.path))).size} files`);
