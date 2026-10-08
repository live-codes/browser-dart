#!/usr/bin/env node
// Bundles src/ into dist/.
//
// The SDK assets under dist/dart and dist/flutter are put there by `npm run fetch` and are
// deliberately left alone: this only rewrites the three files it owns. Clearing dist/ here
// would throw away 253 MB of assets and every build would have to re-download them.

import { build } from 'esbuild';
import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');

/** The files this script owns. Everything else in dist/ belongs to `npm run fetch`. */
const OUTPUTS = ['dart-wasm.mjs', 'dart-wasm.iife.js', 'index.d.ts'];

const banner = {
  js: '/*! @live-codes/dart-wasm — run Dart and Flutter in the browser, with no compilation server. */',
};

const common = {
  bundle: true,
  minify: true,
  platform: 'browser',
  target: 'es2022',
  legalComments: 'external',
  banner,
  logLevel: 'warning',
};

await mkdir(dist, { recursive: true });
await Promise.all(OUTPUTS.map((file) => rm(path.join(dist, file), { force: true })));

// The ES module entry reads `import.meta.url` for its default asset base; the IIFE entry
// reads `document.currentScript` instead, so `import.meta` never reaches a classic script.
await build({
  ...common,
  format: 'esm',
  entryPoints: [path.join(src, 'index.js')],
  outfile: path.join(dist, 'dart-wasm.mjs'),
});

await build({
  ...common,
  format: 'iife',
  entryPoints: [path.join(src, 'iife.js')],
  outfile: path.join(dist, 'dart-wasm.iife.js'),
});

await copyFile(path.join(src, 'index.d.ts'), path.join(dist, 'index.d.ts'));

for (const file of OUTPUTS) {
  const { size } = await stat(path.join(dist, file));
  console.log(`  ${(size / 1024).toFixed(1).padStart(7)} KB  dist/${file}`);
}

// The assets may be stored plainly or gzipped, depending on sdk.lock.json.
const missing = [];
for (const variant of ['dart', 'flutter']) {
  const found = await Promise.all(
    ['worker.wasm', 'worker.wasm.gz'].map((name) =>
      stat(path.join(dist, variant, name)).catch(() => null),
    ),
  );
  if (!found.some(Boolean)) missing.push(`dist/${variant}/`);
}
if (missing.length > 0) {
  console.log(`\nassets not vendored yet: ${missing.join(', ')} — run: npm run fetch`);
}
