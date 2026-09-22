/**
 * Tests for the local usage counter.
 *
 * HOME is redirected to a temp directory for every test, because the module
 * resolves `~/.mnemosyne` at call time: a test that forgot this would append to
 * the developer's real counter and quietly inflate the very number the page is
 * going to publish.
 *
 * Run: `pnpm --filter @mnemosyne_os/mcp test` (tsx + node:test). This package
 * has no vitest: a test written against it is red on `tsc` AND on the suite.
 */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { localDay, readUsage, recordCall } from './usage.js';

let home: string;
let prevHome: string | undefined;
let prevProfile: string | undefined;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'mnemo-usage-'));
  prevHome = process.env['HOME'];
  prevProfile = process.env['USERPROFILE'];
  process.env['HOME'] = home;
  process.env['USERPROFILE'] = home;
});

afterEach(async () => {
  if (prevHome === undefined) delete process.env['HOME']; else process.env['HOME'] = prevHome;
  if (prevProfile === undefined) delete process.env['USERPROFILE']; else process.env['USERPROFILE'] = prevProfile;
  await rm(home, { recursive: true, force: true });
});

const dayFile = (day: string): string => join(home, '.mnemosyne', 'mcp-usage', `${day}.jsonl`);

describe('localDay', () => {
  it('names the LOCAL day, not the UTC one', () => {
    // 22:30 local on the 17th is already the 18th in UTC for a positive offset,
    // and still the 17th for a negative one. Either way the answer must be the
    // day the human just lived, which is what getDate() returns.
    const d = new Date(2026, 8, 17, 22, 30);
    assert.equal(localDay(d), '2026-09-17');
  });

  it('pads month and day', () => {
    assert.equal(localDay(new Date(2026, 0, 5)), '2026-01-05');
  });
});

describe('recordCall', () => {
  it('appends one line per call, in the local day file', async () => {
    const now = new Date(2026, 8, 17, 10, 0);
    await recordCall('mnemosyne_memory_ask', now);
    await recordCall('mnemosyne_memory_ask', now);
    await recordCall('mnemosyne_todo_add', now);

    const raw = await readFile(dayFile('2026-09-17'), 'utf8');
    const lines = raw.trim().split('\n');
    assert.equal(lines.length, 3);
    assert.equal(JSON.parse(lines[0]!).n, 'mnemosyne_memory_ask');
    assert.equal(JSON.parse(lines[2]!).n, 'mnemosyne_todo_add');
  });

  it('never rejects when the directory cannot be created', async () => {
    // A file where the directory should go: mkdir fails, and the tool call must
    // not fail with it.
    await mkdir(join(home, '.mnemosyne'), { recursive: true });
    await writeFile(join(home, '.mnemosyne', 'mcp-usage'), 'not a directory', 'utf8');
    assert.equal(await recordCall('mnemosyne_memory_ask'), undefined);
  });

  it('separates calls made on different local days', async () => {
    await recordCall('a', new Date(2026, 8, 16, 23, 59));
    await recordCall('b', new Date(2026, 8, 17, 0, 1));
    assert.ok((await readFile(dayFile('2026-09-16'), 'utf8')).includes('"a"'));
    assert.ok((await readFile(dayFile('2026-09-17'), 'utf8')).includes('"b"'));
  });
});

describe('readUsage', () => {
  it('returns null when nothing was ever recorded', async () => {
    // 🎭 Absent is not zero: the caller must be able to say "no measurement"
    // rather than print a confident 0.
    assert.equal(await readUsage(30, new Date(2026, 8, 17)), null);
  });

  it('adds up per tool across days', async () => {
    const now = new Date(2026, 8, 17, 12, 0);
    await recordCall('ask', new Date(2026, 8, 17, 9, 0));
    await recordCall('ask', new Date(2026, 8, 16, 9, 0));
    await recordCall('todo', new Date(2026, 8, 16, 9, 5));

    const u = await readUsage(30, now);
    assert.notEqual(u, null);
    assert.deepEqual(u!.byTool, { ask: 2, todo: 1 });
    assert.equal(u!.total, 3);
    assert.equal(u!.days, 2);
    assert.equal(u!.unreadableDays, 0);
  });

  it('ignores days outside the window', async () => {
    const now = new Date(2026, 8, 17, 12, 0);
    await recordCall('old', new Date(2026, 7, 1, 9, 0));
    await recordCall('new', now);
    const u = await readUsage(7, now);
    assert.deepEqual(u!.byTool, { new: 1 });
  });

  it('skips a truncated last line without calling the day unreadable', async () => {
    // A live server appends while this one reads: a half-written tail is normal.
    const now = new Date(2026, 8, 17, 12, 0);
    await recordCall('ask', now);
    const f = dayFile('2026-09-17');
    await writeFile(f, (await readFile(f, 'utf8')) + '{"t":"2026-09-1', 'utf8');

    const u = await readUsage(30, now);
    assert.equal(u!.total, 1);
    assert.equal(u!.unreadableDays, 0);
  });

  it('counts a day it cannot read as unreadable, never as empty', async () => {
    const now = new Date(2026, 8, 17, 12, 0);
    await recordCall('ask', now);
    await mkdir(join(home, '.mnemosyne', 'mcp-usage', '2026-09-16.jsonl'), { recursive: true });

    const u = await readUsage(30, now);
    assert.equal(u!.unreadableDays, 1);
    assert.equal(u!.total, 1);
  });

  it('ignores lines that carry no tool name', async () => {
    const now = new Date(2026, 8, 17, 12, 0);
    await mkdir(join(home, '.mnemosyne', 'mcp-usage'), { recursive: true });
    await writeFile(dayFile('2026-09-17'),
      '{"t":"x","n":"ask"}\n{"t":"x"}\n{"t":"x","n":""}\n{"t":"x","n":42}\n', 'utf8');

    const u = await readUsage(30, now);
    assert.deepEqual(u!.byTool, { ask: 1 });
    assert.equal(u!.total, 1);
  });

  it('ignores files that are not day logs', async () => {
    const now = new Date(2026, 8, 17, 12, 0);
    await recordCall('ask', now);
    await writeFile(join(home, '.mnemosyne', 'mcp-usage', 'README.md'), 'notes', 'utf8');
    const u = await readUsage(30, now);
    assert.equal(u!.total, 1);
  });
});
