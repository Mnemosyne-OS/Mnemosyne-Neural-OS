/**
 * @mnemosyne-workspace/public-contracts — index.ts
 *
 * Point d'entrée principal du package.
 * Exporte TOUS les types et schémas publics de Mnemosyne OS.
 *
 * Import usage :
 *   import { SpineType, Chronicle, IngestRequestSchema } from '@mnemosyne-workspace/public-contracts';
 *   import { parseIngestRequest } from '@mnemosyne-workspace/public-contracts/schemas';
 */

// ── Types & Interfaces ────────────────────────────────────────────────────────
export type {
  Chronicle,
  QueryResult,
  IngestRequest,
  QueryRequest,
  SealedCoreManifest,
  GatewayResponse,
  GatewayErrorCode,
} from './types.js';

// ── Enums (valeurs runtime nécessaires) ───────────────────────────────────────
export { SpineType, VaultType } from './types.js';

// ── Schémas Zod & Helpers ────────────────────────────────────────────────────
export {
  // Enum schemas
  SpineTypeSchema,
  VaultTypeSchema,
  // Request schemas
  IngestRequestSchema,
  QueryRequestSchema,
  // Response schemas
  ChronicleSchema,
  QueryResultSchema,
  GatewayResponseSchema,
  IngestResponseSchema,
  QueryResponseSchema,
  // Parse helpers
  parseIngestRequest,
  parseQueryRequest,
  safeParseIngestRequest,
  safeParseQueryRequest,
} from './schemas.js';

// ── Inferred Types from Zod ──────────────────────────────────────────────────
export type {
  IngestRequestInput,
  QueryRequestInput,
  ChronicleOutput,
  QueryResultOutput,
  IngestResponse,
  QueryResponse,
} from './schemas.js';
