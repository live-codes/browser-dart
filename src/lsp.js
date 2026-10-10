/**
 * The language server, reached through the worker's LSP tunnel.
 *
 * The worker protocol has no "format" method, but it does run a language
 * server, and Dart's formatter is reachable through it as the standard LSP
 * `textDocument/formatting` request — which is how `Compiler.format` works.
 *
 * The worker forwards LSP messages in both directions over
 * `workspace/languageServer/message`; this class owns the request/response
 * correlation and the handshake needed to open a document and ask for its
 * formatting edits. Nothing here touches the DOM, so it lives in a worker.
 */

/** Handshake metadata; the analyzer logs it but requires nothing of it. */
const CLIENT_INFO = { name: 'dart-wasm' };

export class LanguageServer {
  #rpc;
  #workspaceId;
  #languageServerId;
  #nextId = 1;
  #pending = new Map();
  #closed = false;

  constructor({ rpc, workspaceId, languageServerId }) {
    this.#rpc = rpc;
    this.#workspaceId = workspaceId;
    this.#languageServerId = languageServerId;

    // Both arrive as notifications from the worker. `handle` rather than `on`, because the peer
    // may send either form and a request would otherwise be left unanswered.
    rpc.handle('workspace/languageServer/message', (params) => {
      if (params?.languageServerId === languageServerId) this.#receive(params.message);
      return {};
    });
    rpc.handle('workspace/languageServer/exited', (params) => {
      if (params?.languageServerId === languageServerId) {
        this.#fail('the Dart language server stopped');
      }
      return {};
    });
  }

  /** Start a language server in a workspace and return a client for it. */
  static async start({ rpc, workspaceId }) {
    const { languageServerId } = await rpc.request('workspace/startLanguageServer', { workspaceId });
    return new LanguageServer({ rpc, workspaceId, languageServerId });
  }

  /** The LSP handshake. `rootUri` is the folder analysis is rooted at. */
  async initialize(rootUri) {
    await this.request('initialize', {
      processId: null,
      rootUri,
      workspaceFolders: null,
      clientInfo: CLIENT_INFO,
      capabilities: {
        textDocument: { formatting: { dynamicRegistration: false } },
      },
    });
    this.notify('initialized', {});
  }

  didOpen(uri, text, languageId = 'dart') {
    this.notify('textDocument/didOpen', {
      textDocument: { uri, languageId, version: 1, text },
    });
  }

  didClose(uri) {
    this.notify('textDocument/didClose', { textDocument: { uri } });
  }

  request(method, params) {
    if (this.#closed) {
      return Promise.reject(new Error('dart-wasm: the language server is not running'));
    }
    const id = this.#nextId;
    this.#nextId += 1;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#send({ jsonrpc: '2.0', id, method, params });
    });
  }

  notify(method, params) {
    if (this.#closed) return;
    this.#send({ jsonrpc: '2.0', method, params });
  }

  /** Ask the worker to stop the server. Best-effort: the worker may already be gone. */
  async stop() {
    if (this.#closed) return;
    this.#fail('the language server was stopped');
    await this.#rpc
      .request('workspace/languageServer/stop', {
        workspaceId: this.#workspaceId,
        languageServerId: this.#languageServerId,
      })
      .catch(() => {});
  }

  #send(message) {
    this.#rpc.notify('workspace/languageServer/message', {
      workspaceId: this.#workspaceId,
      languageServerId: this.#languageServerId,
      message,
    });
  }

  #receive(message) {
    if (!message || typeof message !== 'object') return;

    if (typeof message.method === 'string') {
      // A request from the server waits for an answer; a notification needs none.
      if (message.id !== undefined) this.#answer(message);
      return;
    }

    const pending = this.#pending.get(message.id);
    if (!pending) return;
    this.#pending.delete(message.id);

    if (message.error) {
      pending.reject(
        Object.assign(new Error(message.error.message), {
          name: 'DartLanguageServerError',
          code: message.error.code,
          data: message.error.data,
        }),
      );
    } else {
      pending.resolve(message.result);
    }
  }

  #answer(message) {
    // `workspace/configuration` is the one server request whose result shape is
    // inspected; the rest tolerate null.
    const result =
      message.method === 'workspace/configuration'
        ? (message.params?.items ?? []).map(() => ({}))
        : null;
    this.#send({ jsonrpc: '2.0', id: message.id, result });
  }

  #fail(reason) {
    this.#closed = true;
    for (const pending of this.#pending.values()) {
      pending.reject(new Error(`dart-wasm: ${reason}`));
    }
    this.#pending.clear();
  }
}

/**
 * Apply LSP `TextEdit`s to `text` and return the result.
 *
 * Offsets are computed by hand rather than through a document model: the worker
 * hands back edits, not a synced editor, so the only thing to do is splice them
 * in. Edits are applied back to front so earlier offsets stay valid.
 *
 * @param {string} text
 * @param {Array<{ range: { start: { line: number, character: number }, end: { line: number, character: number } }, newText: string }>} [edits]
 * @returns {string}
 */
export function applyTextEdits(text, edits) {
  if (!Array.isArray(edits) || edits.length === 0) return text;

  const lineStarts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) lineStarts.push(i + 1);
  }
  const offsetAt = (position) => (lineStarts[position.line] ?? text.length) + position.character;

  const resolved = edits
    .map((edit) => ({
      start: offsetAt(edit.range.start),
      end: offsetAt(edit.range.end),
      text: edit.newText,
    }))
    .sort((a, b) => b.start - a.start);

  let result = text;
  for (const edit of resolved) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}
