/**
 * vault-target.test.ts — the resolution that unbroke `mnemosyne_vault_list` →
 * `mnemosyne_memory_ingest`.
 *
 * The regression these lock down is REAL and was live: ingesting to the exact id
 * that `mnemosyne_vault_list` printed returned SCOPE_DENIED, and the message blamed
 * the manifest for a vault that was correctly declared in MNEMO_VAULTS.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toVaultToken, resolveVaultTarget, vaultGrant, vaultForHostDefault } from './vault-target.js';

/**
 * What the MCP config DECLARES on an install with no MNEMO_VAULTS list, the
 * case where the three host built-ins are declared too.
 */
const DECLARED = ['DEVELOPPEMENT', 'DEV', 'PERSONAL', 'SOCIAL', 'NOTES', 'MNEMOSYNE_OS'];

/**
 * What the host actually exposed on the install where the phantom-destination
 * bug was found (2026-08-31): SOCIAL is mounted, DEV and PERSONAL are not.
 * Every refusal that prints DEV or PERSONAL as somewhere to go is lying.
 */
const PRESENT = ['DEVELOPPEMENT', 'SOCIAL', 'NOTES', 'MNEMOSYNE_OS', 'PDF_INTERNET'];

test('toVaultToken collapses a host id path to its last segment', () => {
  // The exact id `mnemosyne_vault_list` printed the day the bug was found.
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
  assert.match(err, /mnemosyne_vault_list/);
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

// ── The grant: what MNEMO_VAULTS lets this server reach ────────────────────────

test('a set list is exactly those vaults: the reserved names are not added', () => {
  // The bug: MNEMO_VAULTS=NOTES still declared DEV, PERSONAL and SOCIAL, so
  // leaving the personal vault out for an autonomous agent protected nothing.
  const g = vaultGrant({ MNEMO_VAULTS: 'NOTES,RESEARCH' });
  assert.deepEqual(g.declared, ['NOTES', 'RESEARCH']);
  assert.equal(g.listed, true);
  assert.equal(resolveVaultTarget('PERSONAL', g.declared, g.defaultVault).ok, false, 'PERSONAL is still reachable');
  assert.equal(resolveVaultTarget('DEV', g.declared, g.defaultVault).ok, false, 'DEV is still reachable');
});

test('with no default named, an unnamed call lands inside the list', () => {
  const g = vaultGrant({ MNEMO_VAULTS: 'NOTES,RESEARCH' });
  assert.equal(g.defaultVault, 'NOTES');
  assert.equal(g.defaultDeclared, false, 'a fallback must not unlock unnamed writes (refuseUndeclaredWriteTarget)');
});

test('a named default joins the list, in front', () => {
  const g = vaultGrant({ MNEMO_DEFAULT_VAULT: 'agent_work', MNEMO_VAULTS: 'notes' });
  assert.deepEqual(g.declared, ['AGENT_WORK', 'NOTES']);
  assert.equal(g.defaultVault, 'AGENT_WORK');
  assert.equal(g.defaultDeclared, true);
});

test('no list keeps the declaration every install had before 2.1.3', () => {
  assert.deepEqual(vaultGrant({}).declared, ['DEV', 'PERSONAL', 'SOCIAL']);
  assert.equal(vaultGrant({}).defaultVault, 'DEV');
  assert.deepEqual(vaultGrant({ MNEMO_DEFAULT_VAULT: 'NOTES' }).declared, ['NOTES', 'DEV', 'PERSONAL', 'SOCIAL']);
});

test('an empty list is no list, because the .mcpb passes "" for a blank field', () => {
  assert.equal(vaultGrant({ MNEMO_VAULTS: '' }).listed, false);
  assert.equal(vaultGrant({ MNEMO_VAULTS: ' , ' }).listed, false);
  assert.deepEqual(vaultGrant({ MNEMO_VAULTS: ' , ' }).declared, ['DEV', 'PERSONAL', 'SOCIAL']);
});

test('an empty default falls back instead of declaring an empty vault', () => {
  // Before 2.1.3, MNEMO_DEFAULT_VAULT="" gave a default of "" and a scope "vault:read:".
  assert.equal(vaultGrant({ MNEMO_DEFAULT_VAULT: '' }).defaultVault, 'DEV');
  assert.equal(vaultGrant({ MNEMO_DEFAULT_VAULT: '  ', MNEMO_VAULTS: 'NOTES' }).defaultVault, 'NOTES');
});

test('a grant without DEV never leans on the host default, which needs DEV', () => {
  assert.equal(vaultForHostDefault(vaultGrant({})), undefined, 'the host default stays the host default');
  assert.equal(vaultForHostDefault(vaultGrant({ MNEMO_VAULTS: 'NOTES' })), 'NOTES');
  assert.equal(vaultForHostDefault(vaultGrant({ MNEMO_VAULTS: 'DEV,NOTES' })), undefined);
});

test('a refusal says the list is the whole grant once set', () => {
  // Adding one token to an install with no list drops DEV, PERSONAL and SOCIAL.
  const r = resolveVaultTarget('ARCHIPEL', ['NOTES'], 'NOTES');
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /whole grant/);
});
