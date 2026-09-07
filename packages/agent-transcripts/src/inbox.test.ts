/**
 * The rules a mailbox between agents has to hold, and the ways this one could
 * quietly stop working: mail that never expires, mail one session eats before
 * the others see it, and a banner on every clean commit.
 */
import { describe, it, expect } from 'vitest';
import {
  ageHours,
  addressesReader,
  deliverable,
  expired,
  markDelivered,
  readerFor,
  renderInbox,
  INBOX_MAX_AGE_HOURS,
  type InboxMessage,
} from './inbox';

const NOW = new Date('2026-08-31T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const msg = (over: Partial<InboxMessage> = {}): InboxMessage => ({
  from: 'todo widget',
  to: '*',
  at: hoursAgo(1),
  subject: 'the red test is mine',
  body: 'useTodoAlarms.test.ts is written against an implementation not landed yet.',
  ...over,
});

describe('expiry — a message is not a memory', () => {
  it('delivers a fresh message', () => {
    expect(deliverable([msg()], { sessionId: 's1' }, NOW)).toHaveLength(1);
  });

  it('drops one past the age, and offers it for pruning', () => {
    const old = msg({ at: hoursAgo(INBOX_MAX_AGE_HOURS + 1) });
    expect(deliverable([old], { sessionId: 's1' }, NOW)).toHaveLength(0);
    expect(expired([old], NOW)).toHaveLength(1);
  });

  it('treats an unreadable date as STALE, never as fresh', () => {
    // 🎭 The dangerous default is the other one: a broken timestamp that reads
    // as "just now" would pin a message in every inbox forever.
    const broken = msg({ at: 'not a date' });
    expect(ageHours(broken, NOW)).toBe(Number.POSITIVE_INFINITY);
    expect(deliverable([broken], { sessionId: 's1' }, NOW)).toHaveLength(0);
  });
});

describe('addressing', () => {
  it('* reaches anyone in the tree', () => {
    expect(addressesReader(msg({ to: '*' }), { sessionId: 'whoever' })).toBe(true);
  });

  it('matches a session id or a human label, either way', () => {
    const m = msg({ to: 'IO feature request' });
    expect(addressesReader(m, { sessionId: 's1', label: 'IO feature request' })).toBe(true);
    expect(addressesReader(m, { sessionId: 'io feature request' })).toBe(true);
    expect(addressesReader(m, { sessionId: 's1', label: 'todo widget' })).toBe(false);
  });

  it('an empty `to` is not a silent no-op — it reaches everyone', () => {
    expect(addressesReader(msg({ to: '' }), { sessionId: 's1' })).toBe(true);
  });
});

describe('delivery is per SESSION, not per message', () => {
  it('shows the same message to a second session', () => {
    // 🚨 The failure this prevents: the first session to commit consumes the
    // mail and everyone else never learns it existed.
    const m = markDelivered(msg(), { sessionId: 's1' });
    expect(deliverable([m], { sessionId: 's1' }, NOW)).toHaveLength(0);
    expect(deliverable([m], { sessionId: 's2' }, NOW)).toHaveLength(1);
  });

  it('marking twice does not grow the list', () => {
    const once = markDelivered(msg(), { sessionId: 's1' });
    expect(markDelivered(once, { sessionId: 's1' }).deliveredTo).toEqual(['s1']);
  });

  it('a reader with no session id still SEES its mail', () => {
    // Refusing to show a message because the harness is quiet is the worse
    // failure. It repeats instead, and the banner says so.
    const m = msg();
    expect(deliverable([m], { sessionId: null }, NOW)).toHaveLength(1);
    expect(markDelivered(m, { sessionId: null })).toEqual(m);
    expect(renderInbox([m], { sessionId: null })).toContain('will show again');
  });
});

describe('rendering', () => {
  it('says nothing at all when there is nothing — no empty banner', () => {
    expect(renderInbox([], { sessionId: 's1' })).toBeNull();
  });

  it('carries the subject, the sender and the body', () => {
    const out = renderInbox([msg()], { sessionId: 's1' })!;
    expect(out).toContain('the red test is mine');
    expect(out).toContain('todo widget');
    expect(out).toContain('useTodoAlarms.test.ts');
  });

  it('orders oldest first, so a thread reads in the order it happened', () => {
    const a = msg({ subject: 'first', at: hoursAgo(5) });
    const b = msg({ subject: 'second', at: hoursAgo(2) });
    const out = deliverable([b, a], { sessionId: 's1' }, NOW).map(m => m.subject);
    expect(out).toEqual(['first', 'second']);
  });
});

/**
 * The half that was DEAD. `addressesReader` handled labels and the test above
 * proved it, but the hook built its reader from the session id alone, so the
 * label branch was unreachable in production: `--to "todo widget"` posted fine,
 * said it was left for todo widget, and reached nobody until it expired.
 *
 * These cover the CONSTRUCTION of the reader, which is where the bug lived. A
 * rule can be right and still never run.
 */
describe('readerFor — the wiring that made label addressing real', () => {
  const sessions = [
    { sessionId: 's1', title: 'todo widget' },
    { sessionId: 's2', title: 'wiki docs' },
  ];

  it('gives the reader the title a sender would actually type', () => {
    expect(readerFor('s1', sessions)).toEqual({ sessionId: 's1', label: 'todo widget' });
  });

  it('delivers a message addressed to that title — the case that used to vanish', () => {
    const m = msg({ to: 'todo widget' });
    expect(deliverable([m], readerFor('s1', sessions), NOW)).toHaveLength(1);
    expect(deliverable([m], readerFor('s2', sessions), NOW)).toHaveLength(0);
  });

  it('carries no label when the harness publishes no session id', () => {
    expect(readerFor(null, sessions)).toEqual({ sessionId: null, label: null });
  });

  it('never guesses a label for a session it cannot find', () => {
    expect(readerFor('unknown-id', sessions)).toEqual({ sessionId: 'unknown-id', label: null });
  });

  it('leaves the label null when the transcript carries no title', () => {
    expect(readerFor('s3', [{ sessionId: 's3', title: null }])).toEqual({ sessionId: 's3', label: null });
  });
});

/**
 * The author of a message is not one of its readers. `deliverable` cannot know
 * that — `from` is a human label, never an id — so the sender's id is seeded
 * into `deliveredTo` at write time. This pins the behaviour that seeding buys.
 */
describe('a sender does not receive its own message', () => {
  it('skips the author when their id was seeded at post time', () => {
    const m = msg({ from: 'todo widget', deliveredTo: ['s1'] });
    expect(deliverable([m], { sessionId: 's1' }, NOW)).toHaveLength(0);
    expect(deliverable([m], { sessionId: 's2' }, NOW)).toHaveLength(1);
  });

  it('still reaches everyone else, so seeding costs no reader', () => {
    const m = msg({ deliveredTo: ['s1'] });
    for (const id of ['s2', 's3', 's4']) {
      expect(deliverable([m], { sessionId: id }, NOW)).toHaveLength(1);
    }
  });
});
