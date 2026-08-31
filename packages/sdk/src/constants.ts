/**
 * @mnemosyne_os/sdk — Public Constants
 *
 * Exposes the RPC methods available on the SDK server (ws://localhost:7799)
 * and the constants of the Mnemosyne OS ecosystem.
 *
 * [SDK][LAYER-2][ZERO-TRUST]
 */

// ── RPC Methods ────────────────────────────────────────────────────────────────

/**
 * JSON-RPC methods exposed by the Mnemosyne OS SDK WebSocket Server.
 * The server listens on ws://127.0.0.1:7799 (localhost only).
 *
 * @example
 * ```typescript
 * import { MNEMOSYNE_METHODS } from '@mnemosyne_os/sdk';
 * // Direct usage (without MnemoClient):
 * ws.send(JSON.stringify({ id: '1', method: MNEMOSYNE_METHODS.REGISTER, params: { manifest } }));
 * ```
 */
export const MNEMOSYNE_METHODS = {
  // ── Auth ───────────────────────────────────────────────────────────────
  /** Registers the app, validates the manifest, returns a 24h JWT */
  REGISTER: 'sdk.register',

  // ── Vault ───────────────────────────────────────────────────────────────
  /** Ingests content into the vault (vectorization included) */
  INGEST: 'sdk.ingest',
  /** Semantic query — results filtered by source_app_id */
  QUERY: 'sdk.query',
  /** Ask Mnemosyne a question — synthesized RAG+LLM prose answer + its sources */
  ASK: 'sdk.ask',
  /** Finds the causal connections between two contents */
  CORRELATE: 'sdk.correlate',
  /** Deletes a chronicle by ID (vault:write scope required) */
  FORGET: 'sdk.forget',

  // ── Resonances ───────────────────────────────────────────────────────────
  /**
   * Lists the active Resonances (cognitive projects) from the DEV vault.
   * Requires the `vault:read:DEV` scope.
   */
  RESONANCES_LIST: 'sdk.resonances.list',
  /**
   * Updates the current position of a Resonance (phase, description).
   * Persisted as a DECISION chronicle in the DEV vault.
   * Requires the `vault:write:DEV` scope.
   */
  UPDATE_POSITION: 'sdk.resonance.updatePosition',

  // ── Monorepo ───────────────────────────────────────────────────────────
  /**
   * Reads the git log of the Mnemosyne OS monorepo.
   * Requires the `monorepo:read` scope in the manifest.
   * Returns the filtered commits (hash, message, author, date).
   * [SECURITY] Path hardcoded server-side — the client does not control the repo.
   */
  GIT_LOG: 'sdk.git.log',
  /**
   * Reads a .md file from the Mnemosyne OS repo (docs/, packages/).
   * Requires the `monorepo:read` scope.
   * [SECURITY] Only .md files are readable, path sanitized server-side.
   */
  READ_FILE: 'sdk.readFile',

  // ── Agents ───────────────────────────────────────────────────────────────
  /**
   * Lists the active agents connected to the SDK WebSocket Server.
   * Requires the `agents:read` scope in the manifest.
   */
  LIST_AGENTS: 'sdk.agents.list',

  // ── Cross-App ──────────────────────────────────────────────────────────
  /** Requests access to another app's chronicles (consent popup) */
  SHARE: 'sdk.share',

  // ── NFT Licence ─────────────────────────────────────────────────────────
  /**
   * Verifies that a wallet holds the licence NFT for this app.
   * Requires the `nft:validate` scope in the manifest.
   * 5 min cache TTL on the OS side to avoid spamming the blockchain.
   */
  NFT_VALIDATE: 'sdk.nft.validate',

  // ── NeuralGraph ─────────────────────────────────────────────────────────
  /**
   * Queries the NeuralGraph — returns nodes and edges near the given text.
   * Requires scope `neural:graph:read`.
   */
  GRAPH_QUERY: 'sdk.graph.query',

  // ── Vault Discovery ─────────────────────────────────────────────────────
  /**
   * Lists all available vaults (core built-ins + user-created custom vaults).
   * Requires intent `LIST_VAULTS`.
   * Returns `VaultListResult` with `coreVaults` and `customVaults` arrays.
   * Use the `id` field of each vault as the `vault` param in ingest/query.
   */
  LIST_VAULTS: 'sdk.vaults.list',

  // ── App Sandbox Vault ────────────────────────────────────────────────────
  /**
   * Idempotently ensures the calling app's OWN sandbox vault exists — an
   * isolated vault derived from the appId (`APP-<slug>`), walled off by
   * default (no mixing, hidden from the neural map and the dream layer).
   * The app writes freely there; only the HUMAN can unlock permanence, from
   * the Vault Manager. Returns `SandboxVaultResult`.
   */
  SANDBOX_ENSURE: 'sdk.vault.sandbox.ensure',

  // ── Correlate ─────────────────────────────────────────────────────────
  // (CORRELATE and FORGET are already declared in the Vault section above)

  // ── Forget (GDPR) ────────────────────────────────────────────────────────
  // (See FORGET above)

  // ── Dynamic Spine Registry ────────────────────────────────────────────────
  /**
   * Allocates a new dynamic spine in the OS neural registry (Protocole du Guichet).
   * Requires scope `vault:write:CUSTOM`.
   * The allocated spine appears in the Mnemosyne OS neural graph.
   */
  REGISTER_SPINE: 'sdk.spine.register',

  /**
   * Releases a previously allocated dynamic spine.
   * Only the owning app can release its own spines.
   * Requires scope `vault:write:CUSTOM`.
   */
  RELEASE_SPINE: 'sdk.spine.release',

  /**
   * Lists all currently allocated dynamic spines across all registered apps.
   * Returns an array of `DynamicSpineInfo` objects.
   */
  LIST_SPINES: 'sdk.spine.list',

  // ── Read-only Introspection (v1.4.0) ─────────────────────────────────────
  /**
   * Lists the connections the nocturnal Dream State engine discovered between
   * chronicles (dream bridges) — DBS + cosine scores plus both linked
   * chronicles. "What did you dream about last night?"
   * Requires scope `bridge:read` and intent `BRIDGE_READ`.
   */
  DREAM_BRIDGES: 'sdk.dream.bridges',

  /**
   * Lists chronicle → spine assignments for a vault ("how did you classify
   * this memory?"), with per-spine counts and an optional taxonomy tree.
   * Requires scope `vault:read:<vault>` and intent `QUERY`.
   */
  SPINE_ASSIGNMENTS: 'sdk.spine.assignments',

  // ── Voice rendering (v1.6.0) ─────────────────────────────────────────────
  /**
   * Lists the local TTS engines (installed or not) and the reference voices
   * available for cloning. Call it before speaking: it is the only source of
   * valid clone names, and an invented one is refused, never substituted.
   * Requires scope `voice:speak` and intent `VOICE_SPEAK`.
   */
  VOICE_ENGINES: 'sdk.voice.engines',

  /**
   * Starts rendering a script to a WAV file. Returns a JOB, never audio —
   * synthesis runs at roughly real time, so a five-minute script is minutes of
   * work, well past any RPC timeout. Poll with `sdk.voice.status`.
   * Requires scope `voice:speak` and intent `VOICE_SPEAK`.
   */
  VOICE_SPEAK: 'sdk.voice.speak',

  /** State of one render, or every render of the session when no id is given. */
  VOICE_STATUS: 'sdk.voice.status',

  /** Stops a render at its next segment boundary. No file is written. */
  VOICE_CANCEL: 'sdk.voice.cancel',
} as const;

export type MnemoMethod = typeof MNEMOSYNE_METHODS[keyof typeof MNEMOSYNE_METHODS];

// ── Runtime constants ──────────────────────────────────────────────────────────

/** Default port of the SDK WebSocket Server */
export const MNEMOSYNE_WS_PORT = 7799;

/** Host of the SDK WebSocket Server (localhost only — Zero-Trust security) */
export const MNEMOSYNE_WS_HOST = '127.0.0.1';

/** Validity duration of an SDK JWT (in seconds) */
export const MNEMOSYNE_TOKEN_TTL_S = 24 * 60 * 60; // 24h

/** Duration of the NFT validation cache on the OS side (in ms) */
export const MNEMOSYNE_NFT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

// ── Supported chains for NFT licences ─────────────────────────────────────────

export const MNEMOSYNE_CHAINS = {
  BASE:    { id: 8453,  name: 'Base',    rpc: 'https://mainnet.base.org' },
  POLYGON: { id: 137,   name: 'Polygon', rpc: 'https://polygon-rpc.com' },
  BASE_SEPOLIA: { id: 84532, name: 'Base Sepolia (testnet)', rpc: 'https://sepolia.base.org' },
} as const;

export type MnemoChain = keyof typeof MNEMOSYNE_CHAINS;
