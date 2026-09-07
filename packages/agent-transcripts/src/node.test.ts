/**
 * Reading from a real filesystem, and the one resolution the collision check
 * depends on being correct.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSessionsFromDisk, workingTreeOf, nodeReadDir } from './node';
import claudeCode from './connectors/claude-code.json';
import type { Connector } from './connector';

const CONN = claudeCode as Connector;

function tmp(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'agent-transcripts-'));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

describe('workingTreeOf', () => {
  it('walks up to the folder holding .git', () => {
    const t = tmp();
    try {
      const deep = join(t.root, 'packages', 'thing', 'src');
      mkdirSync(deep, { recursive: true });
      mkdirSync(join(t.root, '.git'));
      expect(workingTreeOf(deep)).toBe(t.root);
    } finally { t.cleanup(); }
  });

  // A linked worktree stores `.git` as a FILE. It has its own index, so it is
  // its own root — precisely the case that must not merge with the checkout it
  // was made from, because running two agents in two worktrees is the CORRECT
  // way to work in parallel.
  it('treats a linked worktree as its own root', () => {
    const t = tmp();
    try {
      const wt = join(t.root, 'wt');
      mkdirSync(join(wt, 'src'), { recursive: true });
      mkdirSync(join(t.root, '.git'));
      writeFileSync(join(wt, '.git'), 'gitdir: ../.git/worktrees/wt', 'utf-8');
      expect(workingTreeOf(join(wt, 'src'))).toBe(wt);
    } finally { t.cleanup(); }
  });

  // A directory in no repository is not thereby part of some other one.
  it('answers null outside any repository, so the caller keeps the raw path', () => {
    const t = tmp();
    try {
      const deep = join(t.root, 'a', 'b');
      mkdirSync(deep, { recursive: true });
      expect(workingTreeOf(deep)).toBeNull();
    } finally { t.cleanup(); }
  });
});

describe('readSessionsFromDisk', () => {
  const line = (o: Record<string, unknown>) => JSON.stringify(o) + '\n';

  const write = (dir: string, name: string, cwd: string, at: string) => {
    writeFileSync(join(dir, name), line({
      type: 'user', timestamp: at, cwd, gitBranch: 'main', sessionId: name,
      isSidechain: false, message: { content: 'hello' },
    }), 'utf-8');
  };

  it('reads a folder of transcripts, newest first, and says what it read', async () => {
    const t = tmp();
    try {
      const proj = join(t.root, 'proj');
      mkdirSync(proj, { recursive: true });
      write(proj, 'a.jsonl', 'C:/w', '2026-08-29T10:00:00.000Z');
      write(proj, 'b.jsonl', 'C:/w', '2026-08-29T11:00:00.000Z');
      const out = await readSessionsFromDisk(t.root, CONN);
      expect(out.sessions.map(s => s.file)).toEqual(['b.jsonl', 'a.jsonl']);
      expect(out.found).toBe(2);
      expect(out.read).toBe(2);
      expect(out.unreadable).toBeNull();
      expect(out.root).toBe(t.root);
    } finally { t.cleanup(); }
  });

  // 🚨 The whole collision check rests on this. The harness records the shell's
  // CURRENT directory, so one `cd` into a subfolder makes a session look like a
  // different project — and the warning would never fire.
  it('resolves a recorded cwd to the working tree it belongs to', async () => {
    const t = tmp();
    try {
      const repo = join(t.root, 'repo');
      const sub = join(repo, 'packages', 'x');
      mkdirSync(sub, { recursive: true });
      mkdirSync(join(repo, '.git'));
      const proj = join(t.root, 'proj');
      mkdirSync(proj, { recursive: true });
      write(proj, 'deep.jsonl', sub, '2026-08-29T11:00:00.000Z');
      write(proj, 'root.jsonl', repo, '2026-08-29T11:00:00.000Z');
      const out = await readSessionsFromDisk(t.root, CONN);
      expect(out.sessions.map(s => s.projectPath)).toEqual([repo, repo]);
    } finally { t.cleanup(); }
  });

  it('keeps a path that belongs to no repository', async () => {
    const t = tmp();
    try {
      const loose = join(t.root, 'loose');
      mkdirSync(loose, { recursive: true });
      const proj = join(t.root, 'proj');
      mkdirSync(proj, { recursive: true });
      write(proj, 'a.jsonl', loose, '2026-08-29T11:00:00.000Z');
      const out = await readSessionsFromDisk(t.root, CONN);
      expect(out.sessions[0].projectPath).toBe(loose);
    } finally { t.cleanup(); }
  });

  it('drops what is older than the floor before opening anything', async () => {
    const t = tmp();
    try {
      const proj = join(t.root, 'proj');
      mkdirSync(proj, { recursive: true });
      write(proj, 'fresh.jsonl', 'C:/w', '2026-08-29T11:00:00.000Z');
      write(proj, 'stale.jsonl', 'C:/w', '2026-08-29T11:00:00.000Z');
      // The mtime is set explicitly rather than inferred from "just written":
      // a floor measured against the clock at test time is a flaky test, and a
      // flaky test on a filter is worse than none.
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      utimesSync(join(proj, 'stale.jsonl'), twoHoursAgo, twoHoursAgo);

      const recent = await readSessionsFromDisk(t.root, CONN, { maxAgeMinutes: 60 });
      expect(recent.found).toBe(1);
      expect(recent.sessions.map(s => s.file)).toEqual(['fresh.jsonl']);

      const all = await readSessionsFromDisk(t.root, CONN, { maxAgeMinutes: 0 });
      expect(all.found).toBe(2);
    } finally { t.cleanup(); }
  });

  it('answers empty for a folder with no transcripts, without throwing', async () => {
    const t = tmp();
    try {
      const out = await readSessionsFromDisk(t.root, CONN);
      expect(out.sessions).toEqual([]);
      expect(out.found).toBe(0);
    } finally { t.cleanup(); }
  });
});

describe('nodeReadDir', () => {
  it('reports a missing folder rather than an empty one', async () => {
    const res = await nodeReadDir(join(tmpdir(), 'definitely-not-here-9182'));
    expect(res.success).toBe(false);
    expect(res.error).toBeTruthy();
    expect(res.files).toBeUndefined();
  });

  it('carries size and mtime, which is what lets recency cost no reads', async () => {
    const t = tmp();
    try {
      writeFileSync(join(t.root, 'x.jsonl'), 'hi', 'utf-8');
      const res = await nodeReadDir(t.root);
      expect(res.success).toBe(true);
      expect(res.files?.[0].sizeBytes).toBe(2);
      expect(res.files?.[0].mtime).toBeGreaterThan(0);
    } finally { t.cleanup(); }
  });
});
