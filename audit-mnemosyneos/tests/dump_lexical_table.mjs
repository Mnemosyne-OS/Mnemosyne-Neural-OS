// Tableau complet par question : gold, réponses et verdicts des 3 runs lexical-2026-08.
// Usage: node dump_lexical_table.mjs <bench-root>  > sortie.md
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = process.argv[2];
const RUNS = join(ROOT, 'lexical-2026-08', 'runs');
const load = (f) => new Map(JSON.parse(readFileSync(join(RUNS, f), 'utf8')).results.map((r) => [r.id, r]));
const B = load('duel-full.rejudged.json'), R1 = load('duel-full-lexfusion.json'), R2 = load('duel-full-lexfusion-r2.json');
const v = (r) => `h=${r.judge.heuristic ? 1 : 0}/${r.judge.matchType} S=${r.judge.strict ? 1 : 0} F=${r.judge.flexible ? 1 : 0}`;
for (const [id, b] of B) {
  const a = R1.get(id), c = R2.get(id);
  console.log(`### ${id} [${b.cat}]`);
  console.log(`GOLD: ${JSON.stringify(b.gold)}`);
  console.log(`BASE ${v(b)} :: ${JSON.stringify(b.generated)}`);
  console.log(`R1   ${v(a)} :: ${JSON.stringify(a.generated)}`);
  console.log(`R2   ${v(c)} :: ${JSON.stringify(c.generated)}`);
  console.log('');
}
