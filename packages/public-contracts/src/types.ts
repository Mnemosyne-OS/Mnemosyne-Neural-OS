/**
 * @mnemosyne_os/public-contracts — types.ts
 *
 * OFFICIAL PUBLIC SURFACE OF MNEMOSYNE OS
 * ======================================
 * This file defines the types and interfaces shared with the external ecosystem.
 * ABSOLUTE RULE: No business logic here. Types, enums and interfaces only.
 * The cognitive logic stays in the sealed Core Engine.
 *
 * @version 0.2.1
 * @phase 65 — Protected Architecture / Asymmetric Exposure
 */

// ─── ENUMS ───────────────────────────────────────────────────────────────────

/**
 * SpineType — Mnemosyne's cognitive taxonomy.
 *
 * Spines are the semantic "backbones" that classify every ingested Chronicle.
 * They power intent-aware retrieval.
 *
 * TECHNICAL SPINES: engineering and session classifications.
 * COGNITIVE SPINES: what sets Mnemosyne apart from a plain RAG.
 */
export enum SpineType {
  // ── Technical Spines ───────────────────────────────────────────────────────
  /** Architecture decisions, ADRs, design choices. */
  ARCHITECTURE  = 'ARCHITECTURE',
  /** Bug resolutions, patches, fixes. */
  BUGFIX        = 'BUGFIX',
  /** Dependency changes, upgrades, migrations. */
  DEPENDENCY    = 'DEPENDENCY',
  /** Documentation watch, technical monitoring. */
  DOC_WATCH     = 'DOC_WATCH',
  /** Work sessions, conversation context. */
  SESSION       = 'SESSION',

  // ── Cognitive & Affective Spines ───────────────────────────────────────────
  /** Revelation, eureka, major insight. */
  EPIPHANY      = 'EPIPHANY',
  /** Ideation, speculation, concept exploration. */
  IDEATIONAL    = 'IDEATIONAL',
  /** Emotional states, valence, flow states. */
  EMOTIONAL     = 'EMOTIONAL',
  /** Resonance between chronicles, cross-cutting semantic connections. */
  RESONANCE     = 'RESONANCE',
  /** Social nodes, human interactions, collaborators. */
  SOCIAL_NODE   = 'SOCIAL_NODE',
}

/**
 * VaultType — Mnemosyne's resonant spaces.
 *
 * Each Vault owns its own MRL (Matryoshka Representation Learning) vector space.
 * Segmentation enables targeted retrieval and permission management.
 */
export enum VaultType {
  /** Codebase, architecture decisions, debug logs. */
  DEV      = 'DEV',
  /** Social interactions, collaborators, social nodes. */
  SOCIAL   = 'SOCIAL',
  /** Private reflections, personal notes, ideation. */
  PERSONAL = 'PERSONAL',
}

// ─── CORE INTERFACES ─────────────────────────────────────────────────────────

/**
 * Chronicle — Mnemosyne's fundamental unit of memory.
 *
 * A Chronicle is not a plain document — it is a semantically tagged memory,
 * with an embedding vector and temporal traceability.
 */
export interface Chronicle {
  /** Unique identifier (UUID v4). */
  id: string;
  /** Storage vault. Determines the vector space used. */
  vaultId: VaultType;
  /** Textual content of the memory. */
  content: string;
  /** Semantic classifications (at least one Spine required). */
  spines: SpineType[];
  /** Creation timestamp (Unix ms). */
  createdAt: number;
  /** Last-update timestamp (Unix ms). */
  updatedAt?: number;
  /** Arbitrary attached metadata (source, author, ref, etc.). */
  metadata?: Record<string, unknown>;
}

/**
 * QueryResult — Result of an intent-aware query.
 *
 * The resonance engine returns not only the relevant Chronicles, but also a
 * LLM-synthesized answer and an overall resonance score.
 */
export interface QueryResult {
  /** Relevant chronicles sorted by descending resonance score. */
  chronicles: Chronicle[];
  /** Answer synthesized by the cognitive Core. Empty if the Core is not connected. */
  synthesizedAnswer: string;
  /** Overall semantic resonance score [0.0 – 1.0]. */
  resonanceScore: number;
  /** Vaults queried during this request. */
  vaultsQueried?: VaultType[];
  /** Spines that contributed to retrieval (debug/observability). */
  spinesActivated?: SpineType[];
}

/**
 * IngestRequest — Parameters of a memory-ingestion request.
 */
export interface IngestRequest {
  /** Content to ingest. */
  content: string;
  /** Target vault. */
  vault: VaultType;
  /**
   * Requested spines. If omitted, the Core applies automatic classification
   * via the (LLM-based) Intent Classifier.
   */
  requestedSpines?: SpineType[];
  /** Arbitrary metadata to attach to the created Chronicle. */
  metadata?: Record<string, unknown>;
}

/**
 * QueryRequest — Parameters of an intent-aware query.
 */
export interface QueryRequest {
  /** The user's intent or question (natural language). */
  intent: string;
  /**
   * Vaults to query. If omitted, every authorized vault is queried.
   */
  targetVaults?: VaultType[];
  /**
   * Spines to favor (score boost). Enables biased retrieval.
   * Example: [SpineType.IDEATIONAL] to search for "best ideas".
   */
  boostSpines?: SpineType[];
  /** Maximum number of Chronicles returned (default: 10). */
  limit?: number;
}

// ─── SEALED CORE MANIFEST ────────────────────────────────────────────────────

/**
 * SealedCoreManifest — Metadata of a Sealed Core distribution.
 *
 * Included in every mnemosyne-core-sealed.tgz archive as BUILD_INFO.json.
 * Lets the distributee verify version compatibility before installing.
 */
export interface SealedCoreManifest {
  /** Version of the sealed Core Engine. */
  sourceVersion: string;
  /** ISO 8601 build date. */
  sealedAt: string;
  /** Exact Node.js version used to compile the bytecode. */
  nodeVersion: string;
  /** Node.js major version (for compatibility checks). */
  nodeMajor: number;
  /** Target Electron version (e.g. "v31.x (Electron 31)"). */
  electronTarget: string;
  /** Bytecode targets included in the archive. */
  targets: Array<'node' | 'electron'>;
  /** npm package name of the distribution. */
  packageName: string;
  /** V8 compatibility warning to show the installer. */
  warning: string;
}

// ─── GATEWAY API RESPONSES ───────────────────────────────────────────────────

/**
 * GatewayResponse<T> — Standard envelope for Mnemosyne Gateway responses.
 *
 * Every Gateway HTTP response follows this shape.
 * eval-sdk consumers always receive this format.
 */
export interface GatewayResponse<T = unknown> {
  /** Whether the request succeeded. */
  ok: boolean;
  /** Returned data when ok === true. */
  data?: T;
  /** Error message when ok === false. */
  error?: string;
  /** Machine-readable error code (e.g. "VAULT_NOT_FOUND", "RATE_LIMITED"). */
  code?: GatewayErrorCode;
  /** Response timestamp (Unix ms). */
  ts: number;
}

/**
 * GatewayErrorCode — Standardized Gateway error codes.
 */
export type GatewayErrorCode =
  | 'UNAUTHORIZED'        // Token missing or invalid
  | 'RATE_LIMITED'        // Too many requests
  | 'VAULT_NOT_FOUND'     // Vault does not exist or is not authorized
  | 'CORE_UNAVAILABLE'    // Core Engine offline
  | 'VALIDATION_ERROR'    // Invalid payload (Zod)
  | 'INGEST_FAILED'       // Ingestion failed
  | 'QUERY_FAILED'        // Query failed
  | 'INTERNAL_ERROR';     // Unclassified internal error
