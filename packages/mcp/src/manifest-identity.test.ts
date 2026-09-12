/**
 * The two fields of the manifest that are NOT interchangeable.
 *
 * Why this exists. The manifest carries an `id` and a `name`, they sit on
 * consecutive lines, and they fail in opposite directions:
 *
 *  - the `id` is the GRANT KEY. The host stores the scopes the human approved
 *    against it and persists them (`sdk-ws-server`, `saveSdkRegistry`), so
 *    changing it would present this server to every existing install as an app
 *    nobody ever authorised — a silent re-consent, or a silent refusal.
 *  - the `name` is a USER-FACING IDENTITY. It is what the consent dialog asks
 *    about, and what the arrival card prints when this server writes to the
 *    human's calendar or backlog. It read "Mnemosyne MCP Server" and had been
 *    dropping the "OS" on every one of those surfaces for as long as it
 *    existed — the half of the product name that carries what it is, and what
 *    tells it apart from the homonyms.
 *
 * Read as TEXT rather than imported, the way `version.test.ts` and
 * `readme-tools.test.ts` do: importing `index.ts` builds a server.
 *
 * Run: `pnpm --filter @mnemosyne_os/mcp test` (tsx + node:test).
 */

import { test }          from 'node:test';
import assert            from 'node:assert/strict';
import { readFileSync }  from 'node:fs';
import { fileURLToPath } from 'node:url';
import path              from 'node:path';

const HERE   = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(path.join(HERE, 'index.ts'), 'utf8');

/** The manifest literal, from its opening brace to its `version:` line. */
function manifestHead(): string {
  const at = SOURCE.indexOf('const MCP_MANIFEST');
  assert.notEqual(at, -1, 'MCP_MANIFEST is gone — this guard is reading nothing');
  return SOURCE.slice(at, at + 2000);
}

test('the app id is unchanged — it is what the human granted scopes to', () => {
  assert.match(manifestHead(), /id:\s*'mnemosyne-mcp'/);
});

test('the declared name keeps the OS', () => {
  const name = manifestHead().match(/\n\s*name:\s*'([^']+)'/)?.[1];
  assert.ok(name, 'the manifest declares no name at all');
  // Not an equality check: the wording may change, the OS may not.
  assert.match(name, /\bMnemosyne OS\b/);
});
