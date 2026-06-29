/**
 * @mnemosyne-workspace/eval-sdk — index.ts
 *
 * Point d'entrée du SDK d'évaluation Mnemosyne OS.
 * Exporte le client et tous les types nécessaires à l'intégration.
 */

// ── Client ────────────────────────────────────────────────────────────────────
export { MnemosyneClient, MnemosyneGatewayError } from './MnemosyneClient.js';
export type { MnemosyneClientConfig } from './MnemosyneClient.js';

// ── Re-export des types publics (pour éviter l'import double côté intégrateur) ─
export {
  SpineType,
  VaultType,
  parseIngestRequest,
  parseQueryRequest,
} from '@mnemosyne_os/public-contracts';

export type {
  Chronicle,
  QueryResult,
  IngestRequest,
  QueryRequest,
  GatewayResponse,
  GatewayErrorCode,
} from '@mnemosyne_os/public-contracts';
