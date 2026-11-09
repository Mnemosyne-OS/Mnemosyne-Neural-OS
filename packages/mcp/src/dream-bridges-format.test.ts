/**
 * dream-bridges-format.test.ts — what an agent reads from `mnemosyne_dream_bridges`.
 * An inferred side must say so; an older app (no `state`) prints the old line.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDreamBridges, sideLine } from './dream-bridges-format.js';
import type { DreamBridge } from './ws-client.js';

const bridge = (over: Partial<DreamBridge> = {}): DreamBridge => ({
  id: 1, sessionId: 's', scannedAt: '2026-10-05', dbs: 0.0061, cosine: 0.8,
  from: { chronicleId: 745, spineType: 'IDEATIONAL', vault: 'NOTES', vaultLabel: 'Notes', state: 'inferred', candidates: 1, excerpt: 'an idea about the sea' },
  to:   { chronicleId: 12,  spineType: 'SOURCE_CODE', vault: 'CODE', vaultLabel: 'Code', state: 'resolved', candidates: 1, excerpt: 'a wave simulator' },
  sightings: 1, status: 'new',
  ...over,
});

test('an inferred side names its vault and says it is inferred', () => {
  assert.equal(sideLine(bridge().from),
    '[745] IDEATIONAL (vault:Notes, inferred: matched on id and spine, likely not certain): an idea about the sea');
});

test('a resolved side prints the vault label, without a hedge', () => {
  assert.equal(sideLine(bridge().to), '[12] SOURCE_CODE (vault:Code): a wave simulator');
});

test('ambiguous and missing sides say why there is no text', () => {
  assert.equal(sideLine({ chronicleId: 5, spineType: 'X', vault: 'dev', state: 'ambiguous', candidates: 3 }),
    '[5] X (vault unknown: 3 vaults hold this id and spine, none chosen)');
  assert.equal(sideLine({ chronicleId: 7, spineType: 'X', vault: 'dev', state: 'missing', candidates: 0 }),
    '[7] X (not found in any vault the dream may read)');
});

test('an older app (no state) prints the line it always printed', () => {
  assert.equal(sideLine({ chronicleId: 745, spineType: '', vault: 'dev' }), '[745] ? (vault:dev)');
});

test('each bridge is headed by its scores, sightings and triage', () => {
  const out = formatDreamBridges({ success: true, bridges: [bridge({ sightings: 3, status: 'pinned' })] });
  assert.ok(out.includes('### [1] dbs 0.006 · cosine 0.800 · 2026-10-05 · seen in 3 scans · status: pinned'), out);
  assert.ok(out.includes('- **From** [745] IDEATIONAL (vault:Notes, inferred'), out);
  assert.ok(out.includes('- **To** [12] SOURCE_CODE (vault:Code): a wave simulator'), out);
});

test('the bridges left out are counted, even when none is shown', () => {
  const some = formatDreamBridges({ success: true, bridges: [bridge()], unresolvedHidden: 4 });
  assert.ok(some.includes('_4 more bridges left out: a memory could not be found (pass include_unresolved to list them)._'), some);
  const none = formatDreamBridges({ success: true, bridges: [], unresolvedHidden: 1 });
  assert.ok(none.includes('1 more bridge left out'), none);
  assert.ok(!none.includes('No dream bridges yet'), none);
});

test('an empty ledger still reads as "not dreamed yet"', () => {
  assert.match(formatDreamBridges({ success: true, bridges: [] }), /^No dream bridges yet\./);
});
