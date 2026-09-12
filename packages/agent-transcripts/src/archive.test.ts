/**
 * The archive reader, at the edges the fixtures do not reach. Doc 118.
 *
 * The fixtures prove three real formats end to end. These prove the decisions:
 * that an absent date stays absent, that a prefix list is ordered, that a
 * malformed tree terminates, and that nothing leaves without being counted.
 */
import { describe, it, expect } from 'vitest';
import {
  readArchive, toIso, htmlToText, stripPrefix, walkOpenAiPath, pickList, describeArchive,
  accountedFor, RECORD_LEVEL_REASONS,
} from './archive';
import type { Connector } from './connector';

const flat = (over: Partial<NonNullable<Connector['archive']>> = {}): Connector => ({
  id: 'test', displayName: 'Test', version: '0', format: 'json', kind: 'archive',
  filePattern: '.json', fields: {},
  archive: {
    root: '', grouping: 'flat-turns',
    conversation: { id: 'uuid', title: 'name', createdAt: 'created_at', turns: 'messages[]' },
    turn: { role: 'sender', text: 'text', parts: 'content[]', time: 'at' },
    roles: { human: ['human'], assistant: ['assistant'] },
    ...over,
  },
});

describe('toIso', () => {
  it('reads epoch SECONDS as seconds', () => {
    // 🪤 The whole reason the split exists. Read as milliseconds this lands in
    // January 1970 — a date convincing enough to sort a person's entire import
    // before everything else they own.
    expect(toIso(1767517920)).toBe('2026-01-04T09:12:00.000Z');
  });

  it('reads epoch MILLISECONDS as milliseconds', () => {
    expect(toIso(1767517920000)).toBe('2026-01-04T09:12:00.000Z');
  });

  it('keeps the fractional part of a float timestamp', () => {
    expect(toIso(1767517920.5)).toBe('2026-01-04T09:12:00.500Z');
  });

  it('treats 0 as absent, never as 1970', () => {
    // 🎭 0 is the value a field has when nobody filled it. Turning it into a
    // date is the difference between an absent timestamp and a wrong one.
    expect(toIso(0)).toBeNull();
  });

  it.each([-1, NaN, Infinity, -Infinity])('refuses %p', v => {
    expect(toIso(v)).toBeNull();
  });

  it('normalises an ISO string, and refuses a string that is not a date', () => {
    expect(toIso('2026-02-02T07:30:00.000000Z')).toBe('2026-02-02T07:30:00.000Z');
    expect(toIso('last tuesday')).toBeNull();
    expect(toIso('')).toBeNull();
  });

  it.each([null, undefined, {}, [], true])('refuses the non-scalar %p', v => {
    expect(toIso(v)).toBeNull();
  });
});

describe('htmlToText', () => {
  it('decodes named, decimal and hex entities', () => {
    expect(htmlToText('<p>a &amp; b &#176;C &#x41;</p>')).toBe('a & b °C A');
  });

  it('turns a non-breaking space into an ordinary one', () => {
    // A stored NBSP defeats a later search for the words around it, and the
    // text is going into a memory store, not a page.
    expect(htmlToText('<p>93&nbsp;&#176;C</p>')).toBe('93 °C');
  });

  it('leaves an entity it does not know alone rather than mangling it', () => {
    expect(htmlToText('<p>&zzz; x</p>')).toBe('&zzz; x');
  });

  it('drops script and style content entirely', () => {
    expect(htmlToText('<p>hi</p><script>alert(1)</script><style>p{}</style>')).toBe('hi');
  });

  it('keeps the shape of a list', () => {
    expect(htmlToText('<ul><li>one</li><li>two</li></ul>')).toBe('- one\n- two');
  });

  it('collapses runs of blank lines instead of leaving a gap', () => {
    expect(htmlToText('<p>a</p><p></p><p></p><p>b</p>')).toBe('a\n\nb');
  });
});

describe('stripPrefix', () => {
  it('strips the LONGEST match, not the first one declared', () => {
    // Declared short-first on purpose: without the length sort, "A: " wins and
    // leaves "B: hello" behind, which reads as a perfectly good prompt.
    const r = stripPrefix('A: B: hello', ['A: ', 'A: B: ']);
    expect(r).toEqual({ text: 'hello', matched: true });
  });

  it('tells a non-breaking space apart from an ordinary one', () => {
    // MEASURED on a real Takeout: "Prompt: " with a plain space matched 0 of
    // 2084 rows, because the real separator is U+00A0.
    expect(stripPrefix('Prompt : x', ['Prompt: ']).matched).toBe(false);
    expect(stripPrefix('Prompt : x', ['Prompt : '])).toEqual({ text: 'x', matched: true });
  });

  it('matches everything when no prefix is declared', () => {
    expect(stripPrefix('anything', undefined)).toEqual({ text: 'anything', matched: true });
    expect(stripPrefix('anything', [])).toEqual({ text: 'anything', matched: true });
  });

  it('reports no match rather than guessing', () => {
    expect(stripPrefix('hello', ['Prompt: '])).toEqual({ text: 'hello', matched: false });
  });
});

describe('pickList', () => {
  it('walks through an array in the middle of a path', () => {
    expect(pickList({ a: [{ b: 1 }, { b: 2 }] }, 'a[].b')).toEqual([1, 2]);
  });

  it('returns the array itself for a trailing []', () => {
    expect(pickList({ a: ['x', 'y'] }, 'a[]')).toEqual(['x', 'y']);
  });

  it('wraps a lone value and returns nothing for a missing one', () => {
    expect(pickList({ a: 'x' }, 'a')).toEqual(['x']);
    expect(pickList({}, 'a[].b')).toEqual([]);
    expect(pickList({ a: 'not an array' }, 'a[].b')).toEqual([]);
    expect(pickList({}, undefined)).toEqual([]);
  });
});

describe('walkOpenAiPath', () => {
  const nodes = {
    root: { parent: null }, a: { parent: 'root' }, b: { parent: 'a' }, orphan: { parent: 'a' },
  };

  it('returns the live path oldest first', () => {
    expect(walkOpenAiPath(nodes, 'b', 'parent')).toEqual([nodes.root, nodes.a, nodes.b]);
  });

  it('refuses when current_node names a node the map does not hold', () => {
    // Refusing is the point: flattening the map here is what puts three
    // contradictory answers to one question into memory.
    expect(walkOpenAiPath(nodes, 'nope', 'parent')).toBeNull();
    expect(walkOpenAiPath(nodes, null, 'parent')).toBeNull();
  });

  it('refuses a parent cycle instead of hanging, or of returning its tail', () => {
    // Two failures in one line. Without the seen-set this loops forever; with
    // the seen-set but no refusal, the tail of a corrupt loop comes back
    // looking exactly like a short conversation.
    const looped = { x: { parent: 'y' }, y: { parent: 'x' } };
    expect(walkOpenAiPath(looped, 'x', 'parent')).toBeNull();
  });

  it('refuses a chain broken above the current node', () => {
    // Returning the part it could reach hands back a conversation quietly
    // missing its oldest turns. A truncation has to announce itself.
    const broken = { leaf: { parent: 'gone' } };
    expect(walkOpenAiPath(broken, 'leaf', 'parent')).toBeNull();
  });
});

describe('readArchive', () => {
  const run = (conn: Connector, doc: unknown) => readArchive(conn, JSON.stringify(doc));

  it('returns null for a document that is not JSON at all', () => {
    expect(readArchive(flat(), 'this is not json')).toBeNull();
  });

  it('returns null when the connector declares no archive spec', () => {
    const noSpec = { ...flat() };
    delete noSpec.archive;
    expect(readArchive(noSpec, '[]')).toBeNull();
  });

  it('says the root was not found rather than reporting zero records', () => {
    // 🎭 The first version of this test pinned the fabricated value: it
    // asserted recordsSeen === 0, which is the app telling someone holding a
    // 500 MB archive that their export is empty. "I did not find the list" and
    // "the list is empty" are different sentences and need different facts.
    const st = run(flat(), { nope: true });
    expect(st).toMatchObject({ conversations: [], rootFound: false });
    const real = run(flat(), []);
    expect(real).toMatchObject({ rootFound: true, recordsSeen: 0 });
  });

  it('counts a record that is not an object instead of dropping it', () => {
    const st = run(flat(), [null, 42, 'x']);
    expect(st?.skipped).toEqual([{ reason: 'malformed', count: 3 }]);
  });

  it('matches a declared role whatever its casing', () => {
    const st = run(flat(), [{ uuid: 'c', messages: [{ sender: 'HUMAN', text: 'hi', at: null }] }]);
    expect(st?.conversations[0].turns[0].role).toBe('human');
  });

  it('counts an undeclared role rather than filing it as the person', () => {
    const st = run(flat(), [{ uuid: 'c', messages: [
      { sender: 'human', text: 'hi' },
      { sender: 'tool', text: 'ran something' },
    ] }]);
    expect(st?.conversations[0].turns).toHaveLength(1);
    expect(st?.skipped).toContainEqual({ reason: 'unknown-role', count: 1 });
  });

  it('counts a turn that held no text', () => {
    const st = run(flat(), [{ uuid: 'c', messages: [
      { sender: 'human', text: '   ' },
      { sender: 'human', text: 'real' },
    ] }]);
    expect(st?.conversations[0].turns).toHaveLength(1);
    expect(st?.skipped).toContainEqual({ reason: 'empty', count: 1 });
  });

  it('leaves a turn with no usable timestamp at null', () => {
    // Never the conversation's own stamp: a date nobody recorded must not
    // become a date on screen.
    const st = run(flat(), [{ uuid: 'c', created_at: '2026-01-01T00:00:00Z', messages: [
      { sender: 'human', text: 'hi' },
    ] }]);
    expect(st?.conversations[0].turns[0].at).toBeNull();
    expect(st?.conversations[0].startedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(st?.conversations[0].endedAt).toBeNull();
  });

  it('prefers the declared creation time over the first surviving turn', () => {
    const st = run(flat(), [{ uuid: 'c', created_at: '2026-01-01T00:00:00Z', messages: [
      { sender: 'human', text: 'hi', at: '2026-06-06T00:00:00Z' },
    ] }]);
    expect(st?.conversations[0].startedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('drops a conversation whose turns all failed, and counts the RECORD too', () => {
    // Both buckets, on purpose: 'unknown-role' answers what went wrong inside,
    // 'no-turns' answers how many rows of the export are actually in there.
    // Without the second one accountedFor silently under-reports.
    const st = run(flat(), [{ uuid: 'c', messages: [{ sender: 'ghost', text: 'x' }] }]);
    expect(st?.conversations).toEqual([]);
    expect(st?.skipped).toContainEqual({ reason: 'unknown-role', count: 1 });
    expect(st?.skipped).toContainEqual({ reason: 'no-turns', count: 1 });
    expect(accountedFor(st!)).toBe(st!.recordsSeen);
  });

  it('accounts for every record on the conversation shapes too, not just activity', () => {
    const st = run(flat(), [
      { uuid: 'a', messages: [{ sender: 'human', text: 'kept' }] },
      { uuid: 'b', messages: [{ sender: 'ghost', text: 'lost' }] },
      { uuid: 'c', messages: 'not an array' },
      'not an object',
    ]);
    expect(accountedFor(st!)).toBe(st!.recordsSeen);
    expect(st!.recordsSeen).toBe(4);
  });

  it('counts a non-text content part instead of rendering it', () => {
    const st = run(flat(), [{ uuid: 'c', messages: [
      { sender: 'human', content: [{ type: 'text', text: 'look' }, { type: 'image' }] },
    ] }]);
    expect(st?.conversations[0].turns[0].text).toBe('look');
    expect(st?.skipped).toContainEqual({ reason: 'non-text-part', count: 1 });
  });

  it('keeps unprefixed activity text when the connector does not require a prefix', () => {
    const conn = flat({
      grouping: 'none',
      record: { time: 'time', humanText: 'title' },
      humanPrefixes: ['Prompt: '],
      requirePrefix: false,
    });
    const st = readArchive(conn, JSON.stringify([{ title: 'bare text', time: '2026-01-01T00:00:00Z' }]));
    expect(st?.conversations[0].turns[0].text).toBe('bare text');
    expect(st?.skipped).toEqual([]);
  });

  it('marks a format that carries no threads as turns-only', () => {
    const conn = flat({ grouping: 'none', record: { time: 'time', humanText: 'title' } });
    expect(readArchive(conn, '[]')?.turnsOnly).toBe(true);
    expect(readArchive(flat(), '[]')?.turnsOnly).toBe(false);
  });

  it('counts every record it looked at, including the ones it skipped', () => {
    // recordsSeen is what makes a skip reviewable: 3 kept out of 3 and 3 kept
    // out of 900 look identical without it.
    const conn = flat({
      grouping: 'none', record: { time: 'time', humanText: 'title' },
      humanPrefixes: ['Prompt: '], requirePrefix: true,
    });
    const st = readArchive(conn, JSON.stringify([
      { title: 'Prompt: kept' }, { title: 'dropped' }, { title: 'dropped too' },
    ]));
    expect(st?.recordsSeen).toBe(3);
    expect(st?.conversations).toHaveLength(1);
    expect(st?.skipped).toEqual([{ reason: 'no-prefix', count: 2 }]);
  });
});

describe('abandoned branches', () => {
  const mapped = (): Connector => ({
    id: 'm', displayName: 'M', version: '0', format: 'json', kind: 'archive',
    filePattern: '.json', fields: {},
    archive: {
      root: '', grouping: 'openai-mapping',
      conversation: { id: 'conversation_id', title: 'title', createdAt: 'create_time', nodes: 'mapping', current: 'current_node' },
      turn: { parent: 'parent', role: 'message.author.role', parts: 'message.content.parts[]', time: 'message.create_time' },
      roles: { human: ['user'], assistant: ['assistant'] },
    },
  });

  const node = (role: string | null, text: string, parent: string | null) => ({
    parent,
    message: role ? { author: { role }, create_time: null, content: { parts: [text] } } : null,
  });

  it('counts only what a person or the model actually said', () => {
    // A system node off the path is not a loss: it was never part of the
    // conversation, so counting it would inflate the number the app shows.
    const doc = [{
      conversation_id: 'c', title: 't', current_node: 'live',
      mapping: {
        root: node(null, '', null),
        q: node('user', 'question', 'root'),
        live: node('assistant', 'kept', 'q'),
        old: node('assistant', 'regenerated away', 'q'),
        sys: node('system', 'hidden', 'q'),
      },
    }];
    const st = readArchive(mapped(), JSON.stringify(doc));
    expect(st?.conversations[0].turns.map(t => t.text)).toEqual(['question', 'kept']);
    expect(st?.conversations[0].abandonedTurns).toBe(1);
  });

  it('reports zero abandoned turns for a conversation that was never regenerated', () => {
    const doc = [{
      conversation_id: 'c', title: 't', current_node: 'a2',
      mapping: { root: node(null, '', null), a1: node('user', 'q', 'root'), a2: node('assistant', 'a', 'a1') },
    }];
    expect(readArchive(mapped(), JSON.stringify(doc))?.conversations[0].abandonedTurns).toBe(0);
  });
});

describe('what the real export taught, that the fixture could not', () => {
  const activity = (over: Partial<NonNullable<Connector['archive']>> = {}) => flat({
    grouping: 'none',
    record: { time: 'time', humanText: 'title', assistantHtml: 'safeHtmlItem[].html' },
    humanPrefixes: ['Prompt: '],
    requirePrefix: true,
    ...over,
  });

  it('refuses a reply whose prompt was nothing but the prefix', () => {
    // MEASURED on a real export: 26 of 2084 rows, and every one of them HAS a
    // reply. Kept, each becomes an answer to a question nobody can see, titled
    // with the empty string — content no search will ever reach again.
    const st = readArchive(activity(), JSON.stringify([
      { title: 'Prompt: ', time: '2026-01-01T00:00:00Z', safeHtmlItem: [{ html: '<p>an answer</p>' }] },
    ]));
    expect(st?.conversations).toEqual([]);
    expect(st?.skipped).toEqual([{ reason: 'empty-prompt', count: 1 }]);
  });

  it('accounts for every record it was given, exactly once', () => {
    // 🚨 The arithmetic that caught the bug above: kept + record-level skips
    // has to equal recordsSeen. It came to 2110 of 2084, because 26 rows were
    // counted as kept AND as skipped.
    const st = readArchive(activity(), JSON.stringify([
      { title: 'Prompt: kept', time: '2026-01-01T00:00:00Z' },
      { title: 'Prompt: ', safeHtmlItem: [{ html: '<p>x</p>' }] },
      { title: 'not a prompt' },
      { title: 'Prompt: also kept' },
      null,
    ]));
    expect(st).toBeTruthy();
    expect(accountedFor(st!)).toBe(st!.recordsSeen);
    expect(st!.recordsSeen).toBe(5);
    expect(st!.conversations).toHaveLength(2);
  });

  it('keeps a turn-level reason out of the record accounting', () => {
    // 'non-text-part' describes something inside a kept turn. Adding it to the
    // record sum is how a screen reports more rows than the file contained.
    expect(RECORD_LEVEL_REASONS).not.toContain('non-text-part');
    expect(RECORD_LEVEL_REASONS).not.toContain('unknown-role');
    expect(RECORD_LEVEL_REASONS).not.toContain('empty');
    expect(RECORD_LEVEL_REASONS).toContain('empty-prompt');
  });

  it('leaves markup the model was SHOWING you, and strips markup it was wearing', () => {
    // MEASURED: 344 real replies still hold angle brackets after conversion,
    // and 0 of them are unstripped markup — every one came from &lt;…&gt;, the
    // model quoting HTML inside a code sample. Entities are decoded AFTER tags
    // are stripped precisely so that stays true. Decoding first would silently
    // eat the contents of every code block about HTML.
    expect(htmlToText('<p>use &lt;div class=&quot;x&quot;&gt; here</p>'))
      .toBe('use <div class="x"> here');
    expect(htmlToText('<div class="x">worn</div>')).toBe('worn');
  });
});

describe('describeArchive', () => {
  it('derives the consent sentence from the declaration, so it cannot drift', () => {
    const conn = flat({
      grouping: 'none',
      record: { time: 'time', humanText: 'title', assistantHtml: 'h[].html', attachments: 'files[]' },
    });
    expect(describeArchive(conn)).toEqual([
      'what you typed', "the model's replies", 'when', 'the names of files you attached',
    ]);
  });

  it('does not promise to read a field the connector never declared', () => {
    const conn = flat({ grouping: 'none', record: { humanText: 'title' } });
    expect(describeArchive(conn)).toEqual(['what you typed']);
  });

  it('returns nothing for a connector with no archive spec', () => {
    const noSpec = { ...flat() };
    delete noSpec.archive;
    expect(describeArchive(noSpec)).toEqual([]);
  });
});
