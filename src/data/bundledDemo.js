/**
 * Pre-baked demo dataset bundled into the app so the visualization works
 * out of the box without running any analyzer scripts.
 *
 * This is the same shape produced by scripts/analyze.mjs:
 *   { repo, commits: [{ sha, date, author, message, stats, changes: [...] }] }
 *
 * To replace this with real data, run `npm run analyze -- <path-to-repo>`
 * and the app will pick up `public/data/history.json` automatically.
 */

const AUTHORS = ['Ada Voss', 'Kai Mendez', 'Nia Okafor', 'Theo Brandt'];

let dayOffset = 0;
function nextDate() {
  dayOffset += 1 + Math.floor(Math.random() * 2);
  const d = new Date(Date.UTC(2024, 0, 1));
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(9 + Math.floor(Math.random() * 9));
  return d.toISOString();
}

let shaCounter = 0;
function sha() {
  shaCounter++;
  return (
    'demo' +
    String(shaCounter).padStart(4, '0') +
    'abcd' +
    Math.floor(Math.random() * 1e8).toString(16).padStart(8, '0')
  );
}

function mk(message, author, changes) {
  const stats = {
    filesChanged: changes.length,
    insertions: changes.reduce((a, c) => a + (c.added || 0), 0),
    deletions: changes.reduce((a, c) => a + (c.removed || 0), 0),
  };
  const s = sha();
  return {
    sha: s,
    shortSha: s.slice(0, 7),
    date: nextDate(),
    author,
    authorEmail: author.toLowerCase().replace(' ', '.') + '@example.com',
    message,
    stats,
    changes: changes.map((c) => ({
      path: c.p,
      added: c.a ?? 30 + Math.floor(Math.random() * 60),
      removed: c.r ?? 0,
      binary: false,
      status: c.s || 'M',
      resolvedImports: c.i || [],
    })),
  };
}

function buildDataset() {
  // Reset for deterministic-ish ordering
  dayOffset = 0;
  shaCounter = 0;

  const c = [];

  // Bootstrap
  c.push(mk('Initial commit — README and license', 'Ada Voss', [
    { p: 'README.md', a: 40, s: 'A' },
    { p: 'LICENSE', a: 21, s: 'A' },
    { p: 'package.json', a: 18, s: 'A' },
  ]));
  c.push(mk('Add build configuration', 'Ada Voss', [
    { p: 'vite.config.js', a: 14, s: 'A' },
    { p: '.eslintrc.json', a: 22, s: 'A' },
    { p: 'tsconfig.json', a: 24, s: 'A' },
  ]));

  // Core
  c.push(mk('Bootstrap application entrypoint', 'Kai Mendez', [
    { p: 'src/index.ts', a: 30, s: 'A' },
    { p: 'src/app.ts', a: 50, s: 'A', i: ['src/index.ts'] },
    { p: 'src/config.ts', a: 25, s: 'A' },
  ]));
  c.push(mk('Add core utilities', 'Kai Mendez', [
    { p: 'src/utils/logger.ts', a: 60, s: 'A' },
    { p: 'src/utils/errors.ts', a: 45, s: 'A' },
    { p: 'src/utils/result.ts', a: 30, s: 'A' },
    { p: 'src/app.ts', a: 12, r: 4, i: ['src/utils/logger.ts', 'src/utils/errors.ts'] },
  ]));

  // Database
  c.push(mk('Set up database client', 'Nia Okafor', [
    { p: 'src/db/client.ts', a: 80, s: 'A', i: ['src/utils/logger.ts', 'src/config.ts'] },
    { p: 'src/db/schema.ts', a: 120, s: 'A' },
    { p: 'src/db/index.ts', a: 15, s: 'A', i: ['src/db/client.ts', 'src/db/schema.ts'] },
  ]));
  c.push(mk('Migration runner', 'Nia Okafor', [
    { p: 'src/db/migrations/001_init.sql', a: 40, s: 'A' },
    { p: 'src/db/migrate.ts', a: 70, s: 'A', i: ['src/db/client.ts', 'src/utils/logger.ts'] },
  ]));
  c.push(mk('Migration: users table', 'Nia Okafor', [
    { p: 'src/db/migrations/002_users.sql', a: 25, s: 'A' },
  ]));
  c.push(mk('Migration: sessions and tokens', 'Nia Okafor', [
    { p: 'src/db/migrations/003_sessions.sql', a: 30, s: 'A' },
  ]));

  // Auth
  c.push(mk('Auth: password hashing primitives', 'Theo Brandt', [
    { p: 'src/auth/crypto.ts', a: 65, s: 'A', i: ['src/utils/errors.ts'] },
  ]));
  c.push(mk('Auth: JWT signing and verification', 'Theo Brandt', [
    { p: 'src/auth/jwt.ts', a: 90, s: 'A', i: ['src/auth/crypto.ts', 'src/config.ts'] },
    { p: 'src/auth/types.ts', a: 25, s: 'A' },
  ]));
  c.push(mk('Auth: signup endpoint', 'Theo Brandt', [
    { p: 'src/auth/signup.ts', a: 100, s: 'A', i: ['src/auth/crypto.ts', 'src/db/index.ts', 'src/auth/jwt.ts', 'src/utils/result.ts'] },
  ]));
  c.push(mk('Auth: login endpoint', 'Theo Brandt', [
    { p: 'src/auth/login.ts', a: 85, s: 'A', i: ['src/auth/crypto.ts', 'src/db/index.ts', 'src/auth/jwt.ts', 'src/utils/result.ts'] },
  ]));
  c.push(mk('Auth: session middleware', 'Theo Brandt', [
    { p: 'src/auth/middleware.ts', a: 70, s: 'A', i: ['src/auth/jwt.ts', 'src/db/index.ts'] },
    { p: 'src/auth/index.ts', a: 20, s: 'A', i: ['src/auth/signup.ts', 'src/auth/login.ts', 'src/auth/middleware.ts'] },
  ]));
  c.push(mk('Auth: refresh token rotation', 'Theo Brandt', [
    { p: 'src/auth/refresh.ts', a: 95, s: 'A', i: ['src/auth/jwt.ts', 'src/db/index.ts'] },
    { p: 'src/auth/index.ts', a: 4, r: 2, i: ['src/auth/signup.ts', 'src/auth/login.ts', 'src/auth/middleware.ts', 'src/auth/refresh.ts'] },
  ]));
  c.push(mk('Auth: harden against timing attacks', 'Theo Brandt', [
    { p: 'src/auth/crypto.ts', a: 12, r: 6 },
    { p: 'src/auth/login.ts', a: 8, r: 4 },
  ]));

  // API
  c.push(mk('API: server bootstrap', 'Kai Mendez', [
    { p: 'src/api/server.ts', a: 75, s: 'A', i: ['src/utils/logger.ts', 'src/auth/middleware.ts'] },
    { p: 'src/api/router.ts', a: 40, s: 'A', i: ['src/auth/index.ts'] },
  ]));
  c.push(mk('API: request validation', 'Kai Mendez', [
    { p: 'src/api/validate.ts', a: 60, s: 'A', i: ['src/utils/errors.ts'] },
    { p: 'src/api/router.ts', a: 10, r: 2, i: ['src/auth/index.ts', 'src/api/validate.ts'] },
  ]));
  c.push(mk('API: error handler middleware', 'Kai Mendez', [
    { p: 'src/api/error-handler.ts', a: 55, s: 'A', i: ['src/utils/errors.ts', 'src/utils/logger.ts'] },
    { p: 'src/api/server.ts', a: 6, r: 2, i: ['src/utils/logger.ts', 'src/auth/middleware.ts', 'src/api/error-handler.ts'] },
  ]));

  // Users
  c.push(mk('Users: profile model', 'Nia Okafor', [
    { p: 'src/users/model.ts', a: 70, s: 'A', i: ['src/db/index.ts'] },
  ]));
  c.push(mk('Users: list and get endpoints', 'Nia Okafor', [
    { p: 'src/users/handlers.ts', a: 90, s: 'A', i: ['src/users/model.ts', 'src/api/validate.ts', 'src/utils/result.ts'] },
    { p: 'src/users/index.ts', a: 18, s: 'A', i: ['src/users/handlers.ts', 'src/users/model.ts'] },
    { p: 'src/api/router.ts', a: 8, r: 2, i: ['src/auth/index.ts', 'src/api/validate.ts', 'src/users/index.ts'] },
  ]));
  c.push(mk('Users: update profile', 'Nia Okafor', [
    { p: 'src/users/handlers.ts', a: 30, r: 4, i: ['src/users/model.ts', 'src/api/validate.ts', 'src/utils/result.ts'] },
  ]));
  c.push(mk('Users: avatar upload', 'Nia Okafor', [
    { p: 'src/users/avatar.ts', a: 110, s: 'A', i: ['src/users/model.ts', 'src/utils/errors.ts'] },
    { p: 'src/users/index.ts', a: 4, r: 1, i: ['src/users/handlers.ts', 'src/users/model.ts', 'src/users/avatar.ts'] },
  ]));

  // Payments
  c.push(mk('Payments: Stripe client wrapper', 'Ada Voss', [
    { p: 'src/payments/stripe-client.ts', a: 95, s: 'A', i: ['src/config.ts', 'src/utils/logger.ts'] },
  ]));
  c.push(mk('Payments: subscription model', 'Ada Voss', [
    { p: 'src/payments/subscriptions.ts', a: 130, s: 'A', i: ['src/db/index.ts', 'src/payments/stripe-client.ts', 'src/users/model.ts'] },
  ]));
  c.push(mk('Payments: checkout flow', 'Ada Voss', [
    { p: 'src/payments/checkout.ts', a: 105, s: 'A', i: ['src/payments/stripe-client.ts', 'src/payments/subscriptions.ts', 'src/utils/result.ts'] },
    { p: 'src/payments/index.ts', a: 16, s: 'A', i: ['src/payments/checkout.ts', 'src/payments/subscriptions.ts'] },
    { p: 'src/api/router.ts', a: 6, r: 1, i: ['src/auth/index.ts', 'src/api/validate.ts', 'src/users/index.ts', 'src/payments/index.ts'] },
  ]));
  c.push(mk('Payments: webhook handler', 'Ada Voss', [
    { p: 'src/payments/webhook.ts', a: 120, s: 'A', i: ['src/payments/stripe-client.ts', 'src/payments/subscriptions.ts', 'src/db/index.ts'] },
  ]));
  c.push(mk('Payments: invoice PDF generation', 'Ada Voss', [
    { p: 'src/payments/invoice.ts', a: 140, s: 'A', i: ['src/payments/subscriptions.ts', 'src/users/model.ts'] },
  ]));

  // Web UI
  c.push(mk('UI: design tokens', 'Kai Mendez', [
    { p: 'src/web/tokens.ts', a: 65, s: 'A' },
    { p: 'src/web/index.html', a: 30, s: 'A' },
  ]));
  c.push(mk('UI: Button and Input components', 'Kai Mendez', [
    { p: 'src/web/components/Button.tsx', a: 60, s: 'A', i: ['src/web/tokens.ts'] },
    { p: 'src/web/components/Input.tsx', a: 55, s: 'A', i: ['src/web/tokens.ts'] },
    { p: 'src/web/components/index.ts', a: 8, s: 'A', i: ['src/web/components/Button.tsx', 'src/web/components/Input.tsx'] },
  ]));
  c.push(mk('UI: signup and login forms', 'Kai Mendez', [
    { p: 'src/web/forms/SignupForm.tsx', a: 100, s: 'A', i: ['src/web/components/index.ts', 'src/web/api-client.ts'] },
    { p: 'src/web/forms/LoginForm.tsx', a: 90, s: 'A', i: ['src/web/components/index.ts', 'src/web/api-client.ts'] },
    { p: 'src/web/api-client.ts', a: 70, s: 'A', i: ['src/web/tokens.ts'] },
  ]));
  c.push(mk('UI: dashboard page', 'Kai Mendez', [
    { p: 'src/web/pages/Dashboard.tsx', a: 130, s: 'A', i: ['src/web/components/index.ts', 'src/web/api-client.ts'] },
  ]));
  c.push(mk('UI: billing settings page', 'Kai Mendez', [
    { p: 'src/web/pages/Billing.tsx', a: 120, s: 'A', i: ['src/web/components/index.ts', 'src/web/api-client.ts'] },
  ]));
  c.push(mk('UI: router and app shell', 'Kai Mendez', [
    { p: 'src/web/router.tsx', a: 80, s: 'A', i: ['src/web/pages/Dashboard.tsx', 'src/web/pages/Billing.tsx', 'src/web/forms/SignupForm.tsx', 'src/web/forms/LoginForm.tsx'] },
    { p: 'src/web/main.tsx', a: 20, s: 'A', i: ['src/web/router.tsx'] },
  ]));

  // Tests
  c.push(mk('Tests: auth unit tests', 'Theo Brandt', [
    { p: 'tests/auth/jwt.test.ts', a: 60, s: 'A', i: ['src/auth/jwt.ts'] },
    { p: 'tests/auth/crypto.test.ts', a: 45, s: 'A', i: ['src/auth/crypto.ts'] },
    { p: 'tests/auth/login.test.ts', a: 75, s: 'A', i: ['src/auth/login.ts'] },
  ]));
  c.push(mk('Tests: payment integration', 'Ada Voss', [
    { p: 'tests/payments/checkout.test.ts', a: 100, s: 'A', i: ['src/payments/checkout.ts', 'src/payments/subscriptions.ts'] },
    { p: 'tests/payments/webhook.test.ts', a: 80, s: 'A', i: ['src/payments/webhook.ts'] },
  ]));
  c.push(mk('Tests: UI snapshot tests', 'Kai Mendez', [
    { p: 'tests/web/Dashboard.test.tsx', a: 50, s: 'A', i: ['src/web/pages/Dashboard.tsx'] },
    { p: 'tests/web/Billing.test.tsx', a: 50, s: 'A', i: ['src/web/pages/Billing.tsx'] },
  ]));

  // Observability + polish
  c.push(mk('Observability: structured logging', 'Theo Brandt', [
    { p: 'src/utils/logger.ts', a: 40, r: 25 },
    { p: 'src/observability/metrics.ts', a: 70, s: 'A', i: ['src/config.ts'] },
  ]));
  c.push(mk('Observability: distributed tracing', 'Theo Brandt', [
    { p: 'src/observability/tracing.ts', a: 95, s: 'A', i: ['src/config.ts', 'src/utils/logger.ts'] },
    { p: 'src/api/server.ts', a: 8, r: 1, i: ['src/utils/logger.ts', 'src/auth/middleware.ts', 'src/api/error-handler.ts', 'src/observability/tracing.ts'] },
  ]));
  c.push(mk('Refactor: extract shared validation schemas', 'Nia Okafor', [
    { p: 'src/schemas/user.ts', a: 45, s: 'A' },
    { p: 'src/schemas/payment.ts', a: 50, s: 'A' },
    { p: 'src/users/handlers.ts', a: 4, r: 18, i: ['src/users/model.ts', 'src/api/validate.ts', 'src/utils/result.ts', 'src/schemas/user.ts'] },
    { p: 'src/payments/checkout.ts', a: 4, r: 15, i: ['src/payments/stripe-client.ts', 'src/payments/subscriptions.ts', 'src/utils/result.ts', 'src/schemas/payment.ts'] },
  ]));
  c.push(mk('Performance: db connection pooling', 'Nia Okafor', [
    { p: 'src/db/client.ts', a: 22, r: 9 },
    { p: 'src/db/pool.ts', a: 60, s: 'A', i: ['src/db/client.ts', 'src/config.ts'] },
  ]));
  c.push(mk('Caching layer with Redis', 'Nia Okafor', [
    { p: 'src/cache/redis-client.ts', a: 65, s: 'A', i: ['src/config.ts', 'src/utils/logger.ts'] },
    { p: 'src/cache/index.ts', a: 30, s: 'A', i: ['src/cache/redis-client.ts'] },
    { p: 'src/users/model.ts', a: 12, r: 4, i: ['src/db/index.ts', 'src/cache/index.ts'] },
  ]));
  c.push(mk('Email notifications', 'Theo Brandt', [
    { p: 'src/notifications/email.ts', a: 90, s: 'A', i: ['src/config.ts', 'src/utils/logger.ts'] },
    { p: 'src/notifications/templates/welcome.html', a: 30, s: 'A' },
    { p: 'src/notifications/templates/receipt.html', a: 40, s: 'A' },
    { p: 'src/auth/signup.ts', a: 6, r: 1, i: ['src/auth/crypto.ts', 'src/db/index.ts', 'src/auth/jwt.ts', 'src/utils/result.ts', 'src/notifications/email.ts'] },
  ]));
  c.push(mk('Feature flags system', 'Kai Mendez', [
    { p: 'src/flags/index.ts', a: 80, s: 'A', i: ['src/db/index.ts', 'src/cache/index.ts'] },
    { p: 'src/flags/admin.ts', a: 45, s: 'A', i: ['src/flags/index.ts', 'src/auth/middleware.ts'] },
  ]));
  c.push(mk('Admin dashboard', 'Kai Mendez', [
    { p: 'src/web/pages/Admin.tsx', a: 150, s: 'A', i: ['src/web/components/index.ts', 'src/web/api-client.ts'] },
    { p: 'src/web/router.tsx', a: 4, r: 1, i: ['src/web/pages/Dashboard.tsx', 'src/web/pages/Billing.tsx', 'src/web/forms/SignupForm.tsx', 'src/web/forms/LoginForm.tsx', 'src/web/pages/Admin.tsx'] },
  ]));
  c.push(mk('Docs: architecture and API guides', 'Ada Voss', [
    { p: 'docs/getting-started.md', a: 120, s: 'A' },
    { p: 'docs/architecture.md', a: 200, s: 'A' },
    { p: 'docs/api.md', a: 180, s: 'A' },
  ]));

  return {
    repo: 'demo-saas',
    generatedAt: new Date().toISOString(),
    totalCommits: c.length,
    firstCommit: c[0].sha,
    lastCommit: c[c.length - 1].sha,
    commits: c,
    isDemo: true,
  };
}

export const bundledDemo = buildDataset();
