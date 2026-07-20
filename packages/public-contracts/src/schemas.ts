/**
 * @mnemosyne_os/public-contracts — schemas.ts
 *
 * ZOD SCHEMAS — RUNTIME VALIDATION
 * ================================
 * Unlike TypeScript types (compile-time only), Zod schemas validate data
 * crossing the Gateway at RUNTIME.
 *
 * Typical usage:
 *   import { IngestRequestSchema } from '@mnemosyne_os/public-contracts/schemas';
 *   const validated = IngestRequestSchema.parse(rawBody); // throws ZodError if invalid
 *
 * @version 0.2.1
 * @phase 65 — Protected Architecture / Trust Boundary
 */

import { z } from 'zod';
import { SpineType, VaultType } from './types.js';

// ─── ZOD ENUMS ───────────────────────────────────────────────────────────────

/**
 * Zod schema for SpineType.
 * Validates spines received via the API before any Core execution.
 */
export const SpineTypeSchema = z.nativeEnum(SpineType);

/**
 * Zod schema for VaultType.
 */
export const VaultTypeSchema = z.nativeEnum(VaultType);

// ─── REQUEST SCHEMAS ─────────────────────────────────────────────────────────

/**
 * Zod schema for IngestRequest.
 * Validates the ingestion payload at the Trust Boundary (Gateway).
 */
export const IngestRequestSchema = z.object({
  content: z
    .string()
    .min(1, 'Content cannot be empty.')
    .max(100_000, 'Content exceeds the 100,000-character limit.'),

  vault: VaultTypeSchema,

  requestedSpines: z
    .array(SpineTypeSchema)
    .min(0)
    .max(Object.keys(SpineType).length)
    .optional(),

  metadata: z
    .record(z.string(), z.unknown())
    .optional(),
});

export type IngestRequestInput = z.infer<typeof IngestRequestSchema>;

/**
 * Zod schema for QueryRequest.
 * Validates intent-aware queries before forwarding them to the cognitive Core.
 */
export const QueryRequestSchema = z.object({
  intent: z
    .string()
    .min(1, 'Intent cannot be empty.')
    .max(2000, 'Intent exceeds the 2000-character limit.'),

  targetVaults: z
    .array(VaultTypeSchema)
    .min(1, 'At least one vault must be targeted.')
    .optional(),

  boostSpines: z
    .array(SpineTypeSchema)
    .optional(),

  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(10),
});

export type QueryRequestInput = z.infer<typeof QueryRequestSchema>;

// ─── RESPONSE SCHEMAS ────────────────────────────────────────────────────────

/**
 * Zod schema for Chronicle (Core response).
 */
export const ChronicleSchema = z.object({
  id:        z.string().uuid(),
  vaultId:   VaultTypeSchema,
  content:   z.string(),
  spines:    z.array(SpineTypeSchema).min(1, 'A Chronicle must have at least one Spine.'),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive().optional(),
  metadata:  z.record(z.string(), z.unknown()).optional(),
});

export type ChronicleOutput = z.infer<typeof ChronicleSchema>;

/**
 * Zod schema for QueryResult.
 */
export const QueryResultSchema = z.object({
  chronicles:       z.array(ChronicleSchema),
  synthesizedAnswer: z.string(),
  resonanceScore:   z.number().min(0).max(1),
  vaultsQueried:    z.array(VaultTypeSchema).optional(),
  spinesActivated:  z.array(SpineTypeSchema).optional(),
});

export type QueryResultOutput = z.infer<typeof QueryResultSchema>;

/**
 * Generic Zod schema for GatewayResponse<T>.
 * Used to validate responses on the client SDK side.
 */
export const GatewayResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    ok:    z.boolean(),
    data:  dataSchema.optional(),
    error: z.string().optional(),
    code:  z.string().optional(),
    ts:    z.number().int().positive(),
  });

// ─── CONCRETE GATEWAY SCHEMAS ────────────────────────────────────────────────

/** Gateway response for an ingestion operation. */
export const IngestResponseSchema = GatewayResponseSchema(ChronicleSchema);
export type IngestResponse = z.infer<typeof IngestResponseSchema>;

/** Gateway response for a memory query. */
export const QueryResponseSchema = GatewayResponseSchema(QueryResultSchema);
export type QueryResponse = z.infer<typeof QueryResponseSchema>;

// ─── VALIDATION HELPERS ──────────────────────────────────────────────────────

/**
 * Parse and validate an incoming IngestRequest.
 * Throws a ZodError with details if invalid.
 *
 * @example
 * const validated = parseIngestRequest(req.body); // throws ZodError if invalid
 */
export function parseIngestRequest(raw: unknown): IngestRequestInput {
  return IngestRequestSchema.parse(raw);
}

/**
 * Parse and validate an incoming QueryRequest.
 */
export function parseQueryRequest(raw: unknown): QueryRequestInput {
  return QueryRequestSchema.parse(raw);
}

/**
 * Validate without throwing (safe parse) — returns success/error.
 */
export function safeParseIngestRequest(raw: unknown) {
  return IngestRequestSchema.safeParse(raw);
}

export function safeParseQueryRequest(raw: unknown) {
  return QueryRequestSchema.safeParse(raw);
}
