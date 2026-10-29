/**
 * The chat-log reader. Doc 118 §9.
 *
 * The cases that matter here are not "does it parse a line" — they are the
 * places where a wrong answer is INDISTINGUISHABLE from a right one on screen:
 * a date read the wrong way round, a photo caption carrying a token nobody
 * wrote, the person's own messages labelled as their correspondent's, and a
 * file the connector does not fit reported as an empty conversation.
 */
import { describe, it, expect } from 'vitest';
import {
  readChatLog, accountedForLines, resolveDateOrder, type ChatLogState,
} from './chatLog';
import type { Connector } from './connector';

const conn = (chatLog: Partial<NonNullable<Connector['chatLog']>> = {}): Connector => ({
  id: 'test',
  displayName: 'Test',
  version: '0.0.0',
  format: 'chatlog',
  kind: 'archive',
  filePattern: '.txt',
  chatLog: { lineShape: 'bracket-ts-colon', ...chatLog },
} as Connector);

const read = (text: string, spec?: Partial<NonNullable<Connector['chatLog']>>): ChatLogState =>
  readChatLog(conn(spec), text)!;

const line = (stamp: string, rest: string) => `[${stamp}] ${rest}`;

describe('readChatLog — fit', () => {
  it('returns null when the connector carries no chat-log spec', () => {
    const bare = { ...conn() };
    delete (bare as { chatLog?: unknown }).chatLog;
    expect(readChatLog(bare as Connector, 'anything')).toBeNull();
  });

  // 🎭 Absent is not zero. A file this connector does not fit must not come
  // back looking like a conversation with nothing in it.
  it('reports shapeMatched false rather than an empty conversation', () => {
    const st = read('nothing here looks like a chat log\nsecond line');
    expect(st.shapeMatched).toBe(false);
    expect(st.turns).toHaveLength(0);
  });

  it('reports shapeMatched true as soon as one line parses', () => {
    expect(read(line('15/08/2026, 16:55:48', 'Ann: hi')).shapeMatched).toBe(true);
  });
});

describe('readChatLog — the date order', () => {
  it('proves day-first from a first field above 12', () => {
    const st = read([
      line('15/08/2026, 16:55:48', 'Ann: a'),
      line('03/08/2026, 16:56:48', 'Ann: b'),
    ].join('\n'));
    expect(st.dateOrder).toBe('dmy');
    expect(st.dateOrderBasis).toBe('proved');
    expect(st.dateOrderEvidence).toContain('15/08/2026');
    expect(st.turns[0].at).toBe('2026-08-15T16:55:48');
    // The line that could not prove anything is read the SAME way. One proof
    // settles the file, which is the whole point of doing this in two passes.
    expect(st.turns[1].at).toBe('2026-08-03T16:56:48');
  });

  it('proves month-first from a second field above 12', () => {
    const st = read(line('8/15/26, 4:56:05 PM', 'Ann: a'));
    expect(st.dateOrder).toBe('mdy');
    expect(st.turns[0].at).toBe('2026-08-15T16:56:05');
  });

  // 🚨 The refusal. Every date in this file fits both readings, so there is no
  // answer — and inventing one puts messages up to eleven months away from
  // where they happened, on a timestamp that looks perfectly ordinary.
  it('refuses to pick when no line can prove the order, and keeps the raw stamp', () => {
    const st = read([
      line('03/08/2026, 10:00:00', 'Ann: a'),
      line('04/08/2026, 11:00:00', 'Ann: b'),
    ].join('\n'));
    expect(st.dateOrder).toBe('ambiguous');
    expect(st.dateOrderBasis).toBe('none');
    expect(st.turns.every(t => t.at === null)).toBe(true);
    expect(st.turns[0].rawAt).toBe('03/08/2026, 10:00:00');
    expect(st.startedAt).toBeNull();
    expect(st.endedAt).toBeNull();
  });

  // 🚨 Not the same verdict as "ambiguous", and folding the two would be a lie
  // of a different kind: here BOTH readings are provably wrong somewhere.
  it('calls a file that proves both orders a conflict, not an ambiguity', () => {
    const st = read([
      line('15/08/2026, 10:00:00', 'Ann: a'),
      line('08/15/2026, 11:00:00', 'Ann: b'),
    ].join('\n'));
    expect(st.dateOrder).toBe('conflict');
    expect(st.turns.every(t => t.at === null)).toBe(true);
  });

  it('lets a connector declare the order, and says the basis was the declaration', () => {
    const st = read(line('03/08/2026, 10:00:00', 'Ann: a'), { dateOrder: 'mdy' });
    expect(st.dateOrder).toBe('mdy');
    expect(st.dateOrderBasis).toBe('declared');
    expect(st.dateOrderEvidence).toBeNull();
    expect(st.turns[0].at).toBe('2026-03-08T10:00:00');
  });

  it('resolveDateOrder is decided by the file, not by the first line', () => {
    const headers = [
      { a: 3, b: 8, rawAt: 'first' },
      { a: 4, b: 30, rawAt: 'later' },
    ];
    expect(resolveDateOrder(headers, undefined)).toEqual(
      { order: 'mdy', basis: 'proved', evidence: 'later' });
  });
});

describe('readChatLog — the clock', () => {
  // 🪤 The naive `+12 when PM` puts every message sent at noon at midnight, and
  // sorts a whole day of conversation to the wrong end of itself.
  it('reads 12 PM as noon and 12 AM as midnight', () => {
    const st = read([
      line('8/15/26, 12:30:00 PM', 'Ann: noon'),
      line('8/16/26, 12:30:00 AM', 'Ann: midnight'),
    ].join('\n'));
    expect(st.turns[0].at).toBe('2026-08-15T12:30:00');
    expect(st.turns[1].at).toBe('2026-08-16T00:30:00');
  });

  it('reads a 24-hour stamp with no meridiem and no seconds', () => {
    const st = read(line('15/08/2026, 16:55', 'Ann: a'));
    expect(st.turns[0].at).toBe('2026-08-15T16:55:00');
  });

  // 🚨 The file carries a wall clock and no offset. Stamping it UTC moves every
  // message by the exporter's offset, undetectably, because the result is a
  // valid timestamp that is simply wrong.
  it('emits a naive stamp with no zone designator', () => {
    expect(read(line('15/08/2026, 16:55:48', 'Ann: a')).turns[0].at).not.toMatch(/[Zz]|[+-]\d\d:\d\d$/);
  });

  it('pivots a two-digit year at 70', () => {
    expect(read(line('15/08/26, 01:00', 'A: x')).turns[0].at).toBe('2026-08-15T01:00:00');
    expect(read(line('15/08/99, 01:00', 'A: x')).turns[0].at).toBe('1999-08-15T01:00:00');
  });

  // Date's silent rollover turns 31 February into 3 March: a date nobody wrote,
  // indistinguishable afterwards from one somebody did.
  it('refuses a date that is not on the calendar instead of rolling it over', () => {
    const st = read([
      line('31/02/2026, 10:00', 'Ann: a'),
      line('31/01/2026, 10:00', 'Ann: b'),
    ].join('\n'));
    expect(st.dateOrder).toBe('dmy');
    expect(st.turns[0].at).toBeNull();
    expect(st.turns[0].rawAt).toBe('31/02/2026, 10:00');
    expect(st.turns[1].at).toBe('2026-01-31T10:00:00');
  });
});

describe('readChatLog — lines that are not messages', () => {
  // MEASURED: 204 of 2 257 lines in the first real file. A reader that drops
  // unstamped lines loses the tail of every long message and reports a
  // perfectly plausible count while doing it.
  it('folds an unstamped line into the message above it', () => {
    const st = read([line('15/08/2026, 10:00', 'Ann: first'), 'second', 'third'].join('\n'));
    expect(st.turns).toHaveLength(1);
    expect(st.turns[0].text).toBe('first\nsecond\nthird');
    expect(st.mergedLines).toBe(2);
  });

  it('counts a line before the first stamp as a preamble belonging to nobody', () => {
    const st = read(['Messages are end-to-end encrypted.', line('15/08/2026, 10:00', 'Ann: hi')].join('\n'));
    expect(st.skipped).toContainEqual({ reason: 'preamble', count: 1 });
    expect(st.turns[0].text).toBe('hi');
  });

  it('separates a notice from a call, because 60 lines reading [Call] is noise', () => {
    const st = read([
      line('15/08/2026, 10:00', '- Ann created this group'),
      line('15/08/2026, 10:01', '- [Appel]'),
    ].join('\n'), { systemPrefix: '- ', callMarkers: ['[Appel]'] });
    expect(st.turns).toHaveLength(0);
    expect(st.skipped).toContainEqual({ reason: 'system-notice', count: 1 });
    expect(st.skipped).toContainEqual({ reason: 'call', count: 1 });
  });

  it('skips a body the exporter wrote as a literal null', () => {
    const st = read(line('15/08/2026, 10:00', 'Ann: null'), { nullBodies: ['null'] });
    expect(st.turns).toHaveLength(0);
    expect(st.skipped).toContainEqual({ reason: 'null-body', count: 1 });
  });

  it('counts a stamped line with no speaker rather than inventing one', () => {
    const st = read(line('15/08/2026, 10:00', 'a notice with no colon'));
    expect(st.skipped).toContainEqual({ reason: 'no-speaker', count: 1 });
  });

  it('skips an empty body', () => {
    expect(read(line('15/08/2026, 10:00', 'Ann: ')).skipped)
      .toContainEqual({ reason: 'empty', count: 1 });
  });
});

describe('readChatLog — media placeholders', () => {
  // 🚨 MEASURED: 49 of 164 placeholders in the first real file carry a caption.
  // Whole-body matching welds '<image omise> ' to the front of every one.
  it('strips the marker off the front and keeps the caption as the message', () => {
    const st = read(line('15/08/2026, 10:00', 'Ann: <image omise> Polka'),
      { mediaMarkers: ['<image omise>'] });
    expect(st.turns[0].text).toBe('Polka');
    expect(st.turns[0].media).toBe('<image omise>');
    expect(st.turns[0].mediaOnly).toBe(false);
  });

  // Something WAS sent at that moment. Skipping it leaves a hole in the talking.
  it('keeps a bare placeholder as a turn, flagged as holding no words', () => {
    const st = read(line('15/08/2026, 10:00', 'Ann: <image omise>'),
      { mediaMarkers: ['<image omise>'] });
    expect(st.turns).toHaveLength(1);
    expect(st.turns[0].text).toBe('');
    expect(st.turns[0].mediaOnly).toBe(true);
    expect(st.mediaPlaceholders).toBe(1);
  });

  // Defensive against a connector whose markers overlap AT A SPACE BOUNDARY,
  // where both genuinely match and declaration order would decide. The short
  // one wins by accident and leaves half a marker welded to the caption.
  //
  // 🪤 The first version of this test declared '<image omise>' and '<image
  // omise longue>' and passed with the sort REMOVED, because the short marker
  // never matched that text at all: a test of an ordering rule that never put
  // two candidates in the running. Caught by mutation, not by reading.
  it('prefers the longest marker when two of them both match', () => {
    const markers = ['<image omise>', '<image omise> HD'];
    const st = read(line('15/08/2026, 10:00', 'Ann: <image omise> HD Polka'), { mediaMarkers: markers });
    expect(st.turns[0].media).toBe('<image omise> HD');
    expect(st.turns[0].text).toBe('Polka');
    // Declaration order must not change the answer.
    const flipped = read(line('15/08/2026, 10:00', 'Ann: <image omise> HD Polka'),
      { mediaMarkers: [...markers].reverse() });
    expect(flipped.turns[0].text).toBe('Polka');
  });

  it('does not treat a marker that merely appears inside a sentence as media', () => {
    const st = read(line('15/08/2026, 10:00', 'Ann: I wrote <image omise> in my notes'),
      { mediaMarkers: ['<image omise>'] });
    expect(st.turns[0].media).toBeNull();
    expect(st.turns[0].text).toBe('I wrote <image omise> in my notes');
  });
});

describe('readChatLog — who is speaking', () => {
  it('names every participant in order of first appearance', () => {
    const st = read([
      line('15/08/2026, 10:00', 'Ann: a'),
      line('15/08/2026, 10:01', 'Bob: b'),
      line('15/08/2026, 10:02', 'Ann: c'),
    ].join('\n'));
    expect(st.participants).toEqual(['Ann', 'Bob']);
  });

  it('marks the declared self, and everybody else as a peer', () => {
    const st = read([
      line('15/08/2026, 10:00', 'Vous: a'),
      line('15/08/2026, 10:01', 'debora: b'),
    ].join('\n'), { selfNames: ['Vous'] });
    expect(st.self).toBe('Vous');
    expect(st.turns.map(t => t.role)).toEqual(['self', 'peer']);
  });

  // 🚨 The one that protects the person's own words. These producers localise
  // the self-name, so a connector measured in French meets an English file and
  // every message the person sent would be filed as their correspondent's.
  it('falls back to unknown when the declared self-name matches nobody', () => {
    const st = read([
      line('15/08/2026, 10:00', 'You: a'),
      line('15/08/2026, 10:01', 'debora: b'),
    ].join('\n'), { selfNames: ['Vous'] });
    expect(st.self).toBeNull();
    expect(st.turns.every(t => t.role === 'unknown')).toBe(true);
  });

  it('leaves every role unknown when the producer marks no self at all', () => {
    const st = read(line('15/08/2026, 10:00', 'Ann: a'));
    expect(st.self).toBeNull();
    expect(st.turns[0].role).toBe('unknown');
  });

  it('splits at the first colon, so a message may contain colons', () => {
    const st = read(line('15/08/2026, 10:00', 'Ann: url: https://x.example'));
    expect(st.turns[0].speaker).toBe('Ann');
    expect(st.turns[0].text).toBe('url: https://x.example');
  });
});

describe('readChatLog — shapes and invisible characters', () => {
  // 🪤 Both are invisible in an editor, so a reader written by eye matches
  // nothing and reports an empty conversation over a real file.
  it('reads a line carrying LRM marks and a narrow no-break space', () => {
    const st = read('\u200e[15/08/2026, 4:55:48\u202fPM] Ann: hi');
    expect(st.turns).toHaveLength(1);
    expect(st.turns[0].at).toBe('2026-08-15T16:55:48');
  });

  it('reads the Android shape, which brackets nothing', () => {
    const st = readChatLog(conn({ lineShape: 'dash-ts-colon' }),
      '15/08/2026, 16:55 - Ann: hi')!;
    expect(st.shapeMatched).toBe(true);
    expect(st.turns[0].speaker).toBe('Ann');
    expect(st.turns[0].text).toBe('hi');
  });

  it('does not read the Android shape with the iOS connector', () => {
    expect(read('15/08/2026, 16:55 - Ann: hi').shapeMatched).toBe(false);
  });
});

describe('readChatLog — the invariant a screen adds up', () => {
  it('accounts for every non-empty line it was given', () => {
    const st = read([
      'Messages are end-to-end encrypted.',
      line('15/08/2026, 10:00', 'Vous: first'),
      'continued',
      line('15/08/2026, 10:01', '- Ann joined'),
      line('15/08/2026, 10:02', '- [Appel]'),
      line('15/08/2026, 10:03', 'debora: <image omise> caption'),
      line('15/08/2026, 10:04', 'debora: '),
      line('15/08/2026, 10:05', 'no colon here'),
      '',
    ].join('\n'), {
      systemPrefix: '- ', callMarkers: ['[Appel]'],
      mediaMarkers: ['<image omise>'], selfNames: ['Vous'],
    });
    expect(st.linesSeen).toBe(8);
    expect(accountedForLines(st)).toBe(st.linesSeen);
    expect(st.turns).toHaveLength(2);
    expect(st.mergedLines).toBe(1);
  });

  it('holds when the file is nothing but lines the reader cannot use', () => {
    const st = read(['one', 'two', 'three'].join('\n'));
    expect(accountedForLines(st)).toBe(st.linesSeen);
    expect(st.shapeMatched).toBe(false);
  });
});
