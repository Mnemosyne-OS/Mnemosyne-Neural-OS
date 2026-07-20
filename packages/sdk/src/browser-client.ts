/**
 * @mnemosyne_os/sdk — MnemoClientBrowser
 *
 * 100% browser-native WebSocket client for Layer 2 apps that run
 * in an Electron renderer or a web browser.
 * Does NOT use the `ws` package (Node-only) — only the native WebSocket API.
 *
 * Usage in a React/Vite app:
 * ```typescript
 * import { MnemoClientBrowser } from '@mnemosyne_os/sdk';
 *
 * const client = await MnemoClientBrowser.connect();
 * await client.register({ id: 'my-app', name: 'My App', version: '1.0.0',
 *   mnemosyne_sdk: '^1.1.0', scopes: ['vault:read:DEV'], vaults: ['DEV'], intents: ['QUERY'] });
 *
 * const chronicles = await client.query('my search', 'DEV', 10);
 * ```
 *
 * [SDK][LAYER-2][BROWSER][ZERO-TRUST]
 */

import { MNEMOSYNE_WS_HOST, MNEMOSYNE_WS_PORT } from './constants.js';
import type {
  AppManifest, Chronicle, GitCommit, AgentInfo, AskResult, AskOptions,
  IngestResult, QueryOptions, QueryResult, RegisterResult,
  ResonanceRecord, PositionUpdateResult,
  VaultListResult, CorrelateOptions, CorrelateResult,
  ForgetResult, GraphQueryResult, DynamicSpineRequest,
  DynamicSpineResult, DynamicSpineInfo,
  // [PHASE-58] Bridge Platform APIs
  BridgeHistoryOptions, BridgeHistoryResult, ResonanceScore,
  // [v1.4.0] Read-only introspection
  DreamBridgesOptions, DreamBridgesResult,
  SpineAssignmentsOptions, SpineAssignmentsResult,
  // [v1.5.0] Per-app sandbox vault
  SandboxVaultResult,
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

interface PushMessage {
  push: true;
  event: Record<string, unknown>;
}

type PendingRpc = {
  resolve: (v: unknown) => void;
  reject:  (e: Error)   => void;
  timer:   ReturnType<typeof setTimeout>;
};

// ── MnemoClientBrowser ────────────────────────────────────────────────────────

/**
 * Browser-native SDK client. Communicates with the Mnemosyne OS SDK
 * WebSocket Server on ws://127.0.0.1:7799 via the standard WebSocket API.
 *
 * Compatible: Chrome, Firefox, Electron renderer, Safari, Vite, Next.js.
 * Not compatible: Node.js (use MnemoClient instead).
 */
export class MnemoClientBrowser {
  private readonly ws:                WebSocket;
  private token:                      string | null = null;
  private readonly pending            = new Map<string, PendingRpc>();
  private _onPush?:                   (event: Record<string, unknown>) => void;
  private _onDisconnect?:             () => void;
  private readonly timeoutMs:         number;

  private constructor(ws: WebSocket, timeoutMs: number) {
    this.ws        = ws;
    this.timeoutMs = timeoutMs;

    this.ws.onmessage = (e: MessageEvent) => this._handleMsg(e.data as string);
    this.ws.onclose   = () => {
      this._onDisconnect?.();
      // Reject all pending RPC calls
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error('[MnemoClientBrowser] WebSocket disconnected'));
      }
      this.pending.clear();
    };
  }

  // ── Static factory ───────────────────────────────────────────────────────────

  /**
   * Creates a native WebSocket connection to the Mnemosyne OS SDK server.
   *
   * @param host - Hostname of the SDK server (default: '127.0.0.1')
   * @param port - Port of the SDK server (default: 7799)
   * @param timeoutMs - Timeout of each RPC in ms (default: 15000)
   */
  static connect(
    host     = MNEMOSYNE_WS_HOST,
    port     = MNEMOSYNE_WS_PORT,
    timeoutMs = 15_000,
  ): Promise<MnemoClientBrowser> {
    return new Promise((resolve, reject) => {
      const url = `ws://${host}:${port}`;
      const ws  = new WebSocket(url);

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error(`[MnemoClientBrowser] Connection timeout to ${url}`));
      }, timeoutMs);

      ws.onopen = () => {
        clearTimeout(timeout);
        resolve(new MnemoClientBrowser(ws, timeoutMs));
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error(`[MnemoClientBrowser] Failed to connect to ${url} — is Mnemosyne OS running?`));
      };
    });
  }

  // ── Message router ───────────────────────────────────────────────────────────

  private _handleMsg(raw: string): void {
    try {
      const msg = JSON.parse(raw) as (RpcResponse & Partial<PushMessage>);
      // Server-push (no id) — e.g. chronicle:new events
      if (msg.push && msg.event) {
        this._onPush?.(msg.event);
        return;
      }
      const p = this.pending.get(msg.id);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error));
      else           p.resolve(msg.result);
    } catch { /* malformed — ignore */ }
  }

  // ── Low-level RPC ────────────────────────────────────────────────────────────

  private call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState !== WebSocket.OPEN) {
        return reject(new Error('[MnemoClientBrowser] WebSocket not open'));
      }

      const id: string = Math.random().toString(36).slice(2);
      const req: RpcRequest = {
        id, method, params,
        ...(this.token ? { token: this.token } : {}),
      };

      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`[MnemoClientBrowser] RPC timeout: ${method} (${this.timeoutMs}ms)`));
      }, this.timeoutMs);

      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
        timer,
      });

      this.ws.send(JSON.stringify(req));
    });
  }

  // ── Auth ─────────────────────────────────────────────────────────────────────

  /**
   * Registers the app with Mnemosyne OS and obtains a 24h JWT.
   * Must be called before any other method.
   *
   * @throws if the manifest is invalid or if the OS refuses the registration
   */
  async register(manifest: AppManifest): Promise<RegisterResult> {
    const res = await this.call<RegisterResult>('sdk.register', { manifest });
    this.token = res.token;
    return res;
  }

  // ── Vault ─────────────────────────────────────────────────────────────────────

  /**
   * Ingests content into the Mnemosyne vault.
   * The content is vectorized by the OS runtime (not in the SDK).
   * Requires the `vault:write:<vault>` scope and the `INGEST` intent.
   */
  async ingest(
    content:   string,
    spineType: string,
    vault      = 'DEV',
    metadata?: Record<string, unknown>,
  ): Promise<IngestResult> {
    const res = await this.call<IngestResult>('sdk.ingest', {
      appId: this.appId ?? 'unknown',
      content, spineType, vault,
      ...(metadata ? { metadata } : {}),
    });
    return res;
  }

  /**
   * Semantic query against the vault — returns the closest chronicles.
   * Requires the `vault:read:<vault>` scope and the `QUERY` intent.
   *
   * @param text    - Search text
   * @param vault   - Target vault (default: 'DEV')
   * @param limit   - Max number of results (default: 10)
   * @param options - [SDK 1.2] Additional semantic options (semantic,
   *                  scope, spineTypeFilter). See {@link QueryOptions}.
   */
  async query(
    text:    string,
    vault                                    = 'DEV',
    limit                                    = 10,
    options: Pick<QueryOptions, 'semantic' | 'scope' | 'spineTypeFilter'> = {},
  ): Promise<Chronicle[]> {
    const res = await this.call<QueryResult>('sdk.query', {
      appId: this.appId ?? 'unknown',
      text, vault, limit,
      // [SDK 1.2 — Semantic Bridge] Forward optional semantic params.
      ...(options.semantic        !== undefined ? { semantic:        options.semantic }        : {}),
      ...(options.scope           !== undefined ? { scope:           options.scope }           : {}),
      ...(options.spineTypeFilter !== undefined ? { spineTypeFilter: options.spineTypeFilter } : {}),
    });
    if (!res.success) throw new Error(res.error ?? 'query failed');
    return res.chronicles ?? [];
  }

  /**
   * Ask Mnemosyne a question and get a SYNTHESIZED prose answer (RAG+LLM) plus
   * the source chronicles it used — Mnemosyne reasons across its memory and
   * answers directly, like a teammate who knows the whole project. Use for
   * "why / who / how" questions. Slower than {@link query} (runs the LLM).
   * Requires scope `vault:read:<vault>` and the QUERY intent (same as query).
   *
   * @param question - Natural-language question
   * @param vault - Vault to reason over (default 'DEV')
   * @param options - [v1.4] Retrieval profile: `{ scope?, topK?, maxSourceChars? }` —
   *                  raise topK/maxSourceChars for recall-heavy questions
   *                  (defaults: 5 sources × 1200 chars; clamped server-side).
   */
  async ask(question: string, vault = 'DEV', options: AskOptions = {}): Promise<AskResult> {
    const res = await this.call<{ success: boolean; answer?: string; sources?: Chronicle[]; error?: string }>(
      'sdk.ask', {
        appId: this.appId ?? 'unknown',
        text: question,
        vault,
        ...(options.scope          !== undefined ? { scope: options.scope }                   : {}),
        ...(options.topK           !== undefined ? { topK: options.topK }                     : {}),
        ...(options.maxSourceChars !== undefined ? { maxSourceChars: options.maxSourceChars } : {}),
      },
    );
    return {
      success: res.success,
      answer:  res.answer  ?? '',
      sources: res.sources ?? [],
      ...(res.error !== undefined ? { error: res.error } : {}),
    };
  }

  // ── Resonances ────────────────────────────────────────────────────────────────

  /**
   * Returns the active Resonances (cognitive projects) from the DEV vault.
   * Requires scope `vault:read:DEV`.
   */
  async resonancesList(): Promise<ResonanceRecord[]> {
    const res = await this.call<{ success: boolean; resonances: ResonanceRecord[] }>(
      'sdk.resonances.list', { appId: this.appId ?? 'unknown' }
    );
    return res.success ? (res.resonances ?? []) : [];
  }

  /**
   * Persists the current position of a Resonance in the DEV vault.
   * Requires scope `vault:write:DEV`.
   *
   * @param resonanceId - Resonance identifier
   * @param position    - Current position description (e.g. 'Phase 51.2 — auto-poll')
   * @param phase       - Current phase (e.g. 'Phase 51')
   */
  async updatePosition(resonanceId: string, position: string, phase: string): Promise<PositionUpdateResult> {
    return this.call<PositionUpdateResult>('sdk.resonance.updatePosition', {
      appId: this.appId ?? 'unknown',
      resonanceId, position, phase,
    });
  }

  // ── Monorepo ──────────────────────────────────────────────────────────────────

  /**
   * Returns the recent commits of the Mnemosyne OS monorepo.
   * Requires the `monorepo:read` scope and the `GIT_LOG` intent.
   * [SECURITY] The repo path is hardcoded server-side.
   *
   * @param limit - Max number of commits (default: 20)
   * @param since - Relative Git date (e.g. '30 days ago', '2024-01-01')
   */
  async gitLog(limit = 20, since?: string): Promise<GitCommit[]> {
    const res = await this.call<{ success: boolean; commits: GitCommit[] }>(
      'sdk.git.log', { appId: this.appId ?? 'unknown', limit, since }
    );
    return res.success ? (res.commits ?? []) : [];
  }

  /**
   * Reads a `.md` file from the Mnemosyne OS repo.
   * Requires the `monorepo:read` scope.
   * [SECURITY] Only `.md` files are accessible, path sanitized server-side.
   *
   * @param path - Path relative to the repo (e.g. 'docs/ARCHITECTURE.md')
   */
  async readFile(path: string): Promise<string> {
    const res = await this.call<{ content: string }>('sdk.readFile', { path });
    return res.content ?? '';
  }

  // ── Agents ──────────────────────────────────────────────────────────────────────

  /**
   * Lists Layer 2 apps currently connected to the SDK WebSocket Server.
   * Requires scope `agents:read` and intent `LIST_AGENTS`.
   */
  async agentsList(): Promise<AgentInfo[]> {
    const res = await this.call<{ success: boolean; agents: AgentInfo[] }>(
      'sdk.agents.list', { appId: this.appId ?? 'unknown' }
    );
    return res.success ? (res.agents ?? []) : [];
  }

  // ── Vault Discovery [v1.2.0] ────────────────────────────────────────────────────

  /**
   * Returns all available vaults (core built-ins + user-created custom vaults).
   * Use the `id` field of each entry as the `vault` param in `ingest()` and `query()`.
   * Requires intent `LIST_VAULTS`.
   *
   * [v1.4 CONTRACT FIX] The server answers with a flat `{ success, vaults }`
   * (id = workspace id, name = display name) — NOT the `{ coreVaults,
   * customVaults }` this method has always advertised. Until 1.4 the split
   * arrays were silently `undefined` for every caller. Normalize here so the
   * advertised type is finally true (and pass a future split through as-is).
   */
  /**
   * Idempotently ensures this app's OWN sandbox vault exists — an isolated
   * vault derived from the app id, walled off by default (no mixing, hidden
   * from the neural map and the dream layer). Write freely into the returned
   * `vault`; only the HUMAN can unlock permanence, from the Vault Manager.
   */
  async ensureSandboxVault(): Promise<SandboxVaultResult> {
    return this.call<SandboxVaultResult>('sdk.vault.sandbox.ensure', {
      appId: this.appId ?? 'unknown',
    });
  }

  async vaultsList(): Promise<VaultListResult> {
    const CORE = new Set(['DEV', 'SOCIAL', 'PERSONAL', 'FINANCE', 'RESEARCH']);
    const res = await this.call<{
      success: boolean;
      error?: string;
      vaults?: Array<{
        id?: string; name?: string; state?: string; chronicleCount?: number;
        type?: string; description?: string; protection?: string;
        mixableWith?: string[]; visibleInNeuralMap?: boolean;
      }>;
      coreVaults?: VaultListResult['coreVaults'];
      customVaults?: VaultListResult['customVaults'];
    }>('sdk.vaults.list', { appId: this.appId ?? 'unknown' });

    if (res.coreVaults || res.customVaults) {
      return {
        success: res.success,
        coreVaults: res.coreVaults ?? [],
        customVaults: res.customVaults ?? [],
        ...(res.error !== undefined ? { error: res.error } : {}),
      };
    }

    const all = (res.vaults ?? []).map((v) => ({
      id:             String(v.id ?? ''),
      displayName:    String(v.name ?? v.id ?? ''),
      fixed:          CORE.has(String(v.id ?? '').toUpperCase()),
      color:          '',
      chronicleCount: typeof v.chronicleCount === 'number' ? v.chronicleCount : 0,
      sizeKb:         0,
      // Governance metadata (undefined when the OS could not read the manifest).
      ...(v.type !== undefined ? { type: v.type } : {}),
      ...(v.description !== undefined ? { description: v.description } : {}),
      ...(v.protection !== undefined ? { protection: v.protection } : {}),
      ...(v.mixableWith !== undefined ? { mixableWith: v.mixableWith } : {}),
      ...(v.visibleInNeuralMap !== undefined ? { visibleInNeuralMap: v.visibleInNeuralMap } : {}),
    }));
    return {
      success: res.success,
      coreVaults: all.filter((v) => v.fixed),
      customVaults: all.filter((v) => !v.fixed),
      ...(res.error !== undefined ? { error: res.error } : {}),
    };
  }

  // ── Correlate [v1.2.0] ──────────────────────────────────────────────────────────

  /**
   * Finds chronicles causally or semantically linked to a source chronicle.
   * Requires intent `CORRELATE` and the appropriate vault read scope.
   *
   * @param options - `{ sourceId, vault?, limit?, threshold? }`
   */
  async correlate(options: CorrelateOptions): Promise<CorrelateResult> {
    return this.call<CorrelateResult>('sdk.correlate', {
      appId: this.appId ?? 'unknown',
      ...options,
    });
  }

  // ── Forget / GDPR [v1.2.0] ──────────────────────────────────────────────────────

  /**
   * Permanently deletes a chronicle by ID. Requires intent `FORGET`
   * and the appropriate vault write scope.
   *
   * @param chronicleId - ID of the chronicle to delete.
   * @param vault       - Vault to delete from (default: 'DEV').
   */
  async forget(chronicleId: string, vault = 'DEV'): Promise<ForgetResult> {
    return this.call<ForgetResult>('sdk.forget', {
      appId: this.appId ?? 'unknown',
      chronicleId, vault,
    });
  }

  // ── NeuralGraph [v1.2.0] ────────────────────────────────────────────────────────

  /**
   * Queries the NeuralGraph — returns nodes and edges near the given text.
   * Requires scope `neural:graph:read`.
   *
   * @param text      - Search text to embed and match against the graph.
   * @param threshold - Minimum edge strength 0-1 (default: 0.5).
   */
  async graphQuery(text: string, threshold = 0.5): Promise<GraphQueryResult> {
    return this.call<GraphQueryResult>('sdk.graph.query', {
      appId: this.appId ?? 'unknown',
      text, threshold,
    });
  }

  // ── Dynamic Spine Registry [v1.2.0] ──────────────────────────────────────────────

  /**
   * Allocates a new dynamic spine in the OS Protocole du Guichet registry.
   * Requires scope `vault:write:CUSTOM`.
   *
   * @example
   * ```ts
   * await client.spineRegister({
   *   id: 'my_events', name: 'App Events', type: 'SESSION', icon: '📊'
   * });
   * ```
   */
  async spineRegister(spine: DynamicSpineRequest): Promise<DynamicSpineResult> {
    return this.call<DynamicSpineResult>('sdk.spine.register', {
      appId: this.appId ?? 'unknown',
      spine,
    });
  }

  /**
   * Releases a dynamic spine previously allocated by this app.
   * Requires scope `vault:write:CUSTOM`.
   */
  async spineRelease(spineId: string): Promise<{ success: boolean; error?: string }> {
    return this.call<{ success: boolean; error?: string }>('sdk.spine.release', {
      appId: this.appId ?? 'unknown',
      spineId,
    });
  }

  /**
   * Lists all currently allocated dynamic spines across all apps.
   */
  async spineList(): Promise<DynamicSpineInfo[]> {
    const res = await this.call<{ success: boolean; spines: DynamicSpineInfo[] }>(
      'sdk.spine.list', { appId: this.appId ?? 'unknown' }
    );
    return res.success ? (res.spines ?? []) : [];
  }

  // ── [PHASE-58] Perpetual Memory Bridges [v2.0] ───────────────────────────────────────

  /**
   * Returns the persistent semantic bridges stored in the user's vault.
   * Bridges are cognitive links discovered by Semantic Reflect scans between
   * cross-vault chronicles (e.g. SOCIAL ⇔ DEV, PERSONAL ⇔ DEV).
   *
   * [PHASE-58][PLATFORM][READ-ONLY]
   *
   * Required manifest: `scopes: ['bridge:read']`, `intents: ['BRIDGE_READ']`
   *
   * @param options - Optional filters: `{ limit, since, minCosine, vaultFilter, onlyNew }`
   *
   * @example
   * ```typescript
   * const result = await client.getBridgeHistory({ minCosine: 0.80, limit: 50 });
   * console.log(`${result.bridges.length} high-confidence bridges`);
   * ```
   */
  async getBridgeHistory(options?: BridgeHistoryOptions): Promise<BridgeHistoryResult> {
    return this.call<BridgeHistoryResult>('sdk.bridges.history', {
      appId: this.appId ?? 'unknown',
      ...options,
    });
  }

  /**
   * Computes a resonance score for a text against the user's bridge history.
   * Use this to measure cognitive relevance before publishing a social post.
   *
   * [PHASE-58][PLATFORM][READ-ONLY]
   *
   * Required manifest: `scopes: ['bridge:read']`, `intents: ['BRIDGE_READ']`
   *
   * @param text - Text to score (e.g. LinkedIn/Reddit post draft).
   * @param topK - Number of top matches to return (default: 5).
   *
   * @returns { score: 0-1, level: 'LOW'|'MEDIUM'|'HIGH_RESONANCE', topMatches }
   *
   * @example
   * ```typescript
   * const score = await client.computeResonance(postDraft, 5);
   * if (score.level === 'HIGH_RESONANCE') {
   *   console.log('✨ This post aligns with your cognitive graph!');
   * }
   * ```
   */
  async computeResonance(text: string, topK = 5): Promise<ResonanceScore> {
    return this.call<ResonanceScore>('sdk.bridges.resonance', {
      appId: this.appId ?? 'unknown',
      text, topK,
    });
  }

  // ── Read-only Introspection [v1.4.0] ─────────────────────────────────────────

  /**
   * Lists the connections the Dream State engine discovered between chronicles
   * during its nocturnal scans — "what did you dream about last night?". Each
   * bridge carries its DBS/cosine scores and both linked chronicles.
   *
   * Required manifest: `scopes: ['bridge:read']`, `intents: ['BRIDGE_READ']`
   *
   * @param options - Optional filters: `{ limit, minDbs, sessionId, chronicleId }`
   *
   * @example
   * ```typescript
   * const { bridges } = await client.dreamBridges({ minDbs: 0.5, limit: 20 });
   * bridges.forEach(b => console.log(`${b.from.excerpt} ⇄ ${b.to.excerpt} (dbs ${b.dbs})`));
   * ```
   */
  async dreamBridges(options: DreamBridgesOptions = {}): Promise<DreamBridgesResult> {
    return this.call<DreamBridgesResult>('sdk.dream.bridges', {
      appId: this.appId ?? 'unknown',
      ...options,
    });
  }

  /**
   * Lists chronicle → spine assignments for a vault — "how did you classify
   * this memory?". Returns a newest-first page of assignments, per-spine counts
   * across the whole vault, and (optionally) the global taxonomy tree.
   *
   * Required manifest: `scopes: ['vault:read:<vault>']`, `intents: ['QUERY']`
   *
   * @param options - `{ vault?, spineType?, limit?, offset?, includeTaxonomy? }`
   *
   * @example
   * ```typescript
   * const res = await client.spineAssignments({ vault: 'ARENA', includeTaxonomy: true });
   * console.log(res.counts); // [{ spineType: 'DOCUMENT', count: 412 }, …]
   * ```
   */
  async spineAssignments(options: SpineAssignmentsOptions = {}): Promise<SpineAssignmentsResult> {
    return this.call<SpineAssignmentsResult>('sdk.spine.assignments', {
      appId: this.appId ?? 'unknown',
      ...options,
    });
  }

  // ── Events ────────────────────────────────────────────────────────────────────

  /**
   * Registers a handler for the push events sent by the OS.
   * Triggered for example when another client ingests a chronicle (`chronicle:new`).
   *
   * @example
   * ```typescript
   * client.onPush((event) => {
   *   if (event.type === 'chronicle:new') {
   *     console.log('New chronicle from:', event.sourceApp);
   *   }
   * });
   * ```
   */
  onPush(fn: (event: Record<string, unknown>) => void): void {
    this._onPush = fn;
  }

  /**
   * Registers a callback invoked when the WS connection is closed by the OS.
   */
  onDisconnect(fn: () => void): void {
    this._onDisconnect = fn;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  /**
   * Closes the WebSocket connection cleanly.
   */
  close(): void {
    this.ws.close(1000, 'Client close');
  }

  // ── Getters ───────────────────────────────────────────────────────────────────

  get isConnected(): boolean { return this.ws.readyState === WebSocket.OPEN; }

  /** Current JWT token (null before register()) */
  get currentToken(): string | null { return this.token; }

  /**
   * AppId extracted from the current JWT, or null if not registered.
   */
  get appId(): string | null {
    if (!this.token) return null;
    try {
      const [, b64] = this.token.split('.');
      if (!b64) return null;
      const padded = b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - b64.length % 4) % 4);
      const payload = JSON.parse(atob(padded)) as { sub?: string };
      return payload.sub ?? null;
    } catch { return null; }
  }
}
