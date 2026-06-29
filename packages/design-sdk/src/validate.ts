/**
 * validate.ts — Skin manifest validation
 *
 * Mirrors validateSkinManifest() from apps/dev-edition/src/renderer/src/lib/skin-registry.ts
 * but as a standalone module with zero runtime dependencies (DR-014).
 *
 * Used by:
 *   - scripts/skin-validate.mjs (CLI)
 *   - packages/design-sdk (npm package)
 *   - skin-registry.ts (internal, has its own copy for bundle isolation)
 */

import type { SkinManifest, SkinTokens } from './types.js';
import { ALLOWED_TOKENS } from './built-ins.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ValidationResult =
  | { ok: true;  skin: SkinManifest }
  | { ok: false; error: string };

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validates a skin manifest against the Design SDK contract.
 *
 * Rules:
 * - `id` must be a non-empty string with no whitespace
 * - `id` cannot be `'mnemo-default'` (reserved, DR-013)
 * - `name` must be a non-empty string
 * - `version` must be a string
 * - `tokens` must be a plain object (not array, not null)
 * - All token keys must start with `--`
 * - All token keys must be in `ALLOWED_TOKENS`
 * - All token values must be strings
 *
 * Returns the validated and normalized `SkinManifest` on success.
 * Returns a human-readable error message on failure.
 *
 * [DR-014]
 */
export function validateSkinManifest(raw: unknown): ValidationResult {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, error: 'Manifest must be a JSON object' };
  }

  const m = raw as Record<string, unknown>;

  if (typeof m['id'] !== 'string' || !m['id'].trim()) {
    return { ok: false, error: 'Missing or invalid "id" field (must be non-empty string)' };
  }
  if (/\s/.test(m['id'] as string)) {
    return { ok: false, error: `"id" must not contain spaces: "${m['id']}"` };
  }
  if (m['id'] === 'mnemo-default') {
    return { ok: false, error: '"mnemo-default" is a reserved skin ID and cannot be overridden' };
  }
  if (typeof m['name'] !== 'string' || !m['name'].trim()) {
    return { ok: false, error: 'Missing or invalid "name" field' };
  }
  if (typeof m['version'] !== 'string') {
    return { ok: false, error: 'Missing or invalid "version" field' };
  }
  if (typeof m['tokens'] !== 'object' || m['tokens'] === null || Array.isArray(m['tokens'])) {
    return { ok: false, error: '"tokens" must be a JSON object' };
  }

  const tokens = m['tokens'] as Record<string, unknown>;

  for (const [key, value] of Object.entries(tokens)) {
    if (!key.startsWith('--')) {
      return { ok: false, error: `Invalid token key "${key}" — must start with "--"` };
    }
    if (!ALLOWED_TOKENS.has(key)) {
      return { ok: false, error: `Unknown token "${key}" — not in the SDK allowlist` };
    }
    if (typeof value !== 'string') {
      return { ok: false, error: `Token "${key}" value must be a string, got ${typeof value}` };
    }
  }

  return {
    ok: true,
    skin: {
      id:          (m['id'] as string).trim(),
      name:        (m['name'] as string).trim(),
      version:     (m['version'] as string).trim(),
      author:      typeof m['author'] === 'string' ? m['author'].trim() : undefined,
      description: typeof m['description'] === 'string' ? m['description'].trim() : undefined,
      preview:     typeof m['preview'] === 'string' ? m['preview'] : undefined,
      tokens:      tokens as Partial<SkinTokens>,
    },
  };
}
