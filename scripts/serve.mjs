#!/usr/bin/env node
// Static server for the PoC and for anything else you want to point at this repository.
//
// It serves the repository root, so /poc/index.html, /dist/dart-wasm.mjs and both asset
// trees are same-origin. None of this belongs in production: any static host works, as
// long as `.wasm` goes out as `application/wasm` — `WebAssembly.compileStreaming` in the
// worker refuses anything else.
//
//   node scripts/serve.mjs
//   PORT=9000 node scripts/serve.mjs

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 8138);

const TYPES = {
  '.bin': 'application/octet-stream',
  '.css': 'text/css; charset=utf-8',
  '.frag': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.tar': 'application/x-tar',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

// The asset trees are pinned by sdk.lock.json and never change under a version, so they can
// be cached hard. Everything else is what you are editing, so it must not be.
const cacheControl = (pathname) =>
  /^\/dist\/(dart|flutter)\//.test(pathname) ? 'public, max-age=31536000, immutable' : 'no-store';

http
  .createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
    const file = path.resolve(root, '.' + (pathname.endsWith('/') ? `${pathname}index.html` : pathname));

    if (file !== root && !file.startsWith(root + path.sep)) {
      response.writeHead(403).end('forbidden');
      return;
    }

    fs.stat(file, (error, stats) => {
      if (error || !stats.isFile()) {
        const hint = pathname.startsWith('/dist/')
          ? '\nassets missing — run: npm run fetch\n'
          : '';
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end(`not found: ${pathname}${hint}`);
        return;
      }
      response.writeHead(200, {
        'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'content-length': stats.size,
        'cache-control': cacheControl(pathname),
        'access-control-allow-origin': '*',
      });
      fs.createReadStream(file).pipe(response);
    });
  })
  .listen(port, () => {
    console.log(`serving ${root}`);
    console.log(`  PoC: http://localhost:${port}/poc/`);
  });
