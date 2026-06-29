/**
 * @mnemosyne-workspace/eval-sdk — MnemosyneClient.ts
 *
 * CLIENT SDK OFFICIEL — GATEWAY MNEMOSYNE OS
 * ==========================================
 * Wrapper HTTP vers la Gateway locale ou distante de Mnemosyne OS.
 * Ne contient AUCUNE logique cognitive — c'est un transport pur.
 *
 * Ce client est conçu pour les développeurs tiers qui intègrent Mnemosyne
 * via l'Evaluation SDK. Il n'a accès qu'à la surface publique (Tier 2).
 *
 * @version 0.2.0
 * @phase 65 — Protected Architecture / Eval SDK
 */

import type {
  Chronicle,
  QueryResult,
  IngestRequest,
  QueryRequest,
  GatewayResponse,
  GatewayErrorCode,
} from '@mnemosyne_os/public-contracts';

import {
  SpineType,
  VaultType,
  safeParseIngestRequest,
  safeParseQueryRequest,
} from '@mnemosyne_os/public-contracts';

// ─── TYPES INTERNES ──────────────────────────────────────────────────────────

export interface MnemosyneClientConfig {
  /**
   * URL de base de la Gateway Mnemosyne OS.
   * Par défaut : http://localhost:7437 (daemon local).
   */
  endpoint?: string;
  /**
   * Token d'authentification (requis hors localhost).
   * Fourni lors de l'onboarding Evaluation SDK.
   */
  apiKey?: string;
  /**
   * Timeout des requêtes en millisecondes (défaut: 10 000ms).
   */
  timeoutMs?: number;
  /**
   * Active les logs de debug dans la console (défaut: false).
   */
  debug?: boolean;
}

export class MnemosyneGatewayError extends Error {
  constructor(
    message: string,
    public readonly code: GatewayErrorCode | 'NETWORK_ERROR' | 'TIMEOUT' | 'VALIDATION_ERROR',
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'MnemosyneGatewayError';
  }
}

// ─── CLIENT ──────────────────────────────────────────────────────────────────

/**
 * MnemosyneClient — Point d'entrée unique pour l'Evaluation SDK.
 *
 * @example
 * ```typescript
 * import { MnemosyneClient, VaultType, SpineType } from '@mnemosyne-workspace/eval-sdk';
 *
 * const client = new MnemosyneClient({ endpoint: 'http://localhost:7437' });
 *
 * // Ingérer une mémoire
 * const chronicle = await client.ingestContext(
 *   'Décision : utiliser bytenode pour sceller le Core Engine.',
 *   VaultType.DEV,
 *   [SpineType.ARCHITECTURE]
 * );
 *
 * // Interroger la mémoire
 * const result = await client.queryMemory('Quelle est la meilleure idée ?', [VaultType.DEV]);
 * console.log(result.synthesizedAnswer);
 * ```
 */
export class MnemosyneClient {
  private readonly endpoint: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly debug: boolean;

  constructor(config: MnemosyneClientConfig = {}) {
    this.endpoint  = (config.endpoint ?? 'http://localhost:7438').replace(/\/$/, '');
    this.apiKey    = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? 10_000;
    this.debug     = config.debug ?? false;
  }

  // ── Utilitaires privés ──────────────────────────────────────────────────────

  private log(...args: unknown[]): void {
    if (this.debug) console.log('[MnemosyneSDK]', ...args);
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Mnemosyne-Client': 'eval-sdk/0.2.0',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  /**
   * Effectue une requête HTTP vers la Gateway avec timeout et gestion d'erreurs.
   */
  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.endpoint}${path}`;
    this.log(`${method} ${url}`, body ?? '');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: this.buildHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new MnemosyneGatewayError(
          `Timeout : la Gateway n'a pas répondu en ${this.timeoutMs}ms.`,
          'TIMEOUT',
        );
      }
      throw new MnemosyneGatewayError(
        `Erreur réseau : ${err instanceof Error ? err.message : String(err)}`,
        'NETWORK_ERROR',
      );
    } finally {
      clearTimeout(timer);
    }

    const json = await response.json() as GatewayResponse<T>;

    if (!json.ok) {
      throw new MnemosyneGatewayError(
        json.error ?? 'Erreur inconnue de la Gateway.',
        (json.code as GatewayErrorCode) ?? 'INTERNAL_ERROR',
        response.status,
      );
    }

    return json.data as T;
  }

  // ── API Publique ────────────────────────────────────────────────────────────

  /**
   * Ingère une nouvelle mémoire dans le système cognitif Mnemosyne.
   *
   * @param content - Texte à mémoriser.
   * @param vault - Espace de stockage cible (DEV / SOCIAL / PERSONAL).
   * @param requestedSpines - Classifications sémantiques demandées.
   *   Si absent, le Core applique la classification automatique via LLM.
   * @param metadata - Métadonnées arbitraires (source, auteur, lien, etc.).
   * @returns La Chronicle créée avec son ID et ses Spines effectives.
   * @throws {MnemosyneGatewayError} Si la Gateway est indisponible ou retourne une erreur.
   */
  async ingestContext(
    content: string,
    vault: VaultType,
    requestedSpines?: SpineType[],
    metadata?: Record<string, unknown>,
  ): Promise<Chronicle> {
    const payload: IngestRequest = { content, vault, requestedSpines, metadata };

    // Validation client-side avant envoi (évite des allers-retours réseau inutiles)
    const validation = safeParseIngestRequest(payload);
    if (!validation.success) {
      throw new MnemosyneGatewayError(
        `Payload invalide : ${validation.error.message}`,
        'VALIDATION_ERROR',
      );
    }

    return this.request<Chronicle>('POST', '/v1/ingest', payload);
  }

  /**
   * Interroge le moteur de résonance Intent-Aware de Mnemosyne.
   *
   * @param intent - L'intention ou question en langage naturel.
   * @param targetVaults - Vaults à interroger (tous si absent).
   * @param boostSpines - Spines à favoriser dans le retrieval.
   * @param limit - Nombre max de Chronicles retournées (défaut: 10).
   * @returns Les Chronicles pertinentes + une réponse synthétisée par le Core cognitif.
   * @throws {MnemosyneGatewayError} Si la Gateway est indisponible ou retourne une erreur.
   */
  async queryMemory(
    intent: string,
    targetVaults?: VaultType[],
    boostSpines?: SpineType[],
    limit?: number,
  ): Promise<QueryResult> {
    const payload: QueryRequest = { intent, targetVaults, boostSpines, limit };

    const validation = safeParseQueryRequest(payload);
    if (!validation.success) {
      throw new MnemosyneGatewayError(
        `Payload invalide : ${validation.error.message}`,
        'VALIDATION_ERROR',
      );
    }

    return this.request<QueryResult>('POST', '/v1/query', payload);
  }

  /**
   * Vérifie la disponibilité de la Gateway et retourne son état.
   *
   * @returns true si la Gateway est en ligne et le Core cognitif est actif.
   */
  async ping(): Promise<{ online: boolean; coreVersion?: string; uptime?: number }> {
    try {
      return await this.request<{ online: boolean; coreVersion?: string; uptime?: number }>(
        'GET',
        '/v1/status',
      );
    } catch {
      return { online: false };
    }
  }
}
