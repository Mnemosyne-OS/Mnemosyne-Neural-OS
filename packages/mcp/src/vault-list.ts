/**
 * vault-list.ts — what `mnemosyne_vault_list` prints.
 *
 * Pulled out of the tool switch so the rows can be tested. The description
 * line is doc 99 §2: an agent choosing between vaults on a name and a count
 * chose wrong two times out of three (measured 2026-08-30), and an outside
 * agent read DEVELOPPEMENT as the code vault on 2026-10-24. The host already
 * sent the manifest's description; this list used to drop it.
 */
import type { VaultInfo } from './ws-client.js';
import { toVaultToken, GRANT_RULE } from './vault-target.js';

/** Longest description printed; a longer one is cut and says so. */
export const DESCRIPTION_MAX_CHARS = 400;

/**
 * The manifest's description on one line, or null when there is none.
 * Absent and blank both print nothing: no placeholder stands in for words the
 * owner did not write.
 */
export function descriptionLine(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const flat = raw.replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  return flat.length > DESCRIPTION_MAX_CHARS
    ? `${flat.slice(0, DESCRIPTION_MAX_CHARS).trimEnd()}… (cut at ${DESCRIPTION_MAX_CHARS} characters)`
    : flat;
}

/**
 * Renders the whole answer of `mnemosyne_vault_list`.
 *
 * @param vaults   the host's listing
 * @param declared the tokens this server was configured for (MNEMO_VAULTS)
 */
export function renderVaultList(vaults: VaultInfo[], declared: readonly string[]): string {
  if (vaults.length === 0) return 'No vaults are currently exposed by Mnemosyne OS.';

  const reachable = new Set(declared);
  let outside = 0;
  let reachableUndescribed = 0;
  const rows = vaults.map((v) => {
    const name  = v.name && v.name !== v.id ? ` (${v.name})` : '';
    const count = typeof v.chronicleCount === 'number' ? ` · ${v.chronicleCount} chronicles` : '';
    // The id is a PATH; comparing it uppercased against env-style tokens
    // matched nothing, so this warning used to fire on EVERY vault —
    // including the reachable ones. Compare the derived token instead.
    const token = toVaultToken(String(v.id)) || toVaultToken(String(v.name ?? ''));
    const inGrant = reachable.has(token);
    if (!inGrant) outside++;
    const scope = inGrant ? '' : ' · ⚠️ not reachable by this server (its token is not in MNEMO_VAULTS)';
    const description = descriptionLine(v.description);
    if (inGrant && !description) reachableUndescribed++;
    // "described as", never "holds": the manifest's words, which the owner
    // may have written or the app may have filled from a template (a fresh
    // Développement vault says "Code, projets, GitHub, DevOps"). Not a census.
    const descLine = description ? `\n    described as: ${description}` : '';
    // Governance flags an agent must honor (see mnemosyne_about).
    const gov: string[] = [];
    if (v.protection === 'MAXIMUM') gov.push('🔒 MAXIMUM (private: do not read for cross-vault work, mix, or write unless asked)');
    if (Array.isArray(v.mixableWith) && v.mixableWith.length === 0) gov.push('⛓️ isolated (never blend with other vaults)');
    if (v.visibleInNeuralMap === false && v.protection !== 'MAXIMUM') gov.push('🧪 sandbox/out-of-band (not the user\'s real knowledge)');
    const govLine = gov.length ? `\n    ${gov.join(' · ')}` : '';
    // The TOKEN leads, because the token is what the other tools take.
    // Printing the path-shaped id first is what sent agents into
    // SCOPE_DENIED for years — it looks like the identifier, and is not.
    return `- **${token}**${name}${count}${scope}${descLine}\n    id: \`${v.id}\`${govLine}`;
  }).join('\n');

  // Adding a token is the user's config change, and on an install with no
  // list it also drops DEV, PERSONAL and SOCIAL: say so where it is offered.
  const grantNote = outside > 0 ? ` To reach a ⚠️ vault, the user adds its token to MNEMO_VAULTS and restarts the server. ${GRANT_RULE}` : '';
  const undescribedNote = reachableUndescribed > 0
    ? ` ${reachableUndescribed} reachable vault${reachableUndescribed === 1 ? ' has' : 's have'} no description; the user can write one in the vault's panel in the app.`
    : '';
  return `# Vaults exposed by Mnemosyne OS\n\n${rows}\n\n_Pass the bold **token** above as the \`vault\` argument to mnemosyne_memory_query / mnemosyne_memory_ask / mnemosyne_memory_ingest. The \`id\` line is the host's internal path, shown for reference only. Honor the governance flags; see mnemosyne_about.${undescribedNote}${grantNote}_`;
}
