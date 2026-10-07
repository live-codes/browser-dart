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
  Dartpad,
  createDartpad,
  ENGINES,
  ENGINE_IDS,
  buildPubspec,
  dependencyLines,
  parseSourceMap,
} from './core.js';
