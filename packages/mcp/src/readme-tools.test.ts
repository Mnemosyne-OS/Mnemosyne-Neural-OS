/**
 * Drift guard: the README must document every tool the server registers, and
 * the counts in its headings must be the real ones.
 *
 * Why this exists. On 2026-08-31 the README described 8 memory tools under a
 * heading that said 11, while the server had been registering 14 for weeks:
 * `mnemosyne_about`, `mnemosyne_dream_bridges` and `mnemosyne_spine_assignments`
 * were reachable and documented nowhere. An MCP README is not decoration, it is
 * how an agent's operator finds out a tool exists at all, so an undocumented
 * tool is an unused one. Nothing failed, nothing warned: the number was typed by
 * hand next to a list that grew without it.
 *
 * Why it reads the file as TEXT rather than importing the arrays. `index.ts`
 * constructs a server and calls `run()` at module scope, so importing it from a
 * test would start an MCP server on stdio. It also exports nothing. Parsing is
 * the cheap, side-effect-free option, and a drift guard only needs the names.
 *
 * Run: `pnpm --filter @mnemosyne_os/mcp test` (tsx + node:test).
 */

import { test }         from 'node:test';
import assert           from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path             from 'node:path';

const HERE   = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(path.join(HERE, 'index.ts'), 'utf8');
const README = readFileSync(path.join(HERE, '..', 'README.md'), 'utf8');

/** Tool names declared in one `const <NAME> = [...]` block of index.ts. */
function toolsIn(block: string): string[] {
  return [...block.matchAll(/name:\s*'(mnemosyne_[a-z_]+)'/g)].map((m) => m[1]!);
}

// VOICE_TOOLS is declared after TOOLS, so the split separates the two decks.
const [beforeVoice, afterVoice] = SOURCE.split('const VOICE_TOOLS');
assert.ok(afterVoice, 'index.ts no longer declares VOICE_TOOLS — update this guard');

const ALWAYS_ON = toolsIn(beforeVoice!);
const VOICE     = toolsIn(afterVoice);

/** A tool counts as documented when it has its own bolded-code mention. */
const documented = new Set(
  [...README.matchAll(/\*\*`(mnemosyne_[a-z_]+)`\*\*/g)].map((m) => m[1]!),
);

test('the deck is non-empty, so a parse failure cannot pass as a green test', () => {
  assert.ok(ALWAYS_ON.length >= 10, `parsed only ${ALWAYS_ON.length} always-on tools`);
  assert.ok(VOICE.length >= 1, `parsed only ${VOICE.length} voice tools`);
});

test('every registered tool is documented in the README', () => {
  const missing = [...ALWAYS_ON, ...VOICE].filter((t) => !documented.has(t));
  assert.deepEqual(
    missing,
    [],
    `these tools are registered but appear in no README row: ${missing.join(', ')}`,
  );
});

test('the README documents no tool the server does not register', () => {
  const registered = new Set([...ALWAYS_ON, ...VOICE]);
  const ghosts = [...documented].filter((t) => !registered.has(t));
  assert.deepEqual(
    ghosts,
    [],
    `documented but not registered — a reader would call these and get an error: ${ghosts.join(', ')}`,
  );
});

test('the tools heading states the always-on count', () => {
  const m = README.match(/^## The (\d+) tools your agent gets$/m);
  assert.ok(m, 'the "## The N tools your agent gets" heading is gone or was reworded');
  assert.equal(
    Number(m![1]),
    ALWAYS_ON.length,
    `heading says ${m![1]}, the server registers ${ALWAYS_ON.length} without MNEMO_VOICE`,
  );
});

test('the total quoted under that heading includes the voice tools', () => {
  const m = README.match(/for (\d+) in all/);
  assert.ok(m, 'the "for N in all" total is gone or was reworded');
  assert.equal(
    Number(m![1]),
    ALWAYS_ON.length + VOICE.length,
    `total says ${m![1]}, the server registers ${ALWAYS_ON.length + VOICE.length} with MNEMO_VOICE=1`,
  );
});
