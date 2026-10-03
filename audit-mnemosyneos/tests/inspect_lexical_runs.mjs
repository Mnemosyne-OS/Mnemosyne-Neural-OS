// Inspection structurelle des fichiers bruts lexical-2026-08/runs/duel-*.json
// Usage: node inspect_lexical_runs.mjs <chemin MnemosyneOS---benchmarks>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2];
if (!ROOT) { console.error('usage: node inspect_lexical_runs.mjs <bench-root>'); process.exit(2); }
const RUNS = join(ROOT, 'lexical-2026-08', 'runs');
const files = ['duel-full.rejudged.json', 'duel-full-lexfusion.json', 'duel-full-lexfusion-r2.json'];
let fail = 0;
const data = {};
for (const f of files) {
  const d = JSON.parse(readFileSync(join(RUNS, f), 'utf8'));
  const { results, ...top } = d;
  data[f] = results;
  const ids = results.map((r) => r.id);
  const uniq = new Set(ids);
  const keys = new Set(); results.forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));
  const jkeys = new Set(); results.forEach((r) => Object.keys(r.judge || {}).forEach((k) => jkeys.add(k)));
  const cats = {}; results.forEach((r) => (cats[r.cat] = (cats[r.cat] || 0) + 1));
  const heurTrue = results.filter((r) => r.judge.heuristic === true);
  const heurTrueStrictFalse = heurTrue.filter((r) => r.judge.strict !== true || r.judge.flexible !== true);
  const strictTrueFlexFalse = results.filter((r) => r.judge.strict === true && r.judge.flexible !== true);
  const infra = results.filter((r) => r.infra);
  const empty = results.filter((r) => !r.generated || !String(r.generated).trim());
  const types = results.filter((r) => typeof r.judge.strict !== 'boolean' || typeof r.judge.flexible !== 'boolean');
  console.log(`== ${f}`);
  console.log('  top-level:', JSON.stringify(top));
  console.log(`  rows=${results.length} unique_ids=${uniq.size} row_keys=${[...keys].join(',')} judge_keys=${[...jkeys].join(',')}`);
  console.log('  cats:', JSON.stringify(cats));
  console.log(`  strict hits=${results.filter((r) => r.judge.strict === true).length} flexible hits=${results.filter((r) => r.judge.flexible === true).length} heuristic hits=${heurTrue.length}`);
  console.log(`  matchType counts:`, JSON.stringify(results.reduce((a, r) => ((a[r.judge.matchType] = (a[r.judge.matchType] || 0) + 1), a), {})));
  console.log(`  heuristic=true but strict/flex not true: ${heurTrueStrictFalse.length}`);
  console.log(`  strict=true but flexible false: ${strictTrueFlexFalse.length} ${strictTrueFlexFalse.map((r) => r.id).join(',')}`);
  console.log(`  infra=true: ${infra.length} empty generated: ${empty.length} non-boolean verdicts: ${types.length}`);
  console.log(`  nSrc values: ${[...new Set(results.map((r) => r.nSrc))].join(',')} nDream values: ${[...new Set(results.map((r) => r.nDream))].join(',')}`);
}
// Alignement des ids entre runs
const idsets = files.map((f) => new Set(data[f].map((r) => r.id)));
const same = [...idsets[0]].every((i) => idsets[1].has(i) && idsets[2].has(i)) && idsets[0].size === idsets[1].size && idsets[1].size === idsets[2].size;
console.log(`\nids identiques entre les 3 runs: ${same}`);
if (!same) fail = 1;
// Réponses identiques r1 vs r2
const r2 = new Map(data['duel-full-lexfusion-r2.json'].map((r) => [r.id, r]));
let identical = 0, stricDiff = 0, flexDiff = 0;
for (const r of data['duel-full-lexfusion.json']) {
  const t = r2.get(r.id);
  if (t.generated === r.generated) identical++;
  if (t.judge.strict !== r.judge.strict) stricDiff++;
  if (t.judge.flexible !== r.judge.flexible) flexDiff++;
}
console.log(`r1 vs r2: réponses byte-identiques=${identical}/48, désaccords strict=${stricDiff}, désaccords flexible=${flexDiff}`);
process.exit(fail);
