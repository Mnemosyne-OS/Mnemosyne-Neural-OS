/**
 * cockpit-detail.test.ts — the two lines under a card's title: where the
 * session runs, and which model.
 *
 * `detailFrom` had no suite, which is how it kept naming the wrong thing for
 * as long as it did. The line it builds is the only place on the card that
 * says which project a session belongs to, so a human reads it to work out
 * where the card will land.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detailFrom } from './cockpitHook.js';

/** A one-turn transcript that records `cwd`, the way the harness does. */
function transcriptIn(dir: string, cwd: string, branch: string, model: string): string {
  const file = path.join(dir, 'sess.jsonl');
  writeFileSync(
    file,
    JSON.stringify({
      type: 'user',
      timestamp: new Date().toISOString(),
      cwd,
      gitBranch: branch,
      message: { role: 'user', content: 'hello' },
    }) +
      '\n' +
      JSON.stringify({
        type: 'assistant',
        timestamp: new Date().toISOString(),
        cwd,
        gitBranch: branch,
        message: { role: 'assistant', model, content: [{ type: 'text', text: 'hi' }] },
      }) +
      '\n',
    'utf-8',
  );
  return file;
}

test('the line names the PROJECT, not the subfolder a cd left the shell in', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'mnemo-card-label-'));
  try {
    const repo = path.join(root, 'MY REPO');
    const deep = path.join(repo, 'apps', 'web', 'desktops');
    mkdirSync(deep, { recursive: true });
    mkdirSync(path.join(repo, '.git'));

    const file = transcriptIn(root, deep, 'main', 'claude-opus-5');
    const lines = detailFrom(file);

    // The defect this test exists for: `desktops · main` on a card whose
    // siblings in the same repository read `MY REPO · main`.
    assert.equal(lines[0], 'MY REPO · main');
    assert.ok(!lines[0].includes('desktops'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a cwd under no repository keeps its own name, since it joined nothing', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'mnemo-card-label-'));
  try {
    const loose = path.join(root, 'notes');
    mkdirSync(loose, { recursive: true });

    const file = transcriptIn(root, loose, 'main', 'claude-opus-5');
    assert.equal(detailFrom(file)[0], 'notes · main');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('nothing to read means no line, never an invented one', () => {
  assert.deepEqual(detailFrom(undefined), []);
  assert.deepEqual(detailFrom(path.join(os.tmpdir(), 'mnemo-card-label-absent.jsonl')), []);
});
