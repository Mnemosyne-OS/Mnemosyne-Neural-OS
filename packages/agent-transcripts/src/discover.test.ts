import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attemptedRoots, discoverSources, rootFor } from './discover';
import { CONNECTORS } from './index';

const dirs: string[] = [];
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'discover-'));
  dirs.push(d);
  return d;
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** An env with every probed source pointed at a folder that does not exist,
 *  so the developer's real agent folders are never read. */
function isolated(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const none = join(tmpdir(), 'discover-none-xyz');
  return {
    MNEMO_AGENT_SESSIONS: none,
    MNEMO_AGENT_SESSIONS_ANTIGRAVITY: none,
    MNEMO_AGENT_SESSIONS_ANTIGRAVITY_IDE: none,
    ...extra,
  };
}

describe('discover', () => {
  it('never probes OpenClaw: it has no usual folder', () => {
    expect(rootFor('openclaw', {})).toBeNull();
    expect(attemptedRoots(isolated()).map(a => a.id)).not.toContain('openclaw');
  });

  it('reads OpenClaw from the folder a human declared', () => {
    const root = tempDir();
    const env = isolated({ MNEMO_AGENT_SESSIONS_OPENCLAW: root });
    const found = discoverSources(env);
    expect(found.map(s => s.id)).toEqual(['openclaw']);
    expect(found[0]).toMatchObject({ root, declared: true });
  });

  it('marks a declared folder that does not exist as declared', () => {
    const typo = join(tmpdir(), 'discover-typo-xyz');
    const env = isolated({ MNEMO_AGENT_SESSIONS_OPENCLAW: typo });
    expect(discoverSources(env)).toEqual([]);
    expect(attemptedRoots(env).find(a => a.id === 'openclaw')).toEqual({ id: 'openclaw', root: typo, declared: true });
  });
});

// A connector is data a stranger can ship. Its hint is resolved under the
// home directory, so an absolute hint or one that climbs out is refused.
describe('a connector never says where to read', () => {
  it('refuses an absolute hint and one with ".."', () => {
    const conn = CONNECTORS['antigravity'];
    const original = conn.folderHint;
    try {
      conn.folderHint = '/etc';
      expect(rootFor('antigravity', {})).toBeNull();
      conn.folderHint = '../../etc';
      expect(rootFor('antigravity', {})).toBeNull();
    } finally {
      conn.folderHint = original;
    }
  });
});
