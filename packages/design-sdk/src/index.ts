/**
 * @mnemosyne_os/design-sdk — index.ts
 *
 * Standalone TypeScript entry point for the Design SDK package.
 * Exports only the types and validation logic — zero runtime deps,
 * no React, no localStorage.
 *
 * Consumers (designers, third-party tools) can use this to:
 *   - Type-check their skin JSON against SkinManifest
 *   - Validate manifests before import into Mnemosyne OS
 *   - Build custom skin editors / generators
 *
 * Architecture IRINA — Phase 62 / DR-011→014
 */

// ── Re-export core types ──────────────────────────────────────────────────────

export type { SkinManifest, SkinTokens } from './types.js';
export { ALLOWED_TOKENS, MNEMO_DEFAULT_SKIN, BUILT_IN_SKINS } from './built-ins.js';
export { validateSkinManifest } from './validate.js';
export type { ValidationResult } from './validate.js';

// ── Package metadata ──────────────────────────────────────────────────────────

export const DESIGN_SDK_VERSION = '0.1.0';
export const DESIGN_SDK_PHASE   = 'Phase 62';
export const TOKEN_COUNT        = 36;
