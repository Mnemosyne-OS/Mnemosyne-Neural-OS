/**
 * usage.ts — a local count of how often an agent actually calls these tools.
 *
 * It exists to answer one question with a measurement instead of a claim: is the
 * memory used every day, or only demonstrated? Nothing here leaves the machine,
 * there is no endpoint and no identifier — the file sits next to the user's own
 * data and is theirs to read or delete. A memory product that phoned home about
 * its usage would be arguing against itself.
 *
 * 🚨 APPEND-ONLY, one line per call, one file per local day. Several MCP servers
 * run at once (one per agent session, and this machine regularly has three), so
 * a read-modify-write on a shared counter loses calls exactly when the tool is
 * being used most. An append never reads what the others wrote.
 *
 * 🚨 A failure here NEVER fails the tool call. The counter is an observation of
 * the work, not part of it: a full disk must not stop an agent from asking a
 * question. Failures are reported once to stderr and then stay quiet, because a
 * line printed on every call would be worse than the lost count.
 *
 * @module usage
 */
import { appendFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** One recorded call. Kept to two short fields: the file is written on every tool call. */
interface UsageLine {
  /** ISO instant of the call. */
  t: string;
  /** Tool name, as the agent asked for it. */
  n: string;
}

/** What a day of the log adds up to. */
export interface UsageTotals {
  /** Calls per tool name, highest first when rendered. */
  byTool: Record<string, number>;
  /** Every call on every day read. */
  total: number;
  /** Local days that had at least one call. */
  days: number;
  /**
   * 🎭 Days the reader could NOT parse, kept separate from days with no calls.
   * An unreadable file is an unknown, never a zero.
   */
  unreadableDays: number;
}

/** `~/.mnemosyne`, the same directory the daemon helpers already use. */
function mnemosyneDir(): string {
  return join(homedir(), '.mnemosyne');
}

function usageDir(): string {
  return join(mnemosyneDir(), 'mcp-usage');
}

/**
 * The LOCAL calendar day, because a human counting "today" means their today.
 * `toISOString()` would roll over at UTC midnight and split an evening in two.
 *
 * @param now - Instant to name
 * @returns `YYYY-MM-DD` in local time
 */
export function localDay(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Set once a write has failed, so the warning is printed a single time. */
let warned = false;

/**
 * Records one tool call. Never throws, never rejects.
 *
 * @param tool - Tool name
 * @param now - Injectable clock, for tests
 */
export async function recordCall(tool: string, now: Date = new Date()): Promise<void> {
  const line: UsageLine = { t: now.toISOString(), n: tool };
  try {
    await mkdir(usageDir(), { recursive: true });
    await appendFile(join(usageDir(), `${localDay(now)}.jsonl`), `${JSON.stringify(line)}\n`, 'utf8');
  } catch (err) {
    // Rule 7: never a silent catch. But this runs on every call, so it says it
    // once — a message per call would drown the agent's own output.
    if (!warned) {
      warned = true;
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[mnemosyne] usage counter disabled (${msg})\n`);
    }
  }
}

/**
 * Adds up the recorded days.
 *
 * @param sinceDays - How many local days back to read, today included
 * @param now - Injectable clock, for tests
 * @returns Totals, or `null` when the directory cannot be listed at all
 */
export async function readUsage(sinceDays = 30, now: Date = new Date()): Promise<UsageTotals | null> {
  let names: string[];
  try {
    names = await readdir(usageDir());
  } catch {
    // 🎭 No directory is not "zero calls": nothing has been recorded here, which
    // is a different statement, and the caller has to be able to tell them apart.
    return null;
  }

  const wanted = new Set<string>();
  for (let i = 0; i < sinceDays; i++) {
    wanted.add(localDay(new Date(now.getTime() - i * 86_400_000)));
  }

  const totals: UsageTotals = { byTool: {}, total: 0, days: 0, unreadableDays: 0 };

  for (const name of names) {
    const day = name.replace(/\.jsonl$/, '');
    if (name === day || !wanted.has(day)) continue;
    let raw: string;
    try {
      raw = await readFile(join(usageDir(), name), 'utf8');
    } catch {
      totals.unreadableDays++;
      continue;
    }
    let seen = 0;
    for (const row of raw.split('\n')) {
      if (!row.trim()) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(row);
      } catch {
        // 🪤 The last line is routinely half-written: the file is appended to by
        // a live process while this one reads it. A truncated tail is expected,
        // not corruption, so it is skipped without touching unreadableDays.
        continue;
      }
      const tool = (parsed as UsageLine | null)?.n;
      if (typeof tool !== 'string' || !tool) continue;
      totals.byTool[tool] = (totals.byTool[tool] ?? 0) + 1;
      totals.total++;
      seen++;
    }
    if (seen > 0) totals.days++;
  }

  return totals;
}
