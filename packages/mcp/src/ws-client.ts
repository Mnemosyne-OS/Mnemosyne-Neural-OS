/**
 * MnemoWsClient — standalone WebSocket client for the Mnemosyne OS SDK.
 *
 * Talks the same JSON-RPC protocol as @mnemosyne_os/sdk's MnemoClient but
 * with ZERO dependency on the published SDK package. Reason: the published
 * SDK 1.1.0 ships a tsup-bundled ESM artefact that calls `__require2("events")`
 * (a dynamic require shim) which throws under pure Node ESM:
 *
 *   Error: Dynamic require of "events" is not supported
 *     at @mnemosyne_os/sdk/dist/index.js:11
 *
 * The crash happens at module-load time, so any import of the SDK makes the
 * MCP server fail to start under `node dist/index.js` — i.e. when launched
 * by Claude Desktop or Claude Code. Until SDK 1.2 fixes the bundle, the MCP
 * implements the wire contract directly. Only `ws` is required (CJS-friendly).
 *
 * Wire contract (cf. apps/infinity-edition/src/main/network/sdk-ws-server.ts):
 *   sdk.register            — manifest → { token, expiresAt, appId }
 *   sdk.query (semantic)    — { appId, text, vault, limit, semantic } → { chronicles, _semantic }
 *   sdk.ingest              — { appId, content, spineType, vault } → { chronicleId }
 *   sdk.git.log             — { appId, limit, since? } → { commits }
 *   sdk.dream.bridges       — { appId, limit?, minDbs?, sessionId?, chronicleId? } → { bridges }
 *   sdk.spine.assignments   — { appId, vault?, spineType?, limit?, offset?, includeTaxonomy? }
 *                             → { vault, assignments, counts, total, taxonomy? }
 *   sdk.voice.engines       — { appId } → { engines, clones, outputDir, maxScriptChars }
 *   sdk.voice.speak         — { appId, text, engine?, language?, clone?, … } → { job }
 *   sdk.voice.status        — { appId, jobId? } → { job } | { jobs }
 *   sdk.voice.cancel        — { appId, jobId } → { stopped, job }
 */

import { WebSocket } from 'ws';

export interface AppManifest {
  id:            string;
  name:          string;
  version:       string;
  mnemosyne_sdk: string;
  scopes:        string[];
  vaults:        string[];
  intents:       string[];
  description?:  string;
  author?:       string;
  [key: string]: unknown;
}

export interface MnemoChronicle {
  id:            string;
  spineType:     string;
  content?:      string;
  timestamp:     number | string;
  score:         number;
  source_app_id: string;
}

export interface QueryResult {
  success:    boolean;
  chronicles: MnemoChronicle[];
  error?:     string;
  _semantic?: { wanted: boolean; used: boolean; error?: string; vectorDim?: number; vaultSize?: number };
}

export interface AskResult {
  success: boolean;
  answer:  string;
  sources: MnemoChronicle[];
  error?:  string;
}

export interface VaultInfo {
  id:              string;
  name?:           string;
  state?:          string;
  chronicleCount?: number;
  // Governance metadata (present when the OS could read the vault manifest).
  type?:               string;
  description?:        string;
  protection?:         string;   // 'NORMAL' | 'MAXIMUM'
  mixableWith?:        string[]; // ['*'] = open, [] = isolated
  visibleInNeuralMap?: boolean;
}

export interface VaultsListResult {
  success: boolean;
  vaults?: VaultInfo[];
  error?:  string;
}

export interface IngestPayload {
  content:   string;
  spineType: string;
  vault:     string;
}

export interface IngestResult {
  success:      boolean;
  chronicleId?: string;
  error?:       string;
}

export interface GitCommit {
  hash:    string;
  author:  string;
  ts:      number;
  message: string;
  type:    string;
}

export interface GitLogResult {
  success: boolean;
  commits: GitCommit[];
  error?:  string;
}

// ── Read-only introspection (SDK v1.4) ────────────────────────────────────────

export interface DreamBridgeEndpoint {
  chronicleId: number;
  spineType:   string;
  vault:       string;
  excerpt?:    string;
}

export interface DreamBridge {
  id:        number;
  sessionId: string | null;
  scannedAt: string;
  /** Composite Dream Bridge Score (prime-aware) — higher = stronger connection. */
  dbs:       number;
  cosine:    number;
  from:      DreamBridgeEndpoint;
  to:        DreamBridgeEndpoint;
}

export interface DreamBridgesResult {
  success: boolean;
  bridges: DreamBridge[];
  error?:  string;
}

export interface SpineAssignmentEntry {
  chronicleId: number;
  spineType:   string;
  createdAt:   string;
  excerpt?:    string;
}

export interface SpineTaxonNode {
  id:        string;
  label:     string;
  kind:      string;
  pack:      string;
  color?:    string;
  icon?:     string;
  origin:    string;
  children?: SpineTaxonNode[];
}

export interface SpineAssignmentsResult {
  success:     boolean;
  vault:       string;
  assignments: SpineAssignmentEntry[];
  counts:      Array<{ spineType: string; count: number }>;
  total:       number;
  /** Chronicles with no embedding yet (invisible to semantic retrieval). */
  unvectorized?: number;
  taxonomy?:   SpineTaxonNode[];
  error?:      string;
}

interface PendingRpc {
  resolve: (v: any) => void;
  reject:  (e: Error) => void;
  timer?:  ReturnType<typeof setTimeout>;
}

/** Per-request RPC deadline. A backend that accepts the socket but never replies
 *  (or dies mid-call) must not hang the tool forever. */
const RPC_TIMEOUT_MS = 30_000;

// ── Voice rendering (SDK v1.6) ────────────────────────────────────────────────

export interface VoiceCloneInfo {
  name:      string;
  /** Playing time of the reference clip. Null when the WAV could not be read —
   *  which is NOT the same fact as a zero-second clip. */
  seconds:   number | null;
  isDefault: boolean;
  /** 'REFERENCE_TOO_SHORT' | 'NOT_MONO' | 'UNREADABLE_WAV', or null. */
  warning:   string | null;
}

export interface VoiceEnginesResult {
  success:  boolean;
  engines?: Array<{ id: string; installed: boolean; clones: boolean }>;
  clones?:  VoiceCloneInfo[];
  piperVoices?:    string[];
  outputDir?:      string;
  maxScriptChars?: number;
  error?:   string;
}

export interface VoiceJob {
  id:    string;
  state: 'rendering' | 'done' | 'failed' | 'cancelled';
  engine: string;
  language: string;
  clone: string | null;
  cloneWarning: string | null;
  segments: number;
  segmentsDone: number;
  /** Absolute path — present only once the file is written. */
  path: string | null;
  seconds: number | null;
  bytes: number | null;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  realtimeFactor: number | null;
  etaSeconds: number | null;
}

export interface VoiceJobResult {
  success: boolean;
  job?:    VoiceJob;
  jobs?:   VoiceJob[];
  stopped?: boolean;
  error?:  string;
}

export class MnemoWsClient {
  private ws:        WebSocket | null = null;
  private token:     string | null    = null;
  private seq                          = 0;
  private pending:   Map<string, PendingRpc> = new Map();
  private listeners: Map<string, Array<() => void>> = new Map();
  private connected                    = false;

  constructor(
    private readonly manifest: AppManifest,
    private readonly wsPort:   number = 7799,
    private readonly timeoutMs: number = 10_000,
  ) {}

  get isConnected(): boolean { return this.connected; }

  /**
   * Open the WebSocket, send sdk.register with the manifest, store the JWT.
   * Throws on connection error, register failure, or timeout.
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `ws://127.0.0.1:${this.wsPort}`;
      const ws  = new WebSocket(url);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`Connection to ${url} timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      ws.on('open', async () => {
        clearTimeout(timer);
        this.ws = ws;
        ws.on('message', (raw) => this._onMessage(String(raw)));
        ws.on('close', () => {
          this.connected = false;
          this.ws        = null;
          this.token     = null;
          this._rejectAllPending('WS_CLOSED: Mnemosyne OS connection closed');
          this._emit('disconnected');
        });
        ws.on('error', (err) => {
          // Surface as disconnect; rpc callers will see "WS_NOT_OPEN" on retry.
          console.error('[mnemo-ws-client] ws error:', (err as Error).message);
        });
        try {
          const reg = await this._rpc('sdk.register', { manifest: this.manifest }) as
            { token: string; expiresAt: number; appId: string };
          if (!reg?.token) throw new Error('sdk.register returned no token');
          this.token     = reg.token;
          this.connected = true;
          resolve();
        } catch (e) {
          ws.close();
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timer);
        reject(new Error(`WebSocket error connecting to ${url}: ${(err as Error).message}`));
      });
    });
  }

  /** Subscribe to client events. Returns an unsubscribe fn. */
  on(event: 'disconnected', cb: () => void): () => void {
    const arr = this.listeners.get(event) ?? [];
    arr.push(cb);
    this.listeners.set(event, arr);
    return () => {
      const cur = this.listeners.get(event) ?? [];
      this.listeners.set(event, cur.filter(f => f !== cb));
    };
  }

  private _emit(event: string): void {
    for (const cb of this.listeners.get(event) ?? []) cb();
  }

  /**
   * Generic RPC. Automatically injects the JWT (after register). Use this for
   * any method not exposed via a typed wrapper below.
   */
  async _rpc<T = unknown>(method: string, params: Record<string, unknown> = {}, timeoutMs: number = RPC_TIMEOUT_MS): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WS_NOT_OPEN');
    }
    const id = String(++this.seq);
    return new Promise<T>((resolve, reject) => {
      // Reject (and release the pending entry) if the backend never replies.
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) {
          reject(new Error(`RPC "${method}" timed out after ${timeoutMs}ms — is Mnemosyne OS running?`));
        }
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      const payload: Record<string, unknown> = { id, method, params };
      // sdk.register is the only method allowed without token.
      if (this.token && method !== 'sdk.register') payload['token'] = this.token;
      this.ws!.send(JSON.stringify(payload));
    });
  }

  /** Reject every in-flight RPC — used when the socket closes mid-call. */
  private _rejectAllPending(reason: string): void {
    for (const [id, p] of this.pending) {
      if (p.timer) clearTimeout(p.timer);
      this.pending.delete(id);
      p.reject(new Error(reason));
    }
  }

  private _onMessage(raw: string): void {
    let msg: { id?: string; result?: unknown; error?: string };
    try { msg = JSON.parse(raw); }
    catch { console.error('[mnemo-ws-client] non-JSON message:', raw.slice(0, 200)); return; }
    if (!msg.id) return;
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    if (p.timer) clearTimeout(p.timer);
    if (msg.error) p.reject(new Error(msg.error));
    else           p.resolve(msg.result);
  }

  // ── Typed wrappers ──────────────────────────────────────────────────────────

  async query(text: string, opts: {
    limit?:           number;
    vault?:           string;
    semantic?:        boolean;
    spineTypeFilter?: string[];
  }): Promise<QueryResult> {
    const params: Record<string, unknown> = {
      appId:    this.manifest.id,
      text,
      vault:    opts.vault    ?? 'DEV',
      limit:    opts.limit    ?? 10,
      semantic: opts.semantic ?? true,
    };
    // Only send when set — server treats absence as "no filter".
    if (opts.spineTypeFilter && opts.spineTypeFilter.length > 0) {
      params['spineTypeFilter'] = opts.spineTypeFilter;
    }
    return await this._rpc<QueryResult>('sdk.query', params);
  }

  /**
   * "Ask Mnemosyne" — get a synthesized prose answer (RAG+LLM) plus its source
   * chronicles, instead of raw hits. Slower than query() (runs the LLM), so it
   * uses a longer timeout.
   */
  async ask(question: string, opts: { vault?: string } = {}): Promise<AskResult> {
    return await this._rpc<AskResult>('sdk.ask', {
      appId: this.manifest.id,
      text:  question,
      vault: opts.vault ?? 'DEV',
    }, 60_000);
  }

  /** Enumerate the vaults the OS exposes (id, display name, chronicle count). */
  async vaultsList(): Promise<VaultsListResult> {
    return await this._rpc<VaultsListResult>('sdk.vaults.list', { appId: this.manifest.id });
  }

  async ingest(p: IngestPayload): Promise<IngestResult> {
    return await this._rpc<IngestResult>('sdk.ingest', {
      appId:     this.manifest.id,
      content:   p.content,
      spineType: p.spineType,
      vault:     p.vault,
    });
  }

  async gitLog(p: { limit?: number; since?: string }): Promise<GitLogResult> {
    return await this._rpc<GitLogResult>('sdk.git.log', {
      appId: this.manifest.id,
      limit: p.limit ?? 20,
      since: p.since ?? '30 days ago',
    });
  }

  /**
   * Dream State introspection — the connections the nocturnal engine discovered
   * between chronicles ("what did you dream about?"). Read-only.
   */
  async dreamBridges(opts: {
    limit?:       number;
    minDbs?:      number;
    sessionId?:   string;
    chronicleId?: number;
  } = {}): Promise<DreamBridgesResult> {
    const params: Record<string, unknown> = { appId: this.manifest.id };
    if (opts.limit       !== undefined) params['limit']       = opts.limit;
    if (opts.minDbs      !== undefined) params['minDbs']      = opts.minDbs;
    if (opts.sessionId   !== undefined) params['sessionId']   = opts.sessionId;
    if (opts.chronicleId !== undefined) params['chronicleId'] = opts.chronicleId;
    return await this._rpc<DreamBridgesResult>('sdk.dream.bridges', params);
  }

  /**
   * Spine introspection — chronicle → spine assignments for a vault, whole-vault
   * per-spine counts, and (optionally) the global taxonomy tree. Read-only.
   */
  async spineAssignments(opts: {
    vault?:           string;
    spineType?:       string;
    limit?:           number;
    offset?:          number;
    includeTaxonomy?: boolean;
  } = {}): Promise<SpineAssignmentsResult> {
    const params: Record<string, unknown> = { appId: this.manifest.id };
    if (opts.vault           !== undefined) params['vault']           = opts.vault;
    if (opts.spineType       !== undefined) params['spineType']       = opts.spineType;
    if (opts.limit           !== undefined) params['limit']           = opts.limit;
    if (opts.offset          !== undefined) params['offset']          = opts.offset;
    if (opts.includeTaxonomy !== undefined) params['includeTaxonomy'] = opts.includeTaxonomy;
    return await this._rpc<SpineAssignmentsResult>('sdk.spine.assignments', params);
  }

  // ── Voice rendering (SDK v1.6) ──────────────────────────────────────────────

  /** What can speak on this machine, and which reference voices exist. */
  async voiceEngines(): Promise<VoiceEnginesResult> {
    return await this._rpc<VoiceEnginesResult>('sdk.voice.engines', { appId: this.manifest.id });
  }

  /**
   * Start rendering a script to a WAV file. Returns a JOB, never audio — a
   * five-minute script is minutes of synthesis, well past any RPC timeout.
   * Poll with {@link voiceStatus}.
   */
  async voiceSpeak(p: {
    text:          string;
    engine?:       string;
    language?:     string;
    clone?:        string;
    speed?:        number;
    exaggeration?: number;
    title?:        string;
  }): Promise<VoiceJobResult> {
    const params: Record<string, unknown> = { appId: this.manifest.id, text: p.text };
    // Only send what the caller chose: absence means "the host decides", and a
    // value invented here would be indistinguishable from a deliberate one.
    if (p.engine       !== undefined) params['engine']       = p.engine;
    if (p.language     !== undefined) params['language']     = p.language;
    if (p.clone        !== undefined) params['clone']        = p.clone;
    if (p.speed        !== undefined) params['speed']        = p.speed;
    if (p.exaggeration !== undefined) params['exaggeration'] = p.exaggeration;
    if (p.title        !== undefined) params['title']        = p.title;
    return await this._rpc<VoiceJobResult>('sdk.voice.speak', params);
  }

  /** State of one render, or every render this session when no id is given. */
  async voiceStatus(jobId?: string): Promise<VoiceJobResult> {
    const params: Record<string, unknown> = { appId: this.manifest.id };
    if (jobId) params['jobId'] = jobId;
    return await this._rpc<VoiceJobResult>('sdk.voice.status', params);
  }

  /** Ask a render to stop at its next segment boundary. */
  async voiceCancel(jobId: string): Promise<VoiceJobResult> {
    return await this._rpc<VoiceJobResult>('sdk.voice.cancel', { appId: this.manifest.id, jobId });
  }

  close(): void {
    this.ws?.close();
    this.ws        = null;
    this.connected = false;
    this.token     = null;
  }
}
