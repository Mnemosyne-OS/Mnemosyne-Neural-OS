/**
 * The version the server announces must be the version that was published.
 *
 * Why this exists. `serverInfo.version` said `1.2.0` while npm served 1.6.2:
 * two hand-typed literals that nothing compared to `package.json`. It is the
 * string an MCP client shows and a user pastes into a bug report, so the whole
 * point of the field, telling two builds apart, was lost, silently, for months.
 *
 * These tests fail on the two ways it can come back: the constant drifting away
 * from the manifest, and a literal version being retyped into index.ts.
 *
 * Run: `pnpm --filter @mnemosyne_os/mcp test` (tsx + node:test).
 */

import { test }          from 'node:test';
import assert            from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path              from 'node:path';
import { PKG_VERSION }   from './version.js';

const HERE   = path.dirname(fileURLToPath(import.meta.url));
const PKG    = JSON.parse(readFileSync(path.join(HERE, '..', 'package.json'), 'utf8')) as {
  version: string;
};
const SOURCE = readFileSync(path.join(HERE, 'index.ts'), 'utf8');

test('PKG_VERSION is the manifest version, read and not retyped', () => {
  assert.equal(PKG_VERSION, PKG.version);
});

test('PKG_VERSION never reports the placeholder on a healthy tree', () => {
  // 'unknown' is the honest answer when package.json cannot be read. Here it
  // can, so seeing it means the path resolution broke.
  assert.notEqual(PKG_VERSION, 'unknown');
});

test('index.ts states no version literal of its own', () => {
  // Both former sites are `version:` fields. Anything semver-shaped assigned to
  // one of them is a hand-typed version coming back.
  const literals = [...SOURCE.matchAll(/version:\s*'(\d+\.\d+\.\d+[^']*)'/g)].map((m) => m[1]!);
  assert.deepEqual(
    literals,
    [],
    `index.ts hardcodes ${literals.join(', ')} — import PKG_VERSION from ./version.js instead`,
  );
});

test('both announcement sites use the constant', () => {
  // The manifest an agent can read, and the handshake a client displays.
  const uses = SOURCE.match(/version:\s*PKG_VERSION/g) ?? [];
  assert.equal(
    uses.length,
    2,
    `expected the manifest and the Server constructor to use PKG_VERSION, found ${uses.length}`,
  );
});

/**
 * The registry manifest is the third place a version is written, and until
 * 2026-09-21 it was the only one nothing compared to `package.json`.
 *
 * 🚨 It matters more than a stale string on screen: `server.json` is what the
 * MCP registry reads to tell people which version to install, so a bump that
 * forgets it points every reader at the release before.
 *
 * 🎭 Skipped rather than failed when the file is absent. The public mirror does
 * not carry it, and this suite runs there too.
 */
const SERVER_JSON_PATH = path.join(HERE, '..', 'server.json');
const SERVER_JSON = existsSync(SERVER_JSON_PATH)
  ? (JSON.parse(readFileSync(SERVER_JSON_PATH, 'utf8')) as { version?: string; packages?: { version?: string }[] })
  : null;

test('server.json states the version package.json states, in every place it states one',
  { skip: SERVER_JSON ? false : 'server.json is not in this checkout' },
  () => {
    const found = [SERVER_JSON!.version, ...(SERVER_JSON!.packages ?? []).map(p => p.version)]
      .filter((v): v is string => typeof v === 'string');
    assert.ok(found.length >= 2, `parsed only ${found.length} version(s) — the guard would pass on a parse failure`);
    for (const v of found) {
      assert.equal(v, PKG.version,
        `server.json says ${v}, package.json says ${PKG.version} — the registry would point at the wrong release`);
    }
  });
