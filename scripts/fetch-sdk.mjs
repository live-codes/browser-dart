#!/usr/bin/env node
/**
 * Vendors the DartPad SDK browser assets used by this project.
 *
 * The Dart team publishes a fully client-side toolchain inside the `dartpad`
 * pub package. `web/dart/` is a Dart-only environment; `web/flutter/` is the
 * same worker plus a precompiled Flutter framework. Both are static assets, so
 * they are copied here verbatim and served from our own origin.
 *
 *   node scripts/fetch-sdk.mjs                        # dart only (default)
 *   node scripts/fetch-sdk.mjs --variant flutter
 *   node scripts/fetch-sdk.mjs --variant all
 *   node scripts/fetch-sdk.mjs --variant flutter --force
 *
 * Requires `tar` on PATH (bundled with Windows 10+, macOS and Linux).
 *
 * When bumping DARTPAD_VERSION, update DARTPAD_SHA256 from:
 *   https://pub.dev/api/packages/dartpad   (archive_sha256)
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DARTPAD_VERSION = '0.0.9';
const DARTPAD_SHA256 = '3ac8de047c0c6b82ff63bc67f2fff2f579d6e4b6218028392b75b982a10c672f';

/**
 * Both variants ship the same worker and DDC runtime. Flutter additionally
 * ships `flutter_web.js`, the precompiled framework (~123 MB), plus fonts and
 * shaders under `assets/`.
 */
const VARIANTS = {
  dart: {
    source: 'web/dart',
    destination: 'public/dart',
    required: [
      'dart_sdk.js',
      'dart_sdk.js.map',
      'dart_stack_trace_mapper.js',
      'ddc_module_loader.js',
      'sandbox.js',
      'sdk.tar',
      'worker.js',
      'worker.mjs',
      'worker.support.js',
      'worker.wasm',
    ],
  },
  flutter: {
    source: 'web/flutter',
    destination: 'public/flutter',
    required: [
      'dart_sdk.js',
      'dart_sdk.js.map',
      'dart_stack_trace_mapper.js',
      'ddc_module_loader.js',
      'flutter.js',
      'flutter_web.js',
      'flutter_web.js.map',
      'sandbox.js',
      'sdk.tar',
      'worker.js',
      'worker.mjs',
      'worker.support.js',
      'worker.wasm',
    ],
  },
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const force = args.includes('--force');

const variantFlag = args.find((arg) => arg.startsWith('--variant'));
const requested =
  args[args.indexOf('--variant') + 1] ?? variantFlag?.split('=')[1] ?? 'dart';

if (requested !== 'all' && !VARIANTS[requested]) {
  console.error(`Unknown --variant "${requested}". Use: dart, flutter or all.`);
  process.exit(1);
}

const selected = requested === 'all' ? Object.keys(VARIANTS) : [requested];

const archiveName = `dartpad-${DARTPAD_VERSION}.tar.gz`;
const archiveUrl = `https://pub.dev/api/archives/${archiveName}`;
const cachedArchive = join(tmpdir(), archiveName);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function run(command, commandArgs) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, commandArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
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
    if (existing?.isFile() && sha256(await readFile(cachedArchive)) === DARTPAD_SHA256) {
      console.log(`Using cached ${cachedArchive}`);
      return cachedArchive;
    }
  }

  console.log(`Downloading ${archiveUrl}`);
  const response = await fetch(archiveUrl);
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);

  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = sha256(bytes);
  if (digest !== DARTPAD_SHA256) {
    throw new Error(
      `Checksum mismatch for dartpad ${DARTPAD_VERSION}\n` +
        `  expected ${DARTPAD_SHA256}\n  actual   ${digest}`,
    );
  }

  await writeFile(cachedArchive, bytes);
  console.log(`Verified sha256 ${digest} (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`);
  return cachedArchive;
}

async function dirSize(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  let total = 0;
  for (const entry of entries) {
    if (entry.isFile()) {
      total += (await stat(join(entry.parentPath ?? dir, entry.name))).size;
    }
  }
  return total;
}

async function vendorVariant(name, archive, extracted) {
  const variant = VARIANTS[name];
  const destination = join(root, variant.destination);

  if (force) await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });

  await run('tar', ['-xzf', archive, '-C', extracted, variant.source]);

  const from = join(extracted, variant.source);
  await cp(from, destination, { recursive: true, force: true });

  for (const file of variant.required) {
    const info = await stat(join(destination, file)).catch(() => null);
    if (!info?.isFile()) throw new Error(`Archive did not contain ${variant.source}/${file}`);
  }

  const count = (await readdir(destination, { recursive: true })).length;
  const size = await dirSize(destination);
  console.log(
    `Vendored ${name} → ${variant.destination} (${count} entries, ` +
      `${(size / 1024 / 1024).toFixed(1)} MB)`,
  );
}

async function main() {
  const archive = await download();
  const extracted = await mkdtemp(join(tmpdir(), 'dartpad-extract-'));
  try {
    for (const name of selected) {
      await vendorVariant(name, archive, extracted);
    }
  } finally {
    await rm(extracted, { recursive: true, force: true });
  }
}

await main();
