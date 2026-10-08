/**
 * IIFE entry: a classic script for anywhere an ES module cannot go.
 *
 * This file must not mention `import.meta`, or every non-module consumer pays
 * for it. The default asset base is read from `document.currentScript` while
 * the bundle is still evaluating; in a worker that is unavailable, so it falls
 * back to the worker's own location.
 */

import { setDefaultAssetBase } from './base.js';
import {
  Compiler,
  Dartpad,
  ENGINES,
  ENGINE_IDS,
  Runner,
  buildPubspec,
  createCompiler,
  createDartpad,
  createRunner,
  dependencyLines,
  parseSourceMap,
} from './core.js';

const scriptUrl = (() => {
  if (typeof document !== 'undefined' && document.currentScript?.src) {
    return document.currentScript.src;
  }
  if (typeof self !== 'undefined' && self.location?.href) return self.location.href;
  return undefined;
})();

if (scriptUrl) setDefaultAssetBase(new URL('./', scriptUrl));

globalThis.DartWasm = {
  createCompiler,
  Compiler,
  createRunner,
  Runner,
  createDartpad,
  Dartpad,
  ENGINES,
  ENGINE_IDS,
  buildPubspec,
  dependencyLines,
  parseSourceMap,
};
