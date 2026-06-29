/**
 * @mnemosyne/sdk — MnemoClient
 *
 * Client principal du SDK. Dual transport : WebSocket (externe) + IPC Electron (embarqué).
 * Authentification JWT HMAC-SHA256.
 *
 * Usage minimal :
 * ```typescript
 * import { MnemoClient } from '@mnemosyne/sdk';
 * const client = await MnemoClient.connect({ appId: 'my-app', manifest: './app.manifest.json' });
 * await client.ingest({ content: '...', spineType: 'REDDIT_POST', vault: 'SOCIAL' });
 * ```
 *
 * [SDK][ZERO-TRUST][DUAL-TRANSPORT]
 */

import WebSocket from 'ws';
import { loadManifest, assertScope, assertVault } from './manifest.js';
import { verifyToken } from './jwt.js';
import type {
  MnemoClientOptions,
  AppManifest,
  IngestPayload,
  IngestResult,
  QueryOptions,
  QueryResult,
  ShareRequest,
  ShareResult,
  RegisterResult,
  GitLogOptions,
  GitLogResult,
  MnemoEvent,
  MnemoEventType,
} from './types.js';

// ── Internal types ────────────────────────────────────────────────────────────

interface RpcRequest {
  id: string;
  method: string;
  params: unknown;
  token?: string;
}

interface RpcResponse {
  id: string;
  result?: unknown;
  error?: string;
}

type EventHandler<T = unknown> = (event: MnemoEvent<T>) => void;

// ── MnemoClient ───────────────────────────────────────────────────────────────

export class MnemoClient {
  private readonly manifest:    AppManifest;
  private readonly options:     Required<MnemoClientOptions>;
  private ws:                   WebSocket | null   = null;
  private token:                string | null       = null;
  private connected:            boolean             = false;
  private readonly pending      = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private readonly handlers     = new Map<MnemoEventType, Set<EventHandler>>();

  // ── Static factory ──────────────────────────────────────────────────────────

  /**
   * Crée et connecte un client Mnemosyne.
   * @throws si le manifest est invalide ou la connexion échoue
   */
  static async connect(options: MnemoClientOptions): Promise<MnemoClient> {
    const client = new MnemoClient(options);
    await client._connect();
    return client;
  }

  private constructor(options: MnemoClientOptions) {
    this.manifest = loadManifest(options.manifest);
    this.options  = {
      appId:      options.appId,
      manifest:   options.manifest,
      transport:  options.transport  ?? 'auto',
      wsPort:     options.wsPort     ?? 7799,
      token:      options.token      ?? '',
      timeoutMs:  options.timeoutMs  ?? 30_000,
    };

    if (this.options.appId !== this.manifest.id) {
      throw new Error(
        `[MnemoSDK] appId "${this.options.appId}" does not match manifest.id "${this.manifest.id}"`
      );
    }
  }

  // ── Connection ──────────────────────────────────────────────────────────────

  private async _connect(): Promise<void> {
    const transport = this._resolveTransport();

    if (transport === 'ws') {
      await this._connectWs();
    } else {
      // IPC : on suppose qu'on tourne dans Electron — window.mnemosyne est disponible
      this._connectIpc();
    }

    // Handshake : enregistre l'app et récupère un token JWT
    if (!this.options.token) {
      const reg = await this._register();
      this.token = reg.token;
    } else {
      this.token = this.options.token;
    }

    this.connected = true;
    this._emit('connected', { appId: this.manifest.id });
    console.log(`[MnemoSDK] ✓ Connected as "${this.manifest.id}" via ${transport}`);
  }

  private _resolveTransport(): 'ws' | 'ipc' {
    if (this.options.transport === 'ipc') return 'ipc';
    if (this.options.transport === 'ws')  return 'ws';
    // auto : IPC si window.mnemosyne existe (Electron renderer), sinon WS
    const hasIpc = typeof globalThis !== 'undefined' &&
      typeof (globalThis as Record<string, unknown>)['window'] !== 'undefined' &&
      typeof ((globalThis as Record<string, unknown>)['window'] as Record<string, unknown>)['mnemosyne'] !== 'undefined';
    return hasIpc ? 'ipc' : 'ws';
  }

  private _connectWs(): Promise<void> {
    return new Promise((resolve, reject) => {
      // [MN-IPV6] Use the explicit IPv4 loopback. The OS SdkWsServer binds on
      // 127.0.0.1 (IPv4 only); on hosts where "localhost" resolves to ::1 first
      // (common on Windows), ws://localhost would yield an intermittent ECONNREFUSED.
      const url = `ws://127.0.0.1:${this.options.wsPort}`;
      this.ws   = new WebSocket(url);

      const timeout = setTimeout(() => {
        this.ws?.terminate();
        reject(new Error(`[MnemoSDK] Connection timeout to ${url}`));
      }, this.options.timeoutMs);

      this.ws.on('open', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as RpcResponse | MnemoEvent;
          if ('id' in msg) {
            this._handleRpcResponse(msg as RpcResponse);
          } else if ('type' in msg) {
            this._handleEvent(msg as MnemoEvent);
          }
        } catch { /* ignore malformed */ }
      });

      this.ws.on('error', (err) => {
        this._emit('error', { message: err.message });
      });

      this.ws.on('close', () => {
        this.connected = false;
        this._emit('disconnected', {});
        // Reject all pending RPC calls
        for (const [, p] of this.pending) {
          clearTimeout(p.timer);
          p.reject(new Error('[MnemoSDK] WebSocket disconnected'));
        }
        this.pending.clear();
      });
    });
  }

  private _connectIpc(): void {
    // En mode IPC, les appels passent par window.mnemosyne
    // Le WS n'est pas créé — on délègue directement à _rpcIpc()
    this.connected = true;
  }

  // ── RPC layer ───────────────────────────────────────────────────────────────

  private async _rpc<T>(method: string, params: unknown): Promise<T> {
    if (!this.connected && method !== 'sdk.register') {
      throw new Error('[MnemoSDK] Client not connected. Call MnemoClient.connect() first.');
    }

    if (this._resolveTransport() === 'ipc') {
      return this._rpcIpc<T>(method, params);
    }

    return this._rpcWs<T>(method, params);
  }

  private _rpcWs<T>(method: string, params: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('[MnemoSDK] WebSocket not open'));
      }

      const id: string = Math.random().toString(36).slice(2);
      const req: RpcRequest = { id, method, params, ...(this.token ? { token: this.token } : {}) };

      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`[MnemoSDK] RPC timeout: ${method}`));
      }, this.options.timeoutMs);

      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
        timer,
      });

      this.ws.send(JSON.stringify(req));
    });
  }

  private async _rpcIpc<T>(method: string, params: unknown): Promise<T> {
    // Mapping méthode SDK → canal IPC Mnemosyne
    const mnemo = (globalThis as Record<string, unknown>)['window'] as
      { mnemosyne: Record<string, (...args: unknown[]) => Promise<unknown>> } | undefined;

    if (!mnemo?.mnemosyne) {
      throw new Error('[MnemoSDK] IPC transport: window.mnemosyne not available');
    }

    const ipcMap: Record<string, string> = {
      'sdk.register':      'registerApp',
      'sdk.ingest':        'sendPulse',
      'sdk.query':         'sendPulse',
      'sdk.correlate':     'sendPulse',
      'sdk.share':         'requestCrossAppShare',
      'sdk.nft.validate':  'validateNFTLicense',
      'sdk.graph.query':   'queryNeuralGraph',
    };

    const ipcMethod = ipcMap[method];
    if (!ipcMethod || !mnemo.mnemosyne[ipcMethod]) {
      throw new Error(`[MnemoSDK] IPC method not found for: ${method}`);
    }

    return mnemo.mnemosyne[ipcMethod](params) as Promise<T>;
  }

  private _handleRpcResponse(msg: RpcResponse): void {
    const p = this.pending.get(msg.id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(msg.id);
    if (msg.error) {
      p.reject(new Error(msg.error));
    } else {
      p.resolve(msg.result);
    }
  }

  private _handleEvent(event: MnemoEvent): void {
    this._emit(event.type, event.data);
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  private async _register(): Promise<RegisterResult> {
    return this._rpc<RegisterResult>('sdk.register', {
      manifest: this.manifest,
    });
  }

  /**
   * Renouvelle le token JWT avant expiration.
   * Appelé automatiquement si le token expire dans moins de 5 minutes.
   */
  async renewToken(): Promise<void> {
    const reg  = await this._register();
    this.token = reg.token;
    console.log(`[MnemoSDK] Token renewed for "${this.manifest.id}", expires: ${new Date(reg.expiresAt).toISOString()}`);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Ingère du contenu dans le vault Mnemosyne.
   * Isolé par source_app_id — seule ton app peut lire ce qu'elle écrit.
   */
  async ingest(payload: IngestPayload): Promise<IngestResult> {
    assertScope(this.manifest, `vault:write:${payload.vault}` as import('./types.js').MnemoScope);
    assertVault(this.manifest, payload.vault);

    if (!this.manifest.intents.includes('INGEST')) {
      throw new Error('[MnemoSDK] Intent "INGEST" not declared in manifest');
    }

    const maxBytes = (this.manifest.max_chronicle_size_kb ?? 64) * 1024;
    if (new TextEncoder().encode(payload.content).length > maxBytes) {
      throw new Error(`[MnemoSDK] Content exceeds max_chronicle_size_kb (${this.manifest.max_chronicle_size_kb}KB)`);
    }

    return this._rpc<IngestResult>('sdk.ingest', {
      appId:    this.manifest.id,
      ...payload,
    });
  }

  /**
   * Requête sémantique — retourne uniquement les chronicles de ton app (source_app_id isolation).
   */
  async query(text: string, options: QueryOptions = {}): Promise<QueryResult> {
    const vault = options.vault ?? this.manifest.vaults[0]!;
    assertScope(this.manifest, `vault:read:${vault}` as import('./types.js').MnemoScope);

    if (!this.manifest.intents.includes('QUERY')) {
      throw new Error('[MnemoSDK] Intent "QUERY" not declared in manifest');
    }

    return this._rpc<QueryResult>('sdk.query', {
      appId: this.manifest.id,
      text,
      vault,
      limit:     options.limit     ?? 10,
      threshold: options.threshold ?? 0.0,
      // [SDK 1.2 — Semantic Bridge] Forward opt-in semantic params. Server
      // ignores absent fields, so omitting these preserves legacy "recent"
      // behaviour exactly.
      ...(options.semantic        !== undefined ? { semantic:        options.semantic }        : {}),
      ...(options.scope           !== undefined ? { scope:           options.scope }           : {}),
      ...(options.spineTypeFilter !== undefined ? { spineTypeFilter: options.spineTypeFilter } : {}),
    });
  }

  /**
   * Demande un accès aux chronicles d'une autre app.
   * Déclenche un popup de consentement utilisateur dans Mnemosyne OS.
   * Timeout : 60s par défaut (configurable).
   */
  async requestShare(request: ShareRequest): Promise<ShareResult> {
    assertScope(this.manifest, 'share:request');

    return this._rpc<ShareResult>('sdk.share', {
      requestingAppId: this.manifest.id,
      fromAppId:       request.fromAppId,
      reason:          request.reason,
      timeoutMs:       request.timeoutMs ?? 60_000,
    });
  }

  // ── Events ──────────────────────────────────────────────────────────────────

  on<T = unknown>(type: MnemoEventType, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler as EventHandler);
    // Retourne une fonction de cleanup
    return () => this.handlers.get(type)?.delete(handler as EventHandler);
  }

  private _emit(type: MnemoEventType, data: unknown): void {
    const set = this.handlers.get(type);
    if (!set) return;
    const event: MnemoEvent = { type, data, timestamp: Date.now() };
    for (const h of set) h(event);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  /**
   * Ferme proprement la connexion.
   * Attend la résolution de tous les RPC en cours.
   */
  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error('[MnemoSDK] Client disconnected'));
    }
    this.pending.clear();
    console.log(`[MnemoSDK] Disconnected: "${this.manifest.id}"`);
  }

  get isConnected(): boolean { return this.connected; }
  get appId(): string        { return this.manifest.id; }
  get appManifest(): AppManifest { return { ...this.manifest }; }

  /**
   * Inspecte le token actuel (décodé, sans vérification cryptographique).
   * Utilise un décodeur base64url universel (Node + Browser) — MN-005.
   */
  get tokenInfo(): { sub: string; exp: number; scopes: string[] } | null {
    if (!this.token) return null;
    try {
      const [, payloadB64] = this.token.split('.');
      if (!payloadB64) return null;
      // Universal base64url decode — compatible browser polyfill (no 'base64url' encoding)
      const base64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/')
        + '='.repeat((4 - payloadB64.length % 4) % 4);
      const json = typeof atob !== 'undefined'
        ? decodeURIComponent(escape(atob(base64)))
        : Buffer.from(base64, 'base64').toString('utf8');
      return JSON.parse(json);
    } catch { return null; }
  }

  /**
   * [PHASE-50] Lit un fichier .md depuis le repo OS (docs/, packages/).
   */
  async readFile(path: string): Promise<string> {
    const res = await this._rpc<{ content: string }>('sdk.readFile', { path });
    return res.content;
  }

  /**
   * Returns the most recent git commits from the OS monorepo.
   * Calls the server-side `sdk.git.log` RPC (repo path is hardcoded server-side
   * for Zero-Trust — the client cannot choose it).
   * Requires scope `monorepo:read` and intent `GIT_LOG` in the manifest.
   */
  async gitLog(options: GitLogOptions = {}): Promise<GitLogResult> {
    assertScope(this.manifest, 'monorepo:read');

    if (!this.manifest.intents.includes('GIT_LOG')) {
      throw new Error('[MnemoSDK] Intent "GIT_LOG" not declared in manifest');
    }

    return this._rpc<GitLogResult>('sdk.git.log', {
      appId:  this.manifest.id,
      limit:  options.limit  ?? 20,
      since:  options.since,
      filter: options.filter,
    });
  }
}

// ── Re-export verifyToken for the server side ─────────────────────────────────
export { verifyToken } from './jwt.js';
