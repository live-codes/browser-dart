#!/usr/bin/env node
// Guard for `npm pack` / `npm publish`.
//
// This package ships ~253 MB of DartPad SDK assets alongside its bundles, and a package
// that installs but cannot compile is worse than one that refuses to publish — so every
// file package.json promises has to be on disk before npm is allowed to build a tarball.
//
//   node scripts/check-package.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'sdk.lock.json'), 'utf8'));

const bundles = ['dist/dart-wasm.mjs', 'dist/dart-wasm.iife.js', 'dist/index.d.ts'];

const groups = [
  { label: 'bundles', files: bundles, hint: 'npm run build' },
  ...Object.entries(lock.variants).map(([name, variant]) => ({
    label: name,
    files: variant.required.map((file) => `${variant.destination}/${file}`),
    hint: 'npm run fetch',
  })),
];

let failed = false;
let total = 0;

/** A file may be shipped plainly or gzipped; either satisfies the lock. */
const statStored = (relative) => {
  for (const candidate of [relative, `${relative}.gz`]) {
    const stats = fs.statSync(path.join(root, candidate), { throwIfNoEntry: false });
    if (stats?.isFile()) return { relative: candidate, size: stats.size };
  }
  return null;
};

for (const group of groups) {
  const present = [];
  const missing = [];
  let compressed = 0;

  for (const relative of group.files) {
    const stored = statStored(relative);
    if (!stored) {
      missing.push(relative);
      continue;
    }
    present.push(stored.size);
    total += stored.size;
    if (stored.relative.endsWith('.gz')) compressed += 1;
  }

  const bytes = present.reduce((sum, size) => sum + size, 0);
  const status = missing.length === 0 ? 'ok  ' : 'MISS';
  const detail =
    missing.length === 0
      ? `${(bytes / 1048576).toFixed(1)} MB, ${present.length} files` +
        (compressed > 0 ? ` (${compressed} gzipped)` : '')
      : `${missing.length} missing`;
  console.log(`  ${status} ${group.label.padEnd(8)} ${detail}`);

  if (missing.length > 0) {
    failed = true;
    for (const relative of missing) console.log(`         ${relative}`);
    console.log(`         -> ${group.hint}`);
  }
}

console.log(`\n  total   ${(total / 1048576).toFixed(1)} MB uncompressed`);

if (failed) {
  console.error('\ncannot publish: package.json `files` promises more than dist/ holds.');
  console.error('run: npm run fetch && npm run build');
  process.exit(1);
}

console.log('\npackage contents ok');
