/**
 * The asset base inherited by `createDartpad()` when no `baseUrl` is given.
 *
 * Only the entry points know how this module was loaded — an ES module can read
 * `import.meta.url`, an IIFE has to read `document.currentScript` while it is
 * still evaluating — so they set it here and `core.js` reads it.
 */

let defaultAssetBase;

/** @param {string | URL | undefined} url directory holding the `dart/` and `flutter/` asset trees */
export function setDefaultAssetBase(url) {
  defaultAssetBase = url === undefined || url === null ? undefined : new URL(url);
}

/** @returns {URL | undefined} */
export function getDefaultAssetBase() {
  return defaultAssetBase;
}
