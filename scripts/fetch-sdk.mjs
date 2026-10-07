#!/usr/bin/env node
// Vendors the DartPad SDK assets named in sdk.lock.json into dist/.
//
// The Dart team publishes a fully client-side toolchain inside the `dartpad` pub package, as two
// independent asset trees: `web/dart/` (Dart only) and `web/flutter/` (the same worker plus a
// precompiled Flutter framework). Both are static assets, so they are copied here verbatim and
// served from our own origin — there is no compilation server anywhere in the picture.
//
//   node scripts/fetch-sdk.mjs                       # dart only (default; 28 MB)
//   node scripts/fetch-sdk.mjs --variant flutter     # add Flutter (225 MB)
//   node scripts/fetch-sdk.mjs --variant all         # both — what publishing requires
//   node scripts/fetch-sdk.mjs --variant all --force # ignore the cached archive
//
// Requires `tar` on PATH (bundled with Windows 10+, macOS and Linux).

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(await readFile(join(root, 'sdk.lock.json'), 'utf8'));

const args = process.argv.slice(2);
const force = args.includes('--force');
const variantIndex = args.findIndex((arg) => arg.startsWith('--variant'));
const requested =
  (variantIndex === -1 ? undefined : args[variantIndex + 1] ?? args[variantIndex].split('=')[1]) ??
  'dart';

if (requested !== 'all' && !lock.variants[requested]) {
  console.error(`Unknown --variant "${requested}". Use one of: ${Object.keys(lock.variants).join(', ')}, all.`);
  process.exit(1);
}

const selected = requested === 'all' ? Object.keys(lock.variants) : [requested];

const archiveName = `dartpad-${lock.version}.tar.gz`;
const cachedArchive = join(tmpdir(), archiveName);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const mib = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const run = (command, commandArgs) =>
  new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, commandArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${command} exited with ${code}\n${stderr}`));
    });
  });

async function download() {
  if (!force) {
    const cached = await stat(cachedArchive).catch(() => null);
    if (cached?.isFile() && sha256(await readFile(cachedArchive)) === lock.sha256) {
      console.log(`Using cached ${cachedArchive}`);
      return cachedArchive;
    }
  }

  console.log(`Downloading ${lock.url}`);
  const response = await fetch(lock.url);
  if (!response.ok) throw new Error(`GET ${lock.url} -> ${response.status} ${response.statusText}`);

  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = sha256(bytes);
  if (digest !== lock.sha256) {
    throw new Error(
      `dartpad ${lock.version} checksum mismatch\n  expected ${lock.sha256}\n  actual   ${digest}`,
    );
  }

  await writeFile(cachedArchive, bytes);
  console.log(`Verified sha256 ${digest} (${mib(bytes.length)})`);
  return cachedArchive;
}

async function dirBytes(dir) {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  let total = 0;
  for (const entry of entries) {
    if (entry.isFile()) total += (await stat(join(entry.parentPath ?? dir, entry.name))).size;
  }
  return total;
}

async function vendor(name, archive, scratch) {
  const variant = lock.variants[name];
  const destination = resolve(root, variant.destination);

  // A variant must never be able to write outside the repository.
  if (!destination.startsWith(root + sep)) {
    throw new Error(`variant "${name}" destination escapes the repository: ${destination}`);
  }

  if (force) await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });

  await run('tar', ['-xzf', archive, '-C', scratch, variant.source]);
  await cp(join(scratch, variant.source), destination, { recursive: true, force: true });

  const missing = [];
  for (const file of variant.required) {
    const info = await stat(join(destination, file)).catch(() => null);
    if (!info?.isFile()) missing.push(file);
  }
  if (missing.length > 0) {
    throw new Error(
      `the archive did not contain every ${variant.source} file this package needs:\n` +
        missing.map((file) => `  ${variant.source}/${file}`).join('\n'),
    );
  }

  const count = (await readdir(destination, { recursive: true })).length;
  console.log(
    `  ok   ${name.padEnd(7)} -> ${relative(root, destination).replace(/\\/g, '/')} ` +
      `(${count} entries, ${mib(await dirBytes(destination))})`,
  );
}

const archive = await download();
const scratch = await mkdtemp(join(tmpdir(), 'dartpad-sdk-'));
try {
  console.log(`\ndartpad ${lock.version} -> dist/`);
  for (const name of selected) await vendor(name, archive, scratch);
} finally {
  await rm(scratch, { recursive: true, force: true });
}

const vendored = [];
for (const name of Object.keys(lock.variants)) {
  const bytes = await dirBytes(resolve(root, lock.variants[name].destination)).catch(() => 0);
  vendored.push(`${name}${bytes ? ` ${mib(bytes)}` : ' (absent)'}`);
}
console.log(`\ndist/: ${vendored.join(', ')}`);
if (selected.length === 1 && Object.keys(lock.variants).length > 1) {
  console.log('note: publishing needs every variant — run with --variant all');
}
