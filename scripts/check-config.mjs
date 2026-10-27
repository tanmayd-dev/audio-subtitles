#!/usr/bin/env node
// Guard for the declarative Worker deployment.
//
// `wrangler.json` must be the single source of truth for the production
// hostname and the cross-origin isolation headers. This check fails loudly
// while the route still holds the documented placeholder, or if the `_headers`
// file that ships COOP/COEP went missing.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

const config = JSON.parse(readFileSync(join(root, 'wrangler.json'), 'utf8'));
const routes = config.env?.production?.routes ?? [];

if (routes.length === 0) {
  failures.push('wrangler.json: env.production.routes is empty');
}

for (const route of routes) {
  const pattern = route.pattern ?? '';
  if (pattern.includes('example.com') || pattern.includes('<')) {
    failures.push(
      `wrangler.json: route still uses the placeholder "${pattern}" - replace it with the real hostname before deploying`,
    );
  }
}

const headersPath = join(root, 'public', '_headers');
if (!existsSync(headersPath)) {
  failures.push('public/_headers is missing; COOP/COEP would not be served');
} else {
  const headers = readFileSync(headersPath, 'utf8');
  for (const [name, value] of [
    ['Cross-Origin-Opener-Policy', 'same-origin'],
    ['Cross-Origin-Embedder-Policy', 'require-corp'],
  ]) {
    if (!new RegExp(`${name}:\\s*${value}`, 'i').test(headers)) {
      failures.push(`public/_headers is missing ${name}: ${value}`);
    }
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`error: ${failure}`);
  process.exit(1);
}

console.log(`deployment config OK (${routes.map((r) => r.pattern).join(', ')})`);
