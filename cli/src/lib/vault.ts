import fs from 'fs';
import path from 'path';
import os from 'os';

// ─────────────────────────────────────────────
// Vault — MnemoVault path resolution
// Structure: MnemoVault/<Workspace>/<ResonanceProject>/<IDE>/<Provider>/
//
// Workspace        = the ecosystem / org (e.g. 'Mnemosyne-OS')
// ResonanceProject = a feature / component (e.g. 'CLI', 'Dashboard')
// IDE              = the AI assistant (e.g. 'Antigravity', 'Cursor')
// Provider         = the model company (e.g. 'Anthropic', 'GoogleDeepMind')
// ─────────────────────────────────────────────

export const DEFAULT_VAULT = path.join(os.homedir(), 'Documents', 'MnemoVault');
export const CLI_RESONANCE_DIR = '.cli_resonance';

export type ChronicleStyle = 'session' | 'reflection' | 'decision' | 'sweep' | 'narcissus';

export interface RegisteredModel {
  ide: string;
  provider: string;
  modelId?: string;         // auto-signed per chronicle, not required at init
  displayName?: string;
  defaultChronicleStyle?: ChronicleStyle;
}

export interface VaultConfig {
  vaultPath: string;
  ide: string;              // e.g. 'Antigravity', 'Cursor', 'ClaudeCode'
  provider: string;         // e.g. 'Anthropic', 'GoogleDeepMind', 'OpenAI'
  workspace?: string;       // e.g. 'Mnemosyne-OS'
  resonanceProject?: string;
  modelId?: string;
  displayName?: string;
  defaultChronicleStyle?: ChronicleStyle;
  registeredModels?: RegisteredModel[];
  localAI?: {               // Ollama local model for memory compression
    provider: 'ollama';
    model: string;          // e.g. 'mistral:7b'
    endpoint: string;       // e.g. 'http://localhost:11434'
  };
  soulProfile?: string;     // Active dev soul profile ID (architect, auditor, shipper, guardian, challenger)
  lang?: string;            // UI language: 'en' | 'fr' | 'es' (auto-detected from OS if not set)
}


/**
 * Resolve the chronicle output directory.
 * New structure: <vault>/<Workspace>/<ResonanceProject>/<IDE>/<Provider>/
 * Legacy fallback (no workspace/project): <vault>/.cli_resonance/<IDE>/<Provider>/
 */
export function resolveChronicleDir(config: VaultConfig): string {
  let dir: string;
  if (config.workspace && config.resonanceProject) {
    // Full Resonance Project structure
    dir = path.join(
      config.vaultPath,
      config.workspace,
      config.resonanceProject,
      config.ide,
      config.provider
    );
  } else {
    // Legacy: .cli_resonance/IDE/Provider
    dir = path.join(
      config.vaultPath,
      CLI_RESONANCE_DIR,
      config.ide,
      config.provider
    );
  }
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Load config from .mnemo-config.json in the .cli_resonance/ root.
 * Returns null if not initialized.
 */
export function loadVaultConfig(): VaultConfig | null {
  const configPath = path.join(DEFAULT_VAULT, CLI_RESONANCE_DIR, '.mnemo-config.json');
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8')) as VaultConfig;
  } catch {
    return null;
  }
}

/**
 * Save config to .mnemo-config.json.
 */
export function saveVaultConfig(config: VaultConfig): void {
  const dir = path.join(config.vaultPath, CLI_RESONANCE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  const configPath = path.join(dir, '.mnemo-config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

/**
 * List all chronicles for the current IDE/Provider.
 */
export function listChronicles(config: VaultConfig): string[] {
  const dir = resolveChronicleDir(config);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse(); // most recent first
}

// ─────────────────────────────────────────────
// Custom Models Registry
// Loaded from .cli_resonance/models.json
// Compatible with UniversalModelCard v1.0.0 (subset)
// ─────────────────────────────────────────────

export interface ModelEntry {
  modelId: string;
  displayName: string;
  provider: string;        // 'Anthropic', 'GoogleDeepMind', 'OpenAI', 'Meta', 'Mistral'…
  providerLabel?: string;  // Optional human-readable provider name
}

const DEFAULT_MODELS_PATH = (vaultPath: string) =>
  path.join(vaultPath, CLI_RESONANCE_DIR, 'models.json');

export function loadCustomModels(vaultPath: string = DEFAULT_VAULT): ModelEntry[] {
  const p = DEFAULT_MODELS_PATH(vaultPath);
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as ModelEntry[];
  } catch {
    return [];
  }
}

export function saveCustomModels(models: ModelEntry[], vaultPath: string = DEFAULT_VAULT): void {
  const dir = path.join(vaultPath, CLI_RESONANCE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DEFAULT_MODELS_PATH(vaultPath), JSON.stringify(models, null, 2), 'utf8');
}

/**
 * Import a model from a UniversalModelCard-compatible JSON.
 * Extracts: model_info.model_id, model_info.provider, model_info.name
 */
export function importFromModelCard(cardPath: string): ModelEntry | null {
  try {
    const raw = JSON.parse(fs.readFileSync(cardPath, 'utf8'));
    // UniversalModelCard v1.0.0 — extract key fields
    const info = raw?.model_info ?? raw;
    const modelId = info?.model_id ?? info?.id ?? null;
    const provider = info?.provider ?? info?.organization ?? info?.developer ?? null;
    const displayName = info?.name ?? info?.display_name ?? modelId;

    if (!modelId || !provider) return null;
    return { modelId, provider, displayName };
  } catch {
    return null;
  }
}
