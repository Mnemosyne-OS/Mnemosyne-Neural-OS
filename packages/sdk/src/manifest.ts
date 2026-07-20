/**
 * @mnemosyne/sdk — AppManifest Validator
 *
 * Validates the app.manifest.json file before any connection.
 * Uses Zod for strict parsing — no unknown field is passed to the server.
 *
 * ## Zero-Trust Rule (MN-004)
 * The user GRANT is ALWAYS required if the app declares a vault:* scope.
 * This is NOT a flag the app controls — the OS decides by reading the scopes.
 * A manifest with `requires_grant: false` but `scopes: ['vault:read:DEV']` MUST
 * still go through the consent popup. The OS calls `requiresOsGrant(manifest)`.
 *
 * [SDK][ZERO-TRUST][AUDIT-TRAIL][MN-004]
 */

import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AppManifest } from './types.js';

// ── Zod Schema ────────────────────────────────────────────────────────────────

// ── Scopes ──────────────────────────────────────────────────────────────────

const VALID_SCOPES = [
  'vault:read:DEV',      'vault:write:DEV',
  'vault:read:SOCIAL',   'vault:write:SOCIAL',
  'vault:read:PERSONAL', 'vault:write:PERSONAL',
  'vault:read:FINANCE',  'vault:write:FINANCE',
  'vault:read:RESEARCH',  'vault:write:RESEARCH',
  /** Wildcard: grants r/w to any user-created custom vault. */
  'vault:read:CUSTOM',   'vault:write:CUSTOM',
  'share:request',       'share:grant',
  'monorepo:read',
  'agents:read',
  'nft:validate',
  'neural:graph:read',
  'llm:query',
  // [PHASE-58] Read-only access to Perpetual Memory Bridges
  'bridge:read',
] as const;

/**
 * Scopes that ALWAYS require a user GRANT on the OS side.
 * Independent of any flag declared by the app.
 * [MN-004]
 */
export const GRANT_REQUIRED_SCOPE_PREFIXES = [
  'vault:read:', 'vault:write:',
  'share:request', 'share:grant',
  'llm:query',
] as const;

const VALID_INTENTS  = ['INGEST', 'QUERY', 'CORRELATE', 'FORGET', 'GIT_LOG', 'LIST_AGENTS', 'LIST_VAULTS', 'BRIDGE_READ'] as const;
/**
 * Core vault identifiers used for Zod validation.
 * Custom vaults are allowed via a passthrough — they are validated at
 * runtime by the OS when the app calls `sdk.vaults.list`.
 */
const VALID_VAULTS   = ['DEV', 'SOCIAL', 'PERSONAL', 'FINANCE', 'RESEARCH'] as const;
const SEMVER_RE      = /^\d+\.\d+\.\d+/;
const APP_ID_RE      = /^[a-z0-9][a-z0-9_-]{1,63}$/;

export const AppManifestSchema = z.object({
  id: z.string().regex(APP_ID_RE, {
    message: 'id must be lowercase alphanumeric with hyphens/underscores, 2-64 chars',
  }),
  name: z.string().min(2).max(64),
  version: z.string().regex(SEMVER_RE, { message: 'version must be SemVer (e.g. 1.0.0)' }),
  author: z.string().max(64).optional(),
  mnemosyne_sdk: z.string().regex(/^\^?\d+\.\d+\.\d+/, {
    message: 'mnemosyne_sdk must be a SemVer range (e.g. ^1.0.0)',
  }),
  scopes: z.array(z.enum(VALID_SCOPES)).min(1, {
    message: 'At least one scope required — apps with no scopes have no access',
  }),
  /**
   * Vaults the app can access.
   * Core vaults must use the built-in identifiers (DEV, SOCIAL, etc.).
   * Custom vault IDs are opaque uppercase strings — the manifest may list them
   * here to pre-declare intent, and the OS validates them at runtime.
   */
  vaults: z.array(z.union([z.enum(VALID_VAULTS), z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/, 'Custom vault ID must be UPPER_SNAKE_CASE')])).min(1),
  intents: z.array(z.enum(VALID_INTENTS)).min(1),
  max_chronicle_size_kb: z.number().int().min(1).max(1024).optional().default(64),
  /**
   * @deprecated Replaced by requiresOsGrant() — this flag has no effect on security.
   * The OS always decides based on the declared scopes (MN-004).
   */
  requires_consent: z.boolean().optional().default(false),
  description: z.string().max(256).optional(),
});
// Note: no .strict() — the MnemoStore manifest may have additional fields
// (uiMode, uiEntryPoint, etc.). The SDK validates only its own fields.

// ── Utility functions ─────────────────────────────────────────────────────────

/**
 * Loads and validates a manifest from the filesystem.
 * @throws {Error} if the manifest is invalid or not found
 */
export function loadManifest(pathOrManifest: string | AppManifest): AppManifest {
  if (typeof pathOrManifest === 'string') {
    const absPath = resolve(pathOrManifest);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(absPath, 'utf-8'));
    } catch {
      throw new Error(`[MnemoSDK] Cannot read manifest at: ${absPath}`);
    }
    return parseManifest(raw);
  }
  return parseManifest(pathOrManifest);
}

/**
 * Parses and validates a raw manifest object.
 * @throws {Error} with detail of the Zod violations
 */
export function parseManifest(raw: unknown): AppManifest {
  const result = AppManifestSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map(i => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`[MnemoSDK] Invalid app.manifest.json:\n${issues}`);
  }
  return result.data as AppManifest;
}

/**
 * Validates that a scope is declared in the manifest.
 * Used by MnemoClient before each vault operation.
 *
 * For custom vault operations, the scope `vault:read:CUSTOM` or
 * `vault:write:CUSTOM` is accepted as a wildcard that grants access
 * to any custom vault listed in `manifest.vaults`.
 */
export function assertScope(manifest: AppManifest, scope: (typeof VALID_SCOPES)[number]): void {
  // Custom vault wildcard: vault:read:CUSTOM covers vault:read:<anyCustom>
  if (scope.startsWith('vault:read:') && !['DEV','SOCIAL','PERSONAL','FINANCE','RESEARCH'].includes(scope.split(':')[2] ?? '')) {
    if (manifest.scopes.includes('vault:read:CUSTOM')) return;
  }
  if (scope.startsWith('vault:write:') && !['DEV','SOCIAL','PERSONAL','FINANCE','RESEARCH'].includes(scope.split(':')[2] ?? '')) {
    if (manifest.scopes.includes('vault:write:CUSTOM')) return;
  }
  if (!manifest.scopes.includes(scope)) {
    throw new Error(
      `[MnemoSDK] Scope "${scope}" not declared in manifest for app "${manifest.id}". ` +
      `Add it to manifest.scopes to request this permission.`
    );
  }
}

/**
 * Verifies that a vault is accessible according to the manifest.
 */
export function assertVault(manifest: AppManifest, vault: string): void {
  if (!(manifest.vaults as string[]).includes(vault)) {
    throw new Error(
      `[MnemoSDK] Vault "${vault}" not in manifest.vaults for app "${manifest.id}".`
    );
  }
}

/**
 * [MN-004] Determines whether the OS MUST show a user consent popup
 * BEFORE allowing this app to run.
 *
 * The decision is based ONLY on the scopes declared in the manifest.
 * It is impervious to any flag (`requires_grant`, `requires_consent`) that
 * the app could control itself.
 *
 * Rule: any scope with prefix `vault:*`, `share:*` or `llm:query` → GRANT required.
 *
 * @example
 * ```typescript
 * import { requiresOsGrant } from '@mnemosyne_os/sdk';
 * // In LAUNCH_LAYER2_APP (main process):
 * if (requiresOsGrant(appManifest)) {
 *   const granted = await showPermissionPrompt(appManifest);
 *   if (!granted) return { success: false, error: 'GRANT_DENIED' };
 * }
 * ```
 */
export function requiresOsGrant(manifest: Pick<AppManifest, 'scopes'>): boolean {
  return manifest.scopes.some(scope =>
    GRANT_REQUIRED_SCOPE_PREFIXES.some(prefix => scope.startsWith(prefix))
  );
}
