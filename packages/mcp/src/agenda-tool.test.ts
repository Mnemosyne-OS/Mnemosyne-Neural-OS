/**
 * agenda-tool.test.ts — the sentence an agent reads back, for every answer
 * the host can give, and the params it sends without re-deciding anything.
 * Mirrors todo-tool.test.ts.
 */
import { test }   from 'node:test';
import assert     from 'node:assert/strict';
import { agendaParams, renderAgendaAdd, handleAgendaAdd, type AgendaRpcClient } from './agenda-tool.js';

test('agendaParams carries only the recognised fields, renamed to the wire shape', () => {
  const p = agendaParams('mcp', {
    events: [
      { title: 'Dentist', start: '2026-09-10T14:00:00', all_day: false, alarm_minutes_before: 15 },
      { title: 'Trip', start: '2026-10-01T00:00:00', end: '2026-10-03T00:00:00', all_day: true, recurrence: 'yearly' },
      'not an object',
      null,
    ],
  });
  assert.deepEqual(p, {
    appId: 'mcp',
    events: [
      { title: 'Dentist', start: '2026-09-10T14:00:00', alarmMinutesBefore: 15 },
      { title: 'Trip', start: '2026-10-01T00:00:00', end: '2026-10-03T00:00:00', allDay: true, recurrence: 'yearly' },
    ],
  });
});

test('agendaParams reads a missing/non-array events field as empty', () => {
  assert.deepEqual(agendaParams('mcp', {})['events'], []);
});

test('a success names the count', () => {
  assert.match(renderAgendaAdd({ ok: true, added: 1 }, 1), /Filed 1 appointment into the calendar/);
  assert.match(renderAgendaAdd({ ok: true, added: 3 }, 3), /Filed 3 appointments into the calendar/);
});

test('what did not land is said next to what did, and an absent count says nothing (G3)', () => {
  const partial = renderAgendaAdd({ ok: true, added: 50, skipped: 2, truncated: 10 }, 62);
  assert.match(partial, /Filed 50 appointments/);
  assert.match(partial, /2 were refused/);
  assert.match(partial, /10 beyond the host's per-call cap were not looked at/);
  assert.match(renderAgendaAdd({ ok: true, added: 1, skipped: 1, truncated: 0 }, 2), /1 was refused/);
  assert.doesNotMatch(renderAgendaAdd({ ok: true, added: 1, skipped: 1, truncated: 0 }, 2), /cap/);
  // No counts from the host (an older app): the sentence must not invent zeros.
  const silent = renderAgendaAdd({ ok: true, added: 3 }, 3);
  assert.doesNotMatch(silent, /refused|cap/);
  // A refusal still says how many were looked at and refused.
  assert.match(renderAgendaAdd({ ok: false, error: 'EMPTY_PLAN', skipped: 2, truncated: 0 }, 2), /2 were refused/);
});

// See the backlog's twin: a closed app is written to directly now, so this
// branch must not send anyone off to start something.
test('a host that cannot reach a calendar does not tell anyone to start the app', () => {
  for (const error of ['NO_WINDOW', 'NO_CALENDAR']) {
    const s = renderAgendaAdd({ ok: false, error }, 1);
    assert.match(s, /cannot reach a calendar/);
    assert.doesNotMatch(s, /Start the app/);
  }
  assert.match(renderAgendaAdd({ ok: false, error: 'NO_VAULT' }, 1), /No workspace is configured/);
});

test('every failure says nothing was written', () => {
  for (const error of ['TIMEOUT', 'WRITE_FAILED', 'EMPTY_PLAN', 'SOMETHING_ELSE']) {
    assert.match(renderAgendaAdd({ ok: false, error }, 1), /[Nn]othing (was written|to file)/);
  }
});

test('a success says which way the write went, and only when it was the file', () => {
  assert.match(renderAgendaAdd({ ok: true, added: 1, via: 'file' }, 1), /app was not open/);
  assert.doesNotMatch(renderAgendaAdd({ ok: true, added: 1, via: 'window' }, 1), /app was not open/);
  assert.doesNotMatch(renderAgendaAdd({ ok: true, added: 1 }, 1), /app was not open/);
});

test('handleAgendaAdd calls sdk.agenda.add with the app id and renders the answer', async () => {
  const calls: Array<[string, Record<string, unknown> | undefined]> = [];
  const client: AgendaRpcClient = {
    async _rpc<T>(method: string, params?: Record<string, unknown>): Promise<T> {
      calls.push([method, params]);
      return { ok: true, added: 1 } as T;
    },
  };
  const out = await handleAgendaAdd(client, 'mnemosyne-mcp', {
    events: [{ title: 'Dentist', start: '2026-09-10T14:00:00' }],
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]![0], 'sdk.agenda.add');
  assert.equal(calls[0]![1]!['appId'], 'mnemosyne-mcp');
  assert.match(out, /Filed 1 appointment into the calendar/);
});

test('handleAgendaAdd refuses an empty plan without calling the host', async () => {
  let called = false;
  const client: AgendaRpcClient = {
    async _rpc<T>(): Promise<T> { called = true; return {} as T; },
  };
  const out = await handleAgendaAdd(client, 'mcp', { events: [] });
  assert.equal(called, false);
  assert.match(out, /Nothing to file/);
});
