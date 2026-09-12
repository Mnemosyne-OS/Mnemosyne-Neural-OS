/**
 * The calendar has no archive, so these sentences are the last thing between an
 * agent and an appointment nobody can get back: a removal named by title and
 * time, a refusal that says nothing was changed, and a tool that will not take
 * a title where an id belongs.
 */
// Pinned to a NON-ZERO offset (UTC+5, POSIX sign, no DST): the stamps below
// used to be UTC with the Z cut off, and on a UTC machine that bug is invisible.
// node:test runs each file in its own process, so this reaches nobody else.
process.env['TZ'] = 'Etc/GMT-5';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  agendaEditOps, agendaListParams, handleAgendaList, handleAgendaRemove, renderAgendaApply,
  renderAgendaList, renderAgendaOutcome, stamp,
  type AgendaReadResult,
} from './agenda-edit-tool.js';
import type { AgendaRpcClient } from './agenda-tool.js';

const AT = Date.UTC(2026, 8, 10, 14, 0, 0); // 19:00 in the pinned zone

const view = (over: Partial<NonNullable<AgendaReadResult['view']>> = {}): AgendaReadResult => ({
  ok: true,
  view: {
    events: [{ id: 'e1', title: 'Dentist', startAt: AT, nextAt: AT }],
    total: 1,
    truncated: 0,
    outsideWindow: 0,
    ...over,
  },
});

test('a read prints the id and says to use it, never the title', () => {
  const s = renderAgendaList(view());
  assert.match(s, /\[e1\] Dentist/);
  assert.match(s, /never the title/);
});

test('a series appears once, with its cadence and its next occurrence', () => {
  const s = renderAgendaList(view({
    events: [{ id: 'e2', title: 'Standup', startAt: AT, nextAt: AT + 86_400_000, repeats: 'weekly' }],
  }));
  assert.equal((s.match(/\[e2\]/g) ?? []).length, 1);
  assert.match(s, /repeats weekly/);
  assert.match(s, /next 2026-09-11/);
});

test('an event with nothing left says so rather than showing its old start as a future', () => {
  const s = renderAgendaList(view({ events: [{ id: 'e3', title: 'Old lunch', startAt: AT }] }));
  assert.match(s, /no occurrence left/);
});

test('an empty window names the window as the reason, and counts what is outside it', () => {
  const s = renderAgendaList(view({ events: [], total: 0, outsideWindow: 4 }));
  assert.match(s, /No appointments in the window/);
  assert.match(s, /4 appointment\(s\) exist outside the window/);
});

test('a removal is named by title and time, and says it cannot be undone', () => {
  const s = renderAgendaOutcome({ op: 'remove', ok: true, title: 'Dentist', startAt: AT });
  assert.match(s, /REMOVED "Dentist" \(2026-09-10 19:00\)/);
  assert.match(s, /no archive: this one is gone/);
});

test('an unreadable date REFUSES, and the sentence says the old value was kept', () => {
  const s = renderAgendaOutcome({ op: 'edit', ok: false, error: 'BAD_START', title: 'Dentist' });
  assert.match(s, /NOTHING was changed rather than leaving the old one in place/);
});

test('an unknown cadence is refused, not quietly turned into a one-off', () => {
  assert.match(
    renderAgendaOutcome({ op: 'edit', ok: false, error: 'BAD_RECURRENCE' }),
    /Refused rather than quietly made a one-off/,
  );
});

test('a stale id is nameable inside a batch', () => {
  const s = renderAgendaApply({
    ok: true,
    applied: 1,
    results: [
      { op: 'remove', ok: true, title: 'Dentist', startAt: AT },
      { op: 'remove', ok: false, error: 'EVENT_NOT_FOUND' },
    ],
  });
  assert.match(s, /1 of 2 change\(s\) applied/);
  assert.match(s, /no appointment with that id/);
});

test('agendaEditOps keeps null (clear) apart from absent (leave alone)', () => {
  const ops = agendaEditOps({
    changes: [{ event_id: 'e1', title: 'New', location: null, alarm_minutes_before: 30 }],
  });
  assert.deepEqual(ops, [{ op: 'edit', event: 'e1', title: 'New', location: null, alarmMinutesBefore: 30 }]);
  // A change naming no event is dropped rather than applied to something.
  assert.deepEqual(agendaEditOps({ changes: [{ title: 'orphan' }] }), []);
});

test('removing without ids refuses, and says to read the calendar first', async () => {
  const client = { _rpc: async () => { throw new Error('must not be called'); } } as unknown as AgendaRpcClient;
  const s = await handleAgendaRemove(client, 'mcp', { event_ids: [] });
  assert.match(s, /Nothing to remove/);
  assert.match(s, /never by title or by date/);
});

test('removing accepts a single id as a string, and trims it', async () => {
  let sent: Record<string, unknown> | undefined;
  const client = {
    _rpc: async (_m: string, params?: Record<string, unknown>) => {
      sent = params;
      return { ok: true, applied: 1, results: [{ op: 'remove', ok: true, title: 'Dentist', startAt: AT }] };
    },
  } as unknown as AgendaRpcClient;
  await handleAgendaRemove(client, 'mcp', { event_ids: '  e1  ' });
  assert.deepEqual(sent?.['ops'], [{ op: 'remove', event: 'e1' }]);
});

test('agendaListParams reads ISO or epoch, as a number or a numeric string', () => {
  const built = agendaListParams('mcp', { from: '2026-09-10T14:00:00Z', to: String(AT), include_past: true, limit: 5 });
  assert.ok('params' in built);
  const p = built.params;
  assert.equal(p['from'], AT);
  assert.equal(p['to'], AT);
  assert.equal(p['includePast'], true);
  assert.equal(p['limit'], 5);
  // Omitted stays omitted (the host's default is "now"), and so does blank.
  assert.deepEqual(agendaListParams('mcp', { from: '  ' }), { params: { appId: 'mcp', includePast: false } });
});

// 🚨 A bound nobody can read used to become NO bound: a wider window than the
// one asked for, answered as though it were the one asked for. It is refused,
// and the sentence names the field and quotes the value.
test('an unreadable bound REFUSES the read instead of silently widening the window', async () => {
  const built = agendaListParams('mcp', { from: 'sometime soon' });
  assert.ok('refusal' in built);
  assert.match(built.refusal, /"from" could not be read as a date: "sometime soon"/);
  assert.match(built.refusal, /Nothing was read/);
  let called = false;
  const client: AgendaRpcClient = { async _rpc<T>(): Promise<T> { called = true; return {} as T; } };
  const out = await handleAgendaList(client, 'mcp', { to: 'next thursday' });
  assert.equal(called, false, 'the host was not asked');
  assert.match(out, /"to" could not be read/);
});

// 🪤 The host reads no-offset ISO and bare dates as LOCAL, and takes numbers
// only for the window, so the conversion has to follow the host's rule here.
test('window bounds follow the host frame: no offset is local, a bare date is local midnight', () => {
  const b = agendaListParams('mcp', { from: '2026-09-10T19:00', to: '2026-09-11' });
  assert.ok('params' in b);
  assert.equal(b.params['from'], AT);
  assert.equal(b.params['to'], new Date(2026, 8, 11).getTime());
  assert.notEqual(b.params['to'], Date.UTC(2026, 8, 11));
});

test('stamp says nothing about a number nobody measured, and prints LOCAL time', () => {
  assert.equal(stamp(undefined), '');
  assert.equal(stamp(Number.NaN), '');
  assert.equal(stamp(AT), '2026-09-10 19:00');
});

// The frame is stated ONCE per answer that prints a time — read and apply —
// so an agent never has to guess whether "19:00" is its clock or the human's.
test('an answer that prints a time names the frame, once', () => {
  const list = renderAgendaList(view());
  assert.equal(list.match(/this machine's local time/g)?.length, 1);
  assert.doesNotMatch(renderAgendaList(view({ events: [], total: 0 })), /local time/);
  const applied = renderAgendaApply({ ok: true, applied: 1, results: [{ op: 'remove', ok: true, title: 'Dentist', startAt: AT }] });
  assert.equal(applied.match(/this machine's local time/g)?.length, 1);
  assert.match(applied, /2026-09-10 19:00/);
  assert.doesNotMatch(renderAgendaApply({ ok: true, applied: 0, results: [{ op: 'edit', ok: false, error: 'EVENT_NOT_FOUND' }] }), /local time/);
});
