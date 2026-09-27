/**
 * Minimal static file server for the proof of concept.
 *
 * Dart runs entirely in the browser here - this process only serves files.
 * It exists because module workers and `WebAssembly.compileStreaming` need
 * proper MIME types (and an http(s) origin). Any static host will do.
 *
 *   node server.mjs            -> http://localhost:8130
 *   PORT=9000 node server.mjs
 *   CROSS_ORIGIN_ISOLATED=1 node server.mjs   # adds COOP/COEP headers
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)));
const port = Number(process.env.PORT ?? 8130);
const crossOriginIsolated = process.env.CROSS_ORIGIN_ISOLATED === '1';

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.tar': 'application/x-tar',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

const server = createServer(async (request, response) => {
  const { pathname } = new URL(request.url, `http://${request.headers.host}`);
  const relative = normalize(decodeURIComponent(pathname)).replace(/^[/\\]+/, '');
  const filePath = join(root, relative === '' ? 'index.html' : relative);

  if (filePath !== root && !filePath.startsWith(root + sep)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) {
    response.writeHead(404).end('Not found');
    return;
  }

  const headers = {
    'Content-Type': mimeTypes[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': 'no-cache',
  };

  if (crossOriginIsolated) {
    headers['Cross-Origin-Opener-Policy'] = 'same-origin';
    headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
  }

  response.writeHead(200, headers);
  createReadStream(filePath).pipe(response);
});

server.listen(port, () => {
  console.log(`Serving ${root}`);
  console.log(`  http://localhost:${port}/`);
});
