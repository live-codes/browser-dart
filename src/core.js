/**
 * `createDartpad` — the two halves wired together.
 *
 * Use this when compiling and running happen in the same place. When they do
 * not — compiling off the main thread and running in a page you already have —
 * use `createCompiler` and `createRunner` directly. This is only that pair with
 * a sandbox iframe of its own.
 *
 *   import { createDartpad } from '@live-codes/dart-wasm';
 *
 *   const dartpad = await createDartpad({ container: document.body });
 *   await dartpad.run('void main() => print("hello");');
 *   dartpad.dispose();
 */

import { getDefaultAssetBase } from './base.js';
import { Compiler } from './compiler.js';
import { Runner } from './runner.js';
import { assetUrlFor, buildPubspec, engineOf } from './engines.js';

export { ENGINES, ENGINE_IDS, buildPubspec, dependencyLines, parseSourceMap } from './engines.js';
export { Compiler, createCompiler } from './compiler.js';
export { Runner, createRunner } from './runner.js';
export { Runtime, loadRuntime } from './runtime.js';

/** A pad renders into the sandbox, so Flutter needs somewhere visible to put it. */
function containerFor(spec, container) {
  if (typeof document === 'undefined') {
    throw new TypeError(
      'dart-wasm: `createDartpad` needs a document to mount the sandbox; in a Web Worker use `createCompiler` instead.',
    );
  }

  if (container) {
    const element =
      typeof container === 'string' ? document.querySelector(container) : container;
    if (!element) throw new TypeError(`dart-wasm: container not found: ${String(container)}`);
    return { element, owned: false };
  }

  if (spec.id === 'flutter') {
    throw new TypeError(
      "dart-wasm: `container` is required for engine 'flutter' - the app renders into the sandbox.",
    );
  }

  const element = document.createElement('div');
  element.dataset.dartWasmSandbox = '';
  element.style.display = 'none';
  document.body.append(element);
  return { element, owned: true };
}

export class Dartpad {
  #spec;
  #assetBaseUrl;
  #compiler;
  #runner = null;
  #container;
  #ownsContainer;
  #onConsole;
  #onError;
  #onLog;
  #onModule;

  constructor({
    spec,
    assetBaseUrl,
    compiler,
    container,
    ownsContainer,
    onConsole,
    onError,
    onLog,
    onModule,
  }) {
    this.#spec = spec;
    this.#assetBaseUrl = assetBaseUrl;
    this.#compiler = compiler;
    this.#container = container;
    this.#ownsContainer = ownsContainer;
    this.#onConsole = onConsole;
    this.#onError = onError;
    this.#onLog = onLog;
    this.#onModule = onModule;
  }

  /**
   * @param {object} [options]
   * @param {'dart' | 'flutter'} [options.engine] `'dart'` by default
   * @param {string | URL} [options.baseUrl] directory holding the `dart/` and `flutter/` asset
   *   trees. Defaults to the directory this module was loaded from.
   * @param {Element | string} [options.container] where the sandbox iframe is mounted. Required
   *   for `'flutter'`; a hidden element is created for `'dart'`.
   * @param {(event: { level: string, message: string }) => void} [options.onConsole] program output
   * @param {(event: { message: string }) => void} [options.onError] uncaught errors
   * @param {(event: { message: string, source: string }) => void} [options.onLog] `pub` and
   *   compiler chatter
   * @param {(module: { name: string, code: string, map: object | null }) => void} [options.onModule]
   *   each compiled module
   * @returns {Promise<Dartpad>}
   */
  static async create({
    engine = 'dart',
    baseUrl,
    container,
    onConsole,
    onError,
    onLog,
    onModule,
  } = {}) {
    const spec = engineOf(engine);
    const assetBaseUrl = assetUrlFor(spec, baseUrl, getDefaultAssetBase());
    const { element, owned } = containerFor(spec, container);

    const compiler = await Compiler.create({ engine, assetBaseUrl, onLog });

    return new Dartpad({
      spec,
      assetBaseUrl,
      compiler,
      container: element,
      ownsContainer: owned,
      onConsole,
      onError,
      onLog,
      onModule,
    });
  }

  /** `'dart'` or `'flutter'`. */
  get engine() {
    return this.#spec.id;
  }

  /** Run modes this toolchain accepts, in the order the SDK declares them. */
  get modes() {
    return [...this.#spec.runModes];
  }

  /** The url the assets are served from. */
  get assetBaseUrl() {
    return new URL(this.#assetBaseUrl);
  }

  /** The element the sandbox iframe lives in. */
  get container() {
    return this.#container;
  }

  writeFile(uri, text) {
    return this.#compiler.writeFile(uri, text);
  }

  readFile(uri) {
    return this.#compiler.readFile(uri);
  }

  /** Run any of `get`, `add`, `remove`, `upgrade`, `downgrade`, `outdated`, `unpack`. */
  pub(command, args = []) {
    return this.#compiler.pub(command, args);
  }

  /** Write the pubspec and resolve it, if it has not been. */
  resolve(pubspec) {
    return this.#compiler.resolve(pubspec);
  }

  /**
   * Format Dart source with the SDK's formatter.
   *
   * @param {string} code Dart source
   * @param {object} [options] `file`, `tabSize`, `insertSpaces`
   * @returns {Promise<string>} the formatted source
   */
  format(code, options) {
    return this.#compiler.format(code, options);
  }

  /** Format a file already in the workspace. */
  formatFile(path, options) {
    return this.#compiler.formatFile(path, options);
  }

  /**
   * Compile and run a source string.
   *
   * @param {string} code Dart source
   * @param {object} [options] `dependencies`, `pubspec`, `file`, `mode`
   * @returns {Promise<{ log: string, modules: object[] }>}
   */
  async run(code, options) {
    return this.#execute(await this.#compiler.compile(code, options));
  }

  /** Compile and run a file already in the workspace, for multi-file pads. */
  async runFile(path = 'main.dart', mode) {
    return this.#execute(await this.#compiler.compileFile(path, mode));
  }

  async #execute(program) {
    for (const module of program.modules) this.#onModule?.(module);

    // A sandbox runs one entrypoint for its lifetime — `runMain` is not meant to be called twice —
    // so every run gets a fresh one. The compiler, and therefore the resolved packages, is kept.
    await this.#runner?.dispose();
    this.#runner = await Runner.create({
      engine: this.#spec.id,
      assetBaseUrl: this.#assetBaseUrl,
      container: this.#container,
      onConsole: this.#onConsole,
      onError: this.#onError,
    });
    await this.#runner.run(program);

    return { log: program.log, modules: program.modules };
  }

  /** Terminate the worker and remove the sandbox this instance created. */
  async dispose() {
    await this.#runner?.dispose();
    this.#compiler.dispose();
    if (this.#ownsContainer) this.#container.remove();
  }
}

/**
 * Boot a Dart or Flutter environment that compiles and runs in one place.
 * @returns {Promise<Dartpad>}
 */
export const createDartpad = (options) => Dartpad.create(options);
