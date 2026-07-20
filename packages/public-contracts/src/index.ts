/**
 * @mnemosyne_os/public-contracts — index.ts
 *
 * Main entry point for the package.
 * Re-exports every public type and schema of Mnemosyne OS.
 *
 * Usage:
 *   import { SpineType, Chronicle, IngestRequestSchema } from '@mnemosyne_os/public-contracts';
 *   import { parseIngestRequest } from '@mnemosyne_os/public-contracts/schemas';
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

// ── Enums (runtime values required) ───────────────────────────────────────────
export { SpineType, VaultType } from './types.js';

// ── Zod Schemas & Helpers ─────────────────────────────────────────────────────
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

// ── Inferred Types from Zod ───────────────────────────────────────────────────
export type {
  IngestRequestInput,
  QueryRequestInput,
  ChronicleOutput,
  QueryResultOutput,
  IngestResponse,
  QueryResponse,
} from './schemas.js';
