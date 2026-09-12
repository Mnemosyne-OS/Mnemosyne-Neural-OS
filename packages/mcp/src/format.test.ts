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
} from './format.js';
import type { MnemoChronicle } from './ws-client.js';

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
