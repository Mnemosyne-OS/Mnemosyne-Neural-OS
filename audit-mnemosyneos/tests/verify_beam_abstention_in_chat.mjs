// Vérifie les 7 « faux positifs » BEAM d'abstention contre la source primaire :
// 1) retrouve la question dans BEAM/chats/<tier>/<n>/probing_questions/probing_questions.json (texte exact),
// 2) compare la rubrique officielle à celle publiée par Mnemosyne,
// 3) cherche dans la conversation source (chat.json) les termes-clés que la réponse Mnemosyne affirme.
// Si les faits affirmés existent dans la conversation, la rubrique « no information » serait fausse
// et le verdict 1 du juge ne serait PAS un faux positif.
// Usage: node verify_beam_abstention_in_chat.mjs <bench-root> <beam-root>
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const [BENCH, BEAM] = process.argv.slice(2);
const R = (f) => JSON.parse(readFileSync(join(BENCH, 'beam-2026-09/runs', f), 'utf8'));
const answers = { ...R('beam-100K-full.answers.json'), ...R('beam-10M-v1.answers.json') };
const CASES = {
  '100K/1/abstention/0': ['dark mode', 'collapsible sidebar', 'beta test'],
  '100K/3/abstention/0': ['Must-Have', 'Should-Have', "Won't-Have", 'MoSCoW', 'priorit'],
  '100K/3/abstention/1': ['Formspree', 'dedicated backend', 'backend'],
  '100K/4/abstention/0': ['side-based', 'angle-based', 'symmetry'],
  '10M/2/abstention/0': ['0x80070005', 'Run as administrator', 'Access Denied'],
  '10M/3/abstention/1': ['test_navigation_feedback', 'unittest.mock.patch', 'navigation issues'],
  '10M/7/abstention/0': ['Samuel', '$1,000 emergency fund', 'disability insurance', 'rebalance'],
};
const norm = (s) => s.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
function textOf(x) { return typeof x === 'string' ? x : JSON.stringify(x); }
let fail = 0;
for (const [id, terms] of Object.entries(CASES)) {
  const [tier] = id.split('/');
  const a = answers[id];
  const dirs = readdirSync(join(BEAM, 'chats', tier)).filter((d) => existsSync(join(BEAM, 'chats', tier, d, 'probing_questions', 'probing_questions.json')));
  let found = null;
  for (const d of dirs) {
    const pq = JSON.parse(readFileSync(join(BEAM, 'chats', tier, d, 'probing_questions', 'probing_questions.json'), 'utf8'));
    const items = pq.abstention ?? [];
    const idx = items.findIndex((q) => norm(q.question ?? '') === norm(a.question));
    if (idx > -1) { found = { d, idx, item: items[idx] }; break; }
  }
  console.log(`\n### ${id}`);
  console.log(`Q: ${a.question}`);
  if (!found) { console.log('  QUESTION NON RETROUVÉE dans BEAM'); fail = 1; continue; }
  const rubricSame = JSON.stringify(found.item.rubric) === JSON.stringify(a.rubric);
  console.log(`  BEAM dir=chats/${tier}/${found.d} abstention[${found.idx}] ; rubrique identique à la publication Mnemosyne: ${rubricSame}`);
  console.log(`  rubrique officielle: ${JSON.stringify(found.item.rubric)}`);
  const extra = Object.keys(found.item).filter((k) => !['question', 'rubric'].includes(k));
  for (const k of extra) console.log(`  champ BEAM ${k}: ${textOf(found.item[k]).slice(0, 300)}`);
  const chatPath = join(BEAM, 'chats', tier, found.d, 'chat.json');
  const chat = readFileSync(chatPath, 'utf8');
  const low = chat.toLowerCase();
  for (const t of terms) {
    const tl = t.toLowerCase();
    let n = 0, i = -1; const ctx = [];
    while ((i = low.indexOf(tl, i + 1)) !== -1) { n++; if (ctx.length < 2) ctx.push(chat.slice(Math.max(0, i - 140), i + 140).replace(/\\n|\s+/g, ' ')); }
    console.log(`  terme ${JSON.stringify(t)} dans chat.json (${(chat.length / 1e6).toFixed(1)} Mo): ${n} occurrence(s)`);
    ctx.forEach((c) => console.log(`     … ${c} …`));
  }
}
process.exit(fail);
