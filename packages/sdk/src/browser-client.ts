/**
 * @mnemosyne_os/sdk — MnemoClientBrowser
 *
 * Client WebSocket 100% browser-native pour les apps Layer 2 qui tournent
 * dans un renderer Electron ou un navigateur web.
 * N'utilise PAS le package `ws` (Node-only) — uniquement l'API WebSocket native.
 *
 * Usage dans une app React/Vite :
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
  AppManifest, Chronicle, GitCommit, AgentInfo,
  IngestResult, QueryOptions, QueryResult, RegisterResult,
  ResonanceRecord, PositionUpdateResult,
  VaultListResult, CorrelateOptions, CorrelateResult,
  ForgetResult, GraphQueryResult, DynamicSpineRequest,
  DynamicSpineResult, DynamicSpineInfo,
  // [PHASE-58] Bridge Platform APIs
  BridgeHistoryOptions, BridgeHistoryResult, ResonanceScore,
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
 * Client SDK browser-native. Communique avec le SDK WebSocket Server de
 * Mnemosyne OS sur ws://127.0.0.1:7799 via l'API WebSocket standard.
 *
 * Compatible : Chrome, Firefox, Electron renderer, Safari, Vite, Next.js.
 * Non compatible : Node.js (utiliser MnemoClient à la place).
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
   * Crée une connexion WebSocket native vers le SDK server de Mnemosyne OS.
   *
   * @param host - Hostname du SDK server (défaut: '127.0.0.1')
   * @param port - Port du SDK server (défaut: 7799)
   * @param timeoutMs - Timeout de chaque RPC en ms (défaut: 15000)
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
   * Enregistre l'app auprès de Mnemosyne OS et obtient un JWT 24h.
   * Doit être appelé avant toute autre méthode.
   *
   * @throws si le manifest est invalide ou si l'OS refuse l'enregistrement
   */
  async register(manifest: AppManifest): Promise<RegisterResult> {
    const res = await this.call<RegisterResult>('sdk.register', { manifest });
    this.token = res.token;
    return res;
  }

  // ── Vault ─────────────────────────────────────────────────────────────────────

  /**
   * Ingère du contenu dans le vault Mnemosyne.
   * Le contenu est vectorisé par le runtime OS (pas dans le SDK).
   * Requiert le scope `vault:write:<vault>` et l'intent `INGEST`.
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
   * Requête sémantique sur le vault — retourne les chronicles les plus proches.
   * Requiert le scope `vault:read:<vault>` et l'intent `QUERY`.
   *
   * @param text    - Texte de recherche
   * @param vault   - Vault cible (défaut: 'DEV')
   * @param limit   - Nombre max de résultats (défaut: 10)
   * @param options - [SDK 1.2] Options sémantiques additionnelles (semantic,
   *                  scope, spineTypeFilter). Voir {@link QueryOptions}.
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
   * Retourne les commits récents du monorepo Mnemosyne OS.
   * Requiert le scope `monorepo:read` et l'intent `GIT_LOG`.
   * [SECURITY] Le chemin du repo est hardcodé côté serveur.
   *
   * @param limit - Nombre de commits max (défaut: 20)
   * @param since - Date relative Git (ex: '30 days ago', '2024-01-01')
   */
  async gitLog(limit = 20, since?: string): Promise<GitCommit[]> {
    const res = await this.call<{ success: boolean; commits: GitCommit[] }>(
      'sdk.git.log', { appId: this.appId ?? 'unknown', limit, since }
    );
    return res.success ? (res.commits ?? []) : [];
  }

  /**
   * Lit un fichier `.md` depuis le repo Mnemosyne OS.
   * Requiert le scope `monorepo:read`.
   * [SECURITY] Seuls les fichiers `.md` sont accessibles, path sanitizé côté serveur.
   *
   * @param path - Chemin relatif au repo (ex: 'docs/ARCHITECTURE.md')
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
   */
  async vaultsList(): Promise<VaultListResult> {
    return this.call<VaultListResult>('sdk.vaults.list', { appId: this.appId ?? 'unknown' });
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

  // ── Events ────────────────────────────────────────────────────────────────────

  /**
   * Enregistre un handler pour les push events envoyés par l'OS.
   * Déclenché par exemple quand un autre client ingère un chronicle (`chronicle:new`).
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
   * Enregistre un callback appelé quand la connexion WS est fermée par l'OS.
   */
  onDisconnect(fn: () => void): void {
    this._onDisconnect = fn;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  /**
   * Ferme la connexion WebSocket proprement.
   */
  close(): void {
    this.ws.close(1000, 'Client close');
  }

  // ── Getters ───────────────────────────────────────────────────────────────────

  get isConnected(): boolean { return this.ws.readyState === WebSocket.OPEN; }

  /** Token JWT actuel (null avant register()) */
  get currentToken(): string | null { return this.token; }

  /**
   * AppId extrait du JWT actuel, ou null si non enregistré.
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
