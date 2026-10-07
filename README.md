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
| `onConsole` | – | `({ message }) => void` — program output |
| `onError` | – | `({ message }) => void` — uncaught errors and unhandled rejections |
| `onLog` | – | `({ message, source }) => void` — `pub` and compiler chatter, `source` is `'pub'` or `'compiler'` |
| `onModule` | – | `({ code, map }) => void` — each DDC-compiled module, with its source map already parsed |

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

### `dartpad.writeFile(uri, text)` / `readFile(uri)` / `pub(command, args?)`

The workspace. `pub` takes any of `get`, `add`, `remove`, `upgrade`, `downgrade`, `outdated`, `unpack`,
so an "add package" box is a one-liner. `resolve(pubspec?)` writes a pubspec and runs `pub get` only
when it has actually changed.

### Properties

`dartpad.engine`, `dartpad.modes`, `dartpad.assetBaseUrl`, `dartpad.container`.

### `dartpad.dispose()`

Terminates the worker and removes the sandbox. Browsers cannot unload a wasm module, so this drops
references rather than freeing memory — use one instance per page and reuse it.

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

The assets ship inside the package, laid out as `baseUrl` expects:

```
dist/dart/        28 MB   Dart-only toolchain, console run mode
dist/flutter/    225 MB   the same worker plus the precompiled Flutter framework
```

Inside each: `worker.wasm` (DDC + analyzer + pub, dart2wasm), `sdk.tar` (the SDK, loaded into the
worker's in-memory file system), `dart_sdk.js` and `dart_sdk.js.map` (precompiled SDK runtime),
`ddc_module_loader.js`, `sandbox.js`, `dart_stack_trace_mapper.js`. Flutter adds `flutter_web.js`
(123 MB — the framework, precompiled into DDC modules so only *your* code is recompiled), `flutter.js`
and `assets/`.

**253 MB unpacked is a lot.** A Dart pad pays only the 28 MB; Flutter pays all of it. If you serve
both, treat Flutter as a second tier — lazy-load it, and warn before pulling 225 MB. Point `baseUrl`
at a host you control, or at a CDN:

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
The runtime also needs a DOM: there is no Node build, because the sandbox is an iframe.

## Relationship to LiveCodes

LiveCodes consumes this the way it consumes `@live-codes/browser-haskell` and friends: the
`./dist/*` export exists so a host can resolve `@live-codes/dart-wasm@<version>/dist/` and point
`baseUrl` at it. The language definition itself lives in LiveCodes; this package supplies the runtime,
the assets and the protocol client.

## Development

```sh
npm run fetch            # vendor both SDK asset trees into dist/ (253 MB)
npm run fetch:dart       # just Dart (28 MB)
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
