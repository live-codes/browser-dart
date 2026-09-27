/**
 * A dependency-free JavaScript client for the DartPad SDK protocol.
 *
 * The Dart team ships a fully client-side Dart toolchain inside the `dartpad`
 * pub package: a dart2wasm-compiled Web Worker hosting the Dart Development
 * Compiler (DDC), the Dart analyzer, an in-memory file system and a subset of
 * `dart pub`, plus a sandboxed iframe used to execute the compiled output.
 * Everything runs in the browser; there is no compilation server involved.
 *
 * This module speaks the documented protocol directly, so it can be reused
 * outside of this proof of concept:
 *   https://github.com/dart-lang/sdk/blob/main/pkg/dartpad/doc/worker-protocol.md
 *
 * Wire format is JSON-RPC 2.0 extended so that `MessagePort` and `Uint8Array`
 * values can travel alongside a JSON payload via structured clone:
 *   { payload: "<json>", port?: MessagePort, bytes?: Uint8Array }
 */

const DEFAULT_ASSET_BASE_URL = 'public/dart/';

/** Notifications the worker emits while code executes inside the sandbox. */
export const SANDBOX_NOTIFICATIONS = {
  console: 'workspace/sandbox/console',
  error: 'workspace/sandbox/error',
  unhandledRejection: 'workspace/sandbox/unhandledRejection',
};

function resolveAssetBaseUrl(assetBaseUrl) {
  return new URL(assetBaseUrl, document.baseURI);
}

/**
 * JSON-RPC 2.0 over a `MessagePort`.
 *
 * `port` and `bytes` are lifted out of `params`/`result` before serialization
 * and re-attached to whatever arrives on the other side.
 */
export class RpcClient {
  #port;
  #nextId = 1;
  #pending = new Map();
  #handlers = new Map();

  constructor(port) {
    this.#port = port;
    port.onmessage = (event) => this.#receive(event.data);
    port.onmessageerror = () => {
      for (const pending of this.#pending.values()) {
        pending.reject(new Error('Dart worker dropped a message it could not deserialize.'));
      }
      this.#pending.clear();
    };
    port.start();
  }

  on(method, handler) {
    this.#handlers.set(method, handler);
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
}

/**
 * Boots the dart2wasm worker and hands back a session port.
 *
 * The worker is started from a blob module that imports `worker.js` from its
 * real location, so `import.meta.url` inside the worker still resolves
 * `worker.wasm`, `sdk.tar` and friends relative to the asset directory.
 */
export function startWorker({ assetBaseUrl = DEFAULT_ASSET_BASE_URL, options = {} } = {}) {
  const baseUrl = resolveAssetBaseUrl(assetBaseUrl);
  const workerUrl = new URL('worker.js', baseUrl).href;

  const bootstrap = `
    import { Worker } from ${JSON.stringify(workerUrl)};
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
        reject(new Error(`Dart worker failed to start:\n${event.data.message}`));
      }
    };
    worker.onerror = (event) => {
      reject(new Error(`Dart worker crashed: ${event.message || event.type}`));
    };
  });
}

/**
 * Injected into the sandbox before `sandbox.js`.
 *
 * DDC-compiled modules reach the sandbox as a `Blob` that `sandbox.js` turns
 * into an object URL and loads as a script. Wrapping `createObjectURL` is the
 * least invasive place to copy that code out for display.
 */
const MODULE_CAPTURE_HOOK = `
  (function () {
    const createObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function (blob) {
      const url = createObjectURL(blob);
      try {
        if (blob && typeof blob.text === 'function' && /javascript/.test(blob.type)) {
          blob.text().then(function (code) {
            window.parent.postMessage({ action: 'module', code: code }, '*');
          });
        }
      } catch (_) {}
      return url;
    };
  })();
`;

/**
 * Creates the sandboxed iframe that executes compiled Dart and proxies its
 * console output back over a `MessagePort`.
 *
 * When `onModule` is given, each DDC-compiled JS module the sandbox loads is
 * reported through it.
 */
export function createSandbox({
  assetBaseUrl = DEFAULT_ASSET_BASE_URL,
  container,
  timeout = 180_000,
  onModule,
} = {}) {
  const sandboxUrl = new URL('sandbox.js', resolveAssetBaseUrl(assetBaseUrl)).href;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  iframe.title = 'Dart sandbox';
  container.append(iframe);

  let settle;
  const ready = new Promise((resolve, reject) => {
    settle = { resolve, reject };
  });

  // Kept for the lifetime of the sandbox: modules are captured long after the
  // sandbox connects, so this listener must outlive the handshake.
  const onMessage = (event) => {
    if (event.source !== iframe.contentWindow) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    if (data.action === 'connect') {
      clearTimeout(timer);
      settle.resolve(data.port);
    } else if (data.action === 'module') {
      onModule?.(data.code);
    } else if (data.action === 'error') {
      clearTimeout(timer);
      settle.reject(new Error(`Dart sandbox failed to load:\n${data.message}`));
    }
  };

  const timer = setTimeout(() => {
    settle.reject(new Error('Timed out waiting for the Dart sandbox to boot.'));
  }, timeout);

  window.addEventListener('message', onMessage);

  iframe.srcdoc = [
    '<!DOCTYPE html>',
    '<html><head><meta charset="utf-8">',
    onModule ? `<script>${MODULE_CAPTURE_HOOK}</script>` : '',
    `<script src="${sandboxUrl}" defer></script>`,
    '</head><body></body></html>',
  ].join('');

  const close = () => {
    clearTimeout(timer);
    window.removeEventListener('message', onMessage);
    iframe.remove();
  };

  return { iframe, ready, close };
}

/**
 * A connected Dart development environment: a worker session plus a sandbox.
 */
export class DartPad {
  #worker;
  #blobUrl;
  #container;
  #assetBaseUrl;

  /** @type {{ sandboxId: number, modes: string[], close: () => void } | null} */
  #sandbox = null;
  #onModule;

  constructor({ worker, blobUrl, rpc, workspaceId, workspaceFolder, assetBaseUrl, container, onModule }) {
    this.#worker = worker;
    this.#blobUrl = blobUrl;
    this.#assetBaseUrl = assetBaseUrl;
    this.#container = container;
    this.#onModule = onModule;
    this.rpc = rpc;
    this.workspaceId = workspaceId;
    this.workspaceFolder = workspaceFolder;
  }

  static async create({ assetBaseUrl = DEFAULT_ASSET_BASE_URL, container, onNotification, onModule } = {}) {
    const baseUrl = resolveAssetBaseUrl(assetBaseUrl);
    const { worker, port, blobUrl } = await startWorker({ assetBaseUrl });
    const rpc = new RpcClient(port);

    for (const method of [...Object.values(SANDBOX_NOTIFICATIONS), 'workspace/languageServer/exited']) {
      rpc.on(method, (params) => onNotification?.(method, params));
    }

    const { workspaceId, workspaceFolder } = await rpc.request('createWorkspace', {});

    return new DartPad({
      worker,
      blobUrl,
      rpc,
      workspaceId,
      workspaceFolder,
      assetBaseUrl: baseUrl,
      container,
      onModule,
    });
  }

  writeFile(uri, text) {
    return this.rpc.request('workspace/writeFileFromText', { workspaceId: this.workspaceId, uri, text });
  }

  async readFile(uri) {
    const { text } = await this.rpc.request('workspace/readFileAsText', { workspaceId: this.workspaceId, uri });
    return text;
  }

  async stat(uri) {
    try {
      return await this.rpc.request('workspace/stat', { workspaceId: this.workspaceId, uri });
    } catch {
      return null;
    }
  }

  pub(command, args = []) {
    return this.rpc.request('workspace/pub', { workspaceId: this.workspaceId, uri: '.', command, args });
  }

  async #openSandbox() {
    const sandbox = createSandbox({
      assetBaseUrl: this.#assetBaseUrl,
      container: this.#container,
      onModule: this.#onModule,
    });
    const port = await sandbox.ready;
    const { sandboxId, modes } = await this.rpc.request('workspace/connectSandbox', {
      workspaceId: this.workspaceId,
      port,
    });
    this.#sandbox = { sandboxId, modes, close: sandbox.close };
    return this.#sandbox;
  }

  /**
   * Drops the current sandbox. A sandbox runs one entrypoint for its lifetime;
   * `run` cannot be called on it twice, which is why each run gets a new one.
   */
  async #closeSandbox() {
    const sandbox = this.#sandbox;
    if (!sandbox) return;
    this.#sandbox = null;
    sandbox.close();
    await this.rpc
      .request('workspace/sandbox/close', { workspaceId: this.workspaceId, sandboxId: sandbox.sandboxId })
      .catch(() => {});
  }

  /**
   * Compiles and runs `path` in a fresh sandbox.
   *
   * The workspace - and therefore the resolved package cache - is reused
   * between runs, but the sandbox is not, so every run starts from clean
   * application state and console output cannot leak between runs.
   */
  async run(path, mode = 'console') {
    await this.#closeSandbox();
    const { sandboxId } = await this.#openSandbox();
    return this.rpc.request('workspace/sandbox/run', {
      workspaceId: this.workspaceId,
      sandboxId,
      path,
      mode,
    });
  }

  async dispose() {
    try {
      await this.#closeSandbox();
      await this.rpc.request('workspace/dispose', { workspaceId: this.workspaceId });
    } finally {
      this.#worker.terminate();
      URL.revokeObjectURL(this.#blobUrl);
    }
  }
}
