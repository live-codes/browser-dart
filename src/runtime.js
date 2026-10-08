/**
 * The run half for a document you already have.
 *
 * `Runner` drives the SDK's `sandbox.js` inside an iframe. When the compiled code
 * should run in the host's *own* page — which is what compiling to JavaScript and
 * handing it to a result page means — there is no iframe to drive, and
 * `sandbox.js` cannot be used: it posts its port to `window.parent`, and the
 * parent is the host, not us.
 *
 * So this does the part of `sandbox.js` that execution needs, in the current
 * document: load the DDC runtime, wire the stack-trace mapper, and expose a way
 * to register modules and call `main()`.
 *
 *   const runtime = await loadRuntime({ engine: 'dart', baseUrl });
 *   await runtime.run(program);
 */

import { getDefaultAssetBase } from './base.js';
import { assetUrlFor, engineOf } from './engines.js';
import { createScriptInflater } from './inflate.js';

/** Loads a script into `doc`, resolving when it has run. */
function loadScript(doc, url) {
  return new Promise((resolve, reject) => {
    const script = doc.createElement('script');
    script.src = url;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`dart-wasm: failed to load ${url}`));
    doc.head.append(script);
  });
}

/** The scripts every engine needs, then what Flutter adds. Order matters. */
const SCRIPTS = {
  dart: ['ddc_module_loader.js', 'dart_stack_trace_mapper.js', 'dart_sdk.js'],
  flutter: [
    'ddc_module_loader.js',
    'dart_stack_trace_mapper.js',
    'flutter.js',
    'dart_sdk.js',
    'flutter_web.js',
  ],
};

/**
 * CanvasKit is not vendored with the SDK. DartPad's sandbox loads the pinned build from gstatic,
 * so the engine is pointed at the same one.
 */
const CANVASKIT_BASE_URL =
  'https://www.gstatic.com/flutter-canvaskit/c3edad8766a937c49d66380894017cad401aab51/';

/** One load per engine and asset base, however many times `loadRuntime` is called. */
const RUNTIMES = new Map();

export class Runtime {
  #scope;
  #engine;
  #assetBaseUrl;
  #generation = 0;

  constructor({ scope, engine, assetBaseUrl }) {
    this.#scope = scope;
    this.#engine = engine;
    this.#assetBaseUrl = assetBaseUrl;
  }

  get engine() {
    return this.#engine;
  }

  get assetBaseUrl() {
    return new URL(this.#assetBaseUrl);
  }

  /** `dartDevEmbedder`, once the runtime is loaded. */
  get embedder() {
    return this.#scope.dartDevEmbedder;
  }

  /**
   * Register one compiled module and evaluate it.
   *
   * DDC bundles call `defineLibrary` as they run, so the order the compiler produced matters.
   */
  async loadModule({ name, code }) {
    const scope = this.#scope;
    const loader = scope.$dartLoader;
    if (!loader) throw new Error('dart-wasm: the DDC module loader is not loaded');

    // The `?n` suffix gives every generation its own script url, so a re-run maps stack traces
    // against the new source map rather than the one cached for the previous generation.
    const url = scope.URL.createObjectURL(
      new scope.Blob([`${code}\n//# sourceURL=${name}.js?${this.#generation++}\n`], {
        type: 'application/javascript',
      }),
    );
    loader.moduleIdToUrl.set(name, url);
    loader.urlToModuleId.set(url, name);

    await new Promise((resolve) => loader.forceLoadScript(url, resolve));
  }

  /** Call `main()` on an entrypoint that has already been loaded. */
  runMain(libraryUri, options = {}) {
    const embedder = this.#scope.dartDevEmbedder;
    if (!embedder) throw new Error('dart-wasm: the DDC runtime is not loaded');
    return embedder.runMain(libraryUri, options);
  }

  /**
   * Boot the Flutter engine around `runMain`, the way the SDK's `runflutter` does.
   *
   * Flutter's compiled entrypoint is a wrapper that only works once the engine exists, and the
   * engine needs a host element and an asset base that `runMain` alone does not set up — without
   * this the engine starts but the app never renders.
   */
  async #runFlutter(libraryUri) {
    const scope = this.#scope;
    const loader = scope._flutter?.loader;
    if (!loader) throw new Error('dart-wasm: flutter.js is not loaded');

    const entrypointUrl = scope.URL.createObjectURL(
      new scope.Blob([`self.dartDevEmbedder.runMain(${JSON.stringify(libraryUri)}, {});`], {
        type: 'application/javascript',
      }),
    );
    try {
      const engineInitializer = await new Promise((resolve) => {
        loader.loadEntrypoint({ entrypointUrl, onEntrypointLoaded: resolve });
      });
      const appRunner = await engineInitializer.initializeEngine({
        canvasKitBaseUrl: CANVASKIT_BASE_URL,
        assetBase: this.#assetBaseUrl.href,
      });
      await appRunner.runApp();
    } finally {
      scope.URL.revokeObjectURL(entrypointUrl);
    }
  }

  /** Register a compiled program's modules, then run its entrypoint. */
  async run(program) {
    if (!program?.libraryUri) {
      throw new TypeError('dart-wasm: expected a compiled program, with a `libraryUri`');
    }
    for (const module of program.modules ?? []) {
      await this.loadModule(module);
    }
    if (program.mode === 'flutter') return this.#runFlutter(program.libraryUri);
    return this.runMain(program.libraryUri);
  }
}

/**
 * Load an engine's runtime into a document and hand back a handle for running compiled programs
 * in it. Calling it again for the same engine and asset base returns the same runtime.
 *
 * @param {object} [options]
 * @param {'dart' | 'flutter'} [options.engine] `'dart'` by default
 * @param {string | URL} [options.baseUrl] directory holding the `dart/` and `flutter/` trees
 * @param {string | URL} [options.assetBaseUrl] an already-resolved engine directory
 * @param {Document} [options.document] defaults to the current document
 * @param {(event: { level: string, message: string }) => void} [options.onConsole] also mirror
 *   what the program prints
 * @param {(event: { message: string }) => void} [options.onError] also mirror uncaught errors
 * @returns {Promise<Runtime>}
 */
export function loadRuntime({
  engine = 'dart',
  baseUrl,
  assetBaseUrl,
  document: doc = typeof document !== 'undefined' ? document : undefined,
  onConsole,
  onError,
} = {}) {
  if (!doc) return Promise.reject(new TypeError('dart-wasm: loadRuntime needs a document'));

  const spec = engineOf(engine);
  const resolved = assetBaseUrl
    ? new URL(assetBaseUrl)
    : assetUrlFor(spec, baseUrl, getDefaultAssetBase());

  const cacheKey = `${spec.id}@${resolved.href}`;
  const cached = RUNTIMES.get(cacheKey);
  if (cached) return cached;

  const pending = (async () => {
    const scope = doc.defaultView ?? globalThis;
    const inflate = createScriptInflater({ assetBase: resolved.href });

    for (const name of SCRIPTS[spec.id]) {
      // Only the assets we compressed come back as blobs; the rest are loaded as they are.
      await loadScript(doc, await inflate(new URL(name, resolved).href));
    }

    // Point Dart's stack-trace mapper at DDC's registry, so frames name Dart files rather than
    // blob urls. This is the same wiring `sandbox.js` does.
    const utility = scope.$dartStackTraceUtility;
    const embedder = scope.dartDevEmbedder;
    if (utility?.setSourceMapProvider && embedder?.debugger) {
      utility.setSourceMapProvider((scriptUrl) => {
        const moduleName = String(scriptUrl).replace(/\.js\?\d+$/, '');
        return embedder.debugger.getSourceMap(moduleName) ?? null;
      });
    }

    if (typeof onConsole === 'function') {
      const original = scope.console.log;
      scope.console.log = (...args) => {
        original.apply(scope.console, args);
        onConsole({ level: 'log', message: args.map(String).join(' ') });
      };
    }
    if (typeof onError === 'function') {
      scope.addEventListener('error', (event) => {
        onError({ message: String(event.error?.stack ?? event.message ?? event) });
      });
      scope.addEventListener('unhandledrejection', (event) => {
        onError({ message: String(event.reason?.stack ?? event.reason ?? event) });
      });
    }

    return new Runtime({ scope, engine: spec.id, assetBaseUrl: resolved });
  })();

  RUNTIMES.set(cacheKey, pending);
  return pending;
}
