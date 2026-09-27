#!/usr/bin/env node
/**
 * Vendors the DartPad SDK browser assets into `public/dart/`.
 *
 * The Dart team publishes a fully client-side Dart toolchain inside the
 * `dartpad` pub package: `web/dart/` holds a dart2wasm Web Worker containing
 * the Dart Development Compiler (DDC), the analyzer, an in-memory file system
 * and a subset of `dart pub`, plus `sandbox.js` for executing the compiled
 * output. Those files are static assets, so they are copied here verbatim and
 * served from our own origin.
 *
 *   node scripts/fetch-sdk.mjs           # download if missing, then extract
 *   node scripts/fetch-sdk.mjs --force   # ignore the cached archive
 *
 * Requires `tar` on PATH (bundled with Windows 10+, macOS and Linux).
 *
 * When bumping DARTPAD_VERSION, update DARTPAD_SHA256 from:
 *   https://pub.dev/api/packages/dartpad   (archive_sha256)
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DARTPAD_VERSION = '0.0.6';
const DARTPAD_SHA256 = 'ca0ffa0c9537b6206184d0160e6adc453caefacd738dcfd2235e3563f59194af';

/** `web/dart/` entries this project depends on. */
const ASSETS = [
  'dart_sdk.js',
  // Referenced by a `//# sourceMappingURL=` comment at the end of dart_sdk.js,
  // so the browser fetches it when devtools is open.
  'dart_sdk.js.map',
  'ddc_module_loader.js',
  'sandbox.js',
  'sdk.tar',
  'worker.js',
  'worker.mjs',
  'worker.support.js',
  'worker.wasm',
];

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = join(root, 'public', 'dart');
const force = process.argv.includes('--force');

const archiveName = `dartpad-${DARTPAD_VERSION}.tar.gz`;
const archiveUrl = `https://pub.dev/api/archives/${archiveName}`;
const cachedArchive = join(tmpdir(), archiveName);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function run(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${command} exited with ${code}\n${stderr}`));
    });
  });
}

async function download() {
  if (!force) {
    const existing = await stat(cachedArchive).catch(() => null);
    if (existing?.isFile()) {
      const digest = sha256(await readFile(cachedArchive));
      if (digest === DARTPAD_SHA256) {
        console.log(`Using cached ${cachedArchive}`);
        return cachedArchive;
      }
      console.log('Cached archive does not match the expected checksum; downloading again.');
    }
  }

  console.log(`Downloading ${archiveUrl}`);
  const response = await fetch(archiveUrl);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = sha256(bytes);
  if (digest !== DARTPAD_SHA256) {
    throw new Error(`Checksum mismatch for dartpad ${DARTPAD_VERSION}\n  expected ${DARTPAD_SHA256}\n  actual   ${digest}`);
  }

  await writeFile(cachedArchive, bytes);
  console.log(`Verified sha256 ${digest} (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`);
  return cachedArchive;
}

async function main() {
  const archive = await download();

  if (force) await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });

  const extracted = await mkdtemp(join(tmpdir(), 'dartpad-extract-'));
  try {
    await run('tar', [
      '-xzf',
      archive,
      '-C',
      extracted,
      ...ASSETS.map((asset) => `web/dart/${asset}`),
    ]);

    const from = join(extracted, 'web', 'dart');
    for (const asset of ASSETS) {
      const source = join(from, asset);
      const info = await stat(source).catch(() => null);
      if (!info?.isFile()) throw new Error(`Archive did not contain web/dart/${asset}`);
      await writeFile(join(destination, asset), await readFile(source));
    }
  } finally {
    await rm(extracted, { recursive: true, force: true });
  }

  const files = await readdir(destination);
  const total = await Promise.all(files.map(async (file) => (await stat(join(destination, file))).size));
  console.log(`Vendored ${files.length} files into public/dart/ (${(total.reduce((a, b) => a + b, 0) / 1024 / 1024).toFixed(1)} MB)`);
}

await main();
