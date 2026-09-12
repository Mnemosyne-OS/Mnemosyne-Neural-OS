import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOWNLOAD_URL, installHint, installState, mnemosyneHome } from './install-hint.js';

test('the three states are three different sentences, never two', () => {
  const all = (['present', 'no-trace', 'unknown'] as const).map((s) => installHint(s));
  assert.equal(new Set(all).size, 3, 'two states rendered the same sentence');
});

test('every state says WHY the app is needed — a bare "cannot connect" leaves no next step', () => {
  for (const s of ['present', 'no-trace', 'unknown'] as const) {
    assert.match(installHint(s), /holds no data of its own/, `${s} does not say why`);
    assert.match(installHint(s), /desktop application/, `${s} does not name the application`);
  }
});

test('only the states that could need a download carry the link', () => {
  // Telling someone to install what they already run is noise, and it is how a
  // refusal stops being read.
  assert.ok(!installHint('present').includes(DOWNLOAD_URL), 'present should not push the download');
  assert.ok(installHint('no-trace').includes(DOWNLOAD_URL), 'no-trace must give the download');
  assert.ok(installHint('unknown').includes(DOWNLOAD_URL), 'unknown must give the download');
});

test('an absent directory is reported as a HINT, never as proof it is not installed', () => {
  const m = installHint('no-trace');
  assert.match(m, /may never have run/, 'must hedge: a fresh unopened install has no directory either');
  assert.ok(!/not installed/.test(m), 'must not assert that the app is not installed');
});

test('the unknown state accuses nothing and offers both branches', () => {
  const m = installHint('unknown');
  assert.match(m, /could not be checked/);
  assert.match(m, /If it is, start it/);
  assert.ok(!/may never have run/.test(m), 'unknown must not borrow the no-trace claim');
});

test('each sentence names the directory it actually looked at', () => {
  for (const s of ['present', 'no-trace'] as const) {
    assert.ok(installHint(s).includes(mnemosyneHome()), `${s} must name the path it measured`);
  }
});

test('installState reads the app home, and a throwing check is unknown rather than absent', () => {
  const seen: string[] = [];
  assert.equal(installState((p) => { seen.push(p); return true; }), 'present');
  assert.deepEqual(seen, [mnemosyneHome()], 'must probe the app home and nothing else');
  assert.equal(installState(() => false), 'no-trace');
  assert.equal(installState(() => { throw new Error('EACCES'); }), 'unknown');
});

test('the app-only message stops at WHY and leaves the action to installHint', async () => {
  // Two sources of action once produced "Start the app" immediately followed by
  // "it may never have run here, install it" — contradictory in the same breath.
  const { APP_NOT_RUNNING_MESSAGE } = await import('./app-only-tools.js');
  assert.ok(!/Start the Mnemosyne OS app/.test(APP_NOT_RUNNING_MESSAGE),
    'the action belongs to installHint, which alone knows if the app was ever run here');
  assert.match(APP_NOT_RUNNING_MESSAGE, /needs the app itself/, 'it must still say WHY');
});
