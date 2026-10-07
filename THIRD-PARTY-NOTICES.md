# Third-party notices

Everything in this package that we wrote — `src/`, `scripts/`, and the bundles built from them
in `dist/` — is **MIT** (see [LICENSE](./LICENSE)).

The toolchain under `dist/dart/` and `dist/flutter/` is not ours. It is redistributed verbatim
from the [`dartpad`](https://pub.dev/packages/dartpad) pub package, published by
[tools.dart.dev](https://pub.dev/publishers/tools.dart.dev) as part of the
[Dart SDK](https://github.com/dart-lang/sdk), under **BSD-3-Clause**:

> Copyright 2012, the Dart project authors. All rights reserved.
>
> Redistribution and use in source and binary forms, with or without modification, are
> permitted provided that the following conditions are met:
>
> 1. Redistributions of source code must retain the above copyright notice, this list of
>    conditions and the following disclaimer.
> 2. Redistributions in binary form must reproduce the above copyright notice, this list of
>    conditions and the following disclaimer in the documentation and/or other materials
>    provided with the distribution.
> 3. Neither the name of Google Inc. nor the names of its contributors may be used to endorse
>    or promote products derived from this software without specific prior written permission.
>
> THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS
> OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
> MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
> COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
> EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
> SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
> HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
> TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
> SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

## What each file is

| Path | What it is | License |
| --- | --- | --- |
| `dist/*/worker.wasm` | The dart2wasm build of the DartPad tool worker: DDC, the Dart analyzer, an in-memory file system and a subset of `dart pub` | BSD-3-Clause |
| `dist/*/dart_sdk.js`, `dart_sdk.js.map` | DDC-compiled Dart SDK runtime | BSD-3-Clause |
| `dist/*/dart_stack_trace_mapper.js` | Maps JavaScript frames back to Dart source locations | BSD-3-Clause |
| `dist/*/ddc_module_loader.js` | DDC's AMD-style module loader | BSD-3-Clause |
| `dist/*/sandbox.js` | Wraps the module loader in JSON-RPC; runs inside the sandbox iframe | BSD-3-Clause |
| `dist/*/sdk.tar` | Dart SDK sources and summaries loaded into the worker's in-memory file system | BSD-3-Clause |
| `dist/*/worker.js`, `worker.mjs`, `worker.support.js` | Worker entry point and dart2wasm loader | BSD-3-Clause |
| `dist/flutter/flutter_web.js`, `.map` | DDC-compiled Flutter web framework, precompiled so only user code is recompiled | BSD-3-Clause |
| `dist/flutter/flutter.js` | Flutter's web bootstrap | BSD-3-Clause |
| `dist/flutter/assets/*` | Flutter's default assets | see below |

## Flutter assets

`dist/flutter/assets/NOTICES` is the Flutter project's own notice bundle, shipped unmodified —
it is the authoritative attribution for the Flutter SDK and engine components. In summary,
Flutter itself is BSD-3-Clause, and
`dist/flutter/assets/fonts/MaterialIcons-Regular.otf` is Google's Material Design Icons font,
licensed **Apache-2.0**.

## Not shipped

**CanvasKit** — the Skia-based renderer Flutter pads draw through — is *not* in this package.
The Flutter engine fetches it at runtime from `https://www.gstatic.com/flutter-canvaskit/`,
so that request is made against Google's CDN, not ours.

## Dart packages

Code you compile may resolve packages from [pub.dev](https://pub.dev), each under its own
license. Those are fetched by the `pub` client inside the worker, at your request, and are
subject to their own terms rather than to this package's.
