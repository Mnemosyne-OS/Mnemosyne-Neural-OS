// Affiche toutes les questions BEAM "abstention" publiées : question, rubrique,
// réponse, score et justification de chaque juge, pour revue humaine.
// Usage: node dump_beam_abstention.mjs <bench-root>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const R = join(process.argv[2], 'beam-2026-09', 'runs');
const read = (f) => JSON.parse(readFileSync(join(R, f), 'utf8'));
for (const [ans, judges] of [
  ['beam-100K-full.answers.json', ['beam-100K-full.judged-gpt-4.1-mini.json', 'beam-100K-full.judged-gemini-2.5-flash.json']],
  ['beam-10M-v1.answers.json', ['beam-10M-v1.judged-gpt-4.1-mini.json']],
]) {
  const a = read(ans); const js = judges.map(read);
  for (const [id, r] of Object.entries(a)) {
    if (r.category !== 'abstention') continue;
    console.log(`### ${id}`);
    console.log(`Q: ${r.question}`);
    console.log(`RUBRIC: ${JSON.stringify(r.rubric)}`);
    console.log(`ANSWER: ${r.answer.replace(/\n+/g, ' ').slice(0, 700)}`);
    js.forEach((j, i) => console.log(`JUDGE[${judges[i].split('.judged-')[1].replace('.json', '')}] score=${j[id].judgeScore} :: ${j[id].items.map((x) => x.reason).join(' | ').slice(0, 400)}`));
    console.log('');
  }
}
