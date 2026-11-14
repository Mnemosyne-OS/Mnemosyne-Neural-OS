/**
 * vault-list.ts — what `mnemosyne_vault_list` prints.
 *
 * Pulled out of the tool switch so the rows can be tested. The description
 * line is doc 99 §2: an agent choosing between vaults on a name and a count
 * chose wrong two times out of three (measured 2026-08-30), and an outside
 * agent read DEVELOPPEMENT as the code vault on 2026-10-24. The host already
 * sent the manifest's description; this list used to drop it.
 *
 * ONLY THE GRANT IS LISTED (2026-11-10)
 * -------------------------------------
 * The list used to print every vault of the machine, flagging the ones outside
 * MNEMO_VAULTS, each with its description and its path-shaped id. MNEMO_VAULTS
 * stopped the ACCESS, not the listing. Measured through an OpenMausBot bot
 * granted NOTES alone: 25 412 characters came back, and the kept part named
 * 28 vaults, 27 of them unreachable, every one with a path under the user's
 * home and the words its owner wrote about it. All of it went to the model.
 * The remote-agents door already filtered this (doc 167 §3, rule 5); a stdio
 * client (Claude Desktop, Cursor, OpenMausBot) got the whole inventory.
 *
 * Now a vault outside the grant is only counted, and no row prints the id: the
 * token is what every tool takes, and the path says where the user lives.
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
 * Where a vault outside the grant gets reached. Its name is the user's to give:
 * the agent is told the vaults exist, never what they are called.
 */
export const OUTSIDE_GRANT_RULE =
  'To reach one, the user reads its token in the vault panel of the app ' +
  '(the folder name, uppercased, spaces and hyphens as underscores), adds it to ' +
  `MNEMO_VAULTS and restarts the server. ${GRANT_RULE}`;

/** "1 other vault is" / "3 other vaults are", for the count of hidden vaults. */
function vaultsAre(n: number, adjective: string): string {
  return n === 1 ? `1 ${adjective}vault is` : `${n} ${adjective}vaults are`;
}

/**
 * Renders the whole answer of `mnemosyne_vault_list`.
 *
 * Only vaults inside the grant get a row; the others are counted, never named.
 *
 * @param vaults   the host's listing
 * @param declared the tokens this server was configured for (MNEMO_VAULTS)
 */
export function renderVaultList(vaults: VaultInfo[], declared: readonly string[]): string {
  if (vaults.length === 0) return 'No vaults are currently exposed by Mnemosyne OS.';

  const reachable = new Set(declared);
  let outside = 0;
  let reachableUndescribed = 0;
  const rows: string[] = [];
  for (const v of vaults) {
    // The id is a PATH; comparing it uppercased against env-style tokens
    // matched nothing, so the old warning fired on EVERY vault, including the
    // reachable ones. Compare the derived token instead.
    const token = toVaultToken(String(v.id)) || toVaultToken(String(v.name ?? ''));
    if (!reachable.has(token)) {
      outside++;
      continue;
    }
    const name  = v.name && v.name !== v.id ? ` (${v.name})` : '';
    const count = typeof v.chronicleCount === 'number' ? ` · ${v.chronicleCount} chronicles` : '';
    const description = descriptionLine(v.description);
    if (!description) reachableUndescribed++;
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
    // The TOKEN leads, because the token is what the other tools take. The
    // path-shaped id is not printed at all: it sent agents into SCOPE_DENIED
    // for years, and it names the user's home folder.
    rows.push(`- **${token}**${name}${count}${descLine}${govLine}`);
  }

  // Everything but the rows sits in the `_…_` footer, which the remote-agents
  // door drops (filterVaultList in packages/os-actions). The grant is not
  // echoed: behind the door MNEMO_VAULTS is the UNION of every agent's vaults,
  // so printing it would show one agent the vaults granted to another.
  if (rows.length === 0) {
    return `# Vaults reachable by this server\n\n_None: ${vaultsAre(outside, '')} on this machine, all outside this server's grant, so none is listed. ${OUTSIDE_GRANT_RULE}_`;
  }

  const undescribedNote = reachableUndescribed > 0
    ? ` ${reachableUndescribed} reachable vault${reachableUndescribed === 1 ? ' has' : 's have'} no description; the user can write one in the vault's panel in the app.`
    : '';
  // Adding a token is the user's config change, and on an install with no
  // list it also drops DEV, PERSONAL and SOCIAL: OUTSIDE_GRANT_RULE says so.
  const outsideNote = outside > 0
    ? ` ${vaultsAre(outside, 'other ')} on this machine, outside this server's grant, and not listed. ${OUTSIDE_GRANT_RULE}`
    : '';
  return `# Vaults reachable by this server\n\n${rows.join('\n')}\n\n_Pass the bold **token** above as the \`vault\` argument to mnemosyne_memory_query / mnemosyne_memory_ask / mnemosyne_memory_ingest. Honor the governance flags; see mnemosyne_about.${undescribedNote}${outsideNote}_`;
}
