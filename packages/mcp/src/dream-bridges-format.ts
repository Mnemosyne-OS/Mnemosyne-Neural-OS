/**
 * dream-bridges-format.ts — what `mnemosyne_dream_bridges` prints.
 *
 * Pulled out of the tool switch so the lines can be tested. Since app 2.0.x
 * (doc 193) each side says how it was found: a side read from a legacy row
 * (every row stored before the scanner kept the vault said `'dev'`) is
 * matched on (id, spine type) and printed "inferred", never as certain. An
 * older app sends no `state`: the line then reads as it always did.
 */
import type { DreamBridge, DreamBridgeEndpoint, DreamBridgesResult } from './ws-client.js';

/** One side: `[id] SPINE (vault:Label, inferred): excerpt`. */
export function sideLine(s: DreamBridgeEndpoint): string {
  const spine = s.spineType || '?';
  const excerpt = s.excerpt ? `: ${s.excerpt}` : '';
  switch (s.state) {
    case undefined:
      return `[${s.chronicleId}] ${spine} (vault:${s.vault})${excerpt}`;
    case 'resolved':
      return `[${s.chronicleId}] ${spine} (vault:${s.vaultLabel ?? s.vault})${excerpt}`;
    case 'inferred':
      return `[${s.chronicleId}] ${spine} (vault:${s.vaultLabel ?? s.vault}, inferred: matched on id and spine, likely not certain)${excerpt}`;
    case 'ambiguous':
      return `[${s.chronicleId}] ${spine} (vault unknown: ${s.candidates ?? 'several'} vaults hold this id and spine, none chosen)`;
    case 'missing':
      return `[${s.chronicleId}] ${spine} (not found in any vault the dream may read)`;
  }
}

function headerLine(b: DreamBridge, i: number): string {
  const parts = [`dbs ${b.dbs.toFixed(3)}`, `cosine ${b.cosine.toFixed(3)}`, b.scannedAt];
  if (b.sightings !== undefined && b.sightings > 1) parts.push(`seen in ${b.sightings} scans`);
  if (b.nearCopy) parts.push('near copy');
  if (b.status && b.status !== 'new') parts.push(`status: ${b.status}`);
  return `### [${i + 1}] ${parts.join(' · ')}`;
}

/** The whole tool answer for a successful call. */
export function formatDreamBridges(result: DreamBridgesResult): string {
  const bridges = result.bridges ?? [];
  const hidden = result.unresolvedHidden ?? 0;
  const hiddenLine = hidden > 0
    ? `_${hidden} more bridge${hidden === 1 ? '' : 's'} left out: a memory could not be found (pass include_unresolved to list them)._`
    : '';
  if (bridges.length === 0) {
    if (hidden > 0) return `# Dream bridges (0)\n\n${hiddenLine}`;
    return 'No dream bridges yet. The Dream State engine has not produced connections: it runs while the machine is idle (enable/force it in Mnemosyne OS Settings → Dream).';
  }
  const rows = bridges.map((b, i) => [
    headerLine(b, i),
    `- **From** ${sideLine(b.from)}`,
    `- **To** ${sideLine(b.to)}`,
  ].join('\n')).join('\n\n');
  const lead = '_Connections Mnemosyne dreamed while idle. Judge insightfulness before acting on them._';
  return `# Dream bridges (${bridges.length})\n\n${lead}${hiddenLine ? `\n${hiddenLine}` : ''}\n\n${rows}`;
}
