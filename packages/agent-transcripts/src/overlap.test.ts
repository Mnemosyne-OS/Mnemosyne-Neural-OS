import { describe, it, expect } from 'vitest';
import { overlappingTouches, TOUCH_WINDOW_MS } from './overlap';
import type { SessionState, Artifact } from './connector';

const NOW = Date.parse('2026-09-06T12:00:00.000Z');
const ago = (ms: number): string => new Date(NOW - ms).toISOString();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function session(over: Partial<SessionState> = {}): SessionState {
  return {
    file: 's.jsonl',
    path: 'C:/t/s.jsonl',
    sessionId: 'other',
    title: 'the other session',
    model: null,
    projectPath: 'C:/proj',
    branch: 'main',
    isSidechain: false,
    lastEventAt: ago(HOUR),
    firstEventAt: null,
    tool: null,
    sizeBytes: 0,
    artifacts: [],
    artifactsCapped: false,
    humanTurns: [],
    ...over,
  };
}

const art = (path: string, over: Partial<Artifact> = {}): Artifact =>
  ({ path, origin: 'tool', at: ago(HOUR), ...over });

const OPTS = { now: NOW, caseInsensitive: false, selfId: 'me' };

describe('overlappingTouches', () => {
  it('finds a file another session wrote inside the window', () => {
    const s = session({ artifacts: [art('C:/proj/src/metricsCollect.ts')] });
    const r = overlappingTouches([s], ['C:/proj/src/metricsCollect.ts'], OPTS);
    expect(r.touches).toHaveLength(1);
    expect(r.touches[0]!.session).toBe(s);
    expect(r.touches[0]!.dated).toBe(true);
  });

  it('says nothing about a file nobody else touched', () => {
    const s = session({ artifacts: [art('C:/proj/src/elsewhere.ts')] });
    expect(overlappingTouches([s], ['C:/proj/src/mine.ts'], OPTS).touches).toEqual([]);
  });

  it('never reports the reader against itself', () => {
    // 🚨 Without the self filter every commit warns that "another session"
    // touched the file this very session just edited.
    const me = session({ sessionId: 'me', artifacts: [art('C:/proj/a.ts')] });
    expect(overlappingTouches([me], ['C:/proj/a.ts'], OPTS).touches).toEqual([]);
  });

  it('keeps an unknown session id in the report rather than assuming it is not you', () => {
    const anon = session({ sessionId: null, artifacts: [art('C:/proj/a.ts')] });
    expect(overlappingTouches([anon], ['C:/proj/a.ts'], OPTS).touches).toHaveLength(1);
  });

  it('drops a touch older than the window', () => {
    const s = session({ artifacts: [art('C:/proj/a.ts', { at: ago(TOUCH_WINDOW_MS + HOUR) })] });
    expect(overlappingTouches([s], ['C:/proj/a.ts'], OPTS).touches).toEqual([]);
  });

  it('keeps a touch just inside the window', () => {
    const s = session({ artifacts: [art('C:/proj/a.ts', { at: ago(TOUCH_WINDOW_MS - HOUR) })] });
    expect(overlappingTouches([s], ['C:/proj/a.ts'], OPTS).touches).toHaveLength(1);
  });

  it('carries the origin, so a shell inference never wears a recording\'s authority', () => {
    const s = session({
      artifacts: [art('C:/proj/a.ts', { origin: 'shell' }), art('C:/proj/b.ts', { origin: 'tool' })],
    });
    const r = overlappingTouches([s], ['C:/proj/a.ts', 'C:/proj/b.ts'], OPTS);
    expect(r.touches.map(t => t.origin).sort()).toEqual(['shell', 'tool']);
  });

  it('an undated artifact keeps no date and is judged on the session instead', () => {
    const s = session({ lastEventAt: ago(2 * DAY), artifacts: [art('C:/proj/a.ts', { at: null })] });
    const r = overlappingTouches([s], ['C:/proj/a.ts'], OPTS);
    expect(r.touches).toHaveLength(1);
    expect(r.touches[0]!.at).toBeNull();
    expect(r.touches[0]!.dated).toBe(false);
  });

  it('drops an undated artifact when the SESSION itself is outside the window', () => {
    const s = session({
      lastEventAt: ago(TOUCH_WINDOW_MS + DAY),
      artifacts: [art('C:/proj/a.ts', { at: null })],
    });
    expect(overlappingTouches([s], ['C:/proj/a.ts'], OPTS).touches).toEqual([]);
  });

  it('drops an undated artifact from a session that carries no date at all', () => {
    // 🎭 Two unknowns do not make a recent touch.
    const s = session({ lastEventAt: null, artifacts: [art('C:/proj/a.ts', { at: null })] });
    expect(overlappingTouches([s], ['C:/proj/a.ts'], OPTS).touches).toEqual([]);
  });

  it('reports a capped list, because a path missing from it proves nothing', () => {
    const s = session({ artifactsCapped: true, artifacts: [art('C:/proj/elsewhere.ts')] });
    const r = overlappingTouches([s], ['C:/proj/a.ts'], OPTS);
    expect(r.touches).toEqual([]);
    expect(r.cappedSessions).toBe(1);
  });

  it('does not count a capped session that is outside the window', () => {
    const s = session({
      artifactsCapped: true,
      lastEventAt: ago(TOUCH_WINDOW_MS + DAY),
      artifacts: [art('C:/proj/elsewhere.ts')],
    });
    expect(overlappingTouches([s], ['C:/proj/a.ts'], OPTS).cappedSessions).toBe(0);
  });

  it('does not repeat the caveat for a session that already matched', () => {
    const s = session({ artifactsCapped: true, artifacts: [art('C:/proj/a.ts')] });
    const r = overlappingTouches([s], ['C:/proj/a.ts'], OPTS);
    expect(r.touches).toHaveLength(1);
    expect(r.cappedSessions).toBe(0);
  });

  it('folds separators so a Windows path matches the same file', () => {
    const s = session({ artifacts: [art('C:\\proj\\src\\a.ts')] });
    expect(overlappingTouches([s], ['C:/proj/src/a.ts'], OPTS).touches).toHaveLength(1);
  });

  it('does NOT fold case when told the filesystem is case-sensitive', () => {
    // On Linux `A.ts` and `a.ts` are two files; folding them would invent an
    // overlap the committer cannot act on.
    const s = session({ artifacts: [art('/proj/A.ts')] });
    expect(overlappingTouches([s], ['/proj/a.ts'], { ...OPTS, caseInsensitive: false }).touches).toEqual([]);
    expect(overlappingTouches([s], ['/proj/a.ts'], { ...OPTS, caseInsensitive: true }).touches).toHaveLength(1);
  });

  it('says nothing when nothing is staged', () => {
    const s = session({ artifacts: [art('C:/proj/a.ts')] });
    expect(overlappingTouches([s], [], OPTS).touches).toEqual([]);
  });

  it('puts dated touches before undated ones, newest first', () => {
    const older = session({ sessionId: 'a', artifacts: [art('C:/proj/a.ts', { at: ago(30 * HOUR) })] });
    const newer = session({ sessionId: 'b', artifacts: [art('C:/proj/a.ts', { at: ago(HOUR) })] });
    const undated = session({ sessionId: 'c', artifacts: [art('C:/proj/a.ts', { at: null })] });
    const r = overlappingTouches([older, undated, newer], ['C:/proj/a.ts'], OPTS);
    expect(r.touches.map(t => t.session.sessionId)).toEqual(['b', 'a', 'c']);
  });
});
