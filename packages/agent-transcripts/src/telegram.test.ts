/**
 * The Telegram export reader. Doc 118 §10.
 *
 * The cases here are the ones where a wrong answer is INDISTINGUISHABLE from a
 * right one on screen: a message rebuilt without its links, a timestamp moved
 * by the reader's time zone, a forwarded claim filed under the forwarder, the
 * person's own messages labelled as their correspondent's, and a file this
 * connector does not fit reported as an empty account.
 *
 * Parsing a well-formed message is not one of those, and is covered once by the
 * shipped fixture rather than case by case.
 */
import { describe, it, expect } from 'vitest';
import {
  readTelegramExport,
  accountedForMessages,
  type TelegramExportState,
  type TelegramChatState,
} from './telegram';
import type { Connector, TelegramSpec } from './connector';
import { TELEGRAM_CONNECTORS, archiveConnectorIsVerified } from './index';

import fixture from './connectors/telegram-desktop-json.fixture.json?raw';
import expected from './connectors/telegram-desktop-json.expected.json';

const conn = (telegram: Partial<TelegramSpec> = {}): Connector => ({
  id: 'test',
  displayName: 'Test',
  version: '0.0.0',
  format: 'json',
  kind: 'archive',
  filePattern: 'result.json',
  telegram: { shape: 'telegram-desktop-json', ...telegram },
} as Connector);

/** One personal chat around the messages given, in the full-account shape. */
const account = (messages: unknown[], opts: { selfId?: number | null; chats?: unknown[] } = {}) => {
  const personal = opts.selfId === null
    ? {}
    : { personal_information: { user_id: opts.selfId ?? 111222333, first_name: 'Ada' } };
  return JSON.stringify({
    ...personal,
    chats: {
      list: opts.chats ?? [{ name: 'Bo', type: 'personal_chat', id: 444, messages }],
    },
  });
};

const msg = (over: Record<string, unknown> = {}) => ({
  id: 1,
  type: 'message',
  date: '2026-08-15T16:55:48',
  date_unixtime: '1755269748',
  from: 'Ada',
  from_id: 'user111222333',
  text: 'hello',
  text_entities: [{ type: 'plain', text: 'hello' }],
  ...over,
});

const read = (text: string, spec?: Partial<TelegramSpec>): TelegramExportState =>
  readTelegramExport(conn(spec), text)!;

const firstChat = (text: string, spec?: Partial<TelegramSpec>): TelegramChatState =>
  read(text, spec).chats[0];

describe('readTelegramExport — fit', () => {
  it('returns null when the connector carries no telegram spec', () => {
    const bare = { ...conn() };
    delete (bare as { telegram?: unknown }).telegram;
    expect(readTelegramExport(bare as Connector, '{}')).toBeNull();
  });

  it('returns null when the document is not JSON', () => {
    expect(readTelegramExport(conn(), 'not json at all')).toBeNull();
  });

  // 🎭 Absent is not zero. A file this reader does not understand must not come
  // back looking like an account with no conversations in it.
  it('reports shapeMatched false rather than an empty account', () => {
    const st = read('{"something":"else"}');
    expect(st.shapeMatched).toBe(false);
    expect(st.exportShape).toBeNull();
    expect(st.chats).toHaveLength(0);
  });

  it('reads a single-chat export, where the chat IS the document', () => {
    const st = read(JSON.stringify({
      name: 'Bo', type: 'personal_chat', id: 444, messages: [msg()],
    }));
    expect(st.exportShape).toBe('single-chat');
    expect(st.shapeMatched).toBe(true);
    expect(st.chats[0].turns).toHaveLength(1);
  });

  // A single-chat export carries no personal_information, so nobody can be
  // named as the exporter. Guessing from the first speaker would label half a
  // conversation as the wrong person, silently.
  it('leaves every role unknown when the export names no owner', () => {
    const st = read(JSON.stringify({
      name: 'Bo', type: 'personal_chat', id: 444, messages: [msg()],
    }));
    expect(st.selfId).toBeNull();
    expect(st.chats[0].turns[0].role).toBe('unknown');
    expect(st.chats[0].self).toBeNull();
  });
});

describe('readTelegramExport — the message text', () => {
  const arrayText = [
    'look at ',
    { type: 'text_link', text: 'this one', href: 'https://example.org/hall' },
    ' instead',
  ];

  // 🚨 The trap the whole reader exists for. Keeping only the strings out of
  // the array — the obvious loop — yields "look at  instead", which reads as a
  // perfectly ordinary message with its subject removed.
  it('rebuilds a message whose text is an array of mixed chunks', () => {
    const st = firstChat(account([msg({ text: arrayText, text_entities: arrayText.map(
      c => typeof c === 'string' ? { type: 'plain', text: c } : c) })]));
    expect(st.turns[0].text).toBe('look at this one instead');
  });

  it('keeps a masked link’s URL, and keeps it OUT of the text', () => {
    const st = firstChat(account([msg({ text: arrayText, text_entities: arrayText.map(
      c => typeof c === 'string' ? { type: 'plain', text: c } : c) })]));
    expect(st.turns[0].links).toEqual(['https://example.org/hall']);
    expect(st.turns[0].text).not.toContain('https://');
  });

  it('does not repeat a URL that the text already spells out', () => {
    const entities = [{ type: 'link', text: 'https://example.org/hall', href: 'https://example.org/hall' }];
    const st = firstChat(account([msg({ text: entities, text_entities: entities })]));
    expect(st.turns[0].links).toEqual([]);
    expect(st.turns[0].text).toBe('https://example.org/hall');
  });

  // ⚠️ The guard, not a preference: that `text_entities` covers plain runs is
  // something this reader BELIEVES. If it ever does not, a plain string is
  // still definitionally the whole message, and trusting entities over it would
  // truncate messages in a way nothing on screen would show.
  it('prefers the plain string over the entity list, and still harvests links', () => {
    const st = firstChat(account([msg({
      text: 'the whole sentence',
      text_entities: [{ type: 'text_link', text: 'partial', href: 'https://example.org/x' }],
    })]));
    expect(st.turns[0].text).toBe('the whole sentence');
    expect(st.turns[0].links).toEqual(['https://example.org/x']);
  });
});

describe('readTelegramExport — the timestamp', () => {
  // 🚨 `date_unixtime` sits right next to `date` and is an ABSOLUTE instant.
  // Rendering it re-times every message into the reader's zone, which produces
  // a valid timestamp that is simply wrong — and nothing later can detect it.
  it('keeps the wall clock and never the unix time', () => {
    const st = firstChat(account([msg({ date: '2026-08-15T16:55:48', date_unixtime: '0' })]));
    expect(st.turns[0].at).toBe('2026-08-15T16:55:48');
  });

  it('keeps a stamp it cannot read as raw, never as a date it picked', () => {
    const st = firstChat(account([msg({ date: 'not a date' })]));
    expect(st.turns[0].at).toBeNull();
    expect(st.turns[0].rawAt).toBe('not a date');
    expect(st.undated).toBe(1);
  });

  it('refuses a date the calendar does not have', () => {
    const st = firstChat(account([msg({ date: '2026-02-31T10:00:00' })]));
    expect(st.turns[0].at).toBeNull();
  });

  it('leaves an undated message out of the span rather than out of the chat', () => {
    const st = firstChat(account([
      msg({ id: 1, date: '2026-08-15T16:55:48' }),
      msg({ id: 2, date: 'not a date' }),
    ]));
    expect(st.turns).toHaveLength(2);
    expect(st.startedAt).toBe('2026-08-15T16:55:48');
    expect(st.endedAt).toBe('2026-08-15T16:55:48');
  });
});

describe('readTelegramExport — who said it', () => {
  // 🚨 Two people can carry the same display name, and the owner's own name
  // changes over the years an export spans. Matching on the name would file the
  // correspondent's messages as the person's own.
  it('decides the role by id, not by the displayed name', () => {
    const st = firstChat(account([
      msg({ id: 1, from: 'Ada', from_id: 'user111222333' }),
      msg({ id: 2, from: 'Ada', from_id: 'user999' }),
    ]));
    expect(st.turns[0].role).toBe('self');
    expect(st.turns[1].role).toBe('peer');
    expect(st.participants).toEqual(['Ada']);
  });

  it('skips a message with no sender instead of inventing one', () => {
    const st = firstChat(account([msg({ from: null, from_id: 'channel999' })]));
    expect(st.turns).toHaveLength(0);
    expect(st.skipped).toEqual([{ reason: 'no-speaker', count: 1 }]);
  });

  // 🚨 The words are somebody else's. Flattening this puts a stranger's claim
  // in memory under a friend's name, permanently.
  it('keeps a forward under the forwarder, and names the origin', () => {
    const st = firstChat(account([msg({ forwarded_from: 'Cy' })]));
    expect(st.turns[0].speaker).toBe('Ada');
    expect(st.turns[0].forwardedFrom).toBe('Cy');
    expect(st.forwarded).toBe(1);
  });
});

describe('readTelegramExport — what is not a message', () => {
  it('counts a service message rather than keeping it as speech', () => {
    const st = firstChat(account([{ id: 1, type: 'service', date: '2026-08-15T16:55:48', actor: 'Bo', action: 'pin_message' }]));
    expect(st.turns).toHaveLength(0);
    expect(st.skipped).toEqual([{ reason: 'service', count: 1 }]);
  });

  it('separates a call from a notice, by the connector’s declared action', () => {
    const body = [{ id: 1, type: 'service', date: '2026-08-15T16:55:48', actor: 'Bo', action: 'phone_call', duration_seconds: 12 }];
    expect(firstChat(account(body), { callActions: ['phone_call'] }).skipped)
      .toEqual([{ reason: 'call', count: 1 }]);
    // An action the connector does not declare degrades into a notice, which is
    // a miscount between two skips — never a crash and never a lost message.
    expect(firstChat(account(body), { callActions: [] }).skipped)
      .toEqual([{ reason: 'service', count: 1 }]);
  });

  it('skips a message with nothing said and nothing attached', () => {
    const st = firstChat(account([msg({ text: '', text_entities: [] })]));
    expect(st.skipped).toEqual([{ reason: 'empty', count: 1 }]);
  });

  it('keeps an attachment sent with no words, and says nothing was typed', () => {
    const st = firstChat(account([msg({ text: '', text_entities: [], photo: 'photos/a.jpg' })]));
    expect(st.turns[0].media).toBe('photo');
    expect(st.turns[0].mediaOnly).toBe(true);
    expect(st.mediaPlaceholders).toBe(1);
  });

  it('keeps a caption as the message, with the attachment beside it', () => {
    const st = firstChat(account([msg({ text: 'the main room', photo: 'photos/a.jpg' })]));
    expect(st.turns[0].text).toBe('the main room');
    expect(st.turns[0].mediaOnly).toBe(false);
  });

  // A sticker's whole content is its emoji, in its own field. Dropping it
  // leaves a turn that says nothing, in a conversation where something was
  // said — and `mediaOnly` still has to mean "nothing was typed".
  it('keeps a sticker’s emoji without calling it typed words', () => {
    const st = firstChat(account([msg({
      text: '', text_entities: [], media_type: 'sticker', file: 's.webp', sticker_emoji: '\u{1F44D}',
    })]));
    expect(st.turns[0].text).toBe('\u{1F44D}');
    expect(st.turns[0].media).toBe('sticker');
    expect(st.turns[0].mediaOnly).toBe(true);
  });

  it('names the attachment with the file’s own word', () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ media_type: 'voice_message', file: 'v.ogg' }, 'voice_message'],
      [{ photo: 'p.jpg' }, 'photo'],
      [{ file: 'f.pdf' }, 'file'],
      [{ poll: { question: 'when' } }, 'poll'],
      [{ location_information: { latitude: 0, longitude: 0 } }, 'location'],
    ];
    const got = cases.map(([over]) => firstChat(account([msg({ text: '', text_entities: [], ...over })])).turns[0]?.media);
    expect(got).toEqual(cases.map(([, want]) => want));
  });
});

describe('readTelegramExport — the account', () => {
  it('leaves out the chat types the connector declares, and counts them', () => {
    const st = read(account([], { chats: [
      { name: 'Bo', type: 'personal_chat', id: 1, messages: [msg()] },
      { name: 'Deploy bot', type: 'bot_chat', id: 2, messages: [msg()] },
    ] }), { skipChatTypes: ['bot_chat'] });
    expect(st.chats.map(c => c.chatName)).toEqual(['Bo']);
    expect(st.skippedChats).toEqual([{ reason: 'chat-type', count: 1 }]);
    expect(st.chatsSeen).toBe(2);
  });

  // An export of 300 chats where 200 are empty is a fact about the export. A
  // picker that just lists 300 rows makes the person open them to find out.
  it('keeps an empty chat in the list AND counts it', () => {
    const st = read(account([], { chats: [{ name: 'Saved', type: 'saved_messages', id: 9, messages: [] }] }));
    expect(st.chats).toHaveLength(1);
    expect(st.emptyChats).toBe(1);
  });

  it('counts a malformed chat entry rather than dropping it in silence', () => {
    const st = read(account([], { chats: ['not an object', { name: 'Bo', type: 'personal_chat', id: 1, messages: [msg()] }] }));
    expect(st.skippedChats).toEqual([{ reason: 'malformed', count: 1 }]);
    expect(st.chats).toHaveLength(1);
  });
});

describe('accountedForMessages', () => {
  // The sum a review screen puts in front of the person. It is the invariant
  // that makes "nothing was dropped in silence" checkable rather than claimed.
  it('adds kept turns and every skip back up to what was seen', () => {
    const st = firstChat(account([
      msg({ id: 1 }),
      msg({ id: 2, text: '', text_entities: [] }),
      msg({ id: 3, from: null }),
      { id: 4, type: 'service', date: '2026-08-15T16:55:48', action: 'pin_message' },
      'not an object',
    ]));
    expect(st.messagesSeen).toBe(5);
    expect(accountedForMessages(st)).toBe(5);
  });
});

describe('the shipped connector against its own fixture', () => {
  const state = readTelegramExport(TELEGRAM_CONNECTORS['telegram-desktop-json'], fixture);

  it('reads the fixture at all', () => {
    expect(state).not.toBeNull();
  });

  for (const [field, want] of Object.entries(expected)) {
    if (field.startsWith('_')) continue;
    it(`produces the declared ${field}`, () => {
      expect(state?.[field as keyof TelegramExportState]).toEqual(want);
    });
  }

  it('accounts for every message of every chat', () => {
    for (const chat of state!.chats) {
      expect(accountedForMessages(chat)).toBe(chat.messagesSeen);
    }
  });
});

describe('the telegram catalogue', () => {
  const entries = Object.entries(TELEGRAM_CONNECTORS);

  it.each(entries)('%s declares a telegram spec and its id matches its key', (key, c) => {
    expect(c.telegram).toBeTruthy();
    expect(c.id).toBe(key);
    expect(c.format).toBe('json');
  });

  it.each(entries)('%s says whether it has ever been run over a real export', (_key, c) => {
    // Not a style rule. This connector is written against documented shape and
    // has never seen a real file; an app that cannot tell the difference
    // presents a belief as a fact.
    const note = (c as unknown as { _verified?: unknown })._verified;
    expect(typeof note).toBe('string');
    expect(/^(MEASURED|NOT MEASURED)/.test(note as string)).toBe(true);
  });

  it('knows that nobody has run this one over a real export yet', () => {
    // Meant to FAIL the day someone measures it and forgets to say so.
    expect(archiveConnectorIsVerified(TELEGRAM_CONNECTORS['telegram-desktop-json'])).toBe(false);
  });

  it.each(entries)('%s carries no executable pattern', (_key, c) => {
    // Rule 1, asserted rather than trusted: people exchange these files.
    const json = JSON.stringify(c);
    expect(json).not.toMatch(/"\s*\(\s*\)\s*=>/);
    expect(json).not.toMatch(/function\s*\(/);
    for (const t of [...(c.telegram?.skipChatTypes ?? []), ...(c.telegram?.callActions ?? [])]) {
      expect(t).not.toMatch(/[\\^$*+?()[\]{}|]/);
    }
  });
});
