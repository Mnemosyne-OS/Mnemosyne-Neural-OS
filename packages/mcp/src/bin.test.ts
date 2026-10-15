/**
 * `npx -y @mnemosyne_os/mcp` must start the server.
 *
 * Why this exists. 2.1.0 added a second bin, `mnemosyne-cockpit-hook`, next to
 * `mnemosyne-mcp`. From that publish on, the plain form every config example
 * uses died on "npm error could not determine executable to run", for every
 * npm >= 7 user, and so did any client that installs from `server.json`. The
 * `.mcpb` bundle and monorepo installs call `node dist/index.js` directly, so
 * nothing on this machine ever noticed. Found on 2026-10-15 by a stdio probe of
 * the published 2.1.2, reproduced on npm 10.9.2.
 *
 * npm picks the bin with libnpmexec's `getBinFromManifest`: the only bin (or
 * several that all point at one file), else the bin named after the package
 * without its scope, else that error. With two different files, only a bin
 * named `mcp` can answer.
 *
 * Read as data, the way `version.test.ts` reads the manifest.
 *
 * Run: `pnpm --filter @mnemosyne_os/mcp test` (tsx + node:test).
 */

import { test }          from 'node:test';
import assert            from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path              from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));

interface Manifest {
  name:  string;
  bin?:  Record<string, string>;
  files: string[];
}

const PKG = JSON.parse(readFileSync(path.join(HERE, '..', 'package.json'), 'utf8')) as Manifest;

/**
 * npm's rule, copied from libnpmexec `lib/get-bin-from-manifest.js` (npm 10.9.2).
 * The cross-check below compares it with the npm installed next to this node,
 * when there is one, so the copy cannot drift unseen.
 */
function binNpxRuns(mani: Manifest): string {
  const bin = mani.bin ?? {};
  if (new Set(Object.values(bin)).size === 1) return Object.keys(bin)[0]!;
  const name = mani.name.replace(/^@[^/]+\//, '');
  if (bin[name]) return name;
  throw new Error('could not determine executable to run');
}

/** Strips the `./` npm tolerates in a bin path, to compare it with `files`. */
const bare = (p: string): string => p.replace(/^\.\//, '');

test('plain npx on the package runs the MCP server', () => {
  const chosen = binNpxRuns(PKG);
  assert.equal(bare(PKG.bin![chosen]!), 'dist/index.js', `npx would run "${chosen}" -> ${PKG.bin![chosen]}`);
});

test('the bins configs already call are unchanged', () => {
  // Existing client configs call the server by `mnemosyne-mcp`, and the
  // cockpit hook settings call `mnemosyne-cockpit-hook` by name.
  assert.equal(bare(PKG.bin?.['mnemosyne-mcp'] ?? ''), 'dist/index.js');
  assert.equal(bare(PKG.bin?.['mnemosyne-cockpit-hook'] ?? ''), 'dist/cockpit-hook.js');
});

test('every bin target ships in the tarball', () => {
  // A bin whose file `files` leaves out installs as a dead command.
  for (const [name, target] of Object.entries(PKG.bin ?? {})) {
    assert.ok(PKG.files.includes(bare(target)), `bin "${name}" points at ${target}, which "files" does not ship`);
  }
});

// Where npm sits relative to node: next to it on Windows, under ../lib on Unix.
const NPM_RULE = [
  path.join(path.dirname(process.execPath), 'node_modules'),
  path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules'),
].map(root => path.join(root, 'npm', 'node_modules', 'libnpmexec', 'lib', 'get-bin-from-manifest.js'))
 .find(existsSync);

test('the copied rule agrees with the npm installed here',
  { skip: NPM_RULE ? false : 'no npm found next to this node' },
  () => {
    const real = createRequire(import.meta.url)(NPM_RULE!) as (m: Manifest) => string;
    assert.equal(real(PKG), binNpxRuns(PKG));
    // The shape that broke, so the comparison is not only made on the happy path.
    const broken: Manifest = { ...PKG, bin: { a: './x.js', b: './y.js' } };
    assert.throws(() => real(broken), /could not determine executable to run/);
    assert.throws(() => binNpxRuns(broken), /could not determine executable to run/);
  });
