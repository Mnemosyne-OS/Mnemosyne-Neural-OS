/**
 * @mnemosyne_os/sdk — Public Types
 *
 * This file is the public API contract surface of the SDK.
 * Any modification here constitutes a breaking or additive API change.
 *
 * Version history:
 *   v1.1.0 — initial types (ingest, query, git, agents, NFT, NeuralGraph)
 *   v1.2.0 — custom vault support, Resonance types, Correlate/Forget/DynamicSpine API
 *
 * [SDK][ZERO-TRUST][AUDIT-TRAIL]
 */

// ── Manifest ──────────────────────────────────────────────────────────────────

/**
 * All available permission scopes for a Layer 2 application.
 *
 * Scopes follow the pattern `resource:action:target`.
 * Any scope not listed here is silently refused by the Zero-Trust gate.
 *
 * **Custom vault scopes:**
 * Use `vault:read:CUSTOM` / `vault:write:CUSTOM` to request read/write access
 * to any custom vault created by the user. The actual vault ID is resolved at
 * runtime from the `vaults` field of the manifest.
 */
export type MnemoScope =
  | 'vault:read:DEV'      | 'vault:write:DEV'
  | 'vault:read:SOCIAL'   | 'vault:write:SOCIAL'
  | 'vault:read:PERSONAL' | 'vault:write:PERSONAL'
  | 'vault:read:FINANCE'  | 'vault:write:FINANCE'
  | 'vault:read:RESEARCH'  | 'vault:write:RESEARCH'
  /** Wildcard scope — grants read access to any user-created custom vault. */
  | 'vault:read:CUSTOM'
  /** Wildcard scope — grants write access to any user-created custom vault. */
  | 'vault:write:CUSTOM'
  | 'share:request'       | 'share:grant'
  /** Read access to the Mnemosyne OS monorepo git log. */
  | 'monorepo:read'
  /** List active connected SDK agents. */
  | 'agents:read'
  /** On-chain NFT licence validation for MnemoStore. Premium scope. */
  | 'nft:validate'
  /** Read access to the NeuralGraph (nodes, edges, clusters). */
  | 'neural:graph:read'
  /** Direct LLM queries via the Mnemosyne runtime. Premium scope. */
  | 'llm:query'
  /**
   * [PHASE-58] Read access to the Perpetual Memory Bridges.
   * Allows a Layer 2 app to call getBridgeHistory() and computeResonance().
   * Write access (saveBridges) is CORE-ONLY and not exposed to Layer 2.
   */
  | 'bridge:read';

/**
 * Allowed IPC intents for a Layer 2 application.
 * An intent is the high-level operation the app is permitted to perform.
 * Each intent maps to one or more WS server routes.
 */
export type MnemoIntent =
  | 'INGEST'      /** Write content to a vault (triggers vectorization). */
  | 'QUERY'       /** Semantic search against a vault. */
  | 'CORRELATE'   /** Find causal/temporal/semantic links between chronicles. */
  | 'FORGET'      /** Delete a chronicle by ID (GDPR). */
  | 'GIT_LOG'     /** Read the monorepo git commit log. */
  | 'LIST_AGENTS' /** List active SDK agents connected to the WS server. */
  | 'LIST_VAULTS' /** Discover available vaults (core + custom). */
  | 'BRIDGE_READ';/** [PHASE-58] Read bridge history and compute resonance scores. */

/**
 * Target vault identifier.
 *
 * Core vaults are fixed string literals.
 * Custom vaults created via Phase 41 are identified by an opaque uppercase string ID
 * (e.g. `'MY_NOTES'`). Discover available custom vault IDs via `sdk.vaults.list`.
 */
export type MnemoVault = 'DEV' | 'SOCIAL' | 'PERSONAL' | 'FINANCE' | 'RESEARCH' | (string & {});

/** Semantic spine types */
export type SpineType =
  | 'GIT' | 'ARCHITECTURE' | 'DECISION' | 'DEBUG' | 'FEATURE'
  | 'REDDIT_POST' | 'LINKEDIN_POST' | 'SOCIAL_NODE'
  | 'DOCUMENT' | 'NOTE' | 'CUSTOM'
  /** Created by the Cockpit or via sdk.resonances.list */
  | 'RESONANCE'
  /** Session persistence / resume context */
  | 'SESSION'
  /** Position update (phase, current state) */
  | 'POSITION_UPDATE'
  | 'API' | 'DOC' | 'ERROR'
  /** [PHASE-64] Affective & Ideational Spines */
  | 'EPIPHANY' | 'EMOTIONAL' | 'TENSION' | 'FLOW'
  | 'IDEATIONAL' | 'HYPOTHESIS' | 'CONCERN' | 'VISION'
  | 'CONTEXTUAL' | 'DISCOVERY'
  | (string & {});

/** Application manifest — `app.manifest.json` file */
export interface AppManifest {
  /** Stable unique identifier of the app (snake_case recommended) */
  id: string;
  /** Name displayed to the user */
  name: string;
  /** SemVer version */
  version: string;
  /** Author or organization */
  author?: string;
  /** Required SDK version */
  mnemosyne_sdk: string;
  /** Requested scopes — Zero-Trust: any unlisted scope is refused */
  scopes: MnemoScope[];
  /** Accessible vaults */
  vaults: MnemoVault[];
  /** Authorized IPC intents */
  intents: MnemoIntent[];
  /** Maximum size of a chronicle (KB) — default 64KB */
  max_chronicle_size_kb?: number;
  /**
   * If true, each inter-app request triggers a user consent popup.
   * If false, consent is requested once and remembered.
   */
  requires_consent?: boolean;
  /** Short description displayed in the Synaptic Hub */
  description?: string;
}

// ── Client Config ─────────────────────────────────────────────────────────────

export interface MnemoClientOptions {
  /** Identifier of the app — must match AppManifest.id */
  appId: string;
  /** Path to app.manifest.json or inline manifest object */
  manifest: string | AppManifest;
  /**
   * Transport to use:
   *   'ws'  → local WebSocket (Node.js app external to Mnemosyne)
   *   'ipc' → Electron IPC (app embedded via PluginHub)
   *   'auto' → Automatically detects based on the environment (default)
   */
  transport?: 'ws' | 'ipc' | 'auto';
  /** Port of the Mnemosyne WebSocket server (default: 7799) */
  wsPort?: number;
  /** JWT authentication token (obtained via MnemoClient.register) */
  token?: string;
  /** Request timeout in ms (default: 30000) */
  timeoutMs?: number;
}

// ── Ingest ────────────────────────────────────────────────────────────────────

export interface IngestPayload {
  /** Raw text content to vectorize */
  content: string;
  /** Semantic spine type */
  spineType: SpineType;
  /** Destination vault */
  vault: MnemoVault;
  /** Optional metadata (not vectorized, stored as-is) */
  metadata?: Record<string, unknown>;
  /** Vector dimension (default: 512) */
  dimension?: number;
}

export interface IngestResult {
  success: boolean;
  chronicleId?: string;
  error?: string;
  /** If true, the content was sanitized by the AI-Firewall (injection detected) */
  sanitized?: boolean;
}

// ── Query ─────────────────────────────────────────────────────────────────────

export interface QueryOptions {
  /** Max number of results (default: 10) */
  limit?: number;
  /** Vault to query (default: vault declared in the manifest) */
  vault?: MnemoVault;
  /** Minimum similarity threshold 0-1 (default: 0.0) */
  threshold?: number;
  /**
   * [SDK 1.2 — Semantic Bridge] Opt-in true semantic ranking.
   *
   * When `false` / omitted, the server returns the N most recent chronicles
   * (the Cockpit fast-path, ~5ms, query text ignored).
   *
   * When `true`, the server embeds the query via the host's active model
   * (Vertex 768D / e5-base / Hybrid) and ranks via `querySemanticContext`
   * with cosine similarity × spineType weight under the cognitive `scope`.
   *
   * Use `true` for agent-style queries where relevance matters more than
   * recency. Default behaviour stays "recent" to preserve historical
   * contracts (notably Cockpit's live feed).
   */
  semantic?: boolean;
  /**
   * [SDK 1.2] Cognitive ranking scope for type-weighting. Only meaningful
   * when `semantic: true`. Defaults to `'SOURCE_CODE'` server-side, which
   * boosts ARCHITECTURE / GIT / API spines and dampens DOCUMENT / VISION.
   * Other valid scopes depend on the host's `type-weights.ts` table.
   */
  scope?: string;
  /**
   * [SDK 1.2] Optional whitelist of spineTypes to restrict results to.
   * Server-side SQL `IN` clause. Example: `['ARCHITECTURE', 'GIT']` to
   * surface design docs + commit history only.
   */
  spineTypeFilter?: string[];
}

export interface Chronicle {
  id: string;
  /** Text content of the chronicle. May be absent if only the vector is stored. */
  content?: string;
  spineType: SpineType;
  score: number;
  timestamp: string;
  source_app_id: string;
}

/**
 * [SDK 1.2 — Semantic Bridge] Debug breadcrumb returned by the server when
 * the client opted into `semantic: true`. Lets agents distinguish "I asked
 * for semantic and got it" from "I asked for semantic and it silently fell
 * back to recent" (and why). Only populated on opt-in.
 */
export interface QuerySemanticDebug {
  /** Did the client request semantic ranking? Always true when this field is present. */
  wanted: boolean;
  /** Did the semantic branch actually execute? (false ⇒ fell back to recent, see `error`) */
  used: boolean;
  /** Dimension of the embedding vector used (768 for Vertex/e5-base, 512 for nomic local). */
  vectorDim?: number;
  /** Total chronicle count in the target vault at query time. */
  vaultSize?: number;
  /** Error message if `used` is false. Examples: provider not registered, vector dim mismatch. */
  error?: string;
}

export interface QueryResult {
  success: boolean;
  chronicles: Chronicle[];
  error?: string;
  /**
   * [SDK 1.2] Present only when the client sent `semantic: true`. See
   * {@link QuerySemanticDebug}. Absent on fast-path / non-opt-in queries.
   */
  _semantic?: QuerySemanticDebug;
}

/**
 * Result of `ask()` — a synthesized (RAG+LLM) prose answer plus the source
 * chronicles it was grounded in. Unlike `query()` (raw chronicles), Mnemosyne
 * reasons over its memory and answers directly. Always check `sources` before
 * fully trusting `answer`.
 */
export interface AskResult {
  success: boolean;
  answer: string;
  sources: Chronicle[];
  error?: string;
}

/**
 * Options for ask() — [v1.4 RETRIEVAL-PROFILE].
 * The engine's historical defaults (5 sources × 1200 chars each) are tuned
 * for terse IDE answers; recall-heavy callers (benchmarks, agents synthesizing
 * across many memories) can request a richer context. Clamped server-side
 * (topK ≤ 32, maxSourceChars ≤ 6000).
 */
export interface AskOptions {
  /** Cognitive ranking scope for type-weighting (see QueryOptions.scope). */
  scope?: string;
  /** Number of chronicles handed to the answering LLM (default: 5). */
  topK?: number;
  /** Per-source truncation cap in chars (default: 1200). */
  maxSourceChars?: number;
}

// ── Cross-App Share ───────────────────────────────────────────────────────────

export interface ShareRequest {
  /** Source app whose vectors we want to read */
  fromAppId: string;
  /** Reason displayed to the user in the consent popup */
  reason: string;
  /** Consent timeout in ms (default: 60000) */
  timeoutMs?: number;
}

export interface ShareResult {
  granted: boolean;
  chronicles?: Chronicle[];
  error?: string;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface RegisterResult {
  token: string;
  expiresAt: number;
  appId: string;
}

// ── Vault Discovery ───────────────────────────────────────────────────────────

/**
 * Describes a vault (core or custom) returned by `sdk.vaults.list`.
 * Use `id` as the `vault` parameter in `ingest()` and `query()` calls.
 */
export interface VaultInfo {
  /** Unique vault identifier (uppercase, e.g. `'DEV'`, `'MY_NOTES'`). */
  id: string;
  /** Human-readable display name. */
  displayName: string;
  /** Whether this is a built-in core vault (`true`) or user-created (`false`). */
  fixed: boolean;
  /** Accent color (hex) for UI rendering. */
  color: string;
  /** Chronicle count at query time. */
  chronicleCount: number;
  /** SQLite file size in KB. */
  sizeKb: number;
  // ── Governance metadata (present when the OS could read the vault manifest) ──
  /** Vault type (DEV, PERSONAL, RESEARCH, …). */
  type?: string;
  /** Vault description. */
  description?: string;
  /** Protection level: `'NORMAL'` or `'MAXIMUM'` (private/sensitive). */
  protection?: string;
  /** Vaults this one may be mixed with: `['*']` open, `[]` isolated. */
  mixableWith?: string[];
  /** `false` = benchmark sandbox or private store, not cross-pollinatable memory. */
  visibleInNeuralMap?: boolean;
}

export interface VaultListResult {
  success: boolean;
  /** Core vaults (DEV, SOCIAL, PERSONAL, FINANCE, RESEARCH). */
  coreVaults: VaultInfo[];
  /** User-created custom vaults. */
  customVaults: VaultInfo[];
  error?: string;
}

// ── App Sandbox Vault ─────────────────────────────────────────────────────────

/**
 * Result of `sdk.vault.sandbox.ensure` — the per-app sandbox write model.
 * The vault is derived from the appId and starts fully walled off; only the
 * human can unlock permanence (mixing into their real memory).
 */
export interface SandboxVaultResult {
  success: boolean;
  /** Vault name to pass as the `vault` argument of ingest/query (e.g. `APP-MY-CRM`). */
  vault?: string;
  /** True when this call created the vault (false = it already existed). */
  created?: boolean;
  /** True when the human has already unlocked permanence for this sandbox. */
  unlocked?: boolean;
  error?: string;
}

// ── Correlate ─────────────────────────────────────────────────────────────────

/**
 * Options for a causal/semantic correlation query.
 * Finds chronicles that are causally or semantically linked to a source chronicle.
 */
export interface CorrelateOptions {
  /** ID of the source chronicle to find correlations for. */
  sourceId: string;
  /** Maximum number of correlations to return (default: 10). */
  limit?: number;
  /** Vault to search in (defaults to the app's primary vault). */
  vault?: MnemoVault;
  /** Minimum correlation strength 0-1 (default: 0.5). */
  threshold?: number;
}

export interface CorrelationEntry {
  chronicle: Chronicle;
  /** Correlation strength between 0 and 1. */
  strength: number;
  /** Nature of the link between the two chronicles. */
  type: 'causal' | 'temporal' | 'semantic';
}

export interface CorrelateResult {
  success: boolean;
  correlations: CorrelationEntry[];
  error?: string;
}

// ── Forget (GDPR) ─────────────────────────────────────────────────────────────

/**
 * Result of a `sdk.forget` call.
 * Deletes a chronicle by ID from the vault. Requires `vault:write:*` scope.
 */
export interface ForgetResult {
  success: boolean;
  /** ID of the deleted chronicle. */
  deletedId: string;
  error?: string;
}

// ── Dynamic Spine Registry ────────────────────────────────────────────────────

/**
 * Request to allocate a new dynamic spine in the OS registry.
 * Dynamic spines allow Layer 2 apps to define their own semantic categories
 * that appear in the Mnemosyne OS neural graph alongside core spine types.
 *
 * Requires scope `vault:write:CUSTOM` and the Protocole du Guichet to be active.
 */
export interface DynamicSpineRequest {
  /** Unique ID for this spine (snake_case, e.g. `'my_app_events'`). */
  id: string;
  /** Display name shown in the OS neural graph. */
  name: string;
  /** Base spine type to inherit semantic weight from. */
  type: SpineType | string;
  /** Emoji or icon key for UI rendering. */
  icon: string;
  /** Short description of what this spine captures. */
  description?: string;
}

export interface DynamicSpineResult {
  success: boolean;
  /** Full spine ID as registered (may be namespaced, e.g. `'my-app/my_events'`). */
  spineId?: string;
  error?: string;
}

export interface DynamicSpineInfo {
  id: string;
  name: string;
  type: string;
  icon: string;
  /** App ID that owns this spine. */
  ownerAppId: string;
  /** ISO timestamp of allocation. */
  allocatedAt: string;
}

// ── Resonances ────────────────────────────────────────────────────────────────

/**
 * A Resonance record returned by `sdk.resonances.list`.
 * Resonances are cognitive projects tracked in the DEV vault.
 */
export interface ResonanceRecord {
  /** Unique resonance identifier (e.g. `'agent-cockpit'`). */
  id: string;
  /** Display name of the resonance. */
  name: string;
  /** Current lifecycle status. */
  status: 'active' | 'paused' | 'done';
  spineType: 'RESONANCE';
  /** Number of chronicles tagged with this resonance. */
  spineCount: number;
  /** Number of agents currently working on this resonance. */
  agentCount: number;
  /** Milliseconds since last activity. */
  lastActivity: number;
  /** Last known position string (set via `updatePosition`). */
  lastPosition?: string;
}

/**
 * Result of `sdk.resonance.updatePosition`.
 */
export interface PositionUpdateResult {
  /** Whether the position was persisted. */
  ok: boolean;
  resonanceId: string;
  phase: string;
  /** Unix timestamp (ms) of the update. */
  ts: number;
}

// ── Git & Agents (used by the Cockpit and Layer 2 apps) ─────────────────────

/**
 * A git commit returned by MNEMOSYNE_METHODS.GIT_LOG.
 * The repo path is hardcoded server-side (Zero-Trust).
 */
export interface GitCommit {
  hash: string;
  fullHash?: string;
  author: string;
  message: string;
  /** Conventional commit type (feat/fix/chore/…) */
  type: string;
  ts: number;
  repo: string;
}

/** Options for MnemoClient.gitLog(). */
export interface GitLogOptions {
  /** Number of commits to return (default: 20, server cap: 50). */
  limit?: number;
  /** Time range filter (e.g. "7 days ago", "2024-01-01"). */
  since?: string;
  /** Filter commits by message pattern (e.g. "[RESONANCE:agent-cockpit]"). */
  filter?: string;
}

/** Result of MnemoClient.gitLog(). */
export interface GitLogResult {
  success: boolean;
  commits: GitCommit[];
  error?: string;
}

/**
 * An SDK agent returned by MNEMOSYNE_METHODS.LIST_AGENTS.
 */
export interface AgentInfo {
  id: string;
  name: string;
  provider: string;
  status: 'active' | 'idle' | 'offline';
  resonanceId?: string;
  sessionMs?: number;
}

// ── NFT Licence ───────────────────────────────────────────────────────────────

/**
 * Parameters to validate an NFT licence.
 * Validation is done on-chain via the Mnemosyne OS runtime (not directly in the SDK).
 */
export interface NFTLicenseParams {
  /** Wallet address to verify */
  walletAddress: string;
  /** Target chain ID — see MNEMOSYNE_CHAINS in constants.ts */
  chainId?: number;
}

/** Result of an NFT licence validation */
export interface NFTValidation {
  /** true if the wallet holds the licence NFT for this app */
  valid: boolean;
  walletAddress: string;
  appId: string;
  /** Unix ms timestamp of the verification */
  checkedAt: number;
  /** Unix ms timestamp of the OS cache expiry (5 min) */
  cacheExpiresAt?: number;
}

// ── NeuralGraph ───────────────────────────────────────────────────────────────

/** A node in the NeuralGraph */
export interface GraphNode {
  id: string;
  label: string;
  spineType: SpineType;
  weight: number;
  timestamp: string;
}

/** An edge in the NeuralGraph */
export interface GraphEdge {
  source: string;
  target: string;
  strength: number;
  type: 'causal' | 'temporal' | 'semantic';
}

/** Result of a query on the NeuralGraph */
export interface GraphQueryResult {
  success: boolean;
  nodes: GraphNode[];
  edges: GraphEdge[];
  centerNodeId?: string;
  error?: string;
}

// ── Events ────────────────────────────────────────────────────────────────────

export type MnemoEventType =
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'tamper-alert'
  | 'share-request'
  /** Fired when a connected NFT licence is transferred mid-session. */
  | 'nft-revoked'
  /** Fired by the OS when another app ingests a new chronicle. */
  | 'chronicle:new'
  /** Fired when a Layer 2 dynamic spine is allocated or released. */
  | 'spine:change'
  /**
   * [PHASE-58] Fired after each Semantic Reflect scan persists new bridges.
   * payload: { sessionId, newCount, knownCount, totalFound }
   */
  | 'bridge:new';

// ── Phase 58 — Perpetual Memory Bridges ──────────────────────────────────────

/**
 * A semantic bridge between two chronicles in different vaults.
 * Returned by getBridgeHistory().
 * [PHASE-58][PLATFORM][READ-ONLY]
 */
export interface BridgeRecord {
  id: number;
  scanned_at: string;
  from_id: number;
  from_vault: string;
  from_spine: string;
  from_label: string;
  to_id: number;
  to_vault: string;
  to_spine: string;
  to_label: string;
  /** Cosine similarity score (0-1). High values = strong cognitive link. */
  cosine: number;
  /** UUID of the scan session that discovered this bridge. */
  session_id: string | null;
  /** 1 if this bridge was never seen before this scan, 0 if already known. */
  is_new: 0 | 1;
  /** JSON array of tags (reserved for future use). */
  tags: string;
}

/**
 * A bridge scan session — groups all bridges found in one Semantic Reflect run.
 */
export interface BridgeScanSession {
  /** UUID — unique session identifier. */
  id: string;
  scanned_at: string;
  threshold: number;
  total_found: number;
  new_count: number;
  llm_synthesis: string | null;
  duration_ms: number | null;
}

/** Options for getBridgeHistory(). */
export interface BridgeHistoryOptions {
  /** Maximum bridges to return (default: 500). */
  limit?: number;
  /** ISO timestamp — only return bridges after this date. */
  since?: string;
  /** Minimum cosine similarity (0-1, default: 0.0). */
  minCosine?: number;
  /** Filter by source vault (default: 'ALL'). */
  vaultFilter?: 'DEV' | 'SOCIAL' | 'PERSONAL' | 'ALL';
  /** Only return bridges that were new when first discovered. */
  onlyNew?: boolean;
}

/** Result of getBridgeHistory(). */
export interface BridgeHistoryResult {
  success: boolean;
  bridges: BridgeRecord[];
  error?: string;
}

/**
 * Result of computeResonance() — resonance score for a text before publication.
 * [PLATFORM] Use this to gate social posts on cognitive relevance.
 */
export interface ResonanceScore {
  success: boolean;
  /** Aggregated cosine score (0-1). */
  score: number;
  /** Qualitative band: LOW (<0.60), MEDIUM (0.60-0.80), HIGH_RESONANCE (>0.80). */
  level: 'LOW' | 'MEDIUM' | 'HIGH_RESONANCE';
  /** Top K matching bridges. */
  topMatches: Array<{
    bridgeId: number;
    fromLabel: string;
    toLabel: string;
    cosine: number;
    vault: string;
  }>;
}

export interface MnemoEvent<T = unknown> {
  type: MnemoEventType;
  data: T;
  timestamp: number;
}

// ── v1.4.0 — Read-only Introspection (Dream State + Spine assignments) ───────

/** One endpoint (chronicle) of a dream bridge. */
export interface DreamBridgeEndpoint {
  chronicleId: number;
  spineType: string;
  /** Vault name as recorded by the dream engine (core vault name, e.g. 'dev'). */
  vault: string;
  /** Short excerpt of the chronicle content (~240 chars), when resolvable. */
  excerpt?: string;
}

/**
 * A connection discovered by the nocturnal Dream State engine between two
 * chronicles. `dbs` is the composite Dream Bridge Score (prime-aware,
 * orthogonal to raw cosine) — higher = stronger dreamed connection.
 * [DREAM-STATE][READ-ONLY]
 */
export interface DreamBridge {
  id: number;
  /** Dream scan session that produced this bridge. */
  sessionId: string | null;
  scannedAt: string;
  /** Composite Dream Bridge Score. */
  dbs: number;
  /** Raw cosine similarity between the two chronicles. */
  cosine: number;
  from: DreamBridgeEndpoint;
  to: DreamBridgeEndpoint;
}

/** Options for dreamBridges(). */
export interface DreamBridgesOptions {
  /** Max bridges to return (default: 50, server cap: 200). */
  limit?: number;
  /** Minimum Dream Bridge Score (default: 0). */
  minDbs?: number;
  /** Restrict to a single dream scan session. */
  sessionId?: string;
  /** Only return bridges touching this chronicle id. */
  chronicleId?: number;
}

/** Result of dreamBridges(). */
export interface DreamBridgesResult {
  success: boolean;
  bridges: DreamBridge[];
  error?: string;
}

/** One chronicle → spine assignment. */
export interface SpineAssignment {
  chronicleId: number;
  /** Spine taxon id the chronicle is currently assigned to. */
  spineType: string;
  createdAt: string;
  /** Short excerpt of the chronicle content (~240 chars), when resolvable. */
  excerpt?: string;
}

/** Per-spine chronicle count for the queried vault. */
export interface SpineCount {
  spineType: string;
  count: number;
}

/** A node of the global spine taxonomy tree (nature → sub-spines). */
export interface SpineTaxonNode {
  id: string;
  label: string;
  kind: 'nature' | 'subspine';
  pack: string;
  color?: string;
  icon?: string;
  origin: 'system' | 'user' | 'llm';
  children?: SpineTaxonNode[];
}

/** Options for spineAssignments(). */
export interface SpineAssignmentsOptions {
  /** Vault to inspect (default: first vault declared in the manifest). */
  vault?: MnemoVault;
  /** Restrict to one spine taxon id (e.g. 'DOCUMENT'). */
  spineType?: string;
  /** Max assignments returned (default: 100, server cap: 500). */
  limit?: number;
  /** Pagination offset (default: 0). */
  offset?: number;
  /** Also return the global spine taxonomy tree. */
  includeTaxonomy?: boolean;
}

/** Result of spineAssignments(). */
export interface SpineAssignmentsResult {
  success: boolean;
  /** Vault the assignments were read from (as resolved server-side). */
  vault: string;
  /** Newest-first page of chronicle → spine assignments. */
  assignments: SpineAssignment[];
  /** Per-spine counts across the WHOLE vault (not just this page). */
  counts: SpineCount[];
  /** Total chronicles matching the filter (for pagination). */
  total: number;
  /**
   * Whole-vault count of chronicles with NO embedding vector yet — these are
   * invisible to semantic retrieval. Poll until 0 before benchmarking/querying
   * freshly ingested data ("memory ready" gate).
   */
  unvectorized?: number;
  /** Global taxonomy tree — present only when `includeTaxonomy: true`. */
  taxonomy?: SpineTaxonNode[];
  error?: string;
}
