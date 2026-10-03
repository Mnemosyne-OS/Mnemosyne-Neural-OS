// Inspection des fichiers BEAM publiés par Mnemosyne (beam-2026-09/runs).
// Usage: node inspect_beam_runs.mjs <bench-root>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const R = join(process.argv[2], 'beam-2026-09', 'runs');
const read = (f) => JSON.parse(readFileSync(join(R, f), 'utf8'));
for (const f of ['beam-100K-full.judged-gpt-4.1-mini.json', 'beam-100K-full.judged-gemini-2.5-flash.json', 'beam-10M-v1.judged-gpt-4.1-mini.json']) {
  const d = read(f);
  const rows = Object.entries(d);
  console.log(`== ${f} rows=${rows.length}`);
  const [k0, v0] = rows[0];
  console.log('  key example:', k0, 'fields:', Object.keys(v0).join(','));
  console.log('  first row:', JSON.stringify(v0).slice(0, 900));
  const dist = {}; rows.forEach(([, r]) => { const s = String(r.judgeScore); dist[s] = (dist[s] || 0) + 1; });
  console.log('  judgeScore distribution:', JSON.stringify(dist));
  const catN = {}; rows.forEach(([, r]) => { catN[r.category] = (catN[r.category] || 0) + 1; });
  console.log('  per category:', JSON.stringify(catN));
  const chats = {}; rows.forEach(([, r]) => { chats[r.chatId] = (chats[r.chatId] || 0) + 1; });
  console.log('  per chat:', JSON.stringify(chats));
  const eo = rows.filter(([, r]) => r.category === 'event_ordering').map(([, r]) => r.eventOrdering);
  console.log('  event_ordering sample:', JSON.stringify(eo.slice(0, 2)));
  const other = new Set(); rows.forEach(([, r]) => Object.keys(r).forEach((x) => other.add(x)));
  console.log('  all fields:', [...other].join(','));
}
for (const f of ['beam-100K-full.answers.json', 'beam-10M-v1.answers.json']) {
  const d = read(f);
  const rows = Object.entries(d);
  console.log(`== ${f} rows=${rows.length}`);
  const [k0, v0] = rows[0];
  console.log('  key example:', k0, 'fields:', Object.keys(v0).join(','));
  console.log('  first row:', JSON.stringify(v0).slice(0, 1500));
}
