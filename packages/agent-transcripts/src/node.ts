/**
 * Reading transcripts from a real filesystem.
 *
 * Kept in its own entry so a browser build never pulls `node:fs`: the cartridge
 * imports the root, the MCP server imports this.
 *
 * ## Why this matters more than it looks
 *
 * The transcripts are plain files. An agent asking "is anyone else working in
 * this repo right now" does not need the Mnemosyne app to be running, does not
 * need a vault, and does not spend a token. Everything here is a directory
 * listing and a read.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { readSession, type Connector, type SessionState } from './connector';
import { walkSource, type DirEntry, type WalkResult } from './walk';
import { attemptedRoots, discoverSources, type DiscoveredSource } from './discover';

export { discoverSources, attemptedRoots, rootFor, type DiscoveredSource } from './discover';


/** A `walk.ts` ReadDir backed by the real filesystem. */
export async function nodeReadDir(dirPath: string): Promise<{ success: boolean; files?: DirEntry[]; error?: string }> {
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    const files: DirEntry[] = [];
    for (const e of entries) {
      const path = join(dirPath, e.name);
      // stat can throw on a file that vanished between the listing and here —
      // a transcript being rotated, a temp file. One entry is lost, never the
      // listing, and the loss stays visible as an entry with no mtime.
      let sizeBytes: number | undefined;
      let mtime: number | undefined;
      try {
        const st = statSync(path);
        sizeBytes = st.size;
        mtime = st.mtimeMs;
      } catch { /* keep the entry, without its measurements */ }
      files.push({ name: e.name, path, isDirectory: e.isDirectory(), sizeBytes, mtime });
    }
    return { success: true, files };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface ReadFromDiskResult {
  sessions: SessionState[];
  /** The absolute folder that was actually read. Printed by every caller: a
   *  list of sessions means nothing without knowing which folder produced it,
   *  and an empty answer from the wrong folder reads like an idle machine. */
  root: string;
  /** Transcripts found by the walk, before any were opened. */
  found: number;
  /** Transcripts opened this pass. Lower than `found` when a cap applied. */
  read: number;
  /** Files the walk found but could not open, with the first reason. Never
   *  swallowed: a refused read is indistinguishable from an empty folder, and
   *  that is exactly how a blocked extension once looked like "no sessions". */
  unreadable: { count: number; firstReason: string } | null;
}

export interface ReadFromDiskOptions {
  /** Most recent N transcripts. The tail of a 250-file folder is months old
   *  and answers no question about what is happening now. */
  limit?: number;
  /** Skip transcripts whose last write is older than this. 0 means no floor. */
  maxAgeMinutes?: number;
}

/** Transcripts get large; this is the same ceiling the host read path uses. */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Resolved working-tree roots, so a folder is probed once per process. */
const treeCache = new Map<string, string | null>();

/**
 * The working tree a directory belongs to: the nearest ancestor holding `.git`.
 *
 * 🚨 This is what makes the collision check correct rather than decorative.
 * The harness records the shell's CURRENT directory, and a session that ran one
 * `cd` into a subfolder reports that subfolder — measured on this machine, a
 * live session showed `.../packages/mnemosyne-mcp` while its sibling showed the
 * repository root. Grouped on those two strings they look like different
 * projects, so the one warning this tool exists to give would never fire.
 *
 * The git index is per WORKING TREE, so the working tree is the honest key.
 * A `.git` FILE rather than a directory is a linked worktree, which has its own
 * index and is therefore its own root — exactly the case that must NOT be
 * merged with the main checkout.
 *
 * Returns null when no ancestor has one, and the caller keeps the raw path:
 * a directory outside any repository is not thereby part of some other one.
 */
export function workingTreeOf(dir: string): string | null {
  const start = resolve(dir);
  const cached = treeCache.get(start);
  if (cached !== undefined) return cached;

  const chain: string[] = [];
  let cur = start;
  for (;;) {
    chain.push(cur);
    const hit = treeCache.get(cur);
    if (hit !== undefined) {
      for (const d of chain) treeCache.set(d, hit);
      return hit;
    }
    if (existsSync(join(cur, '.git'))) {
      for (const d of chain) treeCache.set(d, cur);
      return cur;
    }
    const up = dirname(cur);
    if (up === cur) break;          // reached the filesystem root
    cur = up;
  }
  for (const d of chain) treeCache.set(d, null);
  return null;
}

/**
 * Every session under `root`, newest first.
 *
 * Files are ordered by mtime BEFORE any is opened, which the directory listing
 * gives for free — so a limit costs nothing but the reads it avoids.
 */
export async function readSessionsFromDisk(
  root: string,
  connector: Connector,
  opts: ReadFromDiskOptions = {},
): Promise<ReadFromDiskResult> {
  const absolute = resolve(root);
  const walk: WalkResult = await walkSource(nodeReadDir, absolute, connector, undefined, { sweep: true });

  let candidates = [...walk.sessionFiles].sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0));
  if (opts.maxAgeMinutes && opts.maxAgeMinutes > 0) {
    const floor = Date.now() - opts.maxAgeMinutes * 60_000;
    candidates = candidates.filter(f => (f.mtime ?? 0) >= floor);
  }
  const found = candidates.length;
  if (opts.limit && opts.limit > 0) candidates = candidates.slice(0, opts.limit);

  const sessions: SessionState[] = [];
  let failures = 0;
  let firstReason = '';

  for (const f of candidates) {
    if ((f.sizeBytes ?? 0) > MAX_FILE_BYTES) {
      failures++;
      if (!firstReason) firstReason = `${f.name} is larger than 50MB`;
      continue;
    }
    let text: string;
    try {
      text = readFileSync(f.path, 'utf-8');
    } catch (err) {
      failures++;
      if (!firstReason) firstReason = err instanceof Error ? err.message : String(err);
      continue;
    }
    const st = readSession(connector, f.name, f.path, text, f.sizeBytes ?? text.length);
    if (!st) continue;
    // The recorded path is a CWD, which one `cd` moves off the project root.
    // Resolving it to its working tree is a filesystem fact, not an invention,
    // and a directory in no repository keeps the path it had.
    if (st.projectPath) st.projectPath = workingTreeOf(st.projectPath) ?? st.projectPath;
    sessions.push(st);
  }

  sessions.sort((a, b) => (b.lastEventAt ?? '').localeCompare(a.lastEventAt ?? ''));

  return {
    sessions,
    root: absolute,
    found,
    read: candidates.length,
    unreadable: failures > 0 ? { count: failures, firstReason } : null,
  };
}

/** One session, and which harness wrote it. Sessions from two agents in one
 *  list are only useful if you can tell which is which. */
export interface SourcedSession {
  session: SessionState;
  sourceId: string;
  /** The agent's own name for itself, for a line a human reads. */
  agent: string;
}

export interface ReadAllResult {
  sessions: SourcedSession[];
  /** Every folder actually opened, with the agent it belongs to. Printed by
   *  callers: a list means nothing without knowing where it came from. */
  roots: { id: string; root: string; declared: boolean; found: number }[];
  /** Folders that were looked for and are not there. NOT an error — most
   *  machines run one agent — but it is the difference between "nobody else is
   *  around" and "the other agent's folder was never opened". */
  missing: { id: string; root: string }[];
  unreadable: { count: number; firstReason: string } | null;
}

/**
 * Every session from every harness that left a folder on this machine.
 *
 * This is the call that makes a Claude Code session able to see an Antigravity
 * session in the same repository. Reading one harness was the easy half; the
 * question that was actually asked spans them.
 *
 * The per-source limit applies PER SOURCE, not to the merged list: capping the
 * total would let a chatty harness push a quiet one off the end, and the quiet
 * one is exactly the session you did not know about.
 */
export async function readAllSources(
  opts: ReadFromDiskOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<ReadAllResult> {
  const sources: DiscoveredSource[] = discoverSources(env);
  const sessions: SourcedSession[] = [];
  const roots: ReadAllResult['roots'] = [];
  let failures = 0;
  let firstReason = '';

  for (const src of sources) {
    const out = await readSessionsFromDisk(src.root, src.connector, opts);
    for (const session of out.sessions) {
      sessions.push({ session, sourceId: src.id, agent: src.connector.displayName });
    }
    roots.push({ id: src.id, root: out.root, declared: src.declared, found: out.found });
    if (out.unreadable) {
      failures += out.unreadable.count;
      if (!firstReason) firstReason = out.unreadable.firstReason;
    }
  }

  // One clock across every harness, so "newest first" means the same thing on
  // both sides of a merged list.
  sessions.sort((a, b) =>
    (b.session.lastEventAt ?? '').localeCompare(a.session.lastEventAt ?? ''));

  const seen = new Set(sources.map(s => s.id));
  const missing = attemptedRoots(env).filter(a => !seen.has(a.id));

  return {
    sessions,
    roots,
    missing,
    unreadable: failures > 0 ? { count: failures, firstReason } : null,
  };
}
