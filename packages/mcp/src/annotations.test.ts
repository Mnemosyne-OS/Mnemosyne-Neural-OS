/**
 * Drift guard: every tool the server registers must DECLARE what it does to the
 * human's machine, and the declaration must be the shape a client reads.
 *
 * Why this exists. Anthropic's software directory refuses a submission whose
 * tools carry no `title` and no applicable `readOnlyHint` / `destructiveHint`,
 * and a client uses those hints to decide whether a call can run without
 * stopping to ask. Both matter more here than in most servers: this one reaches
 * a person's memory, their backlog and their calendar, and three of its tools
 * can take something away that has no archive.
 *
 * The failure this catches is a new tool shipping unlisted. Nothing would break
 * — `annotated()` leaves an unknown tool alone by design, because guessing
 * `readOnlyHint: true` on a writer is the one outcome worse than saying nothing.
 * So the gap is silent, and silence is exactly what a drift test is for.
 *
 * Why it reads `index.ts` as TEXT for the names. That module builds a server and
 * calls `run()` at import time, so a test cannot import it. The table itself
 * lives in `annotations.ts`, which is why the rest of this file exercises the
 * real function instead of a regex. Same split, same reason, as
 * `readme-tools.test.ts`.
 *
 * Run: `pnpm --filter @mnemosyne_os/mcp test` (tsx + node:test).
 */

import { test }          from 'node:test';
import assert            from 'node:assert/strict';
import { readFileSync }  from 'node:fs';
import { fileURLToPath } from 'node:url';
import path              from 'node:path';

import {
  TOOL_TITLES,
  READ_ONLY_TOOLS,
  DESTRUCTIVE_TOOLS,
  annotated,
} from './annotations.js';

const HERE   = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(path.join(HERE, 'index.ts'), 'utf8');

/** Every tool name the server registers, both decks. */
const REGISTERED = [...SOURCE.matchAll(/name:\s*'(mnemosyne_[a-z_]+)'/g)].map((m) => m[1]!);

test('the deck parsed from index.ts is non-empty, so a parse failure cannot pass green', () => {
  assert.ok(
    REGISTERED.length >= 25,
    `parsed only ${REGISTERED.length} tool names from index.ts — the guard is reading nothing`,
  );
});

test('every registered tool declares a title', () => {
  const untitled = REGISTERED.filter((name) => !TOOL_TITLES[name]);
  assert.deepEqual(
    untitled,
    [],
    `registered but absent from TOOL_TITLES, so they ship with no annotations: ${untitled.join(', ')}`,
  );
});

test('no title is declared for a tool the server does not register', () => {
  const registered = new Set(REGISTERED);
  const ghosts = Object.keys(TOOL_TITLES).filter((name) => !registered.has(name));
  assert.deepEqual(ghosts, [], `declared but not registered: ${ghosts.join(', ')}`);
});

test('a tool is never both read-only and destructive', () => {
  const both = [...DESTRUCTIVE_TOOLS].filter((name) => READ_ONLY_TOOLS.has(name));
  assert.deepEqual(both, [], `contradictory declaration: ${both.join(', ')}`);
});

test('every tool named destructive is one the server actually registers', () => {
  const registered = new Set(REGISTERED);
  const ghosts = [...DESTRUCTIVE_TOOLS].filter((name) => !registered.has(name));
  assert.deepEqual(ghosts, [], `named destructive but not registered: ${ghosts.join(', ')}`);
});

test('every registered tool is served with a title and an applicable hint', () => {
  const served = annotated(REGISTERED.map((name) => ({ name })));
  for (const tool of served) {
    const ann = (tool as { annotations?: Record<string, unknown> }).annotations;
    assert.ok(ann, `${tool.name} is served with no annotations`);
    assert.equal(typeof ann!.title, 'string', `${tool.name} has no title`);
    assert.notEqual(ann!.title, '', `${tool.name} has an empty title`);
    assert.equal(typeof ann!.readOnlyHint, 'boolean', `${tool.name} has no readOnlyHint`);
  }
});

test('a reader declares readOnlyHint and no destructiveHint, which would mean nothing on it', () => {
  const [tool] = annotated([{ name: 'mnemosyne_memory_query' }]);
  const ann = (tool as { annotations?: Record<string, unknown> }).annotations!;
  assert.equal(ann.readOnlyHint, true);
  assert.ok(!('destructiveHint' in ann), 'a read-only tool must not carry destructiveHint');
});

test('a writer that only adds says so explicitly rather than staying silent', () => {
  const [tool] = annotated([{ name: 'mnemosyne_memory_ingest' }]);
  const ann = (tool as { annotations?: Record<string, unknown> }).annotations!;
  assert.equal(ann.readOnlyHint, false);
  assert.equal(ann.destructiveHint, false, 'an ingest is permanent, but it destroys nothing');
});

test('every tool that can take something away is flagged destructive', () => {
  // Named one by one on purpose. Reading the set back from the source would
  // make this test agree with whatever that set says, including a day someone
  // moves the erasure tool into READ_ONLY_TOOLS and every client is told it is
  // safe to run unattended.
  for (const name of [
    'mnemosyne_memory_forget',
    'mnemosyne_todo_update',
    'mnemosyne_agenda_update',
    'mnemosyne_agenda_remove',
  ]) {
    const [tool] = annotated([{ name }]);
    const ann = (tool as { annotations?: Record<string, unknown> }).annotations!;
    assert.equal(ann.readOnlyHint, false, `${name} must not read as read-only`);
    assert.equal(ann.destructiveHint, true, `${name} can destroy and must say so`);
  }
});

test('an unlisted tool is left untouched rather than given a guessed hint', () => {
  const [tool] = annotated([{ name: 'mnemosyne_not_a_real_tool' }]);
  assert.ok(
    !('annotations' in tool),
    'an unknown tool must be served bare: a fabricated readOnlyHint would tell a client to go ahead',
  );
});

test('annotating does not mutate the tool it was given', () => {
  const original = { name: 'mnemosyne_memory_query', description: 'x' };
  annotated([original]);
  assert.ok(!('annotations' in original), 'annotated() must return copies, not edit the deck in place');
});
