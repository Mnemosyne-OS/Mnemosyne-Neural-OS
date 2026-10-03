// Recoupe les 48 questions lexical-2026-08 (et les ids du holdout) avec une copie tierce
// de LongMemEval (JordanMcCann/agentmemory@3aa3b83, longmemeval_results_opus6.json).
// SOURCE SECONDAIRE : sert à récupérer le texte des questions, pas à établir la vérité.
// Usage: node crossref_questions.mjs <bench-root> <mirror-json>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const [ROOT, MIRROR] = process.argv.slice(2);
const mirror = JSON.parse(readFileSync(MIRROR, 'utf8')).per_case;
const M = new Map(mirror.map((x) => [x.question_id, x]));
console.log(`mirror rows=${mirror.length} unique=${M.size}`);
console.log('mirror types:', JSON.stringify(mirror.reduce((a, x) => ((a[x.question_type] = (a[x.question_type] || 0) + 1), a), {})));
const runs = JSON.parse(readFileSync(join(ROOT, 'lexical-2026-08/runs/duel-full.rejudged.json'), 'utf8')).results;
let goldMismatch = 0, missing = 0, typeMismatch = 0;
for (const r of runs) {
  const m = M.get(r.id);
  if (!m) { missing++; console.log(`MISSING ${r.id}`); continue; }
  const g = m.gold_answer ?? m.answer;
  if (String(g).trim() !== String(r.gold).trim()) { goldMismatch++; console.log(`GOLD DIFF ${r.id}: mnemo=${JSON.stringify(r.gold)} mirror=${JSON.stringify(g)}`); }
  if (m.question_type !== r.cat) { typeMismatch++; console.log(`TYPE DIFF ${r.id}: ${r.cat} vs ${m.question_type}`); }
  console.log(`Q ${r.id} [${r.cat}] ${JSON.stringify(m.question)}`);
}
console.log(`\ndev48: missing=${missing} gold_mismatch=${goldMismatch} type_mismatch=${typeMismatch}`);
// Position des 48 ids dans l'ordre du fichier (indice de sélection)
const order = new Map(mirror.map((x, i) => [x.question_id, i]));
console.log('indices dans le fichier miroir:', runs.map((r) => order.get(r.id)).join(','));
// Holdout
for (const f of ['recall-hold-off.json', 'recall-control.json']) {
  const rows = JSON.parse(readFileSync(join(ROOT, 'lexical-2026-08/runs', f), 'utf8')).rows;
  const ids = rows.map((x) => x.id);
  const overlap = ids.filter((i) => runs.some((r) => r.id === i));
  console.log(`${f}: n=${ids.length} présents dans miroir=${ids.filter((i) => M.has(i)).length} recouvrement avec dev48=${overlap.length}`);
  console.log(`  types: ${JSON.stringify(ids.reduce((a, i) => { const t = M.get(i)?.question_type ?? '?'; a[t] = (a[t] || 0) + 1; return a; }, {}))}`);
  console.log(`  indices: ${ids.map((i) => order.get(i)).join(',')}`);
}
const t = M.get('gpt4_76048e76');
console.log('\n=== gpt4_76048e76 (miroir) ===');
console.log(JSON.stringify({ question: t.question, gold: t.gold_answer, type: t.question_type, top_recall: t.top_recall, context_preview: t.context_preview }, null, 1));
