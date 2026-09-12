/**
 * Tests for the agent-facing covenant (the self-description surfaced as MCP
 * `instructions` + the `mnemosyne_about` tool). These lock the load-bearing
 * governance content: an accidental edit that drops the tenet, the protection
 * rules, or the sandbox principle would silently un-brief every agent.
 *
 * Run: `pnpm --filter @mnemosyne_os/mcp test` (tsx + node:test).
 */

import { test } from 'node:test';
import assert    from 'node:assert/strict';
import { MNEMOSYNE_ABOUT, renderCovenant } from './covenant.js';

test('renderCovenant carries the identity, tenet, protection and sandbox principle', () => {
  const out = renderCovenant({ defaultVault: 'DEV', declaredVaults: ['DEV', 'NOTES', 'RESEARCH'] });

  assert.match(out, /Mnemosyne OS/);
  // Governance tenet — the non-negotiable line.
  assert.match(out, /the human governs/i);
  assert.match(out, /never silently deletes/i);
  // Vault protection model the agent must honor.
  assert.match(out, /MAXIMUM/);
  assert.match(out, /mixableWith/);
  assert.match(out, /visibleInNeuralMap/);
  // The sandbox principle (slice-2 write model).
  assert.match(out, /sandbox/i);
  assert.match(out, /only the human/i);
});

/** The one line that lists the non-default vaults, or a throw if it moved. */
function scopedLine(out: string): string {
  const line = out.split('\n').find(l => l.startsWith('- Vaults this MCP is scoped for'));
  // A split that quietly yields '' turns every assertion below into a
  // tautology. If the label is renamed, this test must fail loudly, not pass
  // by measuring nothing.
  assert.ok(line, 'the scoped-vaults line is gone or was renamed');
  return line;
}

test('renderCovenant injects this install\'s vault layout', () => {
  const out = renderCovenant({ defaultVault: 'DEVELOPPEMENT', declaredVaults: ['DEVELOPPEMENT', 'NOTES'] });
  assert.match(out, /Default vault: \*\*DEVELOPPEMENT\*\*/);
  assert.match(out, /\*\*NOTES\*\*/);
  // The default vault must not also be listed among the others.
  assert.ok(!scopedLine(out).includes('DEVELOPPEMENT'));
});

test('renderCovenant handles a single-vault install without dangling "others"', () => {
  const out = renderCovenant({ defaultVault: 'DEV', declaredVaults: ['DEV'] });
  assert.match(scopedLine(out), /\(none\)/);
});

test('renderCovenant never calls the config list "reachable"', () => {
  // This text is rendered at connect time, before any host contact. It cannot
  // know what is mounted, so it must not use a word that says it does — that
  // is what offered DEV and PERSONAL on an install that has neither.
  const out = renderCovenant({ defaultVault: 'DEVELOPPEMENT', declaredVaults: ['DEVELOPPEMENT', 'DEV', 'PERSONAL'] });
  assert.ok(!/reachable/i.test(out), 'the covenant claims reachability it has not measured');
  // And it must point at the tool that CAN measure.
  assert.match(out, /mnemosyne_vaults/);
});

test('MNEMOSYNE_ABOUT exposes the structured facts used by the renderer', () => {
  assert.equal(MNEMOSYNE_ABOUT.name, 'Mnemosyne OS');
  assert.ok(MNEMOSYNE_ABOUT.rules.length >= 5);
  assert.match(MNEMOSYNE_ABOUT.governanceTenet, /human governs/i);
  assert.ok('MAXIMUM' in MNEMOSYNE_ABOUT.vaultProtection.protection);
});
