/**
 * Grouping a conversation into BURSTS. Doc 118 §11.
 *
 * The unit a conversation enters memory as, and the decision the import stands
 * or falls on.
 *
 * Doc 118 §8 lot 2 says *one chronicle per human turn and its reply*. That rule
 * was written for a PROVIDER archive, where a turn is a question and a
 * self-contained answer. Between two people a turn is four words: the measured
 * WhatsApp file (§9.3) holds 1 990 of them across one month. Stored that way,
 * recall answers "ok", "\u{1F44D}" and "je te rappelle" — technically the right
 * chunk, and worth nothing.
 *
 * A burst is what people actually remember: an unbroken stretch of talking,
 * ended by everybody going away for a while. It is the smallest unit that
 * still carries a subject.
 *
 * Three rules, and the second is the one that keeps this honest:
 *
 *  1. **The gap is the only signal.** No topic detection, no model, nothing
 *     that needs a network. A cut is a silence longer than `gapMinutes`.
 *  2. **An undated turn never decides anything.** It joins the burst it sits
 *     in and can neither open nor close one — a message whose stamp could not
 *     be read must not silently become a conversation boundary.
 *  3. **A file that is not in order says so.** Stamps that go backwards are
 *     counted rather than obeyed: a negative gap is not a silence, and
 *     treating it as one would cut a burst in the middle of a sentence.
 */

import type { ChatTurn } from './chatLog';

/**
 * How long a silence has to be to end a burst.
 *
 * ⚠️ CHOSEN, not measured. Thirty minutes is the shape of a conversation people
 * describe as "one" — an exchange over coffee, an evening of back-and-forth —
 * and it is the number every caller can override. Nobody has run it over a real
 * archive and counted what it produces; when somebody does, this comment is
 * what has to change first.
 */
export const DEFAULT_BURST_GAP_MINUTES = 30;

export interface Burst<T extends ChatTurn = ChatTurn> {
  turns: T[];
  /** The first readable stamp inside it. Null when no turn carries one. */
  startedAt: string | null;
  /** The last readable stamp inside it. */
  endedAt: string | null;
  /**
   * `YYYY-MM-DD` of the burst's START, which is the day it is filed under.
   *
   * 🚨 Its start, never a split at midnight. An exchange that runs from 23:40 to
   * 00:20 is ONE conversation, and cutting it at the date boundary would put
   * the answer in a different day from the question for the sake of a tidy
   * filename.
   */
  day: string | null;
}

export interface BurstReport<T extends ChatTurn = ChatTurn> {
  bursts: Burst<T>[];
  /** The gap that produced them, so a screen can say what it applied. */
  gapMinutes: number;
  /**
   * Turns whose stamp reads EARLIER than the turn before them.
   *
   * 🎭 Counted, never obeyed. A file that is not in chronological order is a
   * fact about the file; treating a negative gap as a silence would cut a burst
   * mid-sentence, and treating it as zero without saying so would hide that the
   * export is odd.
   */
  outOfOrder: number;
  /** Turns carrying no readable stamp, which decided nothing. */
  undated: number;
}

/**
 * Naive ISO to milliseconds, for a DIFFERENCE only.
 *
 * 🪤 Both stamps are wall clocks with no offset, so reading both as UTC gives
 * the exact interval between them. That is the only thing this value is used
 * for — it is never rendered back, which is what would re-time the whole
 * conversation into the reader's zone (doc 118 §10.2).
 *
 * ⚠️ A pair that straddles a daylight-saving change is off by an hour, because
 * the file does not record the offset and nothing can recover it. At a
 * half-hour granularity that can move ONE boundary a year.
 */
function stampMs(at: string | null): number | null {
  if (!at) return null;
  const ms = Date.parse(at.endsWith('Z') ? at : `${at}Z`);
  return Number.isNaN(ms) ? null : ms;
}

const dayOf = (at: string | null): string | null => (at ? at.slice(0, 10) : null);

/**
 * Cut a conversation into bursts.
 *
 * Order is the file's own; nothing is sorted. An export that lists its messages
 * out of order is reported, not repaired — repairing it would mean deciding
 * that the stamps are right and the order is wrong, and on a file where one
 * clock was off, that is exactly backwards.
 */
export function groupIntoBursts<T extends ChatTurn>(
  turns: readonly T[],
  opts: { gapMinutes?: number } = {},
): BurstReport<T> {
  const gapMinutes = opts.gapMinutes ?? DEFAULT_BURST_GAP_MINUTES;
  const gapMs = Math.max(0, gapMinutes) * 60_000;

  const bursts: Burst<T>[] = [];
  let current: T[] = [];
  // The last stamp SEEN, which is not the last turn: an undated turn leaves it
  // where it was, so the silence is measured across it rather than restarting
  // from nothing.
  let lastMs: number | null = null;
  let outOfOrder = 0;
  let undated = 0;

  const flush = (): void => {
    if (current.length === 0) return;
    const stamps = current.map(t => t.at).filter((s): s is string => s !== null);
    bursts.push({
      turns: current,
      startedAt: stamps[0] ?? null,
      endedAt: stamps.length ? stamps[stamps.length - 1]! : null,
      day: dayOf(stamps[0] ?? null),
    });
    current = [];
  };

  for (const turn of turns) {
    const ms = stampMs(turn.at);
    if (ms === null) {
      undated++;
      current.push(turn);
      continue;
    }
    if (lastMs !== null) {
      const delta = ms - lastMs;
      if (delta < 0) outOfOrder++;
      else if (delta > gapMs) flush();
    }
    current.push(turn);
    // The LATEST moment the conversation was known to be alive, which is not
    // the last turn's stamp. A clock that goes backwards does not make the
    // exchange older: taking it as the new reference makes the very next
    // message look like it arrived after a long silence, and cuts a burst one
    // turn after the odd stamp rather than on it.
    lastMs = Math.max(lastMs ?? ms, ms);
  }
  flush();

  return { bursts, gapMinutes, outOfOrder, undated };
}
