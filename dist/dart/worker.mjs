// Compiles a dart2wasm-generated main module from `source` which can then
// be instantiated via the `instantiate` method.
//
// `source` needs to be a `Response` object (or promise thereof) e.g. created
// via the `fetch()` JS API.
export async function compileStreaming(source) {
  const builtins = {builtins: ['js-string'], importedStringConstants: ''};
  return new CompiledApp(
      await _compileStreaming(source, builtins), builtins);
}

// Compiles a dart2wasm-generated wasm module from `bytes` which is then
// instantiable via the `instantiate` method.
export async function compile(bytes) {
  const builtins = {builtins: ['js-string'], importedStringConstants: ''};
  return new CompiledApp(await WebAssembly.compile(bytes, builtins), builtins);
}

let _isCompileStreamingSupported;
async function _compileStreaming(source, builtins) {
  _isCompileStreamingSupported ??= WebAssembly.compileStreaming(
    new Response(
      new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,2,23,1,14,119,97,115,109,58,106,115,45,115,116,114,105,110,103,4,99,97,115,116,0,0]),
      {headers: {'Content-Type': 'application/wasm'}},
    ),
    builtins,
  ).then(() => false, (e) => e instanceof WebAssembly.CompileError);
  if (await _isCompileStreamingSupported) {
    return WebAssembly.compileStreaming(source, builtins);
  }
  return WebAssembly.compile(await (await source).arrayBuffer(), builtins);
}

class CompiledApp {
  constructor(module, builtins) {
    this.module = module;
    this.builtins = builtins;
  }

  // The second argument is an options object containing:
  // `loadDeferredModules` is a JS function that takes an array of module names
  //   matching wasm files produced by the dart2wasm compiler. It also takes a
  //   callback that should be invoked for each loaded module with 2 arguments:
  //   (1) the module name, (2) the loaded module in a format supported by
  //   `WebAssembly.compile` or `WebAssembly.compileStreaming`. The callback
  //   returns a Promise that resolves when the module is instantiated.
  //   loadDeferredModules should return a Promise that resolves when all the
  //   modules have been loaded and the callback promises have resolved.
  // `loadDeferredId` is a JS function that takes load ID produced by the
  //   compiler when the `use-load-ids` option is passed. Each load ID maps to
  //   one or more wasm files as specified in the emitted JSON file. It also
  //   takes a callback that should be invoked for each loaded module with 2
  //   arguments: (1) the module name, (2) the loaded module in a format
  //   supported by `WebAssembly.compile` or `WebAssembly.compileStreaming`.
  //   The callback returns a Promise that resolves when the module is
  //   instantiated.
  //   loadDeferredId should return a Promise that resolves when all the
  //   modules have been loaded and the callback promises have resolved.
  async instantiate(additionalImports, {loadDeferredModules, loadDeferredId} = {}) {
    let dartInstance;

    // Prints to the console
    function printToConsole(value) {
      if (typeof dartPrint == "function") {
        dartPrint(value);
        return;
      }
      if (typeof console == "object" && typeof console.log != "undefined") {
        console.log(value);
        return;
      }
      if (typeof print == "function") {
        print(value);
        return;
      }

      throw "Unable to print message: " + value;
    }

    // A special symbol attached to functions that wrap Dart functions.
    const jsWrappedDartFunctionSymbol = Symbol("JSWrappedDartFunction");

    function finalizeWrapper(dartFunction, wrapped) {
      wrapped.dartFunction = dartFunction;
      wrapped[jsWrappedDartFunctionSymbol] = true;
      return wrapped;
    }

    // Imports
    const dart2wasm = {
            AB: (a, i, v) => a[i] = v,
      AC: s => {
        if (!/^\s*[+-]?(?:Infinity|NaN|(?:\.\d+|\d+(?:\.\d*)?)(?:[eE][+-]?\d+)?)\s*$/.test(s)) {
          return NaN;
        }
        return parseFloat(s);
      },
      AD: x0 => new Uint8Array(x0),
      AE: x0 => x0.statusText,
      B: s => printToConsole(s),
      BB: (a, i) => a[i],
      BC: () => typeof dartUseDateNowForTicks !== "undefined",
      BD: x0 => new Uint8ClampedArray(x0),
      BE: x0 => x0.url,
      C: Function.prototype.call.bind(Number.prototype.toString),
      CB: (a, i) => a.push(i),
      CC: () => Date.now(),
      CD: x0 => new Int16Array(x0),
      CE: x0 => x0.status,
      D: Function.prototype.call.bind(String.prototype.indexOf),
      DB: a => a.length,
      DC: () => 1000 * performance.now(),
      DD: x0 => new Uint16Array(x0),
      DE: x0 => x0.getReader(),
      E: o => o,
      EB: (o, p, r) => o.replaceAll(p, () => r),
      EC: (handle) => clearTimeout(handle),
      ED: (jsArray, jsArrayOffset, wasmArray, wasmArrayOffset, length) => {
        const getValue = dartInstance.exports.$wasmI16ArrayGet;
        for (let i = 0; i < length; i++) {
          jsArray[jsArrayOffset + i] = getValue(wasmArray, wasmArrayOffset + i);
        }
      },
      EE: x0 => x0.read(),
      F: s => JSON.stringify(s),
      FB: s => s.trim(),
      FC: s => new Date(s * 1000).getTimezoneOffset() * 60,
      FD: x0 => new Int32Array(x0),
      FE: x0 => x0.value,
      G: o => {
        if (o === undefined || o === null) return 0;
        if (typeof o === 'number') return 1;
        return 2;
      },
      GB: (o, p) => p in o,
      GC: Date.now,
      GD: (jsArray, jsArrayOffset, wasmArray, wasmArrayOffset, length) => {
        const getValue = dartInstance.exports.$wasmI32ArrayGet;
        for (let i = 0; i < length; i++) {
          jsArray[jsArrayOffset + i] = getValue(wasmArray, wasmArrayOffset + i);
        }
      },
      GE: x0 => x0.done,
      H: x0 => x0.index,
      HB: o => typeof o === 'function' && o[jsWrappedDartFunctionSymbol] === true,
      HC: (b, o) => new DataView(b, o),
      HD: x0 => new Uint32Array(x0),
      HE: x0 => x0.cancel(),
      I: (exn) => {
        let stackString = exn.toString();
        let frames = stackString.split('\n');
        let drop = 4;
        if (frames[0].startsWith('Error')) {
            drop += 1;
        }
        return frames.slice(drop).join('\n');
      },
      IB: f => f.dartFunction,
      IC: (b, o, l) => new DataView(b, o, l),
      ID: x0 => new Float32Array(x0),
      IE: x0 => x0.body,
      J: () => new Error().stack,
      JB: (wasmFunction,f) => finalizeWrapper(f, function(x0) { return wasmFunction(f,arguments.length,x0) }),
      JC: (a, s) => a.join(s),
      JD: x0 => new Float64Array(x0),
      JE: o => {
        if (o === null || o === undefined) return 0;
        if (typeof(o) === 'string') return 1;
        return 2;
      },
      K: o => String(o),
      KB: (wasmFunction,f) => finalizeWrapper(f, function(x0,x1) { return wasmFunction(f,arguments.length,x0,x1) }),
      KC: (a, l) => a.length = l,
      KD: (jsArray, jsArrayOffset, wasmArray, wasmArrayOffset, length) => {
        const getValue = dartInstance.exports.$wasmF64ArrayGet;
        for (let i = 0; i < length; i++) {
          jsArray[jsArrayOffset + i] = getValue(wasmArray, wasmArrayOffset + i);
        }
      },
      KE: x0 => x0.headers,
      L: o => o === undefined,
      LB: (p, s, f) => p.then(s, (e) => f(e, e === undefined)),
      LC: (a, l) => a.length = l,
      LD: x0 => new ArrayBuffer(x0),
      LE: x0 => x0.signal,
      M: (x0,x1) => x0.exec(x1),
      MB: Function.prototype.call.bind(Object.getOwnPropertyDescriptor(DataView.prototype, 'byteLength').get),
      MC: x0 => x0.clearMarks(),
      MD: (x0,x1,x2) => new Uint8Array(x0,x1,x2),
      ME: x0 => x0.abort(),
      N: (x0,x1) => { x0.lastIndex = x1 },
      NB: o => o.buffer,
      NC: x0 => x0.clearMeasures(),
      ND: (x0,x1,x2) => new DataView(x0,x1,x2),
      NE: (x0,x1) => x0.getRandomValues(x1),
      O: o => o,
      OB: (o) => new DataView(o.buffer, o.byteOffset, o.byteLength),
      OC: (x0,x1) => x0.parse(x1),
      OD: (o, p) => o[p],
      OE: () => globalThis.crypto,
      P: (s, m) => {
        try {
          return new RegExp(s, m);
        } catch (e) {
          return String(e);
        }
      },
      PB: (o, start, length) => new Float64Array(o.buffer, o.byteOffset + start, length),
      PC: (x0,x1,x2) => x0.mark(x1,x2),
      PD: x0 => new Array(x0),
      PE: l => new DataView(new ArrayBuffer(l)),
      Q: o => o instanceof RegExp,
      QB: Function.prototype.call.bind(DataView.prototype.setFloat64),
      QC: (x0,x1,x2,x3) => x0.measure(x1,x2,x3),
      QD: (x0,x1,x2) => { x0[x1] = x2 },
      QE: x0 => new DecompressionStream(x0),
      R: (string, times) => string.repeat(times),
      RB: Function.prototype.call.bind(DataView.prototype.getFloat64),
      RC: (o) => {
        const typeofValue = typeof o;
        return (typeofValue === 'object') ||
            typeofValue === 'function';
      },
      RD: o => {
        if (o === null || o === undefined) return 0;
        if (o instanceof Float64Array) return 1;
        return 2;
      },
      RE: x0 => x0.getWriter(),
      S: (s, p, i) => s.lastIndexOf(p, i),
      SB: (o, start, length) => new Float32Array(o.buffer, o.byteOffset + start, length),
      SC: () => globalThis.JSON,
      SD: o => {
        if (o === null || o === undefined) return 0;
        if (o instanceof Float32Array) return 1;
        return 2;
      },
      SE: (x0,x1) => x0.write(x1),
      T: o => o,
      TB: Function.prototype.call.bind(DataView.prototype.setFloat32),
      TC: x0 => x0.clearMarks,
      TD: o => {
        if (o === null || o === undefined) return 0;
        if (o instanceof Uint32Array) return 1;
        return 2;
      },
      TE: x0 => x0.close(),
      U: o => {
        if (o === undefined || o === null) return 0;
        if (typeof o === 'boolean') return 1;
        return 2;
      },
      UB: Function.prototype.call.bind(DataView.prototype.getFloat32),
      UC: x0 => x0.clearMeasures,
      UD: o => {
        if (o === null || o === undefined) return 0;
        if (o instanceof Int32Array) return 1;
        return 2;
      },
      UE: x0 => x0.releaseLock(),
      V: x0 => x0.dotAll,
      VB: (o, start, length) => new Uint32Array(o.buffer, o.byteOffset + start, length),
      VC: x0 => x0.mark,
      VD: o => o instanceof Uint16Array,
      VE: x0 => x0.readable,
      W: x0 => x0.unicode,
      WB: Function.prototype.call.bind(DataView.prototype.setUint32),
      WC: x0 => x0.measure,
      WD: o => o instanceof Int16Array,
      WE: x0 => x0.writable,
      X: x0 => x0.ignoreCase,
      XB: Function.prototype.call.bind(DataView.prototype.getUint32),
      XC: () => globalThis.performance,
      XD: o => o instanceof Uint8ClampedArray,
      XE: s => {
        if (/[[\]{}()*+?.\\^$|]/.test(s)) {
            s = s.replace(/[[\]{}()*+?.\\^$|]/g, '\\$&');
        }
        return s;
      },
      Y: x0 => x0.multiline,
      YB: (o, start, length) => new Int32Array(o.buffer, o.byteOffset + start, length),
      YC: o => o.byteOffset,
      YD: o => {
        if (o === null || o === undefined) return 0;
        if (o instanceof Uint8Array) return 1;
        return 2;
      },
      YE: (d, precision) => d.toPrecision(precision),
      Z: Function.prototype.call.bind(Number.prototype.toString),
      ZB: Function.prototype.call.bind(DataView.prototype.setInt32),
      ZC: (a, i) => a.splice(i, 1)[0],
      ZD: o => {
        if (o === null || o === undefined) return 0;
        if (o instanceof Int8Array) return 1;
        return 2;
      },
      ZE: (wasmFunction,f) => finalizeWrapper(f, function(x0) { return wasmFunction(f,arguments.length,x0) }),
      a: Function.prototype.call.bind(BigInt.prototype.toString),
      aB: Function.prototype.call.bind(DataView.prototype.getInt32),
      aC: (a, b) => a == b ? 0 : (a > b ? 1 : -1),
      aD: () => new Array(),
      aE: (wasmFunction,f) => finalizeWrapper(f, function(x0) { return wasmFunction(f,arguments.length,x0) }),
      b: (exn) => {
        if (exn instanceof Error) {
          return exn.stack;
        } else {
          return null;
        }
      },
      bB: (o, start, length) => new Uint16Array(o.buffer, o.byteOffset + start, length),
      bC: (d, digits) => d.toFixed(digits),
      bD: (x0,x1) => new WebSocket(x0,x1),
      bE: x0 => x0.start(),
      c: (c) =>
      queueMicrotask(() => dartInstance.exports.$invokeCallback(c)),
      cB: Function.prototype.call.bind(DataView.prototype.setUint16),
      cC: () => new WeakMap(),
      cD: x0 => x0.reason,
      cE: x0 => x0.close(),
      d: (map, o, v) => map.set(o, v),
      dB: Function.prototype.call.bind(DataView.prototype.getUint16),
      dC: (o, offsetInBytes, lengthInBytes) => {
        var dst = new ArrayBuffer(lengthInBytes);
        new Uint8Array(dst).set(new Uint8Array(o, offsetInBytes, lengthInBytes));
        return new DataView(dst);
      },
      dD: x0 => x0.code,
      dE: (x0,x1,x2) => x0.postMessage(x1,x2),
      e: (map, o) => map.get(o),
      eB: (o, start, length) => new Int16Array(o.buffer, o.byteOffset + start, length),
      eC: (a, s, e) => a.slice(s, e),
      eD: (x0,x1,x2,x3) => x0.addEventListener(x1,x2,x3),
      eE: (x0,x1) => { x0.onmessageerror = x1 },
      f: x0 => x0.random(),
      fB: Function.prototype.call.bind(DataView.prototype.setInt16),
      fC: a => a.pop(),
      fD: (wasmFunction,f) => finalizeWrapper(f, function(x0) { return wasmFunction(f,arguments.length,x0) }),
      fE: x0 => x0.origin,
      g: () => globalThis.Math,
      gB: Function.prototype.call.bind(DataView.prototype.getInt16),
      gC: (t, s) => t.set(s),
      gD: (x0,x1,x2,x3) => x0.removeEventListener(x1,x2,x3),
      gE: x0 => x0.ports,
      h: (l, r) => l === r,
      hB: (o, start, length) => new Uint8ClampedArray(o.buffer, o.byteOffset + start, length),
      hC: x0 => new WeakRef(x0),
      hD: (wasmFunction,f) => finalizeWrapper(f, function(x0) { return wasmFunction(f,arguments.length,x0) }),
      hE: (x0,x1) => { x0.onmessage = x1 },
      i: s => s.toUpperCase(),
      iB: Function.prototype.call.bind(DataView.prototype.setUint8),
      iC: x0 => x0.deref(),
      iD: o => {
        if (o === null || o === undefined) return 0;
        if (o instanceof ArrayBuffer) return 1;
        if (globalThis.SharedArrayBuffer !== undefined &&
            o instanceof SharedArrayBuffer) {
          return 2;
        }
        return 3;
      },
      iE: x0 => x0.pubHostedUrl,
      j: Object.is,
      jB: Function.prototype.call.bind(DataView.prototype.getUint8),
      jC: () => globalThis.WeakRef,
      jD: (o, c) => o instanceof c,
      jE: x0 => x0.assetBaseUrl,
      k: (jsArray, jsArrayOffset, wasmArray, wasmArrayOffset, length) => {
        const setValue = dartInstance.exports.$wasmI8ArraySet;
        for (let i = 0; i < length; i++) {
          setValue(wasmArray, wasmArrayOffset + i, jsArray[jsArrayOffset + i]);
        }
      },
      kB: (o, start, length) => new Int8Array(o.buffer, o.byteOffset + start, length),
      kC: (a, i) => a.splice(i, 1),
      kD: () => globalThis,
      kE: () => globalThis._workerOptions,
      l: (x0,x1) => x0.test(x1),
      lB: Function.prototype.call.bind(DataView.prototype.setInt8),
      lC: o => o.byteLength,
      lD: (o, t) => typeof o === t,
      m: x0 => x0.pop(),
      mB: Function.prototype.call.bind(DataView.prototype.getInt8),
      mC: (ms, c) =>
      setInterval(() => dartInstance.exports.$invokeCallback(c), ms),
      mD: x0 => x0.data,
      n: x0 => x0.flags,
      nB: (o, i) => o[i],
      nC: () => Date.now(),
      nD: x0 => x0.readyState,
      o: Function.prototype.call.bind(String.prototype.toLowerCase),
      oB: o => o.length,
      oC: s => s.trimRight(),
      oD: (x0,x1) => { x0.binaryType = x1 },
      p: (x0,x1) => x0[x1],
      pB: o => {
        if (o === undefined) return 1;
        var type = typeof o;
        if (type === 'boolean') return 2;
        if (type === 'number') return 3;
        if (type === 'string') return 4;
        if (o instanceof Array) return 5;
        if (ArrayBuffer.isView(o)) {
          if (o instanceof Int8Array) return 6;
          if (o instanceof Uint8Array) return 7;
          if (o instanceof Uint8ClampedArray) return 8;
          if (o instanceof Int16Array) return 9;
          if (o instanceof Uint16Array) return 10;
          if (o instanceof Int32Array) return 11;
          if (o instanceof Uint32Array) return 12;
          if (o instanceof Float32Array) return 13;
          if (o instanceof Float64Array) return 14;
          if (o instanceof DataView) return 15;
        }
        if (o instanceof ArrayBuffer) return 16;
        // Feature check for `SharedArrayBuffer` before doing a type-check.
        if (globalThis.SharedArrayBuffer !== undefined &&
            o instanceof SharedArrayBuffer) {
            return 17;
        }
        if (o instanceof Promise) return 18;
        return 19;
      },
      pC: s => s.trimLeft(),
      pD: o => [o],
      q: x0 => x0.length,
      qB: (o, p) => o[p],
      qC: x0 => x0.protocol,
      qD: (o0, o1) => [o0, o1],
      r: (decoder, codeUnits) => decoder.decode(codeUnits),
      rB: x0 => x0.groups,
      rC: (x0,x1,x2) => x0.close(x1,x2),
      rD: (o0, o1, o2) => [o0, o1, o2],
      s: (o, start, length) => new Uint8Array(o.buffer, o.byteOffset + start, length),
      sB: (x0,x1) => x0.error(x1),
      sC: x0 => x0.close(),
      sD: (o0, o1, o2, o3) => [o0, o1, o2, o3],
      t: () => new TextDecoder("utf-8", {fatal: true}),
      tB: () => globalThis.console,
      tC: (x0,x1) => x0.send(x1),
      tD: () => new AbortController(),
      u: () => new TextDecoder("utf-8", {fatal: false}),
      uB: (x0,x1) => x0.reject(x1),
      uC: () => ({}),
      uD: (x0,x1,x2,x3,x4,x5) => ({method: x0,headers: x1,body: x2,credentials: x3,redirect: x4,signal: x5}),
      v: () => {
        return typeof process != "undefined" &&
               Object.prototype.toString.call(process) == "[object process]" &&
               process.platform == "win32"
      },
      vB: (wasmFunction,f) => finalizeWrapper(f, function(x0) { return wasmFunction(f,arguments.length,x0) }),
      vC: (o, p, v) => o[p] = v,
      vD: (x0,x1) => globalThis.fetch(x0,x1),
      w: () => {
        // On browsers return `globalThis.location.href`
        if (globalThis.location != null) {
          return globalThis.location.href;
        }
        return null;
      },
      wB: (x0,x1) => x0.resolve(x1),
      wC: () => [],
      wD: (x0,x1) => x0.get(x1),
      x: (o, p, r) => o.replace(p, () => r),
      xB: (ms, c) =>
      setTimeout(() => dartInstance.exports.$invokeCallback(c),ms),
      xC: b => !!b,
      xD: (wasmFunction,f) => finalizeWrapper(f, function(x0,x1,x2) { return wasmFunction(f,arguments.length,x0,x1,x2) }),
      y: (string, token) => string.split(token),
      yB: (handle) => clearInterval(handle),
      yC: x0 => new Int8Array(x0),
      yD: (x0,x1) => x0.forEach(x1),
      z: o => o instanceof Array,
      zB: (s) => +s,
      zC: (jsArray, jsArrayOffset, wasmArray, wasmArrayOffset, length) => {
        const getValue = dartInstance.exports.$wasmI8ArrayGet;
        for (let i = 0; i < length; i++) {
          jsArray[jsArrayOffset + i] = getValue(wasmArray, wasmArrayOffset + i);
        }
      },
      zD: x0 => x0.name,

    };

    const baseImports = {
      _: dart2wasm,
      Math: Math,
      Date: Date,
      Object: Object,
      Array: Array,
      Reflect: Reflect,
      WebAssembly: {
        JSTag: WebAssembly.JSTag,
      },
      "": new Proxy({}, { get(_, prop) { return prop; } }),

    };

    

    dartInstance = await WebAssembly.instantiate(this.module, {
      ...baseImports,
      ...additionalImports,
      
    });

    return new InstantiatedApp(this, dartInstance);
  }
}

class InstantiatedApp {
  constructor(compiledApp, instantiatedModule) {
    this.compiledApp = compiledApp;
    this.instantiatedModule = instantiatedModule;
  }

  // Call the main function with the given arguments.
  invokeMain(...args) {
    this.instantiatedModule.exports.$invokeMain(args);
  }
}
