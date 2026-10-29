/**
 * vault-list.test.ts — `mnemosyne_vault_list` prints what each vault holds.
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
