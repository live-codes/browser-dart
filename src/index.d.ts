/**
 * Run Dart and Flutter entirely in the browser, with no compilation server.
 */

/** The two toolchains the DartPad SDK ships. */
export type EngineId = 'dart' | 'flutter';

export interface EngineSpec {
  readonly id: EngineId;
  readonly label: string;
  /** Directory under the asset base that holds this engine's assets. */
  readonly directory: string;
  /** The mode `runFile` uses when none is given. */
  readonly defaultMode: string;
  /** Modes this toolchain accepts. */
  readonly runModes: string[];
}

export declare const ENGINES: Readonly<Record<EngineId, EngineSpec>>;
export declare const ENGINE_IDS: EngineId[];

/** A source map v3, as DDC emits it. `sources` point into the worker's in-memory file system. */
export interface SourceMap {
  version: number;
  file?: string;
  sourceRoot?: string;
  sources: string[];
  sourcesContent?: (string | null)[];
  names: string[];
  mappings: string;
}

/** One DDC-compiled JavaScript module. */
export interface ModuleEvent {
  /** The `ddcLibraryBundle`: an AMD-style module that binds against the SDK runtime. */
  code: string;
  /** The map DDC registered for it, or `null` if the build did not emit one. */
  map: SourceMap | null;
}

export interface ConsoleEvent {
  message: string;
}

export interface LogEvent {
  message: string;
  source: 'pub' | 'compiler';
}

/** Either a bare name, a `name: constraint` string, or the two separately. */
export type Dependency = string | { name: string; constraint?: string };

export interface CreateOptions {
  /** Defaults to `'dart'`. */
  engine?: EngineId;
  /**
   * Directory holding the `dart/` and `flutter/` asset trees. Defaults to the
   * directory this module was loaded from — which is correct in `dist/`.
   */
  baseUrl?: string | URL;
  /**
   * Where the sandbox iframe is mounted. Required for `'flutter'`, since the app
   * renders into the sandbox; a hidden element is created for `'dart'`.
   */
  container?: Element | string;
  /** Program output. */
  onConsole?: (event: ConsoleEvent) => void;
  /** Uncaught errors and unhandled rejections from the sandbox. */
  onError?: (event: ConsoleEvent) => void;
  /** `pub` and compiler chatter. */
  onLog?: (event: LogEvent) => void;
  /** Each compiled module, as it is loaded into the sandbox. */
  onModule?: (module: ModuleEvent) => void;
}

export interface RunOptions {
  /** pub.dev packages, e.g. `['http', 'collection: ^1.19.0']`. */
  dependencies?: Dependency[];
  /** A whole pubspec, instead of `dependencies`. */
  pubspec?: string;
  /** Entrypoint filename. Defaults to `'main.dart'`. */
  file?: string;
  /** One of `Dartpad.modes`. Defaults to the engine's natural mode. */
  mode?: string;
}

export interface RunResult {
  /** The compiler log; empty when the program compiled. */
  log: string;
  modules: ModuleEvent[];
}

export declare class Dartpad {
  static create(options?: CreateOptions): Promise<Dartpad>;

  readonly engine: EngineId;
  readonly modes: string[];
  readonly assetBaseUrl: URL;
  readonly container: Element;

  writeFile(uri: string, text: string): Promise<void>;
  readFile(uri: string): Promise<string>;

  /** Run any of `get`, `add`, `remove`, `upgrade`, `downgrade`, `outdated`, `unpack`. */
  pub(command: string, args?: string[]): Promise<{ log: string }>;

  /**
   * Write the pubspec and resolve it, if it is not already resolved.
   * Returns the `pub` log, or `''` when nothing had to be done.
   */
  resolve(pubspec?: string): Promise<string>;

  /** Compile and run a file already in the workspace. */
  runFile(path?: string, mode?: string): Promise<RunResult>;

  /** Write a source string, resolve its dependencies, then compile and run it. */
  run(code: string, options?: RunOptions): Promise<RunResult>;

  dispose(): Promise<void>;
}

export declare function createDartpad(options?: CreateOptions): Promise<Dartpad>;

/** The pubspec a pad is compiled against. Flutter pads must depend on the SDK. */
export declare function buildPubspec(engine: EngineId, dependencies?: Dependency[]): string;

/** `pubspec` `dependencies:` entries for `["http", "collection: ^1.19.0"]`. */
export declare function dependencyLines(dependencies?: Dependency[]): string[];

/** Pull DDC's source map out of a compiled module, or `null` if it has none. */
export declare function parseSourceMap(code: string): SourceMap | null;
