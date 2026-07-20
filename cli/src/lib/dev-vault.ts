/**
 * DevVault — Core Types
 * Mnemosyne OS Dev Edition
 *
 * Le DevVault est un vault technique séparé du vault personnel.
 * Il indexe les décisions de développement, conversations d'agents,
 * historique git, et mémoires ancrées dans le code.
 *
 * @module dev-vault
 */

// ── Chronicle Types ────────────────────────────────────────────────────────────

export type DevChronicleSource =
  | 'cursor_ide'
  | 'cursor_composer'
  | 'cursor_chat'
  | 'antigravity_session'
  | 'git_commit'
  | 'github_issue'
  | 'github_pr'
  | 'github_review'
  | 'terminal_command'
  | 'memory_anchor'
  | 'manual'

export type DevChronicleType = 'architectural' | 'debug' | 'feature' | 'refactor' | 'docs' | 'ops' | 'security'

export interface DevChronicle {
  id: string                     // 'cursor_<uuid>' | 'git_<sha>' | 'anchor_<uuid>'
  source: DevChronicleSource
  chronicle_type: DevChronicleType
  timestamp: string              // ISO 8601
  timestamp_ms: number
  workspace?: string             // Workspace hash ou nom du repo
  content: string                // Le contenu brut (prompt, message, commit message...)
  story: string                  // Formulation narrative pour l'ingestion Resonance
  facts: string[]                // Faits extraits pour les Spines
  files_context?: string[]       // Fichiers mentionnés/touchés
  weight?: number                // 1.0 normal | 1.5 note | 2.0 warning | 3.0 critical
  anchor_type?: 'CRITICAL' | 'WARNING' | 'NOTE'
  tags?: string[]
  metadata?: Record<string, unknown>
}

// ── Spine Types ────────────────────────────────────────────────────────────────

export interface ArchitectureSpineEntry {
  id: string
  timestamp: string
  decision: string               // "On utilise Jina v3 embeddings"
  rationale: string              // "Parce que dimension 1024D nécessaire pour MRL"
  alternatives_rejected?: string[]
  files_affected?: string[]
  source_chronicle_id?: string
  tags: string[]
}

export interface GitSpineEntry {
  sha: string
  timestamp: string
  message: string
  author: string
  branch?: string
  files_changed: string[]
  insertions: number
  deletions: number
  tags?: string[]                // git tags pointing to this commit
}

export interface DependencySpineEntry {
  package_name: string
  version: string
  timestamp: string
  change_type: 'added' | 'updated' | 'removed' | 'pinned'
  reason?: string
  breaking?: boolean
  source_chronicle_id?: string
}

export interface ErrorSpineEntry {
  id: string
  timestamp: string
  error_pattern: string          // Message d'erreur normalisé (sans valeurs variables)
  error_type: string             // 'TypeError' | 'BuildError' | 'NetworkError' etc.
  resolution?: string            // Comment ça a été résolu
  files_involved?: string[]
  recurrence_count: number
  last_seen: string
}

export interface ApiSpineEntry {
  id: string
  endpoint: string               // '/api/v1/resonance/query'
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  description: string
  auth_required: boolean
  version: string
  status: 'active' | 'deprecated' | 'planned'
  source_chronicle_id?: string
}

// ── Memory Anchor ──────────────────────────────────────────────────────────────

export interface MemoryAnchor {
  id: string
  timestamp: string
  file_path: string              // Chemin du fichier source
  line_start?: number
  line_end?: number
  selected_text: string          // Le texte surligné
  anchor_type: 'CRITICAL' | 'WARNING' | 'NOTE'
  weight_multiplier: 3 | 2 | 1.5
  note?: string                  // Note additionnelle optionnelle
  chronicle_id?: string          // Chronicle généré depuis cet anchor
}

// ── DevVault Config ────────────────────────────────────────────────────────────

export interface DevVaultConfig {
  vault_path: string             // Chemin vers le DevVault
  edition: 'dev'
  version: string                // '0.1'
  workspace_name: string         // Nom du projet
  workspace_root: string         // Racine du repo
  connectors_enabled: {
    cursor: boolean
    git: boolean
    github: boolean
    terminal: boolean
    antigravity: boolean
  }
  spines_enabled: {
    architecture: boolean
    git: boolean
    dependency: boolean
    error: boolean
    api: boolean
  }
  nft_token?: string             // Token NFT de licence (optionnel en phase beta)
  created_at: string
  last_sync: string
}

// ── Import Result ──────────────────────────────────────────────────────────────

export interface ConnectorImportResult {
  connector: string
  success: boolean
  chronicles_imported: number
  chronicles_skipped: number     // Doublons ou vides
  date_range?: { from: string; to: string }
  errors: string[]
  output_path?: string
}
