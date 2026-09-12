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
import { localStamp, parseAgentDate, LOCAL_TIME_NOTE } from './local-time.js';

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

test('the note names the frame and asks for it back', () => {
  assert.match(LOCAL_TIME_NOTE, /local time/);
  assert.match(LOCAL_TIME_NOTE, /without an offset/);
});
