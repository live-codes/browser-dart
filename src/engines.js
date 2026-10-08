/**
 * What the two toolchains are, and the Dart-specific knowledge the API needs:
 * where their assets live, what a pubspec looks like, and how to read DDC's
 * source map back out of a compiled module.
 *
 * Nothing here touches the DOM, so it is safe in a worker.
 */

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

/** @returns {object} the engine spec for an id, or the spec itself */
export const engineOf = (engine) => {
  const spec = typeof engine === 'string' ? ENGINES[engine] : engine;
  if (!spec?.directory) {
    throw new TypeError(
      `dart-wasm: unknown engine ${JSON.stringify(engine)}. Use one of: ${ENGINE_IDS.join(', ')}.`,
    );
  }
  return spec;
};

/**
 * Where an engine's assets are, given a base holding `dart/` and `flutter/`.
 *
 * @param {object} spec an engine spec
 * @param {string | URL | undefined} baseUrl
 * @param {URL | undefined} fallback used when `baseUrl` is omitted; entry points
 *   supply it, because only they know how the module was loaded
 */
export function assetUrlFor(spec, baseUrl, fallback) {
  const base = baseUrl ?? fallback;
  if (!base) {
    throw new TypeError(
      'dart-wasm: no asset base URL. Pass `baseUrl`, or use a build that can work it out.',
    );
  }
  const reference = typeof document !== 'undefined' ? document.baseURI : self.location.href;
  return new URL(spec.directory, new URL(base, reference));
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
    'name: dartpad_pad',
    'environment:',
    "  sdk: '>=3.9.0 <4.0.0'",
    'dependencies:',
    ...(spec.id === 'flutter' ? ['  flutter:', '    sdk: flutter'] : []),
    ...dependencyLines(dependencies),
    '',
  ].join('\n');
}

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
