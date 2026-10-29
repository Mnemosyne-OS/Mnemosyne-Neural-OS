/**
 * Regression tests for the resonance formatting helpers.
 * Run: `pnpm --filter @mnemosyne_os/mcp test` (tsx + node:test).
 *
 * The headline case is the "189KB blob" regression: a chronicle that merely
 * MENTIONS the "[RESONANCE:" token (e.g. the MCP's own source code) must never
 * be classified as a resonance, and no field may grow unbounded.
 */

import { test } from 'node:test';
import assert    from 'node:assert/strict';
import {
  unwrapContent,
  isResonanceChronicle,
  selectResonances,
  toResonanceView,
  freshnessLine,
  queryRefusal,
  searchFailure,
  findPosition,
  scoreLabel,
  readCoverage,
  isDesignDoc,
  formatQueryRow,
  resonanceLine,
} from './format.js';
import type { MnemoChronicle, QueryResult } from './ws-client.js';

const chronicle = (over: Partial<MnemoChronicle>): MnemoChronicle => ({
  id:            '1',
  spineType:     'NOTE',
  content:       '',
  timestamp:     Date.now(),
  score:         1,
  source_app_id: 'CORE',
  ...over,
});

// ── unwrapContent ──────────────────────────────────────────────────────────────

test('unwrapContent returns .raw from a SemanticChunker envelope', () => {
  assert.equal(unwrapContent(JSON.stringify({ raw: 'hello', spineType: 'NOTE' })), 'hello');
});

test('unwrapContent passes plain text through unchanged', () => {
  assert.equal(unwrapContent('just text'), 'just text');
});

// ── isResonanceChronicle ─────────────────────────────────────────────────────────

test('accepts a chronicle whose spineType is RESONANCE', () => {
  assert.equal(isResonanceChronicle('RESONANCE', 'anything at all'), true);
});

test('accepts a position chronicle starting with the update_position marker', () => {
  const body = '[RESUME_SESSION] [RESONANCE:agent-cockpit]\nPhase 52 — 2026-05-01T12:00:00.000Z\nDid stuff';
  assert.equal(isResonanceChronicle('DECISION', body), true);
});

test('REJECTS source code that merely mentions the [RESONANCE: token (189KB-blob regression)', () => {
  // Mirrors index.ts itself: the token appears mid-file, not as an anchored marker.
  const body = '#!/usr/bin/env node\nconst content = `[RESUME_SESSION] [RESONANCE:${id}]`;\n// ...';
  assert.equal(isResonanceChronicle('SOURCE_CODE', body), false);
});

test('selectResonances filters out the impostor and keeps the real one', () => {
  const real     = chronicle({ id: '10', spineType: 'RESONANCE', content: 'Name: p2p' });
  const impostor = chronicle({ id: '11', spineType: 'SOURCE_CODE', content: 'x = "[RESONANCE:foo]"' });
  const kept     = selectResonances([real, impostor]);
  assert.deepEqual(kept.map(c => c.id), ['10']);
});

// ── toResonanceView ──────────────────────────────────────────────────────────────

test('extracts id, phase and age from a real update_position body', () => {
  const body = '[RESUME_SESSION] [RESONANCE:mnemosync-p2p]\nPhase 52 — 2026-05-01T12:00:00.000Z\nNext: wire git root';
  const v = toResonanceView(
    chronicle({ id: '7', spineType: 'DECISION', content: body, timestamp: Date.parse('2026-05-01T12:00:00.000Z') }),
    Date.parse('2026-05-01T12:30:00.000Z'),
  );
  assert.equal(v.id, 'mnemosync-p2p');
  assert.equal(v.phase, 'Phase 52');
  assert.equal(v.agoMin, 30);
});

test('caps a malformed giant body so the output can never explode again', () => {
  const huge = '[RESONANCE:' + 'x'.repeat(200_000) + ']\n' + 'y'.repeat(200_000);
  const v = toResonanceView(chronicle({ id: '42', spineType: 'RESONANCE', content: huge }));
  assert.ok(v.id.length    <= 61, `id too long: ${v.id.length}`);    // 60 chars + ellipsis
  assert.ok(v.phase.length <= 61, `phase too long: ${v.phase.length}`);
});

test('unwraps the envelope before extracting fields', () => {
  const body = '[RESUME_SESSION] [RESONANCE:wrapped]\nPhase 1 — 2026-01-01T00:00:00.000Z';
  const v = toResonanceView(chronicle({ id: '9', spineType: 'DECISION', content: JSON.stringify({ raw: body, spineType: 'DECISION' }) }));
  assert.equal(v.id, 'wrapped');
});

// ── freshnessLine — a result whose source file moved on ──────────────────────

// Instants built from LOCAL wall-clock parts, so these hold in every timezone.
const at = (y: number, mo: number, d: number, h = 12, mi = 0): string => new Date(y, mo - 1, d, h, mi).toISOString();

test('freshnessLine: on different days, prints both local days and the path to read', () => {
  const line = freshnessLine({ state: 'changed', filePath: '/repo/docs/a.md', readAt: at(2026, 8, 25, 10), modifiedAt: at(2026, 9, 20, 8) });
  assert.equal(line, '> ⚠️ Stale: the file changed on 2026-09-20, after this memory was taken on 2026-08-25 (local time). Read `/repo/docs/a.md` for its current state.');
});

test('freshnessLine: on the same local day, prints the two times instead of one date twice', () => {
  const line = freshnessLine({ state: 'changed', filePath: '/repo/q.ts', readAt: at(2026, 9, 28, 21, 41), modifiedAt: at(2026, 9, 28, 22, 24) });
  assert.equal(line, '> ⚠️ Stale: the file changed on 2026-09-28 at 22:24, after this memory was taken at 21:41 (local time). Read `/repo/q.ts` for its current state.');
});

test('freshnessLine: the day is the local one, never the UTC one', () => {
  // 23:30 local is the next day in UTC for every zone west of Greenwich, the previous one east of it.
  const line = freshnessLine({ state: 'missing', filePath: '/repo/b.md', readAt: at(2026, 9, 28, 23, 30) });
  assert.equal(line, '> ⚠️ Gone: `/repo/b.md` no longer exists; this memory was taken on 2026-09-28.');
});

test('freshnessLine: a missing file is said, with its read day only when known', () => {
  assert.equal(freshnessLine({ state: 'missing', filePath: '/repo/b.md', readAt: at(2026, 8, 25, 10) }),
    '> ⚠️ Gone: `/repo/b.md` no longer exists; this memory was taken on 2026-08-25.');
  assert.equal(freshnessLine({ state: 'missing', filePath: '/repo/b.md', readAt: null }),
    '> ⚠️ Gone: `/repo/b.md` no longer exists.');
});

test('freshnessLine: current, unchecked, absent or malformed cost nothing', () => {
  for (const f of [
    undefined, null, 'changed', { state: 'current' }, { state: 'unchecked', reason: 'timeout' },
    { state: 'changed', filePath: '/a', readAt: 'garbage', modifiedAt: '2026-09-20T08:00:00.000Z' },
    { state: 'changed', readAt: '2026-08-25T10:00:00.000Z', modifiedAt: '2026-09-20T08:00:00.000Z' },
    { state: 'missing', filePath: '' },
  ]) assert.equal(freshnessLine(f), null, JSON.stringify(f));
});

// ── queryRefusal ───────────────────────────────────────────────────────────────

const queryResult = (over: Partial<QueryResult>): QueryResult => ({
  success:    true,
  chronicles: [chronicle({ id: '7', content: 'a real hit' })],
  ...over,
});

test('queryRefusal lets real search results through', () => {
  assert.equal(queryRefusal(queryResult({ _semantic: { wanted: true, used: true } }), 'NOTES'), null);
});

test('queryRefusal names a failed search as failed, never as empty', () => {
  // A timeout REJECTS in ws-client and never reaches here; this is what does: the app's own refusal.
  const out = queryRefusal(queryResult({ success: false, chronicles: [], error: 'UNKNOWN_VAULT: ZZZNOPE' }), 'ZZZNOPE');
  assert.ok(out);
  assert.match(out, /could not search vault:ZZZNOPE/);
  assert.match(out, /UNKNOWN_VAULT/);
  assert.doesNotMatch(out, /No chronicles found/);
});

test('queryRefusal refuses the fallback to recent memories even when it carries rows', () => {
  // The rows the app served when the embed threw: recent, unscored, printed as 1.000.
  const out = queryRefusal(queryResult({
    chronicles: [chronicle({ id: '1', score: 1 }), chronicle({ id: '2', score: 1 })],
    _semantic:  { wanted: true, used: false, error: 'modelManager.embed returned empty vector' },
  }), 'NOTES');
  assert.ok(out);
  assert.match(out, /most recent memories/);
  assert.match(out, /empty vector/);
});

test('queryRefusal treats an app that sends no _semantic as a real search', () => {
  // Absent is not false: an older app cannot say, so its rows are shown.
  assert.equal(queryRefusal(queryResult({}), 'NOTES'), null);
});

test('queryRefusal keeps the honest empty for a search that matched nothing', () => {
  const out = queryRefusal(queryResult({ chronicles: [], _semantic: { wanted: true, used: true } }), 'NOTES', ' (filter: GIT)');
  assert.equal(out, 'No chronicles found in vault:NOTES for this query (filter: GIT). The search ran and matched nothing.');
});

test('an empty error string reads as no reason, not as a blank', () => {
  const out = queryRefusal(queryResult({ _semantic: { wanted: true, used: false, error: '' } }), 'NOTES');
  assert.ok(out);
  assert.match(out, /NOTES: no reason given\./);
  const failed = queryRefusal(queryResult({ success: false, chronicles: [], error: '' }), 'NOTES');
  assert.match(failed ?? '', /NOTES: no reason given\./);
});

// ── searchFailure / findPosition (the resonance tools) ─────────────────────────

test('searchFailure lets an empty search through: an empty result means something of its own there', () => {
  assert.equal(searchFailure(queryResult({ chronicles: [], _semantic: { wanted: true, used: true } }), 'DEV'), null);
});

test('searchFailure refuses the fallback to recent memories', () => {
  assert.match(searchFailure(queryResult({ _semantic: { wanted: true, used: false } }), 'DEV') ?? '', /most recent memories/);
});

test('findPosition returns only the resonance carrying this exact id, never the nearest document', () => {
  const doc   = chronicle({ id: '1', spineType: 'ARCHITECTURE', content: 'Phase 59 - Active Cognitive Filter' });
  const other = chronicle({ id: '2', content: '[RESUME_SESSION] [RESONANCE:other-work]\nlot 2 - 2026-10-01' });
  const mine  = chronicle({ id: '3', content: '[RESUME_SESSION] [RESONANCE:my-work]\nlot 4 - 2026-10-20' });
  assert.equal(findPosition([doc, other], 'zzz-no-such-resonance'), null);
  assert.equal(findPosition([doc, other, mine], 'my-work')?.id, '3');
});

// -- scoreLabel / readCoverage (the words-only verdict) --------------------------

test('scoreLabel prints a measured score, and says "unscored" for a row nobody scored', () => {
  assert.equal(scoreLabel(0.9234), 'score: 0.923');
  assert.equal(scoreLabel(undefined), 'unscored (keyword match)');
  assert.equal(scoreLabel(Number.NaN), 'unscored (keyword match)');
});

test('readCoverage is absent when the engine measured nothing', () => {
  assert.equal(readCoverage(queryResult({ _semantic: { wanted: true, used: true } })), null);
  assert.equal(readCoverage(queryResult({ _semantic: { wanted: true, used: true, lexicalCoverage: { measured: 0, admitted: 0, rows: [] } } })), null);
});

test('readCoverage turns "0 of 2 admitted" into a nothing-found warning, row by row', () => {
  const result = queryResult({
    chronicles: [chronicle({ id: '1' }), chronicle({ id: '2' })],
    _semantic:  { wanted: true, used: true, lexicalCoverage: { measured: 2, admitted: 0, rows: [{ admitted: false }, { admitted: false }] } },
  });
  const view = readCoverage(result);
  assert.ok(view);
  assert.match(view.summary, /none of the 2 rows/);
  assert.match(view.summary, /nothing found/);
  assert.deepEqual(view.notAdmitted, [true, true]);
});

test('readCoverage counts the admitted rows, and ignores per-row verdicts that do not line up', () => {
  const result = queryResult({
    chronicles: [chronicle({ id: '1' }), chronicle({ id: '2' })],
    _semantic:  { wanted: true, used: true, lexicalCoverage: { measured: 3, admitted: 1, rows: [{ admitted: true }, { admitted: false }, { admitted: false }] } },
  });
  const view = readCoverage(result);
  assert.ok(view);
  assert.match(view.summary, /judged 1 of the 3 rows/);
  assert.deepEqual(view.notAdmitted, [false, false]);
});

// ── isDesignDoc ────────────────────────────────────────────────────────────────

test('isDesignDoc: an agent\'s own NOTE is not a design doc, a NOTE read from a file is', () => {
  // NOTE is the ingest tool's default spine; CORE is what an agent's ingest is stored as.
  assert.equal(isDesignDoc('NOTE', 'CORE'), false);
  assert.equal(isDesignDoc('NOTE', 'DOCWATCH'), true);
  assert.equal(isDesignDoc('note', 'docwatch'), true);
  assert.equal(isDesignDoc('NOTE', undefined), false);
});

test('isDesignDoc: the other design spines are flagged whatever their source, the rest never', () => {
  assert.equal(isDesignDoc('DOCUMENT', 'CORE'), true);
  assert.equal(isDesignDoc('VISION', 'DOCWATCH'), true);
  assert.equal(isDesignDoc('HYPOTHESIS', undefined), true);
  assert.equal(isDesignDoc('DECISION', 'DOCWATCH'), false);
  assert.equal(isDesignDoc(undefined, 'DOCWATCH'), false);
});

// ── formatQueryRow ─────────────────────────────────────────────────────────────

const WARNING = /Design\/vision doc: verify/;
const row = (over: Partial<MnemoChronicle>, notAdmitted = false): string =>
  formatQueryRow(chronicle({ content: JSON.stringify({ raw: 'My validation drink is lapsang-93807.' }), ...over }), 0, { maxContentChars: 600, notAdmitted });

test('formatQueryRow warns on a NOTE read from a file, never on an agent\'s own NOTE', () => {
  assert.doesNotMatch(row({ spineType: 'NOTE', source_app_id: 'CORE' }), WARNING);
  assert.match(row({ spineType: 'NOTE', source_app_id: 'DOCWATCH' }), WARNING);
  assert.match(row({ spineType: 'DOCUMENT', source_app_id: 'CORE' }), WARNING);
});

test('formatQueryRow prints a date only when the stored time can be read', () => {
  assert.match(row({ timestamp: '2026-10-28 13:26:14' }), /^\*\*Date:\*\* 2026-10-28 \d\d:26$/m);
  for (const timestamp of ['not a time', '']) {
    assert.doesNotMatch(row({ timestamp }), /\*\*Date:\*\*/, JSON.stringify(timestamp));
  }
});

test('formatQueryRow keeps the score label, the body, the truncation hint and the partial-match line', () => {
  const full = row({ score: 0.613, id: '7' });
  assert.match(full, /^### \[1\] NOTE · score: 0\.613$/m);
  assert.match(full, /^\*\*ID:\*\* 7$/m);
  assert.match(full, /^My validation drink is lapsang-93807\.$/m);
  assert.doesNotMatch(full, /content truncated|Not admitted/);

  const cut = formatQueryRow(chronicle({ content: 'x'.repeat(100) }), 2, { maxContentChars: 80 });
  assert.match(cut, /^### \[3\]/);
  assert.match(cut, /x{80}…/);
  assert.match(cut, /content truncated, 100 chars total\. Re-query with max_content_chars: 100/);
  assert.match(row({}, true), /^> Not admitted: this row matches only some words of the query\.$/m);
});

test('resonanceLine says the update time is unknown instead of printing 0min ago', () => {
  const unreadable = toResonanceView(chronicle({ content: '[RESUME_SESSION] [RESONANCE:r1]\nphase — 2026-09-10T13:30:00.000Z', timestamp: 'not a time' }));
  assert.equal(unreadable.agoMin, null);
  assert.match(resonanceLine(unreadable), /update time unknown/);
  assert.doesNotMatch(resonanceLine(unreadable), /0min/);
  assert.match(resonanceLine({ id: 'r1', phase: 'p', agoMin: 30, chronicleId: '9' }), /updated 30min ago `#9`$/);
});
