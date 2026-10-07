/**
 * Run Dart and Flutter entirely in the browser, with no compilation server.
 *
 * Wraps the DartPad SDK (a dart2wasm worker holding DDC, the analyzer and a
 * subset of `dart pub`, plus a sandboxed iframe that executes the compiled
 * output) in a small promise-based API. The protocol itself lives in
 * `dartpad-client.js`; this module is the part a consumer should use.
 *
 *   import { createDartpad } from '@live-codes/dart-wasm';
 *
 *   const dartpad = await createDartpad({ container: document.body });
 *   await dartpad.run('void main() => print("hello");');
 *   dartpad.dispose();
 */

import { getDefaultAssetBase } from './base.js';
import { DartpadSession, SANDBOX_NOTIFICATIONS } from './dartpad-client.js';

/** The two toolchains the DartPad SDK ships. */
export const ENGINES = {
  dart: {
    id: 'dart',
    label: 'Dart',
    directory: 'dart/',
    defaultMode: 'console',
    runModes: ['console'],
  },
  flutter: {
    id: 'flutter',
    label: 'Flutter',
    directory: 'flutter/',
    defaultMode: 'flutter',
    runModes: ['console', 'flutter'],
  },
};

export const ENGINE_IDS = Object.keys(ENGINES);

/**
 * DDC registers its source map in a trailing
 * `dartDevEmbedder.debugger.setSourceMap("<module>", <json-or-null>)` call.
 * From dartpad 0.0.7 the second argument is a source map v3 whose `sources`
 * point into the worker's in-memory file system, e.g. `workspace/pad_1/main.dart`.
 *
 * @param {string} code a DDC library bundle
 * @returns {object | null} the parsed source map, or null if the module has none
 */
export function parseSourceMap(code) {
  const marker = 'setSourceMap(';
  const start = code.indexOf(marker);
  if (start === -1) return null;

  const args = code.slice(start + marker.length);
  const comma = args.indexOf(',');
  if (comma === -1) return null;

  const rest = args.slice(comma + 1).trimStart();
  const quote = rest[0];
  if (quote !== "'" && quote !== '"') return null;

  let end = -1;
  for (let i = 1; i < rest.length; i += 1) {
    if (rest[i] === '\\') {
      i += 1;
      continue;
    }
    if (rest[i] === quote) {
      end = i;
      break;
    }
  }
  if (end === -1) return null;

  const literal = rest.slice(1, end);
  // Single-quoted payloads are already valid JSON; double-quoted ones need
  // their escaped quotes unwrapped first.
  for (const candidate of [literal, literal.replace(/\\(["\\/])/g, '$1')]) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // try the next quoting form
    }
  }
  return null;
}

const engineOf = (engine) => {
  const spec = typeof engine === 'string' ? ENGINES[engine] : engine;
  if (!spec?.directory) {
    throw new TypeError(
      `dart-wasm: unknown engine ${JSON.stringify(engine)}. Use one of: ${ENGINE_IDS.join(', ')}.`,
    );
  }
  return spec;
};

/** Where the assets for `engine` are, given a base that holds `dart/` and `flutter/`. */
function assetUrlFor(spec, baseUrl) {
  const base = baseUrl ?? getDefaultAssetBase();
  if (!base) {
    throw new TypeError(
      'dart-wasm: no asset base URL. Pass `baseUrl`, or use a build that can work it out.',
    );
  }
  const reference =
    typeof document !== 'undefined' ? document.baseURI : self.location.href;
  return new URL(spec.directory, new URL(base, reference));
}

/** A pad renders into the sandbox, so Flutter needs somewhere visible to put it. */
function containerFor(spec, container) {
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

/**
 * `"http"` and `"http: ^1.2.0"` both work, as does `{ name, constraint }`.
 * @returns {string[]} pubspec `dependencies:` entries
 */
export function dependencyLines(dependencies = []) {
  return dependencies.map((entry) => {
    if (entry && typeof entry === 'object') {
      if (!entry.name) throw new TypeError('dart-wasm: a dependency needs a name');
      return `  ${entry.name}: ${entry.constraint ?? 'any'}`;
    }
    const text = String(entry).trim();
    const index = text.indexOf(':');
    const name = (index === -1 ? text : text.slice(0, index)).trim();
    if (name === '') throw new TypeError('dart-wasm: empty dependency name');
    return `  ${name}: ${index === -1 ? 'any' : text.slice(index + 1).trim()}`;
  });
}

/** The pubspec a pad is compiled against. Flutter pads must depend on the SDK. */
export function buildPubspec(engine, dependencies = []) {
  const spec = engineOf(engine);
  return [
    `name: dartpad_pad`,
    'environment:',
    "  sdk: '>=3.0.0 <4.0.0'",
    'dependencies:',
    ...(spec.id === 'flutter' ? ['  flutter:', '    sdk: flutter'] : []),
    ...dependencyLines(dependencies),
    '',
  ].join('\n');
}

/** A live Dart or Flutter environment. */
export class Dartpad {
  #spec;
  #assetBaseUrl;
  #session;
  #container;
  #ownsContainer;
  #onConsole;
  #onError;
  #onLog;
  #onModule;
  #modules = [];
  #pubspec;

  constructor({ spec, assetBaseUrl, session, container, ownsContainer, onConsole, onError, onLog, onModule }) {
    this.#spec = spec;
    this.#assetBaseUrl = assetBaseUrl;
    this.#session = session;
    this.#container = container;
    this.#ownsContainer = ownsContainer;
    this.#onConsole = onConsole;
    this.#onError = onError;
    this.#onLog = onLog;
    this.#onModule = onModule;

    session.rpc.on(SANDBOX_NOTIFICATIONS.console, (params) => {
      this.#onConsole?.({ message: params?.message ?? '' });
    });
    session.rpc.on(SANDBOX_NOTIFICATIONS.error, (params) => {
      this.#onError?.({ message: params?.message ?? '' });
    });
    session.rpc.on(SANDBOX_NOTIFICATIONS.unhandledRejection, (params) => {
      this.#onError?.({ message: params?.message ?? '' });
    });
  }

  /**
   * @param {object} [options]
   * @param {'dart' | 'flutter'} [options.engine] `'dart'` by default
   * @param {string | URL} [options.baseUrl] directory holding the `dart/` and `flutter/` asset
   *   trees. Defaults to the directory this module was loaded from.
   * @param {Element | string} [options.container] where the sandbox iframe is mounted.
   *   Required for `'flutter'`; a hidden element is created for `'dart'`.
   * @param {(event: { message: string }) => void} [options.onConsole] program output
   * @param {(event: { message: string }) => void} [options.onError] uncaught errors
   * @param {(event: { message: string, source: string }) => void} [options.onLog] other
   *   toolchain chatter: `source` is `'pub'` or `'compiler'`
   * @param {(module: { code: string, map: object | null }) => void} [options.onModule] each
   *   DDC-compiled JavaScript module, with its source map already parsed
   * @returns {Promise<Dartpad>}
   */
  static async create({ engine = 'dart', baseUrl, container, onConsole, onError, onLog, onModule } = {}) {
    const spec = engineOf(engine);
    const assetBaseUrl = assetUrlFor(spec, baseUrl);
    const { element, owned } = containerFor(spec, container);

    // Modules are always captured, because `runFile` reports them; `onModule` is the
    // fan-out. The sink only becomes live once the instance exists to receive them.
    const sink = { push: () => {} };
    const session = await DartpadSession.create({
      assetBaseUrl,
      container: element,
      onModule: (code) => sink.push(code),
    });

    const dartpad = new Dartpad({
      spec,
      assetBaseUrl,
      session,
      container: element,
      ownsContainer: owned,
      onConsole,
      onError,
      onLog,
      onModule,
    });

    sink.push = (code) => dartpad.#recordModule(code);
    return dartpad;
  }

  /**
   * The Flutter bootstrap reaches the sandbox as a JavaScript blob through the same path
   * the compiled modules do, so it has to be told apart from them. DDC stamps every module
   * it emits with the same header.
   */
  #recordModule(code) {
    if (!code.startsWith('// Generated by DDC')) return;
    const module = { code, map: parseSourceMap(code) };
    this.#modules.push(module);
    this.#onModule?.(module);
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
    return this.#session.writeFile(uri, text);
  }

  readFile(uri) {
    return this.#session.readFile(uri);
  }

  /** Run any of `get`, `add`, `remove`, `upgrade`, `downgrade`, `outdated`, `unpack`. */
  pub(command, args = []) {
    return this.#session.pub(command, args);
  }

  /**
   * Write the pubspec and resolve it, if it is not already resolved.
   *
   * `pub get` is the one step that needs the network; everything after it runs
   * against the worker's own file system, which is why this is memoised.
   *
   * @param {string} [pubspec] a whole pubspec; when omitted one is generated from `dependencies`
   * @returns {Promise<string>} the `pub` log, or `''` when nothing had to be done
   */
  async resolve(pubspec) {
    const text = pubspec ?? this.#pubspec ?? buildPubspec(this.#spec);
    if (text === this.#pubspec) return '';

    await this.#session.writeFile('pubspec.yaml', text);
    const { log } = await this.#session.pub('get');
    this.#pubspec = text;
    if (log?.trim()) this.#onLog?.({ message: log.trim(), source: 'pub' });
    return log ?? '';
  }

  /**
   * Compile and run a file that is already in the workspace.
   *
   * The sandbox is recreated per run, because a sandbox runs one entrypoint for
   * its lifetime; the workspace is kept, so resolved packages survive.
   *
   * @param {string} [path] entrypoint, relative to the workspace
   * @param {string} [mode] one of `modes`; defaults to the engine's natural mode
   * @returns {Promise<{ log: string, modules: { code: string, map: object | null }[] }>}
   */
  async runFile(path = 'main.dart', mode = this.#spec.defaultMode) {
    if (!this.#spec.runModes.includes(mode)) {
      throw new TypeError(
        `dart-wasm: engine '${this.#spec.id}' does not have a '${mode}' mode. Use one of: ${this.#spec.runModes.join(', ')}.`,
      );
    }

    this.#modules = [];
    const { log } = await this.#session.run(path, mode);
    if (log?.trim()) this.#onLog?.({ message: log.trim(), source: 'compiler' });

    return { log: log ?? '', modules: [...this.#modules] };
  }

  /**
   * Write a source string, resolve its dependencies, then compile and run it.
   *
   * @param {string} code Dart source
   * @param {object} [options]
   * @param {string|object[]} [options.dependencies] pub.dev packages, e.g. `['http', 'collection: ^1.19.0']`
   * @param {string} [options.pubspec] a whole pubspec, instead of `dependencies`
   * @param {string} [options.file] entrypoint filename
   * @param {string} [options.mode]
   */
  async run(code, { dependencies, pubspec, file = 'main.dart', mode } = {}) {
    const text = pubspec ?? (dependencies ? buildPubspec(this.#spec, dependencies) : undefined);
    if (text) await this.resolve(text);
    await this.#session.writeFile(file, code);
    return this.runFile(file, mode);
  }

  /** Terminate the worker and remove the sandbox this instance created. */
  async dispose() {
    await this.#session.dispose();
    if (this.#ownsContainer) this.#container.remove();
  }
}

/**
 * Boot a Dart or Flutter environment.
 *
 * @param {Parameters<typeof Dartpad.create>[0]} [options]
 * @returns {Promise<Dartpad>}
 */
export const createDartpad = (options) => Dartpad.create(options);
