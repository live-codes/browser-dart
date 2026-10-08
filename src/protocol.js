/**
 * Transport for the DartPad SDK worker protocol.
 *
 * The worker hosts DDC, the analyzer, an in-memory file system and a subset of
 * `dart pub`; it is dart2wasm, and everything here talks to it over a
 * `MessagePort`. Nothing in this file touches the DOM, so it works in a worker
 * as well as a page.
 *
 * Wire format is JSON-RPC 2.0 extended so that `MessagePort` and `Uint8Array`
 * values can travel alongside a JSON payload via structured clone:
 *   { payload: "<json>", port?: MessagePort, bytes?: Uint8Array }
 *
 * https://github.com/dart-lang/sdk/blob/main/pkg/dartpad/doc/worker-protocol.md
 */

import { fetchShimSource } from './inflate.js';

function resolveAssetBaseUrl(assetBaseUrl) {
  // `self.location` covers workers, where there is no document to resolve against.
  const reference = typeof document !== 'undefined' ? document.baseURI : self.location.href;
  return new URL(assetBaseUrl, reference);
}

/**
 * JSON-RPC 2.0 over a `MessagePort`.
 *
 * `port` and `bytes` are lifted out of `params`/`result` before serialization and re-attached to
 * whatever arrives on the other side. Both ends are supported: `request`/`notify` to call the
 * peer, `handle` to answer it.
 */
export class RpcClient {
  #port;
  #nextId = 1;
  #pending = new Map();
  #handlers = new Map();
  #methods = new Map();

  constructor(port) {
    this.#port = port;
    port.onmessage = (event) => this.#receive(event.data);
    port.onmessageerror = () => {
      for (const pending of this.#pending.values()) {
        pending.reject(new Error('the Dart worker dropped a message it could not deserialize.'));
      }
      this.#pending.clear();
    };
    port.start();
  }

  /** Handle a notification from the peer. */
  on(method, handler) {
    this.#handlers.set(method, handler);
    return this;
  }

  /**
   * Answer a request from the peer. The return value becomes the response's `result`; a thrown
   * error becomes a JSON-RPC error.
   */
  handle(method, handler) {
    this.#methods.set(method, handler);
    return this;
  }

  request(method, params) {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#send({ jsonrpc: '2.0', id, method, params });
    });
  }

  notify(method, params) {
    this.#send({ jsonrpc: '2.0', method, params });
  }

  #send(message) {
    const transfer = [];
    let port;
    let bytes;

    for (const key of ['params', 'result']) {
      const value = message?.[key];
      if (!value || typeof value !== 'object') continue;
      if (value.port instanceof MessagePort) {
        port = value.port;
        transfer.push(port);
        delete value.port;
      }
      if (value.bytes instanceof Uint8Array) {
        bytes = value.bytes;
        delete value.bytes;
      }
    }

    const envelope = { payload: JSON.stringify(message) };
    if (port) envelope.port = port;
    if (bytes) envelope.bytes = bytes;
    this.#port.postMessage(envelope, transfer);
  }

  #receive(data) {
    if (!data || typeof data.payload !== 'string') return;

    let message;
    try {
      message = JSON.parse(data.payload);
    } catch {
      return;
    }

    for (const key of ['params', 'result']) {
      const value = message?.[key];
      if (!value || typeof value !== 'object') continue;
      if (data.port !== undefined) value.port = data.port;
      if (data.bytes !== undefined) value.bytes = data.bytes;
    }

    if (typeof message.method === 'string') {
      const method = this.#methods.get(message.method);
      if (method) {
        this.#answer(method, message);
        return;
      }
      this.#handlers.get(message.method)?.(message.params, message);
      return;
    }

    const pending = this.#pending.get(message.id);
    if (!pending) return;
    this.#pending.delete(message.id);

    if (message.error) {
      pending.reject(
        Object.assign(new Error(message.error.message), {
          name: 'DartWorkerError',
          code: message.error.code,
          data: message.error.data,
        }),
      );
    } else {
      pending.resolve(message.result);
    }
  }

  #answer(method, message) {
    // Notifications have no id and take no response, even when a handler matches.
    if (message.id === undefined) {
      Promise.resolve().then(() => method(message.params));
      return;
    }
    Promise.resolve()
      .then(() => method(message.params))
      .then((result) => this.#send({ jsonrpc: '2.0', id: message.id, result: result ?? {} }))
      .catch((error) =>
        this.#send({
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32000, message: String(error?.message ?? error) },
        }),
      );
  }
}

/**
 * Boots the dart2wasm worker and hands back a session port.
 *
 * The worker is started from a blob module that imports `worker.js` from its real location, so
 * `import.meta.url` inside the worker still resolves `worker.wasm`, `sdk.tar` and friends relative
 * to the asset directory — while `new Worker` still gets a same-origin script it will accept.
 */
export function startWorker({ assetBaseUrl, options = {} } = {}) {
  const baseUrl = resolveAssetBaseUrl(assetBaseUrl);
  const workerUrl = new URL('worker.js', baseUrl).href;

  const bootstrap = `
    import { Worker } from ${JSON.stringify(workerUrl)};
    // worker.js fetches worker.wasm inside create(), and the Dart side fetches sdk.tar once it is
    // running. Both go through globalThis.fetch, so shimming it here covers both — installing it
    // after the import is fine, because worker.js only fetches when it is called.
    ${fetchShimSource(baseUrl.href)}
    try {
      const worker = await Worker.create(${JSON.stringify(options)});
      const { port1, port2 } = new MessageChannel();
      worker.session(port1);
      self.postMessage({ action: 'session' }, [port2]);
    } catch (error) {
      self.postMessage({ action: 'error', message: String(error?.stack ?? error) });
    }
  `;

  const blobUrl = URL.createObjectURL(new Blob([bootstrap], { type: 'text/javascript' }));
  const worker = new Worker(blobUrl, { type: 'module', name: 'dartpad-worker' });

  return new Promise((resolve, reject) => {
    worker.onmessage = (event) => {
      if (event.data?.action === 'session') {
        resolve({ worker, port: event.ports[0], blobUrl });
      } else if (event.data?.action === 'error') {
        reject(new Error(`the Dart worker failed to start:\n${event.data.message}`));
      }
    };
    worker.onerror = (event) => {
      reject(new Error(`the Dart worker crashed: ${event.message || event.type}`));
    };
  });
}
