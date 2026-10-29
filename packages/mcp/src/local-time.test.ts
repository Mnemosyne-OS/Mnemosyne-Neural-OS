/**
 * The clock the answers are printed in, pinned to a zone with a NON-ZERO
 * offset: on a UTC machine the bug this guards against is invisible.
 *
 * node:test runs each file in its own process, so TZ set here reaches nobody
 * else. `Etc/GMT-5` is UTC+5 (POSIX sign), with no daylight saving to move.
 */
process.env['TZ'] = 'Etc/GMT-5';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localStamp, parseAgentDate, parseStoredTime, LOCAL_TIME_NOTE } from './local-time.js';
import { toResonanceView } from './format.js';

const AT = Date.UTC(2026, 8, 10, 14, 0, 0); // 14:00 UTC = 19:00 local here

test('the zone pin took — this file proves nothing on a UTC clock', () => {
  assert.equal(new Date(AT).getHours(), 19);
});

test('localStamp prints the local wall clock, never UTC with the Z cut off', () => {
  assert.equal(localStamp(AT), '2026-09-10 19:00');
  assert.equal(localStamp(undefined), '');
  assert.equal(localStamp(Number.NaN), '');
});

test('what the answer prints, the host reads back to the same instant', () => {
  // The round trip that used to drift by the offset: print, then send the
  // printed text back as an ISO string without an offset.
  const printed = localStamp(AT).replace(' ', 'T');
  assert.equal(parseAgentDate(printed), AT);
});

test('parseAgentDate follows the host rule: local when no offset, absolute when one is given', () => {
  assert.equal(parseAgentDate('2026-09-10T19:00'), AT);
  assert.equal(parseAgentDate('2026-09-10T14:00:00Z'), AT);
  assert.equal(parseAgentDate('2026-09-10T16:00:00+02:00'), AT);
});

test('a bare date is LOCAL midnight, not UTC midnight', () => {
  assert.equal(parseAgentDate('2026-09-10'), new Date(2026, 8, 10).getTime());
  assert.notEqual(parseAgentDate('2026-09-10'), Date.UTC(2026, 8, 10));
  assert.equal(parseAgentDate('2026-13-40'), null);
});

test('epoch ms as a number OR as a numeric string; anything unreadable is null, never NaN', () => {
  assert.equal(parseAgentDate(AT), AT);
  assert.equal(parseAgentDate(String(AT)), AT);
  assert.equal(parseAgentDate('sometime soon'), null);
  assert.equal(parseAgentDate(''), null);
  assert.equal(parseAgentDate('   '), null);
  assert.equal(parseAgentDate(undefined), null);
  assert.equal(parseAgentDate(Number.NaN), null);
});

test('parseStoredTime reads SQLite\'s zoneless created_at as UTC, never as local time', () => {
  // What the host sends for a chronicle: `CURRENT_TIMESTAMP`, UTC without a zone.
  assert.equal(parseStoredTime('2026-09-10 14:00:00'), AT);
  assert.equal(localStamp(parseStoredTime('2026-09-10 14:00:00') ?? undefined), '2026-09-10 19:00');
  assert.equal(parseStoredTime('2026-09-10 14:00:00.250'), AT + 250);
  assert.equal(parseStoredTime('2026-13-40 14:00:00'), null);
});

test('parseStoredTime reads a number or a zoned ISO string as given; the unreadable is null', () => {
  assert.equal(parseStoredTime(AT), AT);
  assert.equal(parseStoredTime('2026-09-10T14:00:00.000Z'), AT);
  assert.equal(parseStoredTime('2026-09-10T16:00:00+02:00'), AT);
  assert.equal(parseStoredTime('not a time'), null);
  assert.equal(parseStoredTime(''), null);
  assert.equal(parseStoredTime(undefined), null);
  assert.equal(parseStoredTime(Number.NaN), null);
});

test('a resonance saved 30 minutes ago in SQLite\'s form reads as 30 minutes ago', () => {
  const body = '[RESUME_SESSION] [RESONANCE:r1]\nphase — 2026-09-10T13:30:00.000Z\n\nwhere I was';
  const view = toResonanceView({
    id: '1', spineType: 'DECISION', content: body, timestamp: '2026-09-10 13:30:00', score: 1, source_app_id: 'CORE',
  }, AT);
  assert.equal(view.agoMin, 30);
});

test('the note names the frame and asks for it back', () => {
  assert.match(LOCAL_TIME_NOTE, /local time/);
  assert.match(LOCAL_TIME_NOTE, /without an offset/);
});
