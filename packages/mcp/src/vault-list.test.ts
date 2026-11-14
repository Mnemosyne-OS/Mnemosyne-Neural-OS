/**
 * vault-list.test.ts — `mnemosyne_vault_list` prints what each reachable vault
 * holds, and nothing about the others but how many there are.
 *
 * The host sent the manifest's description all along and the list dropped it,
 * so an agent chose on a name and a count (doc 99 §2).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descriptionLine, renderVaultList, DESCRIPTION_MAX_CHARS } from './vault-list.js';

const NOTES_ID = 'c:/users/me/documents/infinity/notes';
const DEV_ID   = 'c:/users/me/documents/infinity/developpement';

test('a described vault prints its description under its token', () => {
  const out = renderVaultList(
    [{ id: NOTES_ID, name: 'Notes', chronicleCount: 1100, description: 'Every architecture doc, split by heading.' }],
    ['NOTES'],
  );
  const row = out.split('\n').findIndex(l => l.startsWith('- **NOTES**'));
  assert.ok(row >= 0, out);
  assert.equal(out.split('\n')[row + 1], '    described as: Every architecture doc, split by heading.');
});

test('absent and blank descriptions print no line, and the footer counts reachable ones', () => {
  const out = renderVaultList(
    [
      { id: NOTES_ID, name: 'Notes' },
      { id: DEV_ID, name: 'Développement', description: '   ' },
      { id: 'c:/users/me/documents/infinity/fleurs', name: 'Fleurs' },
    ],
    ['NOTES', 'DEVELOPPEMENT'],
  );
  assert.ok(!out.includes('described as:'), out);
  // FLEURS is outside the grant: an agent cannot use it, so it is not counted.
  assert.match(out, / 2 reachable vaults have no description;/);
});

test('every reachable vault described: no footer about descriptions', () => {
  const out = renderVaultList([{ id: NOTES_ID, description: 'Architecture.' }], ['NOTES']);
  assert.ok(!out.includes('no description'), out);
});

test('a multi-line description is flattened to one line', () => {
  assert.equal(descriptionLine('Git history\n\n  only.\t'), 'Git history only.');
});

test('a too long description is cut and says so', () => {
  const line = descriptionLine('x'.repeat(DESCRIPTION_MAX_CHARS + 50))!;
  assert.ok(line.startsWith('x'.repeat(DESCRIPTION_MAX_CHARS)));
  assert.ok(line.endsWith(`(cut at ${DESCRIPTION_MAX_CHARS} characters)`));
});

test('a non-string description prints nothing', () => {
  assert.equal(descriptionLine(undefined), null);
  assert.equal(descriptionLine(42), null);
});

// Measured 2026-11-10 through an OpenMausBot bot granted NOTES alone: the list
// named 27 unreachable vaults, each with its owner's description and a path
// under the user's home. MNEMO_VAULTS stopped the access, not the listing.
const JOURNAL = { id: 'c:/users/me/documents/infinity/journal-intime', name: 'Journal intime', chronicleCount: 40, description: 'My private diary.' };

test('a vault outside the grant leaves no token, name, description or path, only a count', () => {
  const out = renderVaultList([{ id: NOTES_ID, name: 'Notes', description: 'Architecture.' }, JOURNAL], ['NOTES']);
  for (const leak of ['JOURNAL_INTIME', 'Journal intime', 'My private diary', 'journal-intime'])
    assert.ok(!out.includes(leak), `"${leak}" leaked: ${out}`);
  assert.match(out, / 1 other vault is on this machine, outside this server's grant, and not listed\./);
  assert.match(out, /vault panel of the app/);
});

test('no row prints the path-shaped id, reachable vaults included', () => {
  const out = renderVaultList([{ id: NOTES_ID, name: 'Notes' }, { id: DEV_ID, name: 'Développement' }], ['NOTES', 'DEVELOPPEMENT']);
  assert.ok(out.includes('**NOTES**') && out.includes('**DEVELOPPEMENT**'), out);
  assert.ok(!out.includes('c:/users') && !/^\s+id:/m.test(out), `a path is printed: ${out}`);
});

test('every vault outside the grant: a count, and the grant is not echoed', () => {
  // Behind the remote-agents door MNEMO_VAULTS is the union of every agent's
  // vaults: echoing it would show one agent another's grant.
  const out = renderVaultList([JOURNAL, { id: NOTES_ID, name: 'Notes' }], ['GROKBOT', 'SECRET_OF_ANOTHER_AGENT']);
  assert.match(out, /_None: 2 vaults are on this machine, all outside this server's grant, so none is listed\./);
  for (const leak of ['GROKBOT', 'SECRET_OF_ANOTHER_AGENT', 'JOURNAL_INTIME', 'NOTES', 'c:/users'])
    assert.ok(!out.includes(leak), `"${leak}" leaked: ${out}`);
});

test('a grant covering every vault adds no line about hidden vaults', () => {
  const out = renderVaultList([{ id: NOTES_ID, name: 'Notes', description: 'Architecture.' }], ['NOTES']);
  assert.ok(!out.includes('not listed') && !out.includes('vault panel of the app'), out);
});
