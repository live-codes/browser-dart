/**
 * ES module entry.
 *
 * `document.currentScript` is null in a module, so the default asset base comes
 * from `import.meta.url`: the built bundle sits next to `dart/` and `flutter/`
 * in `dist/`, which is exactly the base those assets are resolved against.
 */

import { setDefaultAssetBase } from './base.js';

setDefaultAssetBase(new URL('./', import.meta.url));

export {
  // the two halves, for compiling and running in different places
  createCompiler,
  Compiler,
  createRunner,
  Runner,
  // the run half for a document you already have
  loadRuntime,
  Runtime,
  // both halves together, for the simple case
  createDartpad,
  Dartpad,
  // dart-specific helpers
  ENGINES,
  ENGINE_IDS,
  buildPubspec,
  dependencyLines,
  parseSourceMap,
} from './core.js';
