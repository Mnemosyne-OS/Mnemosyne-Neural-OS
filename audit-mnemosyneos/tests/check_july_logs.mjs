// Contrôle B (juillet) : chaque verdict des registres baseline et engine doit
// correspondre au journal cité, et le texte de réponse du registre doit être
// retrouvable (préfixe) dans la ligne du journal.
// Formats : grand-run.log "<ts> <id> [<cat>] ... → HIT|MISS (...)"
//           journaux moteur : en-tête "━━ <id> [<cat>] <question>" puis
//           "[qa] BASELINE|DREAM|ALL (...) : HIT|MISS ... — <réponse tronquée>…"
// Usage: node check_july_logs.mjs <bench-root>
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = process.argv[2];
const LOGS = join(ROOT, 'fullhaystack-2026-07', 'logs');
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const norm = (s) => s.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

function parse(f) {
  const out = []; let cur = null;
  for (const line of strip(readFileSync(join(LOGS, f), 'utf8')).split('\n')) {
    let m = line.match(/^━━\s+(\S+)\s+\[([a-z-]+)\]/);
    if (m) { cur = m[1]; continue; }
    m = line.match(/\[qa\]\s+(BASELINE|DREAM|ALL)\s+\([^)]*\)\s*:\s*(HIT|MISS)\b.*?—\s(.*)$/);
    if (m && cur) { out.push({ id: cur, arm: m[1], verdict: m[2], answer: m[3].replace(/…$/, '') }); continue; }
    m = line.match(/Z\s+(\S+)\s+\[([a-z-]+)\].*?→\s+(HIT|MISS)\b/);
    if (m) out.push({ id: m[1], arm: 'GRAND', verdict: m[3], answer: null });
  }
  return out;
}
const logs = Object.fromEntries(readdirSync(LOGS).filter((f) => f.endsWith('.log')).map((f) => [f, parse(f)]));
console.log('Journal'.padEnd(36), 'verdicts par bras (HIT/total)');
for (const [f, rows] of Object.entries(logs)) {
  const arms = {}; rows.forEach((r) => { (arms[r.arm] ??= [0, 0])[1]++; if (r.verdict === 'HIT') arms[r.arm][0]++; });
  console.log(f.padEnd(36), Object.entries(arms).map(([a, [h, n]]) => `${a}=${h}/${n}`).join(' '));
}
const readJsonl = (f) => readFileSync(join(ROOT, 'verification-kit', 'results', f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((o) => !o._meta);
let fail = 0;
// Baseline
const g = new Map(logs['grand-run.log'].map((r) => [r.id, r]));
const base = readJsonl('baseline-longmemeval-m-48q.jsonl');
const bm = base.filter((r) => (g.get(r.question_id)?.verdict === 'HIT') !== r.correct);
console.log(`\nbaseline 48q vs grand-run.log : ${base.length - bm.length}/${base.length} verdicts concordants`);
if (bm.length) fail = 1;
// Engine : bras ALL (= "sorted + ledgers", moteur complet)
const eng = readJsonl('engine-multisession-8q.jsonl');
let vm = 0, tm = 0, n = 0;
for (const r of eng) {
  for (const run of r.runs) {
    n++;
    const f = run.log.split('/').pop();
    const all = logs[f].filter((x) => x.id === r.question_id && x.arm === 'ALL');
    const dream = logs[f].filter((x) => x.id === r.question_id && x.arm === 'DREAM');
    const vOk = all.some((x) => x.verdict === run.verdict);
    if (!vOk) { vm++; console.log(`  VERDICT ≠ ${r.question_id} ${f}: registre=${run.verdict} ALL=${all.map((x) => x.verdict)} DREAM=${dream.map((x) => x.verdict)}`); }
    const ledgerTxt = norm(run.answer), logTxt = all.map((x) => norm(x.answer));
    const traceable = logTxt.some((t) => t.startsWith(ledgerTxt.slice(0, Math.min(ledgerTxt.length, t.length))) || ledgerTxt.startsWith(t));
    const extra = logTxt.length ? ledgerTxt.slice(Math.max(...logTxt.map((t) => (ledgerTxt.startsWith(t) ? t.length : 0)))) : ledgerTxt;
    if (!traceable) { tm++; console.log(`  TEXTE non retrouvé ${r.question_id} ${f}\n     registre: ${JSON.stringify(run.answer)}\n     journal : ${JSON.stringify(all.map((x) => x.answer))}`); }
    else if (extra && logTxt.every((t) => !t.startsWith(ledgerTxt))) { /* registre = préfixe du journal : ok */ }
  }
}
console.log(`engine 8q : ${n} runs cités ; verdicts discordants avec le bras ALL = ${vm} ; textes de réponse non retrouvés dans le journal = ${tm}`);
if (vm) fail = 1;
// Bras DREAM vs ALL dans exp-verify (le registre retient ALL)
const ev = logs['exp-verify.log'];
const dH = ev.filter((x) => x.arm === 'DREAM' && x.verdict === 'HIT').length, aH = ev.filter((x) => x.arm === 'ALL' && x.verdict === 'HIT').length;
console.log(`exp-verify.log : DREAM ${dH}/8, ALL ${aH}/8 (le registre publie ALL = "sorted + ledgers")`);
process.exit(fail ? 1 : tm ? 2 : 0);
