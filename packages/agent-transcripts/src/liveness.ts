/**
 * What "still going" means, in one place.
 *
 * ## The rule this module exists to protect
 *
 * ⛔ Nothing here ever answers "is this agent working". A crashed agent and an
 * idle one produce exactly the same silence — the narrator cannot be the
 * subject it observes (doc 93 §2). What IS provable is when the harness last
 * wrote a line, so everything here is phrased as *last seen*, and the caller
 * is left to conclude.
 *
 * `LIVE_MINUTES` is therefore a RECENCY window, not a verdict: a session
 * inside it wrote something recently. It may still be dead.
 *
 * ## Why it is shared rather than duplicated
 *
 * Two consumers now read the same transcripts — the Ariadne cartridge on
 * screen, and the MCP server answering another agent. If they disagreed about
 * what counts as recent, a developer would be told "nobody else is on this
 * branch" by one and warned by the other, on the same machine, in the same
 * second. There is no version of that which is not a bug.
 */

/**
 * Below this many minutes since its last written line, a session is shown as
 * recent.
 *
 * Ten, which is the value the cartridge has shipped and the one the collision
 * warning was tuned against in the field. A coding agent can sit on one long
 * build or one long thought for several minutes without being gone, and a
 * window that drops it would make the warning miss exactly the case it exists
 * for. ⛔ do not lower it to "one turn" on the reasoning that a turn is short.
 */
export const LIVE_MINUTES = 10;

export interface LiveLike {
  projectPath: string | null;
  branch: string | null;
  isSidechain: boolean;
  lastEventAt: string | null;
}

/** Minutes since a timestamp. Infinity when there is none — an absent time is
 *  infinitely old, never zero, which would make an unknown look brand new. */
export function minutesSince(iso: string | null, now: number = Date.now()): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return Number.POSITIVE_INFINITY;
  return (now - at) / 60_000;
}

/** Wrote something within the recency window. NOT "is working". */
export function isRecent(s: LiveLike, now: number = Date.now()): boolean {
  return minutesSince(s.lastEventAt, now) < LIVE_MINUTES;
}

/**
 * The sessions that count for a collision: recent, and not a subagent.
 *
 * A sidechain is the same conversation's own helper, not a second person at
 * the keyboard. Counting it would fire the warning on every session that ever
 * delegated anything, and a warning that always fires is one nobody reads.
 */
export function liveSessions<T extends LiveLike>(sessions: readonly T[], now: number = Date.now()): T[] {
  return sessions.filter(s => !s.isSidechain && isRecent(s, now));
}

export interface Collision<T> {
  projectPath: string | null;
  branch: string | null;
  sessions: T[];
}

export interface CollisionReport<T> {
  groups: Collision<T>[];
  /**
   * Recent sessions that could not be placed, because their harness records
   * neither a project nor a branch.
   *
   * 🚨 This number must reach the screen. Measured 2026-08-29 on one machine:
   * 91 of 288 sessions carry neither field (Antigravity records no cwd at all,
   * and some Claude Code transcripts lose theirs). Bucketed together they
   * would all share the key [null, null], and any two live ones would be
   * announced as a collision that nothing supports — a fabricated warning on
   * the one tool whose entire value is that you can trust it.
   *
   * Dropping them silently is the other half of the mistake: the honest
   * position is "these sessions exist and I cannot place them".
   */
  unplaceable: T[];
}

/**
 * Two or more sessions writing to the same project and branch right now.
 *
 * This is the finding the whole tool was built around: a commit from one picks
 * up whatever the other has staged, because `git add` takes the INDEX, which
 * is shared by every process in that working tree.
 *
 * Grouped on project AND branch. Project alone would fire across worktrees,
 * which have separate indexes and are the correct way to run two agents at
 * once; branch alone would fire across unrelated repositories.
 */
export function collisions<T extends LiveLike>(sessions: readonly T[], now: number = Date.now()): Collision<T>[] {
  return collisionReport(sessions, now).groups;
}

/**
 * The same grouping, plus what it could not answer for.
 *
 * Prefer this over `collisions` anywhere the result reaches a human or an
 * agent: a list of groups with no count of the sessions that were skipped
 * reads as a complete survey of the machine, and it is not one.
 */
export function collisionReport<T extends LiveLike>(sessions: readonly T[], now: number = Date.now()): CollisionReport<T> {
  // Keyed on both fields, and each bucket CARRIES them: re-parsing a joined
  // key would have to pick a separator, and this machine's own project is
  // `_MNEMOSYNE OS` — splitting on a space would cut the path in half and
  // report the collision under a project that does not exist.
  const groups = new Map<string, Collision<T>>();
  const unplaceable: T[] = [];

  for (const s of liveSessions(sessions, now)) {
    // Neither field known is NO EVIDENCE, not a shared location. Grouping on
    // [null, null] would announce a collision between two sessions that may be
    // in different repositories on different branches.
    if (!s.projectPath && !s.branch) { unplaceable.push(s); continue; }
    // ONE field missing still narrows it: two sessions in the same working
    // tree that both failed to report a branch are not thereby proven to be on
    // different ones, and the caller renders the gap as `unknown branch`.
    const key = JSON.stringify([s.projectPath, s.branch]);
    const bucket = groups.get(key);
    if (bucket) bucket.sessions.push(s);
    else groups.set(key, { projectPath: s.projectPath, branch: s.branch, sessions: [s] });
  }

  return {
    groups: [...groups.values()].filter(g => g.sessions.length > 1),
    unplaceable,
  };
}

/**
 * Which of these sessions is the one asking.
 *
 * A warning that says "3 sessions are live in this tree" when one of them is
 * YOU overstates the hazard by one, and the reader has to work out which line
 * is their own before they can act. Naming it turns the count into the number
 * that matters: how many OTHER sessions could sweep your index.
 *
 * 🚨 An absent id must never become "none of them is you". That would be the
 * ABSENT-becomes-ZERO mistake on a safety warning: a harness that does not
 * publish a session id would silently gain a phantom extra session in every
 * count. `null` in, `null` out, and the caller keeps the neutral phrasing.
 */
export function findSelf<T extends { sessionId: string | null }>(
  sessions: readonly T[],
  selfId: string | null | undefined,
): T | null {
  if (!selfId) return null;
  return sessions.find(s => s.sessionId === selfId) ?? null;
}
