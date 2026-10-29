/**
 * Contract with packages/dsh-plugin. The DeepSeek Harness recall plugin reads
 * this server's `mnemosyne_memory_query` answer as TEXT: the `N result(s)`
 * header, then the rows formatQueryRow writes. A change of wording on this
 * side would not break the plugin loudly; it would fall back to injecting the
 * raw answer, with the score and the agent hints the plugin keeps out. This
 * file is where such a change shows up.
 * Run: `pnpm --filter @mnemosyne_os/mcp test` (tsx + node:test).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { formatQueryRow, queryRefusal } from './format.js';
import { LOCAL_TIME_NOTE } from './local-time.js';
import type { MnemoChronicle, QueryResult } from './ws-client.js';

interface PluginRow { spine: string; date: string | null; notes: string[]; body: string; shortened: boolean }
interface Plugin { resultCount(text: string): number | null; parseRows(text: string): PluginRow[] }

// Imported by URL: the plugin is plain JS outside this package's tsconfig. A
// checkout that carries this package without the plugin (a public mirror)
// skips the contract and says why, instead of failing on a missing file.
const PLUGIN_URL = new URL('../../dsh-plugin/src/index.js', import.meta.url);
const present = existsSync(PLUGIN_URL);
const skip = present ? false : 'packages/dsh-plugin is not in this checkout';
const plugin = (present ? await import(PLUGIN_URL.href) : null) as Plugin;

const chronicle = (over: Partial<MnemoChronicle>): MnemoChronicle => ({
  id: '1', spineType: 'NOTE', content: '', timestamp: '2026-10-28 13:26:14', score: 0.6, source_app_id: 'CORE', ...over,
});

/** The answer as mnemosyne_memory_query assembles it in index.ts (header, frame note, rows). */
function answer(chronicles: MnemoChronicle[], maxContentChars = 600): string {
  const rows = chronicles.map((c, i) => formatQueryRow(c, i, { maxContentChars, notAdmitted: i === 3 })).join('\n\n---\n\n');
  return `# Mnemosyne Query: "q"\n\n${chronicles.length} result(s) · snippet=${maxContentChars}c\n${LOCAL_TIME_NOTE}\n\n${rows}`;
}

test('the plugin reads every row this server prints, with its type, date, caveats and text', { skip }, () => {
  const text = answer([
    chronicle({ content: JSON.stringify({ raw: 'My validation drink is lapsang-93807.' }) }),
    chronicle({ id: '2', source_app_id: 'DOCWATCH', content: 'A design note.', freshness: { filePath: 'docs/a.md', state: 'missing' } }),
    chronicle({ id: '3', spineType: 'DOCUMENT', content: 'x'.repeat(700) }),
    chronicle({ id: '4', spineType: 'DECISION', content: 'We chose BM25.', timestamp: 'not a time', score: undefined }),
  ]);
  assert.equal(plugin.resultCount(text), 4);
  const rows = plugin.parseRows(text);
  assert.deepEqual(rows.map(r => r.spine), ['NOTE', 'NOTE', 'DOCUMENT', 'DECISION']);
  assert.equal(rows[0].body, 'My validation drink is lapsang-93807.');
  assert.match(rows[0].date ?? '', /^2026-10-28 \d\d:26$/);
  assert.deepEqual(rows[0].notes, []);
  assert.deepEqual(rows[1].notes, ['design document, its names may not match the code', 'its source file no longer exists']);
  assert.equal(rows[2].shortened, true);
  assert.equal(rows[2].body, 'x'.repeat(600) + '…');
  assert.deepEqual(rows[3], { spine: 'DECISION', date: null, notes: ['matches only some words of the request'], body: 'We chose BM25.', shortened: false });
});

test('every answer this server gives instead of rows reads as no listing', { skip }, () => {
  const base: QueryResult = { success: true, chronicles: [] } as unknown as QueryResult;
  const refusals = [
    queryRefusal(base, 'TEST'),
    queryRefusal({ ...base, success: false, error: 'embedder offline' } as QueryResult, 'TEST'),
    queryRefusal({ ...base, chronicles: [chronicle({})], _semantic: { wanted: true, used: false, error: 'no embedder' } } as unknown as QueryResult, 'TEST'),
  ];
  for (const refusal of refusals) {
    assert.ok(refusal !== null);
    assert.equal(plugin.resultCount(refusal), null, refusal);
  }
});
