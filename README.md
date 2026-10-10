# @live-codes/dart-wasm

Run **Dart** and **Flutter** entirely in the browser, with **no compilation server**.

The [Dart team's client-side toolchain](https://pub.dev/packages/dartpad) — a dart2wasm worker holding
DDC, the Dart analyzer, an in-memory file system and a subset of `dart pub`, plus a sandboxed iframe
that executes the compiled output — behind a small promise-based API.

```js
import { createDartpad } from '@live-codes/dart-wasm';

const dartpad = await createDartpad({ container: document.body });

await dartpad.run(`
  void main() {
    print('hello from Dart');
  }
`);

dartpad.dispose();
```

A Flutter pad is the same call with `engine: 'flutter'` — see [Flutter](#flutter).

## Install

```sh
npm install @live-codes/dart-wasm
```

Or from a CDN, with no bundler:

```html
<script src="https://cdn.jsdelivr.net/npm/@live-codes/dart-wasm/dist/dart-wasm.iife.js"></script>
<script>
  const dartpad = await DartWasm.createDartpad({ container: document.body });
  await dartpad.run('void main() => print("hi");');
</script>
```

The IIFE build sets `globalThis.DartWasm` and, with no `baseUrl`, loads its assets from the directory
it was served from.

## API

### `createDartpad(options?) → Promise<Dartpad>`

Boots the worker and returns an instance. Booting downloads the toolchain, so do it once per page and
reuse the instance — that is also why a bad `baseUrl` fails here rather than at the first `run`.

| option | default | meaning |
| --- | --- | --- |
| `engine` | `'dart'` | `'dart'` or `'flutter'` |
| `baseUrl` | this module's directory | Where the assets are: a directory holding `dart/` and `flutter/`. In `dist/` that is already correct, so the default works |
| `container` | a hidden element for `'dart'` | Where the sandbox iframe mounts. **Required for `'flutter'`**, since the app renders into the sandbox |
| `onConsole` | – | `({ level, message }) => void` — program output |
| `onError` | – | `({ message }) => void` — uncaught errors and unhandled rejections |
| `onLog` | – | `({ message, source }) => void` — `pub` and compiler chatter, `source` is `'pub'` or `'compiler'` |
| `onModule` | – | `({ name, code, map }) => void` — each DDC-compiled module, with its source map already parsed |

### `dartpad.run(code, options?) → Promise<RunResult>`

Writes the source, resolves dependencies if the pubspec changed, then compiles and runs it.

| option | meaning |
| --- | --- |
| `dependencies` | pub.dev packages: `['http', 'collection: ^1.19.0']`, or `[{ name, constraint }]` |
| `pubspec` | a whole pubspec instead of `dependencies` |
| `file` | entrypoint filename, `'main.dart'` by default |
| `mode` | one of `dartpad.modes`; defaults to the engine's natural mode |

Returns `{ log, modules }` — the compiler log (empty when the program compiled) and the modules DDC
emitted.

### `dartpad.runFile(path?, mode?)`

Compile and run a file already in the workspace, for multi-file pads.

### `dartpad.format(code, options?) → Promise<string>`

Run the SDK's formatter over some Dart and return the formatted source:

```js
const pretty = await dartpad.format('void main(){print("hi");}');
```

There is no `format` method in the worker protocol — the formatter is reached through the language
server, as an LSP `textDocument/formatting` request, so the first call also boots the analyzer. That
happens once per instance.

| option | default | meaning |
| --- | --- | --- |
| `file` | `'main.dart'` | the filename the document is known by in the workspace |
| `tabSize` | `2` | indentation width |
| `insertSpaces` | `true` | indent with spaces rather than tabs |

`dartpad.formatFile(path?, options?)` formats a file already in the workspace, the way `runFile`
runs one. Both are also on `createCompiler`, which is the half to reach for in a Web Worker —
`createDartpad` mounts a sandbox, so it needs a document.

### `dartpad.writeFile(uri, text)` / `readFile(uri)` / `pub(command, args?)`

The workspace. `pub` takes any of `get`, `add`, `remove`, `upgrade`, `downgrade`, `outdated`, `unpack`,
so an "add package" box is a one-liner. `resolve(pubspec?)` writes a pubspec and runs `pub get` only
when it has actually changed.

### Properties

`dartpad.engine`, `dartpad.modes`, `dartpad.assetBaseUrl`, `dartpad.container`.

### `dartpad.dispose()`

Terminates the worker and removes the sandbox. Browsers cannot unload a wasm module, so this drops
references rather than freeing memory — use one instance per page and reuse it.

## Compiling and running separately

`createDartpad` is a convenience: it wires the two halves together for when compiling and running
happen in the same place. When they do not, use the halves directly.

```js
// Wherever you like — a Worker, say. No DOM is involved.
const compiler = await createCompiler({ baseUrl });
const program = await compiler.compile('void main() => print("hi");');
// program.modules      DDC's output, with source maps already parsed
// program.libraryUri   the entrypoint to call main() on

// The document the code should run in.
const runner = await createRunner({ engine, baseUrl, iframe: resultIframe });
await runner.run(program);
```

Passing `iframe` is the point of the split: the compiled Dart runs **in that document**, with the DOM
and the markup already in it — not in a nested sandbox of its own. (Construct a `Runner` without an
`iframe` and it makes one, at which point your HTML and CSS tabs are a document away, which is the
behaviour `createDartpad` has.)

`createCompiler` creates no elements and touches no globals, so it runs in a Web Worker. Only
`createRunner` needs a document.

### `createCompiler(options?) → Promise<Compiler>`

Boots the worker and returns a compiler. Options are `engine`, `baseUrl` and `onLog`.

| member | meaning |
| --- | --- |
| `compile(code, options?) → Promise<Program>` | takes `dependencies`, `pubspec`, `file`, `mode`, exactly as `dartpad.run` |
| `compileFile(path?, mode?)` | compile a file already in the workspace |
| `format(code, options?)` / `formatFile(path?, options?)` | run the SDK's formatter, as on `dartpad` |
| `writeFile` / `readFile` / `pub` / `resolve` | the workspace |
| `engine`, `modes`, `assetBaseUrl` | |
| `dispose()` | terminates the worker |

`compile` resolves the pubspec first, and only runs `pub get` when it has actually changed — so the
network is paid once per compiler.

A `Program` is `{ engine, mode, modules, libraryUri, log }`, and it is **not** self-contained: the
modules bind against the engine's precompiled runtime, so running one needs a `Runner` and the same
engine's assets. A `Program` is data, so it can be posted between contexts.

### `createRunner(options?) → Promise<Runner>`

Puts the SDK's sandbox in a document and drives it. Options are `engine`, `baseUrl`, `container`,
`iframe`, `onConsole` and `onError` — give `container` to have a sandbox created, or `iframe` to use
one you already have.

| member | meaning |
| --- | --- |
| `run(program, options?)` | load the program and call `main()` |
| `engine`, `modes`, `assetBaseUrl`, `iframe` | |
| `dispose()` | removes the sandbox, if it made one |

The modules load in the order the compiler produced them, then the entrypoint runs. This is
deliberately not re-runnable on the same sandbox: `runMain` is not meant to be called twice, which is
why `createDartpad` starts a fresh one per run.

### `loadRuntime(options?) → Promise<Runtime>`

The third way to run: load the engine's runtime straight into the page you are already in, with no
sandbox iframe. `createRunner` needs a document and an iframe; `loadRuntime` needs only the document,
which is what to use when the compiled code belongs in **your** page — the one with the host's DOM,
scripts and styles around it.

```js
const runtime = await loadRuntime({ engine: 'dart', baseUrl });
await runtime.run(program);
```

Options are `engine`, `baseUrl`, `assetBaseUrl`, `document`, `container`, `onConsole` and `onError`.
The engine's scripts load into `document` (the current one by default), and calling it twice for the
same engine and asset base returns the same runtime — one load per page.

| member | meaning |
| --- | --- |
| `run(program)` | register the program's modules, then run its entrypoint |
| `loadModule(module)` | register one compiled module |
| `runMain(libraryUri)` | call `main()` on an entrypoint that is already loaded |
| `engine`, `assetBaseUrl`, `container`, `embedder` | |

There is no `dispose()`: the engine's scripts stay loaded for the life of the page.

For `'flutter'`, `container` is the element the app renders into. Leave it out and the engine falls
back to its full-page host: it mounts its `flutter-view` into `document.body` and fixes it over the
whole viewport. Give it an element and the app embeds into that instead, sized to it:

```js
const runtime = await loadRuntime({
  engine: 'flutter',
  container: '#app',            // or an Element
});
await runtime.run(program);
```

## Flutter

```js
const dartpad = await createDartpad({
  engine: 'flutter',
  container: document.querySelector('#app'),   // the app renders in here
});

await dartpad.run(`
  import 'package:flutter/material.dart';

  void main() => runApp(const MaterialApp(home: Center(child: Text('hello'))));
`);
```

Flutter is not a different code path: `baseUrl` points at `flutter/` instead of `dart/`, and the run
mode is `'flutter'` rather than `'console'`. That mode compiles a generated wrapper around your
entrypoint rather than your file directly — the wrapper is what calls `bootstrapEngine(runApp: …)`, so
your `main()` runs inside the engine.

Flutter's renderer, **CanvasKit**, is fetched at runtime from `https://www.gstatic.com/flutter-canvaskit/`.
It is not part of this package, so a Flutter pad is not fully self-contained the way a Dart one is.

## Assets, and how big this is

The assets ship inside the package, laid out as `baseUrl` expects — **46.3 MB unpacked**, 42.8 MB as
a tarball:

```
dist/dart/        6.9 MB   Dart-only toolchain, console run mode
dist/flutter/    37.2 MB   the same worker plus the precompiled Flutter framework
```

Inside each: `worker.wasm` (DDC + analyzer + pub, dart2wasm), `sdk.tar` (the SDK, loaded into the
worker's in-memory file system), `dart_sdk.js` and `dart_sdk.js.map` (precompiled SDK runtime),
`ddc_module_loader.js`, `sandbox.js`, `dart_stack_trace_mapper.js`. Flutter adds `flutter_web.js`
— the framework, precompiled into DDC modules so only *your* code is recompiled — `flutter.js`
and `assets/`.

A Dart pad pays only the 6.9 MB; Flutter pays all of it, so treat Flutter as a second tier —
lazy-load it, and warn before pulling 37 MB. Point `baseUrl` at a host you control, or at a CDN:

```js
const dartpad = await createDartpad({
  baseUrl: 'https://cdn.jsdelivr.net/npm/@live-codes/dart-wasm/dist/',
  container: document.body,
});
```

### Why some assets are gzipped

Uncompressed these trees are 265 MB, and **jsDelivr refuses to serve a package over 150 MB** — it
rejects the whole package, not just the offending file. So `worker.wasm`, `sdk.tar`, `dart_sdk.js`
(9.8 MB to 1.2 MB), `flutter_web.js` (123 MB to 12.7 MB) and the two `.map` files ship as `.gz` and
are inflated just before use:

| asset | inflated by |
| --- | --- |
| `worker.wasm`, `sdk.tar` | a `fetch` shim in the worker. `worker.js` fetches the wasm with `compileStreaming`, and dart2wasm-land calls `globalThis.fetch` for the tarball, so one shim covers both |
| `dart_sdk.js`, `flutter_web.js` | an accessor over `$dartpadSandboxScripts`, the startup list `sandbox.js` loads with plain `<script>` tags, where no `fetch` shim can reach |
| any module the DDC loader pulls later | a wrapper around `$dartLoader.forceLoadScript`, the one global every DDC script load goes through |
| `dart_sdk.js.map`, `flutter_web.js.map` | nothing — they are inert until devtools asks, and devtools will not find them |

Inflating happens in the page, not in the iframe, so the blob is cached for the lifetime of the
`Dartpad` instance and recreating the sandbox does not re-inflate 123 MB.

**No SDK file is modified.** The rest stays uncompressed, which is the point: `ddc_module_loader.js`,
`sandbox.js`, `dart_stack_trace_mapper.js` and `flutter.js` are small, and leaving them alone keeps
the number of loading paths that have to be hooked down to three.

```js
const dartpad = await createDartpad({
  baseUrl: 'https://cdn.jsdelivr.net/npm/@live-codes/dart-wasm/dist/',
  container: document.body,
});
```

Under a cross-origin-isolated page (`COEP: require-corp`) the host has to send matching CORS/CORP
headers. jsDelivr does. `scripts/serve.mjs` does too, for local work.

## What the compiled output looks like

Dart is compiled by DDC to a `ddcLibraryBundle`: an AMD-style module that binds `defineLibrary` /
`importLibrary` against the precompiled `dart_sdk.js` already loaded in the sandbox. It is **not** a
standalone bundle — it needs the module loader and SDK runtime around it.

```js
// Generated by DDC, the Dart Development Compiler (to JavaScript).
// Module: main
// Flags: canary, emitLibraryBundle, enableAsserts(true)
dartDevEmbedder.defineLibrary("file:///workspace/pad_1/main.dart", (function load__file$58______…) {
  'use strict';
  let core = dartDevEmbedder.importLibrary("dart:core", function (lib) { core = lib; });
  …
```

Each module's source map is handed over in a trailing call, and `onModule` gives it to you parsed:

```js
dartpad.onModule = ({ code, map }) => map?.sources;   // ['workspace/pad_1/main.dart']
```

There is no RPC that says "give me the JavaScript" — the worker sends modules straight into the
sandbox. They are captured by wrapping `URL.createObjectURL` inside the sandbox, which is the point
where `sandbox.js` turns a module into a loadable script.

Two things worth knowing before relying on the maps:

- **A synchronous throw from `main()` is not mapped.** The mapper is wired into `window.onerror` and
  `unhandledrejection`; `run` catches and rethrows only the message, so you get Dart's error text with
  no frames. Asynchronously-thrown errors do come back with `workspace/pad_1/main.dart 6:5` frames.
- **Devtools will not find the map.** The emitted `sourceMappingURL` points at a file that does not
  exist; the map reaches the runtime mapper through `setSourceMap` only.

## Packages

Adding a package needs the network, because `pub get` talks to pub.dev. Running already-resolved code
does not. Flutter is the exception: its packages resolve against the `/pub-cache` bundled in the
Flutter `sdk.tar`, so it works offline.

```js
await dartpad.run(code, { dependencies: ['http', 'collection'] });
```

DDC's library-bundle format compiles whole libraries — there is no tree shaking — so the module grows
with everything you import:

| Engine | Dependencies | Compiled module | Sources in map |
| --- | --- | --- | --- |
| Dart | none | 5.7 KB | 1 |
| Dart | `collection` | 697 KB | 24 |
| Dart | `collection` + `http` | 4.6 MB | 273 |
| Flutter | `provider` | 617 KB | 15 |

`http` is the expensive one because it depends on `package:web`, which pulls in the whole browser-API
library set. Recompiles are cheap once packages are resolved — a re-run with `http` + `collection`
took 3.2 s.

Not supported: build hooks, **Flutter plugins**, Flutter assets, and `build_runner` code generation.
The target is web, so `dart:io` and anything needing a VM is out.

## Requirements

**Chrome/Edge 130+**, or a browser with WebAssembly GC and the JS String builtins proposal — the
worker feature-detects both and refuses to start without them. Safari and Firefox are not there yet.
The runtime also needs a DOM and `DecompressionStream` (Chrome 80+): there is no Node build, because
the sandbox is an iframe.

## Relationship to LiveCodes

LiveCodes consumes this the way it consumes `@live-codes/browser-haskell` and friends: the
`./dist/*` export exists so a host can resolve `@live-codes/dart-wasm@<version>/dist/` and point
`baseUrl` at it. The language definition itself lives in LiveCodes; this package supplies the runtime,
the assets and the protocol client.

For the integration shape LiveCodes wants — compile off the main thread, run in the results page —
use `createCompiler` and `createRunner` rather than `createDartpad`:

- `createCompiler` runs in the compiler worker, where there is no DOM, and returns a `Program`.
- `createRunner({ iframe: resultIframe })` runs it in the results page, so Dart code sees the HTML
  and CSS tabs beside it rather than a sandbox of its own.

Two things to get right: pass `baseUrl` explicitly, because a bundler rewrites `import.meta.url` to
the app's url and the default asset base would then point at the wrong place; and give Flutter a
visible `container`, since it renders into the sandbox.

## Development

```sh
npm run fetch            # vendor both SDK asset trees into dist/ (46.3 MB unpacked)
npm run fetch:dart       # just Dart (6.9 MB)
npm run build            # bundle src/ into dist/
npm run serve            # http://localhost:8138/poc/
npm run check-package    # what `npm publish` would actually contain
```

`poc/index.html` is the proof of concept: an editor, a console, and tabs for the compiled JavaScript
and its source map, with a Dart/Flutter toggle.

`node scripts/fetch-sdk.mjs --variant all --force` re-downloads from the pub.dev archive pinned in
`sdk.lock.json`; the archive's sha256 is verified before anything is extracted. `dist/dart` and
`dist/flutter` are committed, because the whole point of the package is to ship them — `npm run build`
deliberately leaves them alone.

## License

**MIT** for everything we wrote. The Dart and Flutter toolchain in `dist/` is the Dart project's work
under **BSD-3-Clause**, redistributed unmodified; see [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
Nothing here is copyleft, so nothing about it constrains programs you compile.
