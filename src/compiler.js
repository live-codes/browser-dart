/**
 * The compile half: Dart in, JavaScript out. No DOM.
 *
 * `createCompiler` runs the DartPad worker (DDC, the analyzer, an in-memory file
 * system, `dart pub`) and hands back DDC's output as data, so the caller can
 * decide where and how to run it. Nothing here creates an element, an iframe or
 * a global, which is what lets it live in a Web Worker.
 *
 *   const compiler = await createCompiler();
 *   const program = await compiler.compile('void main() => print("hi");');
 *   // program.modules, program.libraryUri
 *
 * A `Program` is not self-contained: the modules bind against the precompiled
 * SDK runtime, so running one needs `createRunner` and the engine's assets.
 */

import { getDefaultAssetBase } from './base.js';
import { assetUrlFor, buildPubspec, engineOf, parseSourceMap } from './engines.js';
import { RpcClient, startWorker } from './protocol.js';

/**
 * What the worker will ask of a sandbox, and what we answer.
 *
 * `loadModule` and `run` are the two that matter — between them they carry the compiled code and
 * the entrypoint the runner has to call. The rest exist so that a second compile, which makes the
 * worker reset first, does not stall.
 */
const STUB_RESULTS = {
  hotRestart: { generation: 0 },
  hotReload: { generation: 0 },
  getHotRestartGeneration: { generation: 0 },
  getHotReloadGeneration: { generation: 0 },
  appMetrics: {},
  invokeExtension: { result: '' },
  close: {},
};

export class Compiler {
  #spec;
  #assetBaseUrl;
  #worker;
  #blobUrl;
  #rpc;
  #workspaceId;
  #workspaceFolder;
  #sandboxId;
  #pubspec;
  #onLog;
  #capture = { modules: [], libraryUri: null, mode: null };

  constructor({ spec, assetBaseUrl, worker, blobUrl, rpc, workspaceId, workspaceFolder, onLog }) {
    this.#spec = spec;
    this.#assetBaseUrl = assetBaseUrl;
    this.#worker = worker;
    this.#blobUrl = blobUrl;
    this.#rpc = rpc;
    this.#workspaceId = workspaceId;
    this.#workspaceFolder = workspaceFolder;
    this.#onLog = onLog;
  }

  /**
   * @param {object} [options]
   * @param {'dart' | 'flutter'} [options.engine] `'dart'` by default
   * @param {string | URL} [options.baseUrl] directory holding the `dart/` and `flutter/` asset
   *   trees. Defaults to the directory this module was loaded from.
   * @param {string | URL} [options.assetBaseUrl] an already-resolved asset directory — the engine's
   *   own, not the one holding `dart/` and `flutter/`. Takes precedence over `baseUrl`, for callers
   *   that resolved it already.
   * @param {(event: { message: string, source: string }) => void} [options.onLog] `pub` and
   *   compiler chatter
   * @returns {Promise<Compiler>}
   */
  static async create({ engine = 'dart', baseUrl, assetBaseUrl, onLog } = {}) {
    const spec = engineOf(engine);
    const resolved = assetBaseUrl
      ? new URL(assetBaseUrl)
      : assetUrlFor(spec, baseUrl, getDefaultAssetBase());
    const { worker, port, blobUrl } = await startWorker({ assetBaseUrl: resolved });
    const rpc = new RpcClient(port);
    const { workspaceId, workspaceFolder } = await rpc.request('createWorkspace', {});

    const compiler = new Compiler({
      spec,
      assetBaseUrl: resolved,
      worker,
      blobUrl,
      rpc,
      workspaceId,
      workspaceFolder,
      onLog,
    });
    await compiler.#connectSandbox();
    return compiler;
  }

  /**
   * Stands in for the SDK's sandbox iframe.
   *
   * The protocol has no "compile" method: `workspace/sandbox/run` compiles and then pushes the
   * result to a sandbox over an internal port. The cheapest way to get the code out is therefore
   * to *be* that sandbox — a port with nothing behind it, which is what keeps this half DOM-free.
   * Nothing is executed here; the code is collected and handed to a runner.
   */
  async #connectSandbox() {
    const channel = new MessageChannel();
    const stub = new RpcClient(channel.port1);

    stub.handle('loadModule', ({ code, moduleName }) => {
      this.#capture.modules.push({ name: moduleName, code, map: parseSourceMap(code) });
      return {};
    });
    stub.handle('run', ({ libraryUri, mode }) => {
      this.#capture.libraryUri = libraryUri;
      this.#capture.mode = mode;
      return { status: 'running' };
    });
    for (const [method, result] of Object.entries(STUB_RESULTS)) {
      stub.handle(method, () => result);
    }

    const { sandboxId } = await this.#rpc.request('workspace/connectSandbox', {
      workspaceId: this.#workspaceId,
      port: channel.port2,
    });
    this.#sandboxId = sandboxId;
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

  writeFile(uri, text) {
    return this.#rpc.request('workspace/writeFileFromText', {
      workspaceId: this.#workspaceId,
      uri,
      text,
    });
  }

  async readFile(uri) {
    const { text } = await this.#rpc.request('workspace/readFileAsText', {
      workspaceId: this.#workspaceId,
      uri,
    });
    return text;
  }

  /** Run any of `get`, `add`, `remove`, `upgrade`, `downgrade`, `outdated`, `unpack`. */
  pub(command, args = []) {
    return this.#rpc.request('workspace/pub', {
      workspaceId: this.#workspaceId,
      uri: '.',
      command,
      args,
    });
  }

  /**
   * Write the pubspec and resolve it, if it is not already resolved.
   *
   * `pub get` is the one step that needs the network; everything after it runs against the
   * worker's own file system, which is why this is memoised.
   *
   * @returns {Promise<string>} the `pub` log, or `''` when nothing had to be done
   */
  async resolve(pubspec) {
    const text = pubspec ?? this.#pubspec ?? buildPubspec(this.#spec);
    if (text === this.#pubspec) return '';

    await this.writeFile('pubspec.yaml', text);
    const { log } = await this.pub('get');
    this.#pubspec = text;
    if (log?.trim()) this.#onLog?.({ message: log.trim(), source: 'pub' });
    return log ?? '';
  }

  /**
   * Compile a source string.
   *
   * @param {string} code Dart source
   * @param {object} [options]
   * @param {string|object[]} [options.dependencies] pub.dev packages, e.g. `['http', 'collection']`
   * @param {string} [options.pubspec] a whole pubspec, instead of `dependencies`
   * @param {string} [options.file] entrypoint filename
   * @param {string} [options.mode] one of `Compiler.modes`
   * @returns {Promise<Program>}
   */
  async compile(code, { dependencies, pubspec, file = 'main.dart', mode } = {}) {
    // Always resolve, even when the caller asked for nothing: DDC needs a package config, and that
    // needs a pubspec to exist. `resolve` is memoised, so this costs one `pub get` per compiler.
    await this.resolve(pubspec ?? buildPubspec(this.#spec, dependencies ?? []));
    await this.writeFile(file, code);
    return this.compileFile(file, mode);
  }

  /**
   * Compile a file that is already in the workspace, for multi-file pads.
   *
   * @returns {Promise<Program>} `{ engine, mode, modules, libraryUri, log }` — `modules` are the
   *   DDC bundles with their source maps already parsed, and `libraryUri` is the entrypoint the
   *   runner calls `runMain` on.
   */
  async compileFile(path = 'main.dart', mode = this.#spec.defaultMode) {
    if (!this.#spec.runModes.includes(mode)) {
      throw new TypeError(
        `dart-wasm: engine '${this.#spec.id}' does not have a '${mode}' mode. Use one of: ${this.#spec.runModes.join(', ')}.`,
      );
    }

    const capture = this.#capture;
    capture.modules = [];
    capture.libraryUri = null;
    capture.mode = null;

    const { log } = await this.#rpc.request('workspace/sandbox/run', {
      workspaceId: this.#workspaceId,
      sandboxId: this.#sandboxId,
      path,
      mode,
    });

    if (!capture.libraryUri) {
      throw new Error('dart-wasm: the compiler produced no runnable entrypoint');
    }
    if (log?.trim()) this.#onLog?.({ message: log.trim(), source: 'compiler' });

    return {
      engine: this.#spec.id,
      mode,
      modules: capture.modules,
      libraryUri: capture.libraryUri,
      log: log ?? '',
    };
  }

  dispose() {
    this.#worker.terminate();
    URL.revokeObjectURL(this.#blobUrl);
  }
}

/**
 * Boot a Dart or Flutter compiler.
 * @returns {Promise<Compiler>}
 */
export const createCompiler = (options) => Compiler.create(options);

/**
 * @typedef {object} Program
 * @property {'dart' | 'flutter'} engine
 * @property {string} mode
 * @property {{ name: string, code: string, map: object | null }[]} modules
 * @property {string} libraryUri
 * @property {string} log
 */
