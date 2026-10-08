/**
 * The SDK assets ship gzipped.
 *
 * Uncompressed, the two asset trees total ~265 MB, which is over jsDelivr's 150 MB package
 * limit — the CDN refuses to serve the package at all, rather than failing per file.
 * Compressed they are ~78 MB, and the compressed copies are inflated just before use.
 *
 * Only assets that can be intercepted are compressed, so nothing inside the SDK has to
 * change:
 *
 *   worker.wasm     the worker's own `fetch`, via the shim below
 *   sdk.tar         the same, from dart2wasm-land, which calls `globalThis.fetch`
 *   flutter_web.js  `$dartLoader.forceLoadScript`, which is a global we can wrap
 *
 * The two `.map` files are compressed too; they are inert until devtools asks for them.
 * Everything else stays raw, so the SDK's other loading paths are untouched.
 */

export const GZIP_EXTENSION = '.gz';

/**
 * The assets that actually ship gzipped, mirroring `sdk.lock.json`'s `gzip` list. Everything else
 * is served as it is, so asking for its `.gz` would only ever be a 404.
 */
const GZIPPED_ASSETS = [
  'worker.wasm',
  'sdk.tar',
  'dart_sdk.js',
  'dart_sdk.js.map',
  'flutter_web.js',
  'flutter_web.js.map',
];

const GZIPPED_ASSETS_JSON = JSON.stringify(GZIPPED_ASSETS);

/** The file name at the end of a url, with any query string dropped. */
const assetName = (url) => {
  const query = url.indexOf('?');
  const path = query === -1 ? url : url.slice(0, query);
  return path.slice(path.lastIndexOf('/') + 1);
};

const urlOf = (input) => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  if (input && typeof input.url === 'string') return input.url;
  return undefined;
};

/** Whether `url` is one of the gzipped assets, under `assetBase`. */
export const isGzippedAsset = (url, assetBase) =>
  typeof url === 'string' &&
  url.startsWith(assetBase) &&
  GZIPPED_ASSETS.includes(assetName(url));

/**
 * Source for the `fetch` shim, installed in the worker and in the sandbox iframe.
 *
 * It rewrites `${url}` to `${url}.gz` and inflates the response, so callers keep asking for
 * the name they expect. `.wasm` keeps its content type, because `compileStreaming` refuses a
 * response that is not `application/wasm`. If the compressed file is not there the original
 * request is retried, so a host that serves plain files still works.
 *
 * @param {string} assetBase the asset directory url, with a trailing slash
 * @returns {string} JavaScript to evaluate in the target realm
 */
export const fetchShimSource = (assetBase) => `
(function () {
  var realFetch = fetch.bind(globalThis);
  var base = ${JSON.stringify(assetBase)};
  var gzipped = ${GZIPPED_ASSETS_JSON};
  var isGzipped = function (url) {
    var path = url.split('?')[0];
    return gzipped.indexOf(path.slice(path.lastIndexOf('/') + 1)) !== -1;
  };
  globalThis.fetch = function (input, init) {
    var url = typeof input === 'string' ? input
      : input instanceof URL ? input.href
      : input && input.url;
    if (typeof url !== 'string' || url.indexOf(base) !== 0 || !isGzipped(url)) {
      return realFetch(input, init);
    }
    return realFetch(url + '.gz', init).then(function (compressed) {
      if (!compressed.ok) return realFetch(input, init);
      return new Response(compressed.body.pipeThrough(new DecompressionStream('gzip')), {
        headers: {
          'content-type': url.slice(-5) === '.wasm' ? 'application/wasm' : 'application/octet-stream',
        },
      });
    }, function () {
      // A host that answers 404 without CORS headers makes this probe *reject* rather than
      // resolve with ok === false, so the fallback has to be wired to the rejection too.
      return realFetch(input, init);
    });
  };
})();
`;

/**
 * Guards the sandbox's startup script list.
 *
 * The Flutter `sandbox.js` lists `./flutter_web.js` — 129 MB, and the one file that has to be
 * compressed for the package to fit on a CDN — among the scripts it loads with a plain
 * `<script>` tag, where no `fetch` shim can reach it. It also assigns that list
 * unconditionally, so there is nothing to override before the fact.
 *
 * It reads the list exactly once, through `.map`, so an accessor intercepts the assignment and
 * returns an array whose `map` inflates the compressed entries first and loads the rest as
 * written. Nothing in the SDK is modified.
 *
 * @param {string} assetBase absolute asset directory url, with a trailing slash
 * @returns {string} JavaScript to evaluate in the sandbox before `sandbox.js`
 */
export const sandboxScriptsGuardSource = (assetBase) => `
(function () {
  var base = ${JSON.stringify(assetBase)};
  var current;

  var gzipped = ${GZIPPED_ASSETS_JSON};
  var isGzipped = function (url) {
    var path = url.split('?')[0];
    return gzipped.indexOf(path.slice(path.lastIndexOf('/') + 1)) !== -1;
  };

  var inflate = function (url) {
    if (!isGzipped(url)) return Promise.resolve(null);
    return fetch(url + '.gz').then(function (response) {
      if (!response.ok) return null;
      var stream = response.body.pipeThrough(new DecompressionStream('gzip'));
      return new Response(stream).text().then(function (code) {
        return URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      });
    }).catch(function () { return null; });
  };

  Object.defineProperty(self, '$dartpadSandboxScripts', {
    configurable: true,
    get: function () { return current; },
    set: function (value) {
      if (!Array.isArray(value) || value.__dartWasmInflating) {
        current = value;
        return;
      }
      var list = value.slice();
      Object.defineProperty(list, '__dartWasmInflating', { value: true });
      Object.defineProperty(list, 'map', {
        value: function (fn) {
          return Array.prototype.map.call(this, function (entry) {
            if (typeof entry !== 'string') return fn(entry);
            return inflate(new URL(entry, base).href).then(function (blobUrl) {
              return fn(blobUrl || entry);
            });
          });
        },
      });
      current = list;
    },
  });
})();
`;

/** Inflate a gzipped response into bytes. */
export async function inflateBytes(response, fetchImpl = fetch) {
  const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Resolves an SDK script url to one that can be handed to a `<script>` tag.
 *
 * `$dartLoader.forceLoadScript` builds a script element from whatever url it is given, so a
 * gzipped module is inflated into a blob once and reused. Blob urls are origin-scoped and the
 * sandbox is same-origin, so the iframe loads it without further help — and because the cache
 * lives here rather than in the iframe, recreating the sandbox does not re-inflate 129 MB.
 *
 * @param {object} options
 * @param {string} options.assetBase
 * @param {typeof fetch} [options.fetch]
 * @returns {(url: string) => Promise<string>}
 */
export function createScriptInflater({ assetBase, fetch: fetchImpl = fetch }) {
  const cache = new Map();

  return (url) => {
    if (!isGzippedAsset(url, assetBase)) return Promise.resolve(url);
    if (cache.has(url)) return cache.get(url);

    const pending = (async () => {
      const response = await fetchImpl(url + GZIP_EXTENSION);
      if (!response.ok) return url;
      const bytes = await inflateBytes(response, fetchImpl);
      return URL.createObjectURL(new Blob([bytes], { type: 'text/javascript' }));
    })().catch(() => url);

    cache.set(url, pending);
    return pending;
  };
}
