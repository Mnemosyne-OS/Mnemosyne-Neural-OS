/**
 * Finding an agent's files, without crawling the disk.
 *
 * Extracted from the shell so it can be tested against a fake directory tree
 * instead of a live bridge — the walk is where the cost lives, and cost is not
 * something to reason about from a comment.
 *
 * ## Why this is not one listing
 *
 * Claude Code puts every transcript of a project in one directory, so a single
 * listing yields the files AND their mtimes. Antigravity buries each one three
 * levels down, one directory per session, so the same information costs one
 * listing per session — 197 of them on this machine.
 *
 * Doing that every five seconds is waste: the reader only ever opens the dozen
 * most recent files. So a buried source is walked in two speeds (see
 * `shouldSweep`): a cheap pass that revisits what is already known to be
 * recent, and a full sweep on a timer that finds everything else.
 */
import type { Connector } from './connector';

export interface DirEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  sizeBytes?: number;
  mtime?: number;
}

/** The host call this walk needs. Injected so tests can supply a tree. */
export type ReadDir = (dirPath: string) => Promise<{ success: boolean; files?: DirEntry[]; error?: string }>;

export interface WalkResult {
  sessionFiles: DirEntry[];
  noteFiles: DirEntry[];
  /** Directories and files looked at, for the empty state to say what it saw. */
  entries: number;
  /** Listings issued. The cost, reported rather than assumed. */
  listings: number;
}

/**
 * How many known session directories a cheap pass revisits.
 *
 * The reader opens at most a dozen files per pass, so revisiting twice that
 * keeps a resumed session visible while leaving the long tail to the sweep.
 */
const RECENT_DIRS = 25;

/** A full sweep at most this often. A session started in between shows up on
 *  the next one, so the cost of the cheap pass buys a minute of staleness for
 *  brand-new sessions only — never for a session already on screen. */
export const SWEEP_EVERY_MS = 60_000;

export function shouldSweep(lastSweepAt: number | null, now: number): boolean {
  return lastSweepAt === null || now - lastSweepAt >= SWEEP_EVERY_MS;
}

/**
 * One pass over a source's folder.
 *
 * `knownDirs` is the set of session directories a previous pass already found
 * files in; on a cheap pass only the most recent of those are revisited, plus
 * any directory never seen before. Pass `sweep: true` to visit everything.
 */
export async function walkSource(
  readDir: ReadDir,
  root: string,
  sessions: Connector,
  notes: Connector | undefined,
  opts: { sweep: boolean; knownDirs?: readonly string[] } = { sweep: true },
): Promise<WalkResult> {
  const sessionFiles: DirEntry[] = [];
  const noteFiles: DirEntry[] = [];
  let entries = 0;
  let listings = 0;

  const list = async (dirPath: string) => {
    listings++;
    return readDir(dirPath);
  };

  const top = await list(root);
  if (!top.success || !top.files) throw new Error(top.error ?? 'readDir failed');

  const buried = sessions.tree?.subPath;
  const notesIn = notes?.tree?.subPath;

  // On a cheap pass, the directories worth revisiting are the ones we already
  // found files in, most recent first, plus anything we have never seen.
  const recent = new Set((opts.knownDirs ?? []).slice(0, RECENT_DIRS));
  const known = new Set(opts.knownDirs ?? []);
  const worthVisiting = (dirPath: string) =>
    opts.sweep || recent.has(dirPath) || !known.has(dirPath);

  for (const entry of top.files) {
    entries++;

    if (!entry.isDirectory) {
      if (entry.name.endsWith(sessions.filePattern)) sessionFiles.push(entry);
      continue;
    }

    if (buried) {
      if (!worthVisiting(entry.path)) continue;

      const deep = await list(`${entry.path}/${buried}`);
      // A session directory without that sub-path simply has no transcript
      // yet — 119 of 197 on this machine. Not an error, nothing to report.
      if (deep.success && deep.files) {
        for (const f of deep.files) {
          entries++;
          if (!f.isDirectory && f.name.endsWith(sessions.filePattern)) sessionFiles.push(f);
        }
      }

      // An agent can bury its transcript and still leave its documents in the
      // session directory itself, which is what an empty notes subPath means.
      if (notes && notesIn === '') {
        const here = await list(entry.path);
        if (here.success && here.files) {
          for (const n of here.files) {
            entries++;
            if (!n.isDirectory && n.name.endsWith(notes.filePattern)) noteFiles.push(n);
          }
        }
      }
      continue;
    }

    const sub = await list(entry.path);
    if (!sub.success || !sub.files) continue;
    for (const f of sub.files) {
      entries++;
      if (!f.isDirectory && f.name.endsWith(sessions.filePattern)) { sessionFiles.push(f); continue; }
      // Only the one declared name is descended: walking every sub-directory
      // would be a filesystem crawl nobody asked for.
      if (notes && notesIn && f.isDirectory && f.name === notesIn) {
        const inNotes = await list(f.path);
        if (!inNotes.success || !inNotes.files) continue;
        for (const n of inNotes.files) {
          entries++;
          if (!n.isDirectory && n.name.endsWith(notes.filePattern)) noteFiles.push(n);
        }
      }
    }
  }

  return { sessionFiles, noteFiles, entries, listings };
}

/**
 * The session directories a pass found files in, most recent first — the
 * memory a cheap pass needs to know what is worth revisiting.
 */
export function activeDirs(files: readonly DirEntry[], sessions: Connector): string[] {
  const depth = (sessions.tree?.subPath ?? '').split('/').filter(Boolean).length;
  const seen = new Set<string>();
  return [...files]
    .sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0))
    .map(f => {
      // No filter(Boolean) here: a POSIX path starts with an empty segment,
      // and dropping it rejoins to `root/p` instead of `/root/p` — a directory
      // that matches nothing, so every cheap pass would re-list everything.
      const segs = f.path.replace(/\\/g, '/').split('/');
      return segs.slice(0, segs.length - depth - 1).join('/');
    })
    .filter(d => d && !seen.has(d) && seen.add(d));
}
