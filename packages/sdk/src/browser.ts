/**
 * @mnemosyne_os/sdk/browser — Browser-safe entry point (v1.4.0)
 *
 * The root entry bundles the Node client (ws, node:fs, node:path, node:crypto),
 * which breaks browser bundlers: rollup/vite fail on `"resolve" is not exported
 * by __vite-browser-external`. Browser and Electron-renderer apps (Layer 2
 * cartridges, Vite/Next front-ends) must import THIS subpath instead:
 *
 * ```typescript
 * import { MnemoClientBrowser } from '@mnemosyne_os/sdk/browser';
 * ```
 *
 * It re-exports only what runs on the native WebSocket API — the browser
 * client, runtime constants, and the (erased-at-build) public types. The JWT
 * helpers and manifest loader stay Node-only in the root entry.
 */

export { MnemoClientBrowser } from './browser-client.js';

export {
  MNEMOSYNE_METHODS,
  MNEMOSYNE_WS_PORT,
  MNEMOSYNE_WS_HOST,
  MNEMOSYNE_TOKEN_TTL_S,
  MNEMOSYNE_NFT_CACHE_TTL_MS,
  MNEMOSYNE_CHAINS,
} from './constants.js';
export type { MnemoMethod, MnemoChain } from './constants.js';

export type {
  AppManifest,
  MnemoScope,
  MnemoIntent,
  MnemoVault,
  SpineType,
  IngestPayload,
  IngestResult,
  QueryOptions,
  QueryResult,
  QuerySemanticDebug,
  AskResult,
  AskOptions,
  Chronicle,
  ShareRequest,
  ShareResult,
  RegisterResult,
  VaultInfo,
  VaultListResult,
  GitCommit,
  GitLogOptions,
  GitLogResult,
  AgentInfo,
  NFTLicenseParams,
  NFTValidation,
  GraphNode,
  GraphEdge,
  GraphQueryResult,
  ResonanceRecord,
  PositionUpdateResult,
  CorrelateOptions,
  CorrelationEntry,
  CorrelateResult,
  ForgetResult,
  DynamicSpineRequest,
  DynamicSpineResult,
  DynamicSpineInfo,
  BridgeRecord,
  BridgeScanSession,
  BridgeHistoryOptions,
  BridgeHistoryResult,
  ResonanceScore,
  DreamBridgeEndpoint,
  DreamBridge,
  DreamBridgesOptions,
  DreamBridgesResult,
  SpineAssignment,
  SpineCount,
  SpineTaxonNode,
  SpineAssignmentsOptions,
  SpineAssignmentsResult,
  MnemoEvent,
  MnemoEventType,
} from './types.js';
