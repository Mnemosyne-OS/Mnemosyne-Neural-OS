/**
 * local-time — the one clock every time in a tool answer is printed in.
 *
 * 🚨 The host reads an ISO string WITHOUT an offset as THIS machine's local
 * wall clock (the `datetime-local` frame the Agenda widget already lives in),
 * and a bare date as local midnight. The answers printed
 * `toISOString().slice(0, 16)` — UTC, with the `Z` cut off — so an agent that
 * read "14:00" back and wrote "14:00" moved the appointment by the timezone
 * offset on every round trip, and nothing said so. One frame in both
 * directions, and the answer names it once.
 *
 * @module local-time
 */

const pad = (n: number): string => String(n).padStart(2, '0');

/** `YYYY-MM-DD HH:MM` in this machine's local time. Empty for a number nobody measured. */
export function localStamp(at: number | undefined): string {
  if (typeof at !== 'number' || !Number.isFinite(at)) return '';
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Stated once per answer that prints a time, so the frame is never guessed. */
export const LOCAL_TIME_NOTE = 'Times are this machine\'s local time; give times back in the same frame (ISO 8601 without an offset).';

/** `YYYY-MM-DD` and nothing else — the one ISO form the spec reads as UTC. */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A date from the agent → epoch ms, or `null` when it cannot be read. The
 * same rule as the host's `parseExternalDate`, because the read door only
 * takes NUMBERS for its window bounds and someone has to apply it before the
 * wire: a number is a number, a numeric string is epoch ms, a bare date is
 * LOCAL midnight (the spec's UTC reading put "2026-09-10" on the 9th for every
 * zone west of Greenwich), and anything else goes through `Date` — local when
 * no offset is given, absolute when one is.
 */
export function parseAgentDate(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^-?\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  const dateOnly = DATE_ONLY.exec(trimmed);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    const at = new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0);
    // Rejects the impossible (`2026-13-40`), which the constructor would roll over.
    if (at.getMonth() !== Number(m) - 1 || at.getDate() !== Number(d)) return null;
    return at.getTime();
  }
  const ms = new Date(trimmed).getTime();
  return Number.isFinite(ms) ? ms : null;
}
