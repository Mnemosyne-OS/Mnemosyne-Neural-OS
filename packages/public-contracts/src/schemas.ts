/**
 * @mnemosyne-workspace/public-contracts — schemas.ts
 *
 * SCHÉMAS ZOD — VALIDATION RUNTIME
 * =================================
 * Contrairement aux types TypeScript (compile-time only), les schémas Zod
 * permettent la validation RUNTIME des données traversant la Gateway.
 *
 * Usage typique :
 *   import { IngestRequestSchema } from '@mnemosyne-workspace/public-contracts/schemas';
 *   const validated = IngestRequestSchema.parse(rawBody); // lève ZodError si invalide
 *
 * @version 0.2.0
 * @phase 65 — Protected Architecture / Trust Boundary
 */

import { z } from 'zod';
import { SpineType, VaultType } from './types.js';

// ─── ENUMS ZOD ───────────────────────────────────────────────────────────────

/**
 * Schéma Zod pour SpineType.
 * Utilisé pour valider les spines reçues via API avant toute exécution Core.
 */
export const SpineTypeSchema = z.nativeEnum(SpineType);

/**
 * Schéma Zod pour VaultType.
 */
export const VaultTypeSchema = z.nativeEnum(VaultType);

// ─── SCHÉMAS DE REQUÊTE ───────────────────────────────────────────────────────

/**
 * Schéma Zod pour IngestRequest.
 * Valide le payload d'ingestion à la frontière Trust Boundary (Gateway).
 */
export const IngestRequestSchema = z.object({
  content: z
    .string()
    .min(1, 'Le contenu ne peut pas être vide.')
    .max(100_000, 'Le contenu dépasse la limite de 100 000 caractères.'),

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
 * Schéma Zod pour QueryRequest.
 * Valide les requêtes Intent-Aware avant de les transmettre au Core cognitif.
 */
export const QueryRequestSchema = z.object({
  intent: z
    .string()
    .min(1, 'L\'intention ne peut pas être vide.')
    .max(2000, 'L\'intention dépasse la limite de 2000 caractères.'),

  targetVaults: z
    .array(VaultTypeSchema)
    .min(1, 'Au moins un vault doit être ciblé.')
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

// ─── SCHÉMAS DE RÉPONSE ───────────────────────────────────────────────────────

/**
 * Schéma Zod pour Chronicle (réponse du Core).
 */
export const ChronicleSchema = z.object({
  id:        z.string().uuid(),
  vaultId:   VaultTypeSchema,
  content:   z.string(),
  spines:    z.array(SpineTypeSchema).min(1, 'Une Chronicle doit avoir au moins une Spine.'),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive().optional(),
  metadata:  z.record(z.string(), z.unknown()).optional(),
});

export type ChronicleOutput = z.infer<typeof ChronicleSchema>;

/**
 * Schéma Zod pour QueryResult.
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
 * Schéma Zod pour GatewayResponse<T> générique.
 * Utilisé pour valider les réponses reçues côté client SDK.
 */
export const GatewayResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    ok:    z.boolean(),
    data:  dataSchema.optional(),
    error: z.string().optional(),
    code:  z.string().optional(),
    ts:    z.number().int().positive(),
  });

// ─── SCHÉMAS GATEWAY CONCRETS ────────────────────────────────────────────────

/** Réponse Gateway pour une opération d'ingestion. */
export const IngestResponseSchema = GatewayResponseSchema(ChronicleSchema);
export type IngestResponse = z.infer<typeof IngestResponseSchema>;

/** Réponse Gateway pour une requête de mémoire. */
export const QueryResponseSchema = GatewayResponseSchema(QueryResultSchema);
export type QueryResponse = z.infer<typeof QueryResponseSchema>;

// ─── HELPERS DE VALIDATION ───────────────────────────────────────────────────

/**
 * Parse et valide un IngestRequest entrant.
 * Lève une ZodError avec détails si invalide.
 *
 * @example
 * const validated = parseIngestRequest(req.body); // throws ZodError if invalid
 */
export function parseIngestRequest(raw: unknown): IngestRequestInput {
  return IngestRequestSchema.parse(raw);
}

/**
 * Parse et valide un QueryRequest entrant.
 */
export function parseQueryRequest(raw: unknown): QueryRequestInput {
  return QueryRequestSchema.parse(raw);
}

/**
 * Valide sans exception (safe parse) — retourne success/error.
 */
export function safeParseIngestRequest(raw: unknown) {
  return IngestRequestSchema.safeParse(raw);
}

export function safeParseQueryRequest(raw: unknown) {
  return QueryRequestSchema.safeParse(raw);
}
