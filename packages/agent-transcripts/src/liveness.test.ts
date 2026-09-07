/**
 * Two consumers now read the same transcripts: a screen and an agent. These
 * tests are what stops them from giving one developer two different answers
 * about the same second.
 */
import { describe, it, expect } from 'vitest';
import { LIVE_MINUTES, collisionReport, collisions, findSelf, isRecent, liveSessions, minutesSince } from './liveness';

const NOW = Date.parse('2026-08-29T12:00:00.000Z');
const minutesAgo = (n: number) => new Date(NOW - n * 60_000).toISOString();

const s = (over: Partial<Parameters<typeof isRecent>[0]> & { id?: string } = {}) => ({
  projectPath: 'C:/w/proj', branch: 'main', isSidechain: false,
  lastEventAt: minutesAgo(1), ...over,
});

describe('minutesSince', () => {
  it('measures against the given moment', () => {
    expect(minutesSince(minutesAgo(3), NOW)).toBeCloseTo(3);
  });

  // An absent time is infinitely old, never zero. Zero would make a session
  // that never wrote a timestamp look like the freshest thing on the machine.
  it('treats an absent or unreadable time as infinitely old', () => {
    expect(minutesSince(null, NOW)).toBe(Number.POSITIVE_INFINITY);
    expect(minutesSince('not a date', NOW)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('isRecent', () => {
  it('is a statement about a timestamp, at the declared window', () => {
    expect(isRecent(s({ lastEventAt: minutesAgo(LIVE_MINUTES - 1) }), NOW)).toBe(true);
    expect(isRecent(s({ lastEventAt: minutesAgo(LIVE_MINUTES + 1) }), NOW)).toBe(false);
  });

  // The window the cartridge has shipped. Lowering it on the reasoning that
  // "a turn is short" makes the collision warning miss a session sitting on
  // one long build, which is the case it exists for.
  it('keeps the field-tested window', () => {
    expect(LIVE_MINUTES).toBe(10);
  });
});

describe('liveSessions', () => {
  it('drops the stale ones', () => {
    const out = liveSessions([s({ lastEventAt: minutesAgo(1) }), s({ lastEventAt: minutesAgo(60) })], NOW);
    expect(out).toHaveLength(1);
  });

  // A sidechain is the conversation's own helper, not a second person at the
  // keyboard. Counting it fires the warning on every session that delegated
  // anything, and a warning that always fires is one nobody reads.
  it('drops a subagent', () => {
    expect(liveSessions([s({ isSidechain: true })], NOW)).toEqual([]);
  });
});

describe('collisions', () => {
  it('finds two live sessions on the same project and branch', () => {
    const out = collisions([s(), s()], NOW);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ projectPath: 'C:/w/proj', branch: 'main' });
    expect(out[0].sessions).toHaveLength(2);
  });

  it('says nothing about one session alone', () => {
    expect(collisions([s()], NOW)).toEqual([]);
  });

  // Worktrees have separate indexes and are the correct way to run two agents
  // at once. Grouping on project alone would punish exactly the right answer.
  it('does not fire across two worktrees of one branch', () => {
    expect(collisions([s({ projectPath: 'C:/w/a' }), s({ projectPath: 'C:/w/b' })], NOW)).toEqual([]);
  });

  it('does not fire across two repositories sharing a branch name', () => {
    expect(collisions([s({ projectPath: 'C:/one' }), s({ projectPath: 'C:/two' })], NOW)).toEqual([]);
  });

  it('does not fire on two branches of one project', () => {
    expect(collisions([s({ branch: 'main' }), s({ branch: 'feat' })], NOW)).toEqual([]);
  });

  it('ignores a session that has gone quiet', () => {
    expect(collisions([s(), s({ lastEventAt: minutesAgo(90) })], NOW)).toEqual([]);
  });

  // 🪤 This machine's own project is `_MNEMOSYNE OS`. A key joined and then
  // split on a space would cut the path in half and report the collision under
  // a project that does not exist.
  it('keeps a project path that contains a space intact', () => {
    const out = collisions([
      s({ projectPath: 'C:/TRAVAIL/_MNEMOSYNE OS' }),
      s({ projectPath: 'C:/TRAVAIL/_MNEMOSYNE OS' }),
    ], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].projectPath).toBe('C:/TRAVAIL/_MNEMOSYNE OS');
  });

  // One field missing still narrows it: same working tree, branch unknown.
  it('groups two sessions in one tree that both fail to report a branch', () => {
    const out = collisions([s({ branch: null }), s({ branch: null })], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].branch).toBeNull();
  });

  // 🚨 Measured 2026-08-29: 91 of 288 real sessions carry NEITHER field
  // (Antigravity records no cwd at all). Bucketed on [null, null] they would
  // all collide with each other, and the tool whose whole value is that you
  // can trust it would be inventing warnings.
  it('never groups two sessions that report neither project nor branch', () => {
    const blind = [s({ projectPath: null, branch: null }), s({ projectPath: null, branch: null })];
    expect(collisions(blind, NOW)).toEqual([]);
  });

  it('reports the sessions it could not place rather than dropping them', () => {
    const report = collisionReport([
      s({ projectPath: null, branch: null }),
      s({ projectPath: null, branch: null }),
      s(),
    ], NOW);
    expect(report.groups).toEqual([]);
    expect(report.unplaceable).toHaveLength(2);
  });

  it('does not count a stale unplaceable session as present', () => {
    const report = collisionReport([s({ projectPath: null, branch: null, lastEventAt: minutesAgo(300) })], NOW);
    expect(report.unplaceable).toEqual([]);
  });

  it('reports several groups at once', () => {
    const out = collisions([
      s({ branch: 'main' }), s({ branch: 'main' }),
      s({ branch: 'feat' }), s({ branch: 'feat' }),
    ], NOW);
    expect(out).toHaveLength(2);
  });
});

describe('findSelf', () => {
  const row = (sessionId: string | null) => ({ sessionId });

  it('finds the session that is asking', () => {
    expect(findSelf([row('a'), row('b')], 'b')).toEqual(row('b'));
  });

  // 🚨 ABSENT is not "none of them". A harness that publishes no session id
  // would otherwise gain a phantom extra session in every warning, and the
  // count that matters is how many OTHERS could sweep your index.
  it('answers null when the caller does not know its own id', () => {
    expect(findSelf([row('a')], null)).toBeNull();
    expect(findSelf([row('a')], undefined)).toBeNull();
    expect(findSelf([row('a')], '')).toBeNull();
  });

  it('answers null rather than guessing when no session matches', () => {
    expect(findSelf([row('a'), row(null)], 'zzz')).toBeNull();
  });

  it('never matches a session whose own id is absent', () => {
    expect(findSelf([row(null)], null)).toBeNull();
  });
});
