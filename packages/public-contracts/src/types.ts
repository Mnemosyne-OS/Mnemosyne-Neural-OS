/**
 * @mnemosyne-workspace/public-contracts — types.ts
 *
 * SURFACE PUBLIQUE OFFICIELLE DE MNEMOSYNE OS
 * ============================================
 * Ce fichier définit les types et interfaces partagés avec l'écosystème externe.
 * RÈGLE ABSOLUE : Aucune logique métier ici. Uniquement des types, enums et interfaces.
 * La logique cognitive reste dans le Core Engine (sealed).
 *
 * @version 0.2.0
 * @phase 65 — Protected Architecture / Asymmetric Exposure
 */

// ─── ENUMS ───────────────────────────────────────────────────────────────────

/**
 * SpineType — La taxonomie cognitive de Mnemosyne.
 *
 * Les Spines sont les "épines dorsales" sémantiques qui classifient
 * chaque Chronicle ingérée. Elles permettent le retrieval Intent-Aware.
 *
 * SPINES TECHNIQUES : Classifications d'ingénierie et de session.
 * SPINES COGNITIVES : Ce qui différencie Mnemosyne d'un simple RAG.
 */
export enum SpineType {
  // ── Spines Techniques ──────────────────────────────────────────────────────
  /** Décisions d'architecture, ADR, choix de design. */
  ARCHITECTURE  = 'ARCHITECTURE',
  /** Résolutions de bugs, patches, correctifs. */
  BUGFIX        = 'BUGFIX',
  /** Changements de dépendances, mises à jour, migrations. */
  DEPENDENCY    = 'DEPENDENCY',
  /** Surveillance de documentation, veille technique. */
  DOC_WATCH     = 'DOC_WATCH',
  /** Sessions de travail, contexte de conversation. */
  SESSION       = 'SESSION',

  // ── Spines Cognitives & Affectives ────────────────────────────────────────
  /** Révélation, eurêka, insight majeur. */
  EPIPHANY      = 'EPIPHANY',
  /** Idéation, spéculation, exploration de concepts. */
  IDEATIONAL    = 'IDEATIONAL',
  /** États émotionnels, valence, états de flow. */
  EMOTIONAL     = 'EMOTIONAL',
  /** Résonance entre chronicles, connexions sémantiques transversales. */
  RESONANCE     = 'RESONANCE',
  /** Nœuds sociaux, interactions humaines, collaborateurs. */
  SOCIAL_NODE   = 'SOCIAL_NODE',
}

/**
 * VaultType — Les espaces résonants de Mnemosyne.
 *
 * Chaque Vault a son propre espace vectoriel MRL (Matryoshka Representation Learning).
 * La segmentation permet le retrieval ciblé et la gestion des permissions.
 */
export enum VaultType {
  /** Codebase, décisions architecturales, logs de debug. */
  DEV      = 'DEV',
  /** Interactions sociales, collaborateurs, nœuds sociaux. */
  SOCIAL   = 'SOCIAL',
  /** Réflexions privées, notes personnelles, idéation. */
  PERSONAL = 'PERSONAL',
}

// ─── INTERFACES CORE ─────────────────────────────────────────────────────────

/**
 * Chronicle — L'unité fondamentale de mémoire de Mnemosyne.
 *
 * Une Chronicle n'est pas un simple document — c'est une mémoire taguée
 * sémantiquement, avec un vecteur d'embedding et une traçabilité temporelle.
 */
export interface Chronicle {
  /** Identifiant unique (UUID v4). */
  id: string;
  /** Vault de stockage. Détermine l'espace vectoriel utilisé. */
  vaultId: VaultType;
  /** Contenu textuel de la mémoire. */
  content: string;
  /** Classifications sémantiques (au moins une Spine requise). */
  spines: SpineType[];
  /** Timestamp de création (Unix ms). */
  createdAt: number;
  /** Timestamp de dernière mise à jour (Unix ms). */
  updatedAt?: number;
  /** Métadonnées arbitraires attachées (source, auteur, ref, etc.). */
  metadata?: Record<string, unknown>;
}

/**
 * QueryResult — Résultat d'une requête Intent-Aware.
 *
 * Le moteur de résonance retourne non seulement les Chronicles pertinentes,
 * mais aussi une réponse synthétisée par le LLM et un score global de résonance.
 */
export interface QueryResult {
  /** Chronicles pertinentes triées par score de résonance décroissant. */
  chronicles: Chronicle[];
  /** Réponse synthétisée par le Core cognitif. Vide si Core non connecté. */
  synthesizedAnswer: string;
  /** Score global de résonance sémantique [0.0 – 1.0]. */
  resonanceScore: number;
  /** Vaults interrogés pendant cette requête. */
  vaultsQueried?: VaultType[];
  /** Spines ayant contribué au retrieval (debug/observabilité). */
  spinesActivated?: SpineType[];
}

/**
 * IngestRequest — Paramètres d'une demande d'ingestion de mémoire.
 */
export interface IngestRequest {
  /** Contenu à ingérer. */
  content: string;
  /** Vault cible. */
  vault: VaultType;
  /**
   * Spines demandées. Si absent, le Core applique la classification automatique
   * via le Intent Classifier (LLM-based).
   */
  requestedSpines?: SpineType[];
  /** Métadonnées arbitraires à attacher à la Chronicle créée. */
  metadata?: Record<string, unknown>;
}

/**
 * QueryRequest — Paramètres d'une requête Intent-Aware.
 */
export interface QueryRequest {
  /** L'intention ou question de l'utilisateur (langage naturel). */
  intent: string;
  /**
   * Vaults à interroger. Si absent, tous les vaults autorisés sont interrogés.
   */
  targetVaults?: VaultType[];
  /**
   * Spines à privilégier (boost de score). Permet le retrieval biaisé.
   * Exemple : [SpineType.IDEATIONAL] pour une recherche de "meilleures idées".
   */
  boostSpines?: SpineType[];
  /** Nombre maximum de Chronicles retournées (défaut: 10). */
  limit?: number;
}

// ─── MANIFESTE DU SEALED CORE ────────────────────────────────────────────────

/**
 * SealedCoreManifest — Métadonnées d'une distribution Sealed Core.
 *
 * Inclus dans chaque archive mnemosyne-core-sealed.tgz sous BUILD_INFO.json.
 * Permet au distributaire de vérifier la compatibilité de version avant install.
 */
export interface SealedCoreManifest {
  /** Version du Core Engine scellé. */
  sourceVersion: string;
  /** Date ISO 8601 de la compilation. */
  sealedAt: string;
  /** Version exacte de Node.js utilisée pour compiler le bytecode. */
  nodeVersion: string;
  /** Version majeure de Node.js (pour vérification de compatibilité). */
  nodeMajor: number;
  /** Version Electron ciblée (ex: "v31.x (Electron 31)"). */
  electronTarget: string;
  /** Cibles de bytecode incluses dans l'archive. */
  targets: Array<'node' | 'electron'>;
  /** Nom du package npm de la distribution. */
  packageName: string;
  /** Avertissement de compatibilité V8 à afficher à l'installateur. */
  warning: string;
}

// ─── RÉPONSES D'API GATEWAY ──────────────────────────────────────────────────

/**
 * GatewayResponse<T> — Enveloppe standard des réponses de la Gateway Mnemosyne.
 *
 * Toutes les réponses HTTP de la Gateway suivent cette structure.
 * Les consommateurs de l'eval-sdk reçoivent toujours ce format.
 */
export interface GatewayResponse<T = unknown> {
  /** Succès ou échec de la requête. */
  ok: boolean;
  /** Données retournées si ok === true. */
  data?: T;
  /** Message d'erreur si ok === false. */
  error?: string;
  /** Code d'erreur machine (ex: "VAULT_NOT_FOUND", "RATE_LIMITED"). */
  code?: GatewayErrorCode;
  /** Timestamp de la réponse (Unix ms). */
  ts: number;
}

/**
 * GatewayErrorCode — Codes d'erreur standardisés de la Gateway.
 */
export type GatewayErrorCode =
  | 'UNAUTHORIZED'        // Token absent ou invalide
  | 'RATE_LIMITED'        // Trop de requêtes
  | 'VAULT_NOT_FOUND'     // Vault inexistant ou non autorisé
  | 'CORE_UNAVAILABLE'    // Core Engine offline
  | 'VALIDATION_ERROR'    // Payload invalide (Zod)
  | 'INGEST_FAILED'       // Échec d'ingestion
  | 'QUERY_FAILED'        // Échec de requête
  | 'INTERNAL_ERROR';     // Erreur interne non classifiée
