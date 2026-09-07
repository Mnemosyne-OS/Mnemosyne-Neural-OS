/**
 * The walk is where the cost lives, so the tests count listings as carefully
 * as they count files. A fake tree stands in for the host bridge.
 */
import { describe, it, expect } from 'vitest';
import { walkSource, activeDirs, shouldSweep, SWEEP_EVERY_MS, type ReadDir } from './walk';
import type { Connector } from './connector';

const FLAT: Connector = {
  id: 'flat', displayName: 'Flat', version: '1', format: 'jsonl', kind: 'session',
  filePattern: '.jsonl', fields: { timestamp: 'timestamp' },
};
const FLAT_NOTES: Connector = {
  id: 'flat-notes', displayName: 'Notes', version: '1', format: 'markdown',
  kind: 'document', filePattern: '.md', fields: {}, frontmatter: { name: 'name' },
  tree: { subPath: 'memory' },
};
const BURIED: Connector = {
  ...FLAT, id: 'buried', tree: { subPath: '.system_generated/logs', idFrom: 'dir' },
  filePattern: 'transcript.jsonl',
};
const BURIED_NOTES: Connector = { ...FLAT_NOTES, id: 'bn', tree: { subPath: '' } };

/** Builds a readDir over a plain map of directory -> entry names. */
function tree(map: Record<string, string[]>): { readDir: ReadDir; calls: string[] } {
  const calls: string[] = [];
  const readDir: ReadDir = (dirPath) => {
    calls.push(dirPath);
    const names = map[dirPath];
    if (!names) return Promise.resolve({ success: false, error: 'ENOENT' });
    return Promise.resolve({
      success: true,
      files: names.map((n, i) => ({
        name: n,
        path: `${dirPath}/${n}`,
        isDirectory: !n.includes('.'),
        sizeBytes: 100,
        mtime: 1000 - i,          // first listed is the most recent
      })),
    });
  };
  return { readDir, calls };
}

describe('walkSource on a flat layout', () => {
  const map = {
    '/root': ['projA', 'projB', 'stray.txt'],
    '/root/projA': ['a.jsonl', 'b.jsonl', 'memory'],
    '/root/projA/memory': ['n1.md', 'n2.md', 'skip.txt'],
    '/root/projB': ['c.jsonl'],
  };

  it('finds transcripts one level down and notes in the declared subdirectory', async () => {
    const { readDir } = tree(map);
    const r = await walkSource(readDir, '/root', FLAT, FLAT_NOTES);
    expect(r.sessionFiles.map(f => f.name)).toEqual(['a.jsonl', 'b.jsonl', 'c.jsonl']);
    expect(r.noteFiles.map(f => f.name)).toEqual(['n1.md', 'n2.md']);
  });

  it('ignores a file that does not match the pattern', async () => {
    const { readDir } = tree(map);
    const r = await walkSource(readDir, '/root', FLAT, FLAT_NOTES);
    expect(r.sessionFiles.some(f => f.name === 'stray.txt')).toBe(false);
    expect(r.noteFiles.some(f => f.name === 'skip.txt')).toBe(false);
  });

  it('does not look for notes when the source declares none', async () => {
    const { readDir, calls } = tree(map);
    await walkSource(readDir, '/root', FLAT, undefined);
    expect(calls).not.toContain('/root/projA/memory');
  });

  it('throws when the root itself cannot be listed', async () => {
    const { readDir } = tree({});
    await expect(walkSource(readDir, '/nope', FLAT, undefined)).rejects.toThrow('ENOENT');
  });

  it('survives a sub-directory it cannot list', async () => {
    const { readDir } = tree({ '/root': ['projA', 'gone'], '/root/projA': ['a.jsonl'] });
    const r = await walkSource(readDir, '/root', FLAT, undefined);
    expect(r.sessionFiles.map(f => f.name)).toEqual(['a.jsonl']);
  });
});

describe('walkSource on a buried layout', () => {
  const map: Record<string, string[]> = {
    '/brain': ['s1', 's2', 's3'],
    '/brain/s1': ['task.md', '.system_generated'],
    '/brain/s1/.system_generated/logs': ['transcript.jsonl', 'transcript_full.jsonl'],
    '/brain/s2': ['walkthrough.md'],
    '/brain/s2/.system_generated/logs': ['transcript.jsonl'],
    // s3 has no logs at all — the common case, not an error.
    '/brain/s3': [],
  };

  it('reaches transcripts three levels down', async () => {
    const { readDir } = tree(map);
    const r = await walkSource(readDir, '/brain', BURIED, undefined);
    expect(r.sessionFiles.map(f => f.path)).toEqual([
      '/brain/s1/.system_generated/logs/transcript.jsonl',
      '/brain/s2/.system_generated/logs/transcript.jsonl',
    ]);
  });

  it('does not mistake transcript_full for the transcript', async () => {
    const { readDir } = tree(map);
    const r = await walkSource(readDir, '/brain', BURIED, undefined);
    expect(r.sessionFiles.some(f => f.name === 'transcript_full.jsonl')).toBe(false);
  });

  it('collects documents from the session directory when the subPath is empty', async () => {
    const { readDir } = tree(map);
    const r = await walkSource(readDir, '/brain', BURIED, BURIED_NOTES);
    expect(r.noteFiles.map(f => f.name)).toEqual(['task.md', 'walkthrough.md']);
  });

  it('says nothing about a session with no transcript yet', async () => {
    const { readDir } = tree(map);
    const r = await walkSource(readDir, '/brain', BURIED, undefined);
    expect(r.sessionFiles).toHaveLength(2);
  });
});

describe('the cost of a buried walk', () => {
  const many = Object.fromEntries([
    ['/brain', Array.from({ length: 100 }, (_, i) => `s${i}`)],
    ...Array.from({ length: 100 }, (_, i) => [
      [`/brain/s${i}/.system_generated/logs`, ['transcript.jsonl']],
    ]).flat(),
  ]) as Record<string, string[]>;

  it('a full sweep costs one listing per session, plus the root', async () => {
    const { readDir, calls } = tree(many);
    const r = await walkSource(readDir, '/brain', BURIED, undefined, { sweep: true });
    expect(r.listings).toBe(101);
    expect(calls[0]).toBe('/brain');
  });

  it('a cheap pass revisits only the recent directories', async () => {
    const { readDir } = tree(many);
    const known = Array.from({ length: 100 }, (_, i) => `/brain/s${i}`);
    const r = await walkSource(readDir, '/brain', BURIED, undefined, { sweep: false, knownDirs: known });
    // Root + the 25 most recent, and nothing else.
    expect(r.listings).toBe(26);
  });

  it('a cheap pass still visits a directory it has never seen', async () => {
    const { readDir } = tree(many);
    // Everything known except s99, which must still be reached.
    const known = Array.from({ length: 99 }, (_, i) => `/brain/s${i}`);
    const r = await walkSource(readDir, '/brain', BURIED, undefined, { sweep: false, knownDirs: known });
    expect(r.sessionFiles.some(f => f.path.startsWith('/brain/s99/'))).toBe(true);
  });

  it('costs the same either way on a flat layout, which has nothing to skip', async () => {
    const { readDir } = tree({ '/root': ['p'], '/root/p': ['a.jsonl'] });
    const sweep = await walkSource(readDir, '/root', FLAT, undefined, { sweep: true });
    const cheap = await walkSource(readDir, '/root', FLAT, undefined, { sweep: false, knownDirs: [] });
    expect(cheap.listings).toBe(sweep.listings);
  });
});

describe('activeDirs', () => {
  it('names the session directory of each buried file, most recent first', () => {
    const files = [
      { name: 't.jsonl', path: '/brain/old/.system_generated/logs/t.jsonl', isDirectory: false, mtime: 1 },
      { name: 't.jsonl', path: '/brain/new/.system_generated/logs/t.jsonl', isDirectory: false, mtime: 9 },
    ];
    expect(activeDirs(files, BURIED)).toEqual(['/brain/new', '/brain/old']);
  });

  it('names the containing directory on a flat layout', () => {
    const files = [{ name: 'a.jsonl', path: '/root/projA/a.jsonl', isDirectory: false, mtime: 1 }];
    expect(activeDirs(files, FLAT)).toEqual(['/root/projA']);
  });

  it('lists each directory once even with many files in it', () => {
    const files = [
      { name: 'a.jsonl', path: '/root/p/a.jsonl', isDirectory: false, mtime: 2 },
      { name: 'b.jsonl', path: '/root/p/b.jsonl', isDirectory: false, mtime: 1 },
    ];
    expect(activeDirs(files, FLAT)).toEqual(['/root/p']);
  });

  it('reads a Windows path', () => {
    const files = [{ name: 't.jsonl', path: 'C:\\brain\\s1\\.system_generated\\logs\\t.jsonl', isDirectory: false, mtime: 1 }];
    expect(activeDirs(files, BURIED)).toEqual(['C:/brain/s1']);
  });
});

describe('shouldSweep', () => {
  it('sweeps on the very first pass', () => {
    expect(shouldSweep(null, 1000)).toBe(true);
  });

  it('does not sweep again straight away', () => {
    expect(shouldSweep(1000, 1000 + SWEEP_EVERY_MS - 1)).toBe(false);
  });

  it('sweeps again once the interval has elapsed', () => {
    expect(shouldSweep(1000, 1000 + SWEEP_EVERY_MS)).toBe(true);
  });
});
