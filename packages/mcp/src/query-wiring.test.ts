/**
 * Wiring guard: the tools that print search rows ask format.ts first whether
 * the rows are a search result at all (queryRefusal / searchFailure).
 * Run: `pnpm --filter @mnemosyne_os/mcp test` (tsx + node:test).
 *
 * Why it reads index.ts as TEXT: importing it starts an MCP server on stdio
 * (see readme-tools.test.ts). On 2026-10-24 the verification pass showed that
 * dropping the queryRefusal call from mnemosyne_memory_query left every test
 * green, and that mnemosyne_position_get printed an unrelated document as the
 * position of an id that did not exist.
 */

import { test } from 'node:test';
import assert    from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.ts'), 'utf8');

/** The body of one `case '<tool>':` block of the dispatch switch. */
function caseBody(tool: string): string {
  const start = SOURCE.indexOf(`case '${tool}': {`);
  assert.ok(start >= 0, `index.ts no longer has a case for ${tool}: update this guard`);
  const next = SOURCE.indexOf("\n      case '", start + 10);
  return SOURCE.slice(start, next < 0 ? undefined : next);
}

/** `call` must appear in the case, after the query and before `printed`. */
function guardedBefore(tool: string, call: string, printed: string): void {
  const body = caseBody(tool);
  const q = body.indexOf('client.query(');
  const g = body.indexOf(call);
  const p = body.indexOf(printed);
  assert.ok(q >= 0 && p >= 0, `${tool}: the guard lost its anchors`);
  assert.ok(g > q && g < p, `${tool} must call ${call} after the query and before it prints rows`);
}

test('mnemosyne_memory_query asks queryRefusal before formatting rows', () => {
  guardedBefore('mnemosyne_memory_query', 'queryRefusal(', 'result.chronicles.map(');
});

test('mnemosyne_resonance_list asks searchFailure before reading resonances', () => {
  guardedBefore('mnemosyne_resonance_list', 'searchFailure(', 'selectResonances(');
});

test('mnemosyne_position_get asks searchFailure, then picks the row by its id marker', () => {
  guardedBefore('mnemosyne_position_get', 'searchFailure(', 'findPosition(');
  assert.doesNotMatch(caseBody('mnemosyne_position_get'), /result\.chronicles\[0\]/);
});

test('mnemosyne_memory_query prints every row through formatQueryRow, with the words-only verdict', () => {
  // The row itself (score, date, warning) is tested on its output in format.test.ts.
  const body = caseBody('mnemosyne_memory_query');
  assert.match(body, /readCoverage\(result\)/);
  assert.match(body, /formatQueryRow\(c, i, \{ maxContentChars, notAdmitted: coverage\?\.notAdmitted\[i\] === true \}\)/);
  assert.doesNotMatch(body, /c\.score\.toFixed|toLocaleString\(|new Date\(c\.timestamp\)/);
  assert.match(body, /LOCAL_TIME_NOTE/, 'the query answer must name the frame its dates are in');
  // The header and the row separator the dsh recall plugin reads (dsh-recall-contract.test.ts).
  assert.match(body, /\$\{result\.chronicles\.length\} result\(s\) · snippet=/);
  assert.match(body, /\.join\('\\n\\n---\\n\\n'\)/);
});

test('mnemosyne_position_get reads the saved time through parseStoredTime and names the frame', () => {
  // `new Date('2026-10-28 13:26:14')` reads SQLite's UTC text as local time.
  const body = caseBody('mnemosyne_position_get');
  assert.match(body, /parseStoredTime\(latest\.timestamp\)/);
  assert.match(body, /localStamp\(savedAt\)/);
  assert.match(body, /LOCAL_TIME_NOTE/);
  assert.doesNotMatch(body, /new Date\(latest\.timestamp\)|toLocaleString\(/);
});

test('mnemosyne_resonance_list prints its lines through resonanceLine', () => {
  const body = caseBody('mnemosyne_resonance_list');
  assert.match(body, /resonanceLine\(toResonanceView\(c, now\)\)/);
  assert.doesNotMatch(body, /min ago/);
});
