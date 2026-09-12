/**
 * vault-target.ts — turning what an agent SAYS into the vault token the host
 * will actually accept.
 *
 * THE BUG THIS EXISTS TO KILL
 * --------------------------
 * `mnemosyne_vaults` lists vaults by their host id, which is a lowercased
 * absolute path (`toWorkspaceId()` in core-engine: lowercase + forward slashes).
 * Its own description told agents to pass that id back as the `vault` argument.
 * Doing so fails twice over:
 *
 *   1. SCOPE — the host builds the scope string from the raw argument
 *      (`vault:write:<arg>`) and compares it verbatim against this server's
 *      manifest, whose scopes are declared from MNEMO_VAULTS as env-style
 *      TOKENS (`vault:write:MNEMOSYNE_OS`). A path is never equal to a token,
 *      so every such call died on SCOPE_DENIED — including for vaults that were
 *      correctly listed in MNEMO_VAULTS all along.
 *   2. RESOLUTION — even past the scope check, the host uppercases the argument
 *      and looks it up in a map keyed by display name and by LAST PATH SEGMENT
 *      (each with a `[-\s]` → `_` alias). A full path is not a key there either,
 *      so it would have been UNKNOWN_VAULT.
 *
 * So the id was unusable as a target in two independent ways, and the error the
 * agent saw pointed at neither. This module mirrors the host's own aliasing
 * rules so that ANY reasonable spelling — the listed id, the display name, the
 * folder name, the declared token — lands on the one token that satisfies both
 * the scope check and the lookup.
 *
 * It is deliberately PURE and synchronous: no host round-trip, because the last
 * path segment is derivable from the path itself. Nothing to cache, nothing to
 * invalidate, and it stays testable without a running app.
 */

/**
 * Normalizes any vault spelling to the host's token form.
 *
 * Mirrors core-engine `toWorkspaceId` (backslashes → slashes) and the app's
 * `getCustomVaults` aliasing (uppercase, spaces/hyphens → underscore).
 *
 * @param raw - a path, a display name, a folder name, or an env-style token
 * @returns the uppercase underscore token, or '' when `raw` holds nothing usable
 */
export function toVaultToken(raw: string): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '';

  // A path collapses to its last non-empty segment — that is what the host
  // indexes. Anything without a separator is already a name.
  const normalized = trimmed.replace(/\\/g, '/');
  const segment = normalized.includes('/')
    ? (normalized.split('/').filter(Boolean).pop() ?? '')
    : normalized;

  return segment.toUpperCase().replace(/[-\s]/g, '_');
}

export type VaultResolution =
  | { ok: true;  vault: string }
  | { ok: false; error: string };

/**
 * The refusal for a PERMANENT write that named no vault, on a deployment that
 * declared no default either.
 *
 * THE BUG THIS EXISTS TO KILL
 * --------------------------
 * `DEV` is not a vault. The host resolves it to
 * `vaultManager.getActiveSubVaults()[0]` — whichever sub-vault happens to be
 * first in a Map, i.e. whichever mounted first this boot. And `DEV` is a
 * built-in, so it sails past the host's own UNKNOWN_VAULT guard: an ingest
 * targeting it does not fail, does not warn, and lands permanently in an
 * arbitrary vault whose name nobody ever saw.
 *
 * That was the fallback for every install with no MNEMO_DEFAULT_VAULT in its
 * config, which is every install nobody configured.
 *
 * Reads keep the tolerant fallback on purpose — the same asymmetry pulse-router
 * settled on. A read from the wrong vault returns visibly wrong-scoped results
 * and is recoverable; a write contaminates memory that is never deleted.
 */
export function refuseUndeclaredWriteTarget(
  declared: readonly string[],
  present:  readonly string[] | null | undefined,
): string {
  return (
    `NO_WRITE_TARGET: this ingest named no vault, and this MCP server's config declares no default ` +
    `(MNEMO_DEFAULT_VAULT is unset). Ingest is PERMANENT, so it will not guess: the built-in name "DEV" ` +
    `is not a vault, it resolves to whichever sub-vault mounted first, which is not a place anyone chose. ` +
    `${reachableLine(declared, present)} ` +
    `Pass one explicitly as \`vault\`, or set MNEMO_DEFAULT_VAULT in the MCP server config and restart it. ` +
    `Call mnemosyne_vaults if you need to see what each one holds first.`
  );
}

/**
 * Builds the "here is where you CAN go" half of a refusal.
 *
 * THE BUG THIS EXISTS TO KILL
 * --------------------------
 * The refusal used to print `declared` verbatim under the label "Reachable
 * vaults". `declared` is what the MCP's config ASKED for — it is not a census.
 * On the install where this was found it contained DEV and PERSONAL, which do
 * not exist on that host at all. So an agent that had just been refused one
 * vault was handed two addresses that cannot work, under a word that says they
 * can, and its next move is to try them.
 *
 * A list of destinations is a claim about the world. It has to be measured.
 *
 * @param declared - the tokens this server declared scopes for
 * @param present  - the tokens the host actually exposes, or `null`/`undefined`
 *                   when nobody could measure (host down, listing failed)
 */
function reachableLine(
  declared: readonly string[],
  present:  readonly string[] | null | undefined,
): string {
  if (declared.length === 0) {
    return 'This MCP server declares no vault at all — MNEMO_VAULTS is empty in its config.';
  }

  // An unknown is not a zero. A host that did not answer tells us nothing about
  // what exists, and answering "(none)" here would report a measurement that
  // was never taken — the same fabrication, pointed the other way.
  if (!present) {
    return `Declared in this MCP's config, but NOT verified against the host (it did not answer): ` +
           `${declared.join(', ')}. Call mnemosyne_vaults for the live list.`;
  }

  const live = new Set(present);
  const both = declared.filter(v => live.has(v));
  if (both.length > 0) return `Reachable right now: ${both.join(', ')}.`;

  return `NONE of the vaults this MCP declares (${declared.join(', ')}) exists on the host. ` +
         `Call mnemosyne_vaults to see what does.`;
}

/**
 * Resolves a requested vault to a token this server is allowed to reach.
 *
 * Refusing HERE is deliberate. The manifest's scopes are generated from
 * `declared`, so a token outside that set is guaranteed to come back as
 * SCOPE_DENIED from the host — an error that names neither what was wrong nor
 * what to do. A local refusal can say both.
 *
 * What it accepts is governed by `declared` ALONE, never by `present`: the
 * manifest's scopes are built from `declared`, and a host census that failed
 * (or that lags a vault mounted a second ago) must not turn into a local
 * refusal for a vault this server is genuinely scoped for. `present` only
 * shapes the wording of a refusal that has already been decided.
 *
 * @param raw - what the agent passed; empty/undefined falls back to `fallback`
 * @param declared - the tokens this server declared scopes for (uppercase)
 * @param fallback - the deployment default, used when `raw` is empty
 * @param present - tokens the host actually exposes; omit/`null` when unmeasured
 */
export function resolveVaultTarget(
  raw: string | undefined,
  declared: readonly string[],
  fallback: string,
  present?: readonly string[] | null,
): VaultResolution {
  const requested = (raw ?? '').trim();
  if (!requested) return { ok: true, vault: fallback };

  const known = new Set(declared);
  const token = toVaultToken(requested);

  // The aliased token first, then the un-aliased uppercase: a deployment is
  // free to declare a token that legitimately carries a hyphen, and collapsing
  // it to an underscore would then hide a vault that IS reachable.
  const plain = requested.replace(/\\/g, '/').includes('/')
    ? (requested.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? '').toUpperCase()
    : requested.toUpperCase();

  for (const candidate of [token, plain]) {
    if (candidate && known.has(candidate)) return { ok: true, vault: candidate };
  }

  return {
    ok: false,
    error:
      `UNREACHABLE_VAULT: "${requested}" resolves to "${token || requested}", which this MCP server ` +
      `has no scope for. ${reachableLine(declared, present)} ` +
      `Pass the vault TOKEN (folder name, uppercased, spaces and hyphens as underscores) — not the ` +
      `path-shaped id. If this vault should be reachable, add its token to MNEMO_VAULTS in the MCP ` +
      `server config and restart it.`,
  };
}
