/**
 * The run half: takes a compiled program and executes it in a document.
 *
 * The DartPad SDK's `sandbox.js` already does everything execution needs — it
 * loads the DDC runtime, registers modules, runs `main()` and maps stack traces
 * back to Dart — but it is built to be driven by the worker. So rather than
 * reimplement it, a `Runner` *is* its peer: it puts `sandbox.js` in a document
 * and speaks `loadModule` / `run` to it directly.
 *
 * That is what lets the compiled code run wherever the caller wants — a nested
 * iframe created here, or the host's own results page, where it has the DOM.
 *
 *   const runner = await createRunner({ engine: 'dart', container });
 *   await runner.run(program);
 */

import { getDefaultAssetBase } from './base.js';
import { assetUrlFor, engineOf } from './engines.js';
import { createScriptInflater, fetchShimSource, sandboxScriptsGuardSource } from './inflate.js';
import { RpcClient } from './protocol.js';

/**
 * `$dartLoader.forceLoadScript` is the single choke point every DDC module goes through, and it is
 * a plain global installed by `ddc_module_loader.js`. It exists by the time the sandbox connects,
 * because `sandbox.js` loads that file before it posts `connect` — which is why this runs from the
 * parent, on the iframe's realm, rather than in the srcdoc.
 *
 * This is how `flutter_web.js` — 123 MB, and the one file that has to be compressed for the
 * package to fit on a CDN — reaches the inflater.
 */
function wrapScriptLoader(realm, inflateScript) {
  const loader = realm?.$dartLoader;
  if (!loader || typeof loader.forceLoadScript !== 'function' || loader.__dartWasmInflating) return;

  const original = loader.forceLoadScript;
  loader.__dartWasmInflating = true;
  loader.forceLoadScript = (url, onLoad) => {
    inflateScript(url)
      .then((resolved) => original(resolved, onLoad))
      .catch(() => original(url, onLoad));
  };
}

/** The scripts every sandbox needs, in order. */
const BOOTSTRAP = (assetBase) => `${fetchShimSource(assetBase)}${sandboxScriptsGuardSource(assetBase)}`;

/**
 * Waits for a sandbox to announce itself, and wires up what it cannot do for itself.
 *
 * @returns {Promise<{ iframe: HTMLIFrameElement, port: MessagePort }>}
 */
function awaitSandbox({ iframe, assetBase, timeout }) {
  const inflateScript = createScriptInflater({ assetBase });

  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      if (event.source !== iframe.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.action === 'connect') {
        clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        wrapScriptLoader(iframe.contentWindow, inflateScript);
        resolve({ iframe, port: data.port });
      } else if (data.action === 'error') {
        clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        reject(new Error(`the Dart sandbox failed to load:\n${data.message}`));
      }
    };

    const timer = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('timed out waiting for the Dart sandbox to boot.'));
    }, timeout);

    window.addEventListener('message', onMessage);
  });
}

/**
 * A fresh iframe, sandboxed and same-origin, with `sandbox.js` in it.
 *
 * The capture hook is gone from here: the compiled modules come from the compiler, over the
 * protocol, so nothing has to be smuggled back out of the sandbox any more.
 */
function createSandboxIframe({ assetBase, container, timeout }) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  iframe.title = 'Dart sandbox';
  container.append(iframe);

  const sandboxUrl = new URL('sandbox.js', assetBase).href;
  iframe.srcdoc = [
    '<!DOCTYPE html>',
    '<html><head><meta charset="utf-8">',
    `<script>${BOOTSTRAP(assetBase.href)}</script>`,
    `<script src="${sandboxUrl}" defer></script>`,
    '</head><body></body></html>',
  ].join('');

  return awaitSandbox({ iframe, assetBase: assetBase.href, timeout });
}

/**
 * An iframe the caller already has — the host's results page — with `sandbox.js` injected into it.
 *
 * `sandbox.js` reads `document.currentScript` for its base directory, which is set while a
 * dynamically appended script evaluates, so this works on a document that is already loaded.
 */
function adoptSandboxIframe({ iframe, assetBase, timeout }) {
  const doc = iframe.contentDocument;
  if (!doc) {
    throw new Error('dart-wasm: the given iframe has no same-origin document to run in');
  }
  if (doc.defaultView.__dartWasmSandbox) {
    throw new Error('dart-wasm: that iframe is already running a Dart sandbox');
  }
  doc.defaultView.__dartWasmSandbox = true;

  const bootstrap = doc.createElement('script');
  bootstrap.textContent = BOOTSTRAP(assetBase.href);
  doc.head.append(bootstrap);

  const sandbox = doc.createElement('script');
  sandbox.src = new URL('sandbox.js', assetBase).href;
  doc.head.append(sandbox);

  return awaitSandbox({ iframe, assetBase: assetBase.href, timeout });
}

/** Where a nested sandbox goes when the caller did not say. */
function containerFor(container) {
  if (container) {
    const element =
      typeof container === 'string' ? document.querySelector(container) : container;
    if (!element) throw new TypeError(`dart-wasm: container not found: ${String(container)}`);
    return { element, owned: false };
  }
  const element = document.createElement('div');
  element.dataset.dartWasmSandbox = '';
  element.style.display = 'none';
  document.body.append(element);
  return { element, owned: true };
}

export class Runner {
  #spec;
  #assetBaseUrl;
  #iframe;
  #ownsIframe;
  #ownedContainer;
  #rpc;
  #onConsole;
  #onError;
  #disposed = false;

  constructor({ spec, assetBaseUrl, iframe, ownsIframe, ownedContainer, port, onConsole, onError }) {
    this.#spec = spec;
    this.#assetBaseUrl = assetBaseUrl;
    this.#iframe = iframe;
    this.#ownsIframe = ownsIframe;
    this.#ownedContainer = ownedContainer;
    this.#onConsole = onConsole;
    this.#onError = onError;

    this.#rpc = new RpcClient(port);
    // `sandbox.js` talks to whoever is on the other end of the port, so these arrive directly
    // rather than being re-emitted by the worker as `workspace/sandbox/*`.
    this.#rpc.on('console', ({ level, message }) => this.#onConsole?.({ level, message }));
    this.#rpc.on('error', ({ message }) => this.#onError?.({ message }));
    this.#rpc.on('unhandledRejection', ({ message }) => this.#onError?.({ message }));
  }

  /**
   * @param {object} [options]
   * @param {'dart' | 'flutter'} [options.engine] `'dart'` by default
   * @param {string | URL} [options.baseUrl] directory holding the `dart/` and `flutter/` asset trees
   * @param {Element | string} [options.container] where to create the sandbox. Defaults to a hidden
   *   element; required for `'flutter'`, which renders into the sandbox.
   * @param {HTMLIFrameElement} [options.iframe] run inside an iframe you already have, instead of
   *   creating one — its document is where the compiled Dart ends up
   * @param {(event: { level: string, message: string }) => void} [options.onConsole] program output
   * @param {(event: { message: string }) => void} [options.onError] uncaught errors
   * @returns {Promise<Runner>}
   */
  static async create({
    engine = 'dart',
    baseUrl,
    assetBaseUrl,
    container,
    iframe,
    timeout = 180_000,
    onConsole,
    onError,
  } = {}) {
    const spec = engineOf(engine);
    const resolved = assetBaseUrl
      ? new URL(assetBaseUrl)
      : assetUrlFor(spec, baseUrl, getDefaultAssetBase());

    let target;
    let ownedContainer = null;
    if (iframe) {
      target = await adoptSandboxIframe({ iframe, assetBase: resolved, timeout });
    } else {
      if (!container && spec.id === 'flutter') {
        throw new TypeError(
          "dart-wasm: `container` is required for engine 'flutter' - the app renders into the sandbox.",
        );
      }
      const element = containerFor(container);
      ownedContainer = element.owned ? element.element : null;
      target = await createSandboxIframe({
        assetBase: resolved,
        container: element.element,
        timeout,
      });
    }

    return new Runner({
      spec,
      assetBaseUrl: resolved,
      iframe: target.iframe,
      // An iframe we made is one we clean up; one the caller handed us is theirs to keep.
      ownsIframe: !iframe,
      ownedContainer,
      port: target.port,
      onConsole,
      onError,
    });
  }

  /** `'dart'` or `'flutter'`. */
  get engine() {
    return this.#spec.id;
  }

  /** Run modes this toolchain accepts. */
  get modes() {
    return [...this.#spec.runModes];
  }

  /** The url the assets are served from. */
  get assetBaseUrl() {
    return new URL(this.#assetBaseUrl);
  }

  /** The document the compiled code runs in. */
  get iframe() {
    return this.#iframe;
  }

  /**
   * Load a compiled program into the sandbox and run it.
   *
   * @param {import('./compiler.js').Program} program
   * @param {object} [options]
   * @param {(event: { level: string, message: string }) => void} [options.onConsole] for this run
   * @param {(event: { message: string }) => void} [options.onError] for this run
   */
  async run(program, { onConsole, onError } = {}) {
    if (this.#disposed) throw new Error('dart-wasm: this runner has been disposed');
    if (!program?.libraryUri) {
      throw new TypeError('dart-wasm: expected a compiled program, with a `libraryUri`');
    }

    if (onConsole) this.#onConsole = onConsole;
    if (onError) this.#onError = onError;

    // Modules first, in the order the compiler produced them, then the entrypoint.
    for (const module of program.modules ?? []) {
      await this.#rpc.request('loadModule', { code: module.code, moduleName: module.name });
    }
    return this.#rpc.request('run', { libraryUri: program.libraryUri, mode: program.mode });
  }

  dispose() {
    this.#disposed = true;
    if (this.#ownsIframe) this.#iframe.remove();
    this.#ownedContainer?.remove();
  }
}

/**
 * Run compiled Dart in a document.
 * @returns {Promise<Runner>}
 */
export const createRunner = (options) => Runner.create(options);
