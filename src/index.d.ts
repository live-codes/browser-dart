/**
 * Run Dart and Flutter entirely in the browser, with no compilation server.
 *
 * Two halves, so compiling and running can happen in different places:
 *
 *   const compiler = await createCompiler();            // no DOM needed
 *   const program = await compiler.compile('void main() => print("hi");');
 *
 *   const runner = await createRunner({ iframe });      // runs in that document
 *   await runner.run(program);
 *
 * `createDartpad` is both halves wired together, for when they share a place.
 */

/** The two toolchains the DartPad SDK ships. */
export type EngineId = 'dart' | 'flutter';

export interface EngineSpec {
  readonly id: EngineId;
  readonly label: string;
  /** Directory under the asset base that holds this engine's assets. */
  readonly directory: string;
  /** The mode `compileFile` uses when none is given. */
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
export interface CompiledModule {
  /** The module id DDC gave it — `'main'` for a pad's own code. */
  name: string;
  /** The `ddcLibraryBundle`: an AMD-style module that binds against the SDK runtime. */
  code: string;
  /** The map DDC registered for it, or `null` if the build did not emit one. */
  map: SourceMap | null;
}

/**
 * The output of a compile.
 *
 * Not self-contained: the modules bind against the engine's precompiled runtime, so running them
 * needs a `Runner` and the same `engine`'s assets.
 */
export interface Program {
  engine: EngineId;
  mode: string;
  modules: CompiledModule[];
  /** The library the runner calls `main()` on. */
  libraryUri: string;
  /** The compiler log; empty when the program compiled. */
  log: string;
}

/** Either a bare name, a `name: constraint` string, or the two separately. */
export type Dependency = string | { name: string; constraint?: string };

export interface ConsoleEvent {
  level: string;
  message: string;
}

export interface LogEvent {
  message: string;
  source: 'pub' | 'compiler';
}

export interface ErrorEvent {
  message: string;
}

/** Options shared by everything that needs to find the engine's assets. */
export interface AssetOptions {
  engine?: EngineId;
  /**
   * Directory holding the `dart/` and `flutter/` asset trees. Defaults to the directory this
   * module was loaded from — which is correct in `dist/`.
   */
  baseUrl?: string | URL;
  /**
   * An already-resolved asset directory: the engine's own, not the one holding `dart/` and
   * `flutter/`. Takes precedence over `baseUrl`, for callers that resolved it already.
   */
  assetBaseUrl?: string | URL;
}

export interface CompileOptions {
  /** pub.dev packages, e.g. `['http', 'collection: ^1.19.0']`. */
  dependencies?: Dependency[];
  /** A whole pubspec, instead of `dependencies`. */
  pubspec?: string;
  /** Entrypoint filename. Defaults to `'main.dart'`. */
  file?: string;
  /** One of `Compiler.modes`. Defaults to the engine's natural mode. */
  mode?: string;
}

export interface FormatOptions {
  /** The filename the document is known by in the workspace. Defaults to `'main.dart'`. */
  file?: string;
  /** Indentation width. Defaults to `2`. */
  tabSize?: number;
  /** Indent with spaces rather than tabs. Defaults to `true`. */
  insertSpaces?: boolean;
}

export interface CompilerOptions extends AssetOptions {
  /** `pub` and compiler chatter. */
  onLog?: (event: LogEvent) => void;
}

export declare class Compiler {
  static create(options?: CompilerOptions): Promise<Compiler>;

  readonly engine: EngineId;
  readonly modes: string[];
  readonly assetBaseUrl: URL;

  writeFile(uri: string, text: string): Promise<void>;
  readFile(uri: string): Promise<string>;

  /** Run any of `get`, `add`, `remove`, `upgrade`, `downgrade`, `outdated`, `unpack`. */
  pub(command: string, args?: string[]): Promise<{ log: string }>;

  /**
   * Write the pubspec and resolve it, if it is not already resolved.
   * Returns the `pub` log, or `''` when nothing had to be done.
   */
  resolve(pubspec?: string): Promise<string>;

  /** Compile a source string. */
  compile(code: string, options?: CompileOptions): Promise<Program>;

  /** Compile a file already in the workspace, for multi-file pads. */
  compileFile(path?: string, mode?: string): Promise<Program>;

  /** Format Dart source with the SDK's formatter, returning the formatted source. */
  format(code: string, options?: FormatOptions): Promise<string>;

  /** Format a file already in the workspace, returning the formatted source. */
  formatFile(path?: string, options?: Omit<FormatOptions, 'file'>): Promise<string>;

  dispose(): void;
}

export interface RunnerOptions extends AssetOptions {
  /**
   * Where to create the sandbox. Defaults to a hidden element; required for `'flutter'`, since
   * the app renders into the sandbox.
   */
  container?: Element | string;
  /**
   * Run inside an iframe you already have — its document is where the compiled Dart ends up, and
   * it keeps the DOM you put there. This is the one to use to run in a host page.
   */
  iframe?: HTMLIFrameElement;
  /** How long to wait for the sandbox to boot, in ms. Defaults to 180000. */
  timeout?: number;
  onConsole?: (event: ConsoleEvent) => void;
  onError?: (event: ErrorEvent) => void;
}

export declare class Runner {
  static create(options?: RunnerOptions): Promise<Runner>;

  readonly engine: EngineId;
  readonly modes: string[];
  readonly assetBaseUrl: URL;
  /** The document the compiled code runs in. */
  readonly iframe: HTMLIFrameElement;

  /** Load a compiled program into the sandbox and run it. */
  run(
    program: Program,
    options?: { onConsole?: (event: ConsoleEvent) => void; onError?: (event: ErrorEvent) => void },
  ): Promise<unknown>;

  dispose(): void;
}

export interface CreateOptions extends AssetOptions, RunnerOptions {
  onModule?: (module: CompiledModule) => void;
}

export declare class Dartpad {
  static create(options?: CreateOptions): Promise<Dartpad>;

  readonly engine: EngineId;
  readonly modes: string[];
  readonly assetBaseUrl: URL;
  readonly container: Element;

  writeFile(uri: string, text: string): Promise<void>;
  readFile(uri: string): Promise<string>;
  pub(command: string, args?: string[]): Promise<{ log: string }>;
  resolve(pubspec?: string): Promise<string>;

  /** Format Dart source with the SDK's formatter, returning the formatted source. */
  format(code: string, options?: FormatOptions): Promise<string>;

  /** Format a file already in the workspace, returning the formatted source. */
  formatFile(path?: string, options?: Omit<FormatOptions, 'file'>): Promise<string>;

  /** Compile and run a source string. */
  run(code: string, options?: CompileOptions): Promise<{ log: string; modules: CompiledModule[] }>;

  /** Compile and run a file already in the workspace. */
  runFile(path?: string, mode?: string): Promise<{ log: string; modules: CompiledModule[] }>;

  dispose(): Promise<void>;
}

export declare function createCompiler(options?: CompilerOptions): Promise<Compiler>;
export declare function createRunner(options?: RunnerOptions): Promise<Runner>;
export declare function createDartpad(options?: CreateOptions): Promise<Dartpad>;

/** The pubspec a pad is compiled against. Flutter pads must depend on the SDK. */
export declare function buildPubspec(engine: EngineId, dependencies?: Dependency[]): string;

/** `pubspec` `dependencies:` entries for `["http", "collection: ^1.19.0"]`. */
export declare function dependencyLines(dependencies?: Dependency[]): string[];

/** Pull DDC's source map out of a compiled module, or `null` if it has none. */
export declare function parseSourceMap(code: string): SourceMap | null;
