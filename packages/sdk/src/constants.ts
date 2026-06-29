/**
 * @mnemosyne_os/sdk — Public Constants
 *
 * Expose les méthodes RPC disponibles sur le serveur SDK (ws://localhost:7799)
 * et les constantes de l'écosystème Mnemosyne OS.
 *
 * [SDK][LAYER-2][ZERO-TRUST]
 */

// ── RPC Methods ────────────────────────────────────────────────────────────────

/**
 * Méthodes JSON-RPC exposées par le SDK WebSocket Server de Mnemosyne OS.
 * Le serveur écoute sur ws://127.0.0.1:7799 (localhost uniquement).
 *
 * @example
 * ```typescript
 * import { MNEMOSYNE_METHODS } from '@mnemosyne_os/sdk';
 * // Utilisation directe (sans MnemoClient) :
 * ws.send(JSON.stringify({ id: '1', method: MNEMOSYNE_METHODS.REGISTER, params: { manifest } }));
 * ```
 */
export const MNEMOSYNE_METHODS = {
  // ── Auth ───────────────────────────────────────────────────────────────
  /** Enregistre l'app, valide le manifest, retourne un JWT 24h */
  REGISTER: 'sdk.register',

  // ── Vault ───────────────────────────────────────────────────────────────
  /** Ingère du contenu dans le vault (vectorisation incluse) */
  INGEST: 'sdk.ingest',
  /** Requête sémantique — résultats filtrés par source_app_id */
  QUERY: 'sdk.query',
  /** Trouve les connexions causales entre deux contenus */
  CORRELATE: 'sdk.correlate',
  /** Supprime un chronicle par ID (scope vault:write requis) */
  FORGET: 'sdk.forget',

  // ── Resonances ───────────────────────────────────────────────────────────
  /**
   * Liste les Resonances actives (projets cognitifs) depuis le vault DEV.
   * Requiert le scope `vault:read:DEV`.
   */
  RESONANCES_LIST: 'sdk.resonances.list',
  /**
   * Met à jour la position courante d'une Resonance (phase, description).
   * Persisté comme chronicle DECISION dans le vault DEV.
   * Requiert le scope `vault:write:DEV`.
   */
  UPDATE_POSITION: 'sdk.resonance.updatePosition',

  // ── Monorepo ───────────────────────────────────────────────────────────
  /**
   * Lit le git log du monorepo Mnemosyne OS.
   * Requiert le scope `monorepo:read` dans le manifest.
   * Retourne les commits filtrés (hash, message, author, date).
   * [SECURITY] Path hardcodé côté serveur — le client ne contrôle pas le repo.
   */
  GIT_LOG: 'sdk.git.log',
  /**
   * Lit un fichier .md depuis le repo Mnemosyne OS (docs/, packages/).
   * Requiert le scope `monorepo:read`.
   * [SECURITY] Seuls les .md sont lisibles, path sanitizé côté serveur.
   */
  READ_FILE: 'sdk.readFile',

  // ── Agents ───────────────────────────────────────────────────────────────
  /**
   * Liste les agents actifs connectés au SDK WebSocket Server.
   * Requiert le scope `agents:read` dans le manifest.
   */
  LIST_AGENTS: 'sdk.agents.list',

  // ── Cross-App ──────────────────────────────────────────────────────────
  /** Demande d'accès aux chronicles d'une autre app (popup consentement) */
  SHARE: 'sdk.share',

  // ── NFT Licence ─────────────────────────────────────────────────────────
  /**
   * Vérifie qu'un wallet possède le NFT de licence de cette app.
   * Requiert le scope `nft:validate` dans le manifest.
   * Cache TTL 5 min côté OS pour ne pas spam la blockchain.
   */
  NFT_VALIDATE: 'sdk.nft.validate',

  // ── NeuralGraph ─────────────────────────────────────────────────────────
  /**
   * Queries the NeuralGraph — returns nodes and edges near the given text.
   * Requires scope `neural:graph:read`.
   */
  GRAPH_QUERY: 'sdk.graph.query',

  // ── Vault Discovery ─────────────────────────────────────────────────────
  /**
   * Lists all available vaults (core built-ins + user-created custom vaults).
   * Requires intent `LIST_VAULTS`.
   * Returns `VaultListResult` with `coreVaults` and `customVaults` arrays.
   * Use the `id` field of each vault as the `vault` param in ingest/query.
   */
  LIST_VAULTS: 'sdk.vaults.list',

  // ── Correlate ─────────────────────────────────────────────────────────
  // (CORRELATE and FORGET are already declared in the Vault section above)

  // ── Forget (GDPR) ────────────────────────────────────────────────────────
  // (See FORGET above)

  // ── Dynamic Spine Registry ────────────────────────────────────────────────
  /**
   * Allocates a new dynamic spine in the OS neural registry (Protocole du Guichet).
   * Requires scope `vault:write:CUSTOM`.
   * The allocated spine appears in the Mnemosyne OS neural graph.
   */
  REGISTER_SPINE: 'sdk.spine.register',

  /**
   * Releases a previously allocated dynamic spine.
   * Only the owning app can release its own spines.
   * Requires scope `vault:write:CUSTOM`.
   */
  RELEASE_SPINE: 'sdk.spine.release',

  /**
   * Lists all currently allocated dynamic spines across all registered apps.
   * Returns an array of `DynamicSpineInfo` objects.
   */
  LIST_SPINES: 'sdk.spine.list',
} as const;

export type MnemoMethod = typeof MNEMOSYNE_METHODS[keyof typeof MNEMOSYNE_METHODS];

// ── Runtime constants ──────────────────────────────────────────────────────────

/** Port par défaut du SDK WebSocket Server */
export const MNEMOSYNE_WS_PORT = 7799;

/** Host du SDK WebSocket Server (localhost uniquement — sécurité Zero-Trust) */
export const MNEMOSYNE_WS_HOST = '127.0.0.1';

/** Durée de validité d'un JWT SDK (en secondes) */
export const MNEMOSYNE_TOKEN_TTL_S = 24 * 60 * 60; // 24h

/** Durée du cache de validation NFT côté OS (en ms) */
export const MNEMOSYNE_NFT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

// ── Supported chains for NFT licences ─────────────────────────────────────────

export const MNEMOSYNE_CHAINS = {
  BASE:    { id: 8453,  name: 'Base',    rpc: 'https://mainnet.base.org' },
  POLYGON: { id: 137,   name: 'Polygon', rpc: 'https://polygon-rpc.com' },
  BASE_SEPOLIA: { id: 84532, name: 'Base Sepolia (testnet)', rpc: 'https://sepolia.base.org' },
} as const;

export type MnemoChain = keyof typeof MNEMOSYNE_CHAINS;
