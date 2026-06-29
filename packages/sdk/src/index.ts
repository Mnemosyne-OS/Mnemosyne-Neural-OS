/**
 * @mnemosyne_os/sdk v1.2.1 — Entry Point (version of record: package.json)
 *
 * SDK officiel pour construire des apps Layer 2 sur Mnemosyne OS.
 * [PHASE-58] v2.0 adds: getBridgeHistory(), computeResonance(), bridge:read scope.
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
 * À utiliser dans les apps Node.js ou Electron main process.
 */
export { MnemoClient } from './client.js';

/**
 * Client browser-native (WebSocket API standard).
 * À utiliser dans les apps React, Vite, Next.js, Electron renderer.
 * N'utilise PAS le package `ws` — 0 dépendance Node.
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
   * [MN-004] Détermine si l'OS doit afficher le popup Zero-Trust avant de lancer l'app.
   * Basé sur les scopes — imperméable à tout flag que l'app contrôle.
   */
  requiresOsGrant,
  GRANT_REQUIRED_SCOPE_PREFIXES,
} from './manifest.js';

// ── Auth JWT ──────────────────────────────────────────────────────────────────
// Utile côté serveur pour vérifier les tokens émis par le SDK WS Server.

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

  // [PHASE-58] Perpetual Memory Bridges (v2.0.0)
  BridgeRecord,
  BridgeScanSession,
  BridgeHistoryOptions,
  BridgeHistoryResult,
  ResonanceScore,

  // Events
  MnemoEvent,
  MnemoEventType,
} from './types.js';
