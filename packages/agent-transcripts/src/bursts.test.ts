/**
 * Burst grouping. Doc 118 §11.
 *
 * The cases that matter are the ones where a wrong cut is invisible: a burst
 * split in the middle of a sentence, a message with no stamp silently becoming
 * a boundary, and an exchange across midnight filed as two conversations.
 */
import { describe, it, expect } from 'vitest';
import { groupIntoBursts, DEFAULT_BURST_GAP_MINUTES } from './bursts';
import type { ChatTurn } from './chatLog';

const t = (at: string | null, text = 'x'): ChatTurn => ({
  speaker: 'Ann', role: 'peer', text, at, rawAt: at ?? '', media: null, mediaOnly: false,
});

const texts = (turns: ChatTurn[]): string[] => turns.map(x => x.text);

describe('groupIntoBursts', () => {
  it('keeps a continuous exchange in one burst', () => {
    const r = groupIntoBursts([
      t('2026-08-15T16:00:00', 'a'),
      t('2026-08-15T16:05:00', 'b'),
      t('2026-08-15T16:20:00', 'c'),
    ]);
    expect(r.bursts).toHaveLength(1);
    expect(texts(r.bursts[0].turns)).toEqual(['a', 'b', 'c']);
    expect(r.bursts[0].startedAt).toBe('2026-08-15T16:00:00');
    expect(r.bursts[0].endedAt).toBe('2026-08-15T16:20:00');
  });

  it('cuts on a silence longer than the gap', () => {
    const r = groupIntoBursts([
      t('2026-08-15T16:00:00', 'a'),
      t('2026-08-15T17:00:00', 'b'),
    ], { gapMinutes: 30 });
    expect(r.bursts.map(b => texts(b.turns))).toEqual([['a'], ['b']]);
  });

  it('does not cut on a silence exactly as long as the gap', () => {
    // The boundary is a silence LONGER than the gap. A message answered at the
    // thirty-minute mark is an answer, not a new conversation.
    const r = groupIntoBursts([
      t('2026-08-15T16:00:00', 'a'),
      t('2026-08-15T16:30:00', 'b'),
    ], { gapMinutes: 30 });
    expect(r.bursts).toHaveLength(1);
  });

  it('applies the caller’s gap, and reports the one it used', () => {
    const turns = [t('2026-08-15T16:00:00', 'a'), t('2026-08-15T16:10:00', 'b')];
    expect(groupIntoBursts(turns, { gapMinutes: 5 }).bursts).toHaveLength(2);
    expect(groupIntoBursts(turns, { gapMinutes: 5 }).gapMinutes).toBe(5);
    expect(groupIntoBursts(turns).gapMinutes).toBe(DEFAULT_BURST_GAP_MINUTES);
  });
});

describe('groupIntoBursts — the turns that must not decide', () => {
  // 🚨 A stamp that could not be read is not a silence. Letting it open a burst
  // would cut a conversation on a parsing failure, which nothing on screen
  // would explain.
  it('lets an undated turn join the burst it sits in', () => {
    const r = groupIntoBursts([
      t('2026-08-15T16:00:00', 'a'),
      t(null, 'b'),
      t('2026-08-15T16:05:00', 'c'),
    ]);
    expect(r.bursts).toHaveLength(1);
    expect(texts(r.bursts[0].turns)).toEqual(['a', 'b', 'c']);
    expect(r.undated).toBe(1);
  });

  // The silence is measured ACROSS the undated turn, from the last stamp
  // actually seen. Restarting from nothing would weld two evenings together.
  it('measures the silence across an undated turn, not from it', () => {
    const r = groupIntoBursts([
      t('2026-08-15T16:00:00', 'a'),
      t(null, 'b'),
      t('2026-08-15T18:00:00', 'c'),
    ], { gapMinutes: 30 });
    expect(r.bursts.map(b => texts(b.turns))).toEqual([['a', 'b'], ['c']]);
  });

  it('carries a conversation with no stamps at all as one burst', () => {
    const r = groupIntoBursts([t(null, 'a'), t(null, 'b')]);
    expect(r.bursts).toHaveLength(1);
    expect(r.bursts[0].startedAt).toBeNull();
    expect(r.bursts[0].day).toBeNull();
  });

  // 🎭 A file out of order is a fact about the file. Obeying a negative gap
  // would cut mid-sentence; hiding it would make a strange export look normal.
  it('counts a stamp that goes backwards instead of cutting on it', () => {
    const r = groupIntoBursts([
      t('2026-08-15T16:00:00', 'a'),
      t('2026-08-15T15:00:00', 'b'),
      t('2026-08-15T16:02:00', 'c'),
    ], { gapMinutes: 30 });
    expect(r.outOfOrder).toBe(1);
    expect(r.bursts).toHaveLength(1);
  });
});

describe('groupIntoBursts — the day a burst belongs to', () => {
  // 🚨 An exchange from 23:40 to 00:20 is ONE conversation. Splitting it at
  // midnight would file the answer in a different day from the question, for
  // the sake of a tidy filename.
  it('files a burst under its START day, never splitting at midnight', () => {
    const r = groupIntoBursts([
      t('2026-08-15T23:40:00', 'a'),
      t('2026-08-16T00:20:00', 'b'),
    ], { gapMinutes: 60 });
    expect(r.bursts).toHaveLength(1);
    expect(r.bursts[0].day).toBe('2026-08-15');
  });

  it('takes the day from the first STAMPED turn, not the first turn', () => {
    const r = groupIntoBursts([t(null, 'a'), t('2026-08-15T09:00:00', 'b')]);
    expect(r.bursts[0].day).toBe('2026-08-15');
  });

  it('gives each burst of a long day its own start', () => {
    const r = groupIntoBursts([
      t('2026-08-15T09:00:00', 'a'),
      t('2026-08-15T19:00:00', 'b'),
    ], { gapMinutes: 30 });
    expect(r.bursts.map(b => b.startedAt))
      .toEqual(['2026-08-15T09:00:00', '2026-08-15T19:00:00']);
    expect(r.bursts.every(b => b.day === '2026-08-15')).toBe(true);
  });
});

describe('groupIntoBursts — edges', () => {
  it('returns nothing for nothing', () => {
    const r = groupIntoBursts([]);
    expect(r.bursts).toEqual([]);
    expect(r.undated).toBe(0);
  });

  it('never loses a turn', () => {
    const turns = [
      t('2026-08-15T16:00:00', 'a'), t(null, 'b'), t('2026-08-15T20:00:00', 'c'),
      t('2026-08-16T08:00:00', 'd'), t('2026-08-16T08:01:00', 'e'),
    ];
    const r = groupIntoBursts(turns, { gapMinutes: 30 });
    expect(r.bursts.flatMap(b => b.turns)).toEqual(turns);
  });

  it('treats a stamp it cannot parse as undated rather than as the epoch', () => {
    // `at` is typed as a naive ISO string, but it comes out of a reader fed by
    // a stranger's file. A value that does not parse must not become 1970,
    // which would cut a burst at every one of them.
    const r = groupIntoBursts([
      t('2026-08-15T16:00:00', 'a'),
      { ...t('2026-08-15T16:01:00', 'b'), at: 'not a date' },
      t('2026-08-15T16:02:00', 'c'),
    ], { gapMinutes: 30 });
    expect(r.bursts).toHaveLength(1);
    expect(r.undated).toBe(1);
  });
});
