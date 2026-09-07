/**
 * overlap.ts — has another agent session already touched the files I am about
 * to commit?
 *
 * ## The gap this closes
 *
 * `collisionReport` (liveness.ts) answers a SPATIAL question: who else is live
 * in this working tree, on this branch. It groups on `[projectPath, branch]`,
 * which means two sessions on two branches of the same project are never
 * brought together — by construction.
 *
 * That is exactly the waste measured on 2026-09-06. Five branches were
 * discarded during a merge marathon because main had ALREADY solved the same
 * problem by another route: the RAM probe published as a fabricated machine,
 * the download deadline that cut a slow link, the layout save on close, two
 * separate hardcoded-English fixes. Same bug, same reasoning, twice, by
 * sessions that could not see each other. Nothing collapsed. It just cost.
 *
 * The signal that would have caught every one of them is not semantic and
 * needs no model: `metricsCollect.ts` was edited by another session three days
 * ago. A path and a date. That is all this file computes.
 *
 * ## Why it must never guess
 *
 * ⛔ The tempting version asks memory "has anyone solved this?". Retrieval here
 * has NO "I don't know" signal — a miss scores 0.86-1.00 and a hit scores 1.00
 * — so that version fabricates "someone already did this" on the one tool whose
 * entire value is being trusted. Declared, never deduced: this reads recorded
 * file paths and nothing else.
 *
 * Three honesty rules follow, and they are the whole design:
 *
 *  1. `origin` travels. A `tool` touch is a RECORDING (the harness logged a
 *     file-writing call); a `shell` touch is an INFERENCE (a redirection was
 *     read out of a command that may never have completed). Merging them would
 *     let a guess wear a recording's authority.
 *  2. An artifact with no timestamp keeps none. The window then falls back to
 *     the SESSION's own recency, and the result says `dated: false` so the
 *     caller can print "date unknown" instead of inventing one.
 *  3. A capped artifact list is reported. `artifactsCapped` means the reader
 *     stopped at MAX_ARTIFACTS, so a path's ABSENCE from that session proves
 *     nothing — 42 of 211 sessions once showed 40 of their files with nothing
 *     on screen to say so.
 */
import type { SessionState } from './connector';

/** One overlap: a staged path that another session has already written. */
export interface Touch {
  /** The staged path, as the caller gave it. */
  path: string;
  /** The session that touched it. */
  session: SessionState;
  /** `tool` = the harness recorded the write. `shell` = read out of a command. */
  origin: 'tool' | 'shell';
  /** When that session touched it, or null when the line carried no timestamp. */
  at: string | null;
  /** False when `at` is null and the window was judged on the session instead. */
  dated: boolean;
}

export interface OverlapReport {
  /** Overlaps found, newest first. */
  touches: Touch[];
  /** Sessions whose artifact list was capped: their silence is not an answer. */
  cappedSessions: number;
}

export interface OverlapOptions {
  /** This session's id, so the reader is never reported against itself. */
  selfId?: string | null;
  /** Now, in ms. Injected so the window is testable. */
  now?: number;
  /** How far back a touch still counts. */
  windowMs?: number;
  /**
   * Compare paths case-insensitively. Defaults to the Windows answer because
   * that is where the same file arrives spelled two ways; on a case-sensitive
   * filesystem folding would merge two genuinely different files.
   */
  caseInsensitive?: boolean;
}

/**
 * Forty-eight hours, and the number is measured rather than chosen.
 *
 * The window costs real time: this guard runs inside `pre-commit`, and reading
 * transcripts is the expensive part. Measured on this machine, 2026-09-06,
 * over ~250 transcript files:
 *
 *   | window | read time | sessions |
 *   |--------|-----------|----------|
 *   | 12 h   |   0.84 s  |   13     |
 *   | 24 h   |   1.16 s  |   21     |
 *   | 48 h   |   2.42 s  |   37     |
 *   | 72 h   |   3.94 s  |   55     |
 *   | 7 d    |   8.94 s  |  131     |
 *
 * 🚨 Seven days is the window the evidence wants — the branches that
 * duplicated main's work had been written two to three days earlier — and it
 * is exactly the window that must NOT be the default. A hook that adds nine
 * seconds to every commit gets `--no-verify`'d within a week and then protects
 * nothing at all, which is the failure the collision guard beside it already
 * documents.
 *
 * 48 h buys "yesterday and today" — the realistic span of two sessions working
 * in parallel — for about what the doc regeneration in the same hook already
 * costs. `MNEMO_TOUCH_WINDOW_HOURS` widens it for anyone doing a deliberate
 * sweep.
 *
 * ⚠️ The honest way to widen this without paying for it is an index built once
 * per session start (where four seconds is invisible) that the hook then reads
 * in milliseconds. Not built: named here so the next person does not
 * re-discover the cost curve above.
 */
export const TOUCH_WINDOW_MS = 48 * 60 * 60 * 1000;

const fold = (p: string, ci: boolean): string => {
  const slashed = p.replace(/\\/g, '/').replace(/\/+$/, '');
  return ci ? slashed.toLowerCase() : slashed;
};

/** Millis since `iso`, or null when it carries no readable date. */
function msSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? now - t : null;
}

/**
 * Which of `stagedPaths` another session has written inside the window.
 *
 * `stagedPaths` are absolute, as `git diff --cached --name-only` plus the tree
 * root gives them; artifact paths are absolute as the harness recorded them.
 * Both come off the same machine, so a plain normalised compare is right —
 * there is no repo-relative guessing to get wrong.
 */
export function overlappingTouches(
  sessions: readonly SessionState[],
  stagedPaths: readonly string[],
  opts: OverlapOptions = {},
): OverlapReport {
  const now = opts.now ?? Date.now();
  const windowMs = opts.windowMs ?? TOUCH_WINDOW_MS;
  const ci = opts.caseInsensitive ?? (process.platform === 'win32');
  const selfId = opts.selfId ?? null;

  const wanted = new Map<string, string>();   // folded -> as the caller wrote it
  for (const p of stagedPaths) {
    const f = fold(p, ci);
    if (f) wanted.set(f, p);
  }
  if (wanted.size === 0) return { touches: [], cappedSessions: 0 };

  const touches: Touch[] = [];
  let cappedSessions = 0;

  for (const s of sessions) {
    // 🚨 The reader is in the list it reads: without this, every commit warns
    // that "another session" touched the file this session just edited.
    if (selfId && s.sessionId === selfId) continue;

    // The session's own recency, used ONLY as the fallback bound below.
    const sessionAge = msSince(s.lastEventAt, now);

    let matched = false;
    for (const a of s.artifacts) {
      const original = wanted.get(fold(a.path, ci));
      if (!original) continue;

      const age = msSince(a.at, now);
      if (age !== null) {
        if (age > windowMs || age < 0) continue;
        touches.push({ path: original, session: s, origin: a.origin, at: a.at, dated: true });
      } else {
        // No timestamp on the line. The artifact keeps none — the window is
        // judged on the session, and `dated: false` makes the caller say so.
        if (sessionAge === null || sessionAge > windowMs || sessionAge < 0) continue;
        touches.push({ path: original, session: s, origin: a.origin, at: null, dated: false });
      }
      matched = true;
    }

    // Counted only for sessions that are IN the window and could plausibly
    // have touched these files: a capped session from last month tells the
    // committer nothing and would make the caveat fire on every commit.
    if (!matched && s.artifactsCapped && sessionAge !== null && sessionAge <= windowMs) {
      cappedSessions += 1;
    }
  }

  touches.sort((a, b) => {
    // Dated touches first, newest first; undated ones last, since "when" is the
    // field the reader is about to act on.
    if (a.dated !== b.dated) return a.dated ? -1 : 1;
    return Date.parse(b.at ?? '') - Date.parse(a.at ?? '') || 0;
  });

  return { touches, cappedSessions };
}
