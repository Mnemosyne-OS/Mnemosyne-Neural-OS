/**
 * cockpit-desktop.test.ts — the board a session asks for, across the MCP door.
 *
 * Two halves: the name reaches the host untouched, and the four answers reach
 * the agent as four different next steps.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cockpitParams, renderCockpitUpdate } from './cockpit-tool.js';

function tree(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemo-cockpit-desktop-'));
  fs.mkdirSync(path.join(dir, '.git'));
  return dir;
}

const env = { CLAUDE_CODE_SESSION_ID: 'sess-1' } as NodeJS.ProcessEnv;

test('the board name travels exactly as the human wrote it', () => {
  const t = tree();
  try {
    const built = cockpitParams('mnemosyne-mcp', { state: 'working', desktop: '  dev OS  ' }, env, t);
    assert.ok('params' in built);
    // 🚨 Trimmed, never lowercased and never shortened: the host matches the
    // name exactly apart from case, so anything reshaped here can only turn a
    // good name into a miss that still looks like what was typed.
    assert.equal(built.params['desktop'], 'dev OS');
  } finally {
    fs.rmSync(t, { recursive: true, force: true });
  }
});

test('no board asked for sends no field at all', () => {
  const t = tree();
  try {
    for (const args of [{ state: 'working' }, { state: 'working', desktop: '   ' }, { state: 'working', desktop: 7 }]) {
      const built = cockpitParams('mnemosyne-mcp', args as Record<string, unknown>, env, t);
      assert.ok('params' in built);
      assert.ok(!('desktop' in built.params), `desktop leaked for ${JSON.stringify(args)}`);
    }
  } finally {
    fs.rmSync(t, { recursive: true, force: true });
  }
});

test('a board that took the cards is named back', () => {
  const out = renderCockpitUpdate({ ok: true, pinned: true, desktop: { ok: true, name: 'dev OS' } }, 'working');
  assert.match(out, /dev OS/);
});

test('an unknown name lists the boards that exist, and leaves the card alone', () => {
  const out = renderCockpitUpdate(
    { ok: true, pinned: true, desktop: { ok: false, reason: 'UNKNOWN', names: ['dev OS', 'SEO'] } },
    'working',
  );
  // 🚨 The card still went through. A misspelt board name must not read like
  // the card failed to arrive.
  assert.match(out, /Card on the canvas/);
  assert.match(out, /No desktop carries that name/);
  assert.match(out, /dev OS, SEO/);
});

test('two boards of one name send the agent to rename, not to respell', () => {
  const out = renderCockpitUpdate(
    { ok: true, pinned: true, desktop: { ok: false, reason: 'AMBIGUOUS', names: ['Perso', 'perso'] } },
    'working',
  );
  assert.match(out, /Two desktops carry that name/);
  assert.match(out, /rename/);
});

test('boards that could not be read never claim the board is missing', () => {
  const out = renderCockpitUpdate(
    { ok: true, pinned: true, desktop: { ok: false, reason: 'UNAVAILABLE', names: [] } },
    'working',
  );
  // 🎭 The whole point of the third failure: an unknown must not be reported
  // as an absence, or someone goes checking the spelling of a name that is
  // sitting on their screen.
  assert.match(out, /could not be read/);
  assert.ok(!/No desktop carries that name/.test(out));
});

test('a card the human removed says nothing about a board', () => {
  // There is no pin to place it on, and the sentence already says why.
  const out = renderCockpitUpdate({ ok: true, pinned: false }, 'working');
  assert.ok(!/desktop/i.test(out.split('\n')[0] ?? ''));
  assert.match(out, /removed this card/);
});
