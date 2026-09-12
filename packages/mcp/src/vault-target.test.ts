/**
 * vault-target.test.ts — the resolution that unbroke `mnemosyne_vaults` →
 * `mnemosyne_ingest`.
 *
 * The regression these lock down is REAL and was live: ingesting to the exact id
 * that `mnemosyne_vaults` printed returned SCOPE_DENIED, and the message blamed
 * the manifest for a vault that was correctly declared in MNEMO_VAULTS.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toVaultToken, resolveVaultTarget } from './vault-target.js';

/**
 * What the MCP config DECLARES. It carries the three host built-ins because
 * the server declares scopes for them unconditionally — that part is fine.
 */
const DECLARED = ['DEVELOPPEMENT', 'DEV', 'PERSONAL', 'SOCIAL', 'NOTES', 'MNEMOSYNE_OS'];

/**
 * What the host actually exposed on the install where the phantom-destination
 * bug was found (2026-08-31): SOCIAL is mounted, DEV and PERSONAL are not.
 * Every refusal that prints DEV or PERSONAL as somewhere to go is lying.
 */
const PRESENT = ['DEVELOPPEMENT', 'SOCIAL', 'NOTES', 'MNEMOSYNE_OS', 'PDF_INTERNET'];

test('toVaultToken collapses a host id path to its last segment', () => {
  // The exact id `mnemosyne_vaults` printed the day the bug was found.
  assert.equal(
    toVaultToken('c:/users/crypt/documents/infinity/developpement/mnemosyne-os'),
    'MNEMOSYNE_OS',
  );
});

test('toVaultToken accepts Windows backslashes and a trailing separator', () => {
  assert.equal(toVaultToken('C:\\Users\\crypt\\Documents\\infinity\\developpement\\mnemosyne-os'), 'MNEMOSYNE_OS');
  assert.equal(toVaultToken('c:/users/crypt/documents/infinity/notes/'), 'NOTES');
});

test('toVaultToken leaves a bare name alone, aliasing spaces and hyphens', () => {
  assert.equal(toVaultToken('Mnemosyne OS'),  'MNEMOSYNE_OS');
  assert.equal(toVaultToken('mnemosyne-os'),  'MNEMOSYNE_OS');
  assert.equal(toVaultToken('MNEMOSYNE_OS'),  'MNEMOSYNE_OS');
  assert.equal(toVaultToken('DEV'),           'DEV');
});

test('toVaultToken returns empty for nothing usable', () => {
  assert.equal(toVaultToken(''),    '');
  assert.equal(toVaultToken('   '), '');
});

test('resolveVaultTarget accepts the path-shaped id that used to be refused', () => {
  const r = resolveVaultTarget(
    'c:/users/crypt/documents/infinity/developpement/mnemosyne-os',
    DECLARED,
    'DEVELOPPEMENT',
  );
  assert.deepEqual(r, { ok: true, vault: 'MNEMOSYNE_OS' });
});

test('resolveVaultTarget falls back to the deployment default when empty', () => {
  assert.deepEqual(resolveVaultTarget(undefined, DECLARED, 'DEVELOPPEMENT'), { ok: true, vault: 'DEVELOPPEMENT' });
  assert.deepEqual(resolveVaultTarget('',        DECLARED, 'DEVELOPPEMENT'), { ok: true, vault: 'DEVELOPPEMENT' });
});

test('resolveVaultTarget honours a declared token that carries a hyphen', () => {
  // Underscore-aliasing must not HIDE a vault the deployment declared verbatim.
  const declared = ['DEV', 'MY-VAULT'];
  assert.deepEqual(resolveVaultTarget('my-vault', declared, 'DEV'), { ok: true, vault: 'MY-VAULT' });
});

test('resolveVaultTarget refuses locally, naming what is reachable', () => {
  const r = resolveVaultTarget('journal_personnel', DECLARED, 'DEVELOPPEMENT');
  assert.equal(r.ok, false);
  if (r.ok) return;
  // The message must carry BOTH what went wrong and the way out — the old
  // SCOPE_DENIED carried neither.
  assert.match(r.error, /UNREACHABLE_VAULT/);
  assert.match(r.error, /JOURNAL_PERSONNEL/);
  assert.match(r.error, /MNEMOSYNE_OS/);
  assert.match(r.error, /MNEMO_VAULTS/);
});

test('resolveVaultTarget never silently retargets an unreachable vault', () => {
  // The one outcome that would be worse than an error: writing somewhere the
  // human did not ask for. A refusal is the only safe answer.
  const r = resolveVaultTarget('c:/somewhere/else/archipel', DECLARED, 'DEVELOPPEMENT');
  assert.equal(r.ok, false);
});

// ── The destination list a refusal prints ────────────────────────────────────
//
// A refused agent reads that list and goes to the next address on it. So the
// list is a claim about the world, and until 2026-08-31 it was the config's
// wish-list printed under the word "Reachable": DEV and PERSONAL were offered
// on an install that has neither, and the agent tried them.

function refusalOf(r: ReturnType<typeof resolveVaultTarget>): string {
  assert.equal(r.ok, false, 'expected a refusal');
  return r.ok ? '' : r.error;
}

test('a measured refusal offers only vaults that exist', () => {
  const err = refusalOf(resolveVaultTarget('archipel', DECLARED, 'DEVELOPPEMENT', PRESENT));
  // The two phantom destinations must be gone…
  assert.ok(!/\bDEV\b/.test(err),      'DEV is offered but is not mounted on this host');
  assert.ok(!/PERSONAL/.test(err),     'PERSONAL is offered but is not mounted on this host');
  // …and the real ones must survive, or the refusal is a dead end.
  assert.match(err, /MNEMOSYNE_OS/);
  assert.match(err, /SOCIAL/);
});

test('a measured refusal never offers a vault the host has but this MCP is not scoped for', () => {
  // PDF_INTERNET exists on the host and is absent from MNEMO_VAULTS. Naming it
  // as somewhere to go swaps one impossible address for another: the call would
  // die on SCOPE_DENIED instead.
  const err = refusalOf(resolveVaultTarget('archipel', DECLARED, 'DEVELOPPEMENT', PRESENT));
  assert.ok(!/PDF_INTERNET/.test(err), 'offers a vault this server has no scope for');
});

test('an unmeasured census is an UNKNOWN, never an empty world', () => {
  // The host being unreachable says nothing about what it holds. Printing
  // "(none)" here would report a measurement nobody took — the same
  // fabrication as the phantom list, pointed the other way.
  for (const census of [undefined, null]) {
    const err = refusalOf(resolveVaultTarget('archipel', DECLARED, 'DEVELOPPEMENT', census));
    assert.match(err, /NOT verified/i);
    assert.match(err, /MNEMOSYNE_OS/);  // still the best guidance available
    assert.ok(!/Reachable right now/.test(err));
  }
});

test('a declared list that matches nothing says so instead of pointing nowhere', () => {
  const err = refusalOf(resolveVaultTarget('archipel', ['DEV', 'PERSONAL'], 'DEV', PRESENT));
  assert.match(err, /NONE of the vaults/i);
  assert.match(err, /mnemosyne_vaults/);
});

test('presence never widens or narrows what is ACCEPTED', () => {
  // The manifest's scopes come from `declared` alone. A census that lags a
  // freshly mounted vault, or that failed, must not start refusing a vault this
  // server is genuinely scoped for — nor bless one it is not.
  assert.deepEqual(
    resolveVaultTarget('DEV', DECLARED, 'DEVELOPPEMENT', PRESENT),
    { ok: true, vault: 'DEV' },
    'a declared vault absent from the census must still resolve',
  );
  assert.equal(
    resolveVaultTarget('PDF_INTERNET', DECLARED, 'DEVELOPPEMENT', PRESENT).ok,
    false,
    'a vault present on the host but undeclared must still be refused',
  );
});
