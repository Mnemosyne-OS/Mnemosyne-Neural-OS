/**
 * @mnemosyne_os/sdk — Entry Point (version of record: package.json)
 *
 * Official SDK for building Layer 2 apps on Mnemosyne OS.
 * Bridge API (Phase 58-59, shipped in 1.2.1): getBridgeHistory(), computeResonance(), bridge:read scope.
 * Read-only introspection (v1.4.0): dreamBridges() (Dream State connections),
 * spineAssignments() (chronicle → spine classification + taxonomy).
 *
 * ## Quick Start (browser / Electron renderer)
 * ```typescript
 * import { MnemoClientBrowser } from '@mnemosyne_os/sdk';
 *
 * const client = await MnemoClientBrowser.connect();
 * await client.register({
 *   id: 'my-app', name: 'My App', version: '1.0.0',
 *   mnemosyne_sdk: '^1.1.0',
 *   scopes: ['vault:read:DEV', 'vault:write:DEV'],
 *   vaults: ['DEV'],
 *   intents: ['INGEST', 'QUERY'],
 * });
 * const chronicles = await client.query('my search', 'DEV', 10);
 * ```
 *
 * ## Quick Start (Node.js external app)
 * ```typescript
 * import { MnemoClient } from '@mnemosyne_os/sdk';
 *
 * const client = await MnemoClient.connect({
 *   appId: 'my-app',
 *   manifest: './app.manifest.json',
 * });
 * await client.ingest({ content: '...', spineType: 'NOTE', vault: 'DEV' });
 * ```
 */

// ── Clients ───────────────────────────────────────────────────────────────────

/**
 * Client Node.js (dual transport: WS + IPC Electron).
 * Use in Node.js apps or the Electron main process.
 */
export { MnemoClient } from './client.js';

/**
 * Client browser-native (WebSocket API standard).
 * Use in React, Vite, Next.js, or Electron renderer apps.
 * Does NOT use the `ws` package — 0 Node dependencies.
 */
export { MnemoClientBrowser } from './browser-client.js';

// ── Manifest utils ────────────────────────────────────────────────────────────

export {
  loadManifest,
  parseManifest,
  assertScope,
  assertVault,
  AppManifestSchema,
  /**
   * [MN-004] Determines whether the OS must show the Zero-Trust popup before launching the app.
   * Based on the scopes — impervious to any flag the app controls.
   */
  requiresOsGrant,
  GRANT_REQUIRED_SCOPE_PREFIXES,
} from './manifest.js';

// ── Auth JWT ──────────────────────────────────────────────────────────────────
// Useful server-side to verify tokens issued by the SDK WS Server.

export { verifyToken, generateAppToken, generateSecret } from './jwt.js';
export type { JwtPayload, JwtVerifyResult } from './jwt.js';

// ── Constants ─────────────────────────────────────────────────────────────────

export {
  MNEMOSYNE_METHODS,
  MNEMOSYNE_WS_PORT,
  MNEMOSYNE_WS_HOST,
  MNEMOSYNE_TOKEN_TTL_S,
  MNEMOSYNE_NFT_CACHE_TTL_MS,
  MNEMOSYNE_CHAINS,
} from './constants.js';
export type { MnemoMethod, MnemoChain } from './constants.js';

// ── Public Types ──────────────────────────────────────────────────────────────

export type {
  // Manifest
  AppManifest,
  MnemoScope,
  MnemoIntent,
  MnemoVault,
  SpineType,

  // Client config
  MnemoClientOptions,

  // Vault operations
  IngestPayload,
  IngestResult,
  QueryOptions,
  QueryResult,
  QuerySemanticDebug,
  AskResult,
  AskOptions,
  Chronicle,

  // Cross-app
  ShareRequest,
  ShareResult,

  // Auth
  RegisterResult,

  // Vault Discovery (v1.2.0)
  VaultInfo,
  VaultListResult,

  // Git & Agents (Layer 2 apps)
  GitCommit,
  GitLogOptions,
  GitLogResult,
  AgentInfo,

  // NFT Licence (MnemoStore)
  NFTLicenseParams,
  NFTValidation,

  // NeuralGraph
  GraphNode,
  GraphEdge,
  GraphQueryResult,

  // Resonances (v1.2.0 typed)
  ResonanceRecord,
  PositionUpdateResult,

  // Correlate (v1.2.0)
  CorrelateOptions,
  CorrelationEntry,
  CorrelateResult,

  // Forget/GDPR (v1.2.0)
  ForgetResult,

  // Dynamic Spine Registry (v1.2.0)
  DynamicSpineRequest,
  DynamicSpineResult,
  DynamicSpineInfo,

  // [PHASE-58] Perpetual Memory Bridges (shipped in 1.2.1)
  BridgeRecord,
  BridgeScanSession,
  BridgeHistoryOptions,
  BridgeHistoryResult,
  ResonanceScore,

  // Read-only Introspection (v1.4.0) — Dream State + Spine assignments
  DreamBridgeEndpoint,
  DreamBridge,
  DreamBridgesOptions,
  DreamBridgesResult,
  SpineAssignment,
  SpineCount,
  SpineTaxonNode,
  SpineAssignmentsOptions,
  SpineAssignmentsResult,

  // Events
  MnemoEvent,
  MnemoEventType,
} from './types.js';
