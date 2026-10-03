// Recalcul indépendant (audit KAB/ARES) — n'utilise pas verify.js.
// Usage: node independent_recompute.mjs <bench-root>
// Sort avec code 1 si une assertion d'intégrité échoue. Les constats (écarts
// sémantiques, calculs conditionnels) sont imprimés, pas transformés en échec,
// sauf s'ils contredisent une propriété arithmétique publiée.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.argv[2];
if (!ROOT) { console.error('usage: node independent_recompute.mjs <bench-root>'); process.exit(2); }
const { scoreAnswer } = await import(pathToFileURL(join(ROOT, 'verification-kit', 'scoring.js')).href);

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? '  [ok]  ' : '  [FAIL]'} ${msg}`); if (!cond) failures++; };
const readJsonl = (f) => {
  const lines = readFileSync(join(ROOT, 'verification-kit', 'results', f), 'utf8').split('\n').filter((l) => l.trim());
  const parsed = lines.map((l) => JSON.parse(l));
  return { meta: parsed.find((o) => o._meta)?._meta, rows: parsed.filter((o) => !o._meta) };
};
const runs = (f) => JSON.parse(readFileSync(join(ROOT, 'lexical-2026-08', 'runs', f), 'utf8'));

// ── 1. Intégrité de chaque registre ─────────────────────────────────────────
console.log('\n1. Intégrité des registres LongMemEval');
const ledgers = {};
for (const f of ['baseline-longmemeval-m-48q.jsonl', 'engine-multisession-8q.jsonl', 'local-sovereign-12q.jsonl',
  'lexical-baseline-strict-48q.jsonl', 'lexical-baseline-flexible-48q.jsonl', 'lexical-fusion-strict-48q.jsonl', 'lexical-fusion-flexible-48q.jsonl']) {
  const L = readJsonl(f); ledgers[f] = L;
  const ids = L.rows.map((r) => r.question_id);
  const hits = L.rows.filter((r) => r.correct === true).length;
  check(new Set(ids).size === ids.length, `${f}: ${ids.length} ids uniques`);
  check(L.rows.every((r) => typeof r.correct === 'boolean'), `${f}: 'correct' booléen partout`);
  check(hits === L.meta.expected_hits && L.rows.length === L.meta.expected_total, `${f}: ${hits}/${L.rows.length} = expected ${L.meta.expected_hits}/${L.meta.expected_total}`);
  check(Math.round((1000 * hits) / L.rows.length) / 10 === Number(L.meta.expected_accuracy_pct), `${f}: arrondi ${((100 * hits) / L.rows.length).toFixed(2)} -> ${L.meta.expected_accuracy_pct}`);
}

// ── 2. Registres lexical == fichiers bruts (règle de conjonction) ───────────
console.log('\n2. Alignement registres ↔ fichiers bruts lexical-2026-08');
const B = runs('duel-full.rejudged.json').results, R1 = runs('duel-full-lexfusion.json').results, R2 = runs('duel-full-lexfusion-r2.json').results;
const m = (a) => new Map(a.map((r) => [r.id, r]));
const Bm = m(B), R1m = m(R1), R2m = m(R2);
for (const len of ['strict', 'flexible']) {
  const base = ledgers[`lexical-baseline-${len}-48q.jsonl`].rows, fus = ledgers[`lexical-fusion-${len}-48q.jsonl`].rows;
  check(base.every((r) => r.correct === (Bm.get(r.question_id).judge[len] === true)), `baseline ${len}: correct == brut.judge.${len}`);
  check(fus.every((r) => r.correct === (R1m.get(r.question_id).judge[len] === true && R2m.get(r.question_id).judge[len] === true)), `fusion ${len}: correct == run1 ∧ run2`);
  check(fus.every((r) => r.baseline_correct === (Bm.get(r.question_id).judge[len] === true)), `fusion ${len}: baseline_correct cohérent`);
}

// ── 3. Le champ heuristic des fichiers bruts est-il reproduit par scoring.js publié ?
console.log('\n3. scoring.js publié reproduit-il les champs heuristic/matchType bruts ?');
let heurDiff = 0, mtDiff = 0;
for (const [label, arr] of [['base', B], ['r1', R1], ['r2', R2]]) {
  for (const r of arr) {
    const s = scoreAnswer(r.gold, r.generated, r.nSrc);
    if (s.correct !== r.judge.heuristic) { heurDiff++; console.log(`     diff heuristic ${label} ${r.id}: scoring.js=${s.correct}/${s.matchType} brut=${r.judge.heuristic}/${r.judge.matchType}`); }
    else if (s.matchType !== r.judge.matchType) { mtDiff++; console.log(`     diff matchType ${label} ${r.id}: ${s.matchType} vs ${r.judge.matchType}`); }
  }
}
check(heurDiff === 0, `heuristic reproduit sur 144 lignes (écarts: ${heurDiff}, écarts matchType seuls: ${mtDiff})`);

// ── 4. Relation heuristique ↔ verdict final (orchestration non publiée) ─────
console.log('\n4. Verdict final en fonction de l\'heuristique (constat, pas assertion)');
for (const [label, arr] of [['base', B], ['r1', R1], ['r2', R2]]) {
  const t = { hT_sT: 0, hT_sF: 0, hF_sT: 0, hF_sF: 0 };
  arr.forEach((r) => { t[`h${r.judge.heuristic ? 'T' : 'F'}_s${r.judge.strict ? 'T' : 'F'}`]++; });
  console.log(`     ${label}: heuristic∧strict=${t.hT_sT} heuristic∧¬strict=${t.hT_sF} ¬heuristic∧strict=${t.hF_sT} ¬∧¬=${t.hF_sF}`);
}
console.log('     -> ni OR ni AND : le verdict n\'est pas une fonction de l\'heuristique ; la règle de combinaison n\'est pas publiée.');
const hTsF = [...B, ...R1, ...R2].filter((r) => r.judge.heuristic && !r.judge.strict).map((r) => `${r.id}(gold=${JSON.stringify(r.gold)})`);
console.log(`     heuristique HIT renversée par le juge: ${hTsF.join(', ')}`);

// ── 5. Cas signalé gpt4_76048e76 ────────────────────────────────────────────
console.log('\n5. gpt4_76048e76 (référence officielle "bike")');
for (const [label, r] of [['base', Bm.get('gpt4_76048e76')], ['r1', R1m.get('gpt4_76048e76')], ['r2', R2m.get('gpt4_76048e76')]]) {
  const firstClaim = /first/i.test(r.generated) ? r.generated.match(/took care of (?:the |your )?(\w+) first/i)?.[1] : null;
  console.log(`     ${label}: conclusion="${firstClaim}" heuristic=${r.judge.heuristic}/${r.judge.matchType} strict=${r.judge.strict} flexible=${r.judge.flexible}`);
}
const fS = ledgers['lexical-fusion-strict-48q.jsonl'].rows.find((r) => r.question_id === 'gpt4_76048e76');
console.log(`     registre fusion strict: correct=${fS.correct} match_type=${fS.match_type} baseline_correct=${fS.baseline_correct}`);

// ── 6. Tests binomiaux (exact, bilatéral) ───────────────────────────────────
console.log('\n6. Test du signe apparié (binomial exact bilatéral)');
const C = (n, k) => { let c = 1; for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i; return c; };
const signP = (a, b) => { const n = a + b, k = Math.min(a, b); let s = 0; for (let i = 0; i <= k; i++) s += C(n, i); return Math.min(1, (2 * s) / 2 ** n); };
const p91 = signP(9, 1);
check(Math.abs(p91 - 0.0215) < 0.00005, `+9/−1 -> p=${p91.toFixed(4)} (publié 0.0215)`);
console.log(`     +7/−2 (flexible) -> p=${signP(7, 2).toFixed(4)}`);
console.log(`     CONDITIONNEL si gpt4_76048e76 est reclassé MISS: +9/−2 -> p=${signP(9, 2).toFixed(4)}`);
console.log('     Unité = question ; 48 questions de 48 historiques distinctes (LongMemEval: une histoire par question) -> indépendance plausible des paires, mais échantillon de développement.');

// ── 7. Composition 72,9 % et hypothèse de monotonie ─────────────────────────
console.log('\n7. Composition de 72,9 % et test empirique de la "borne inférieure"');
const jb = new Map(ledgers['baseline-longmemeval-m-48q.jsonl'].rows.map((r) => [r.question_id, r.correct]));
const je = new Map(ledgers['engine-multisession-8q.jsonl'].rows.map((r) => [r.question_id, r.correct]));
const aVecFlex = new Map(ledgers['lexical-baseline-flexible-48q.jsonl'].rows.map((r) => [r.question_id, r.correct]));
const composed = [...jb].reduce((s, [id, c]) => s + (je.has(id) ? (je.get(id) ? 1 : 0) : c ? 1 : 0), 0);
check(composed === 35, `composition recalculée: ${composed}/48`);
check([...jb.keys()].every((id) => aVecFlex.has(id)) && jb.size === aVecFlex.size, 'mêmes 48 questions en juillet et août');
const aVecHits = [...aVecFlex.values()].filter(Boolean).length;
console.log(`     Août, moteur complet (spine-sort + dream ledgers, topK32+3), vectoriel seul, juge flexible, UN run sur 48 q: ${aVecHits}/48 = ${((100 * aVecHits) / 48).toFixed(1)} %`);
console.log(`     Borne inférieure annoncée en juillet (même juge flexible): 35/48 = 72.9 %`);
const carriedLost = [...jb].filter(([id, c]) => !je.has(id) && c && !aVecFlex.get(id)).map(([id]) => id);
const carriedGained = [...jb].filter(([id, c]) => !je.has(id) && !c && aVecFlex.get(id)).map(([id]) => id);
console.log(`     Parmi les 40 questions "reportées" (HIT juillet baseline) -> MISS en août: ${carriedLost.length} [${carriedLost.join(', ')}]`);
console.log(`     Parmi les 40 reportées MISS juillet -> HIT août: ${carriedGained.length} [${carriedGained.join(', ')}]`);
const msJulyEng = [...je].filter(([, c]) => c).length, msAug = [...aVecFlex].filter(([id, c]) => je.has(id) && c).length;
console.log(`     Multi-session: juillet moteur ${msJulyEng}/8 (règle de rejeu), août vectoriel seul ${msAug}/8 (un run)`);

// ── 8. Pondération par catégorie ────────────────────────────────────────────
console.log('\n8. Pondération : échantillon 8×6 vs distribution officielle LongMemEval (500 q, dont 30 _abs)');
// Distribution officielle par question_type (500 questions, abstentions incluses dans leur type) — source: miroir
// JordanMcCann/agentmemory@3aa3b83 longmemeval_results_opus6.json, compté par crossref_questions.mjs (T03).
const OFFICIAL = { 'temporal-reasoning': 133, 'multi-session': 133, 'knowledge-update': 78, 'single-session-preference': 30, 'single-session-assistant': 56, 'single-session-user': 70 };
const reweight = (rows) => {
  const per = {}; rows.forEach((r) => { (per[r.category] ??= { h: 0, n: 0 }).n++; if (r.correct) per[r.category].h++; });
  let s = 0; for (const [c, w] of Object.entries(OFFICIAL)) s += (w / 500) * (per[c].h / per[c].n);
  return 100 * s;
};
for (const f of ['baseline-longmemeval-m-48q.jsonl', 'lexical-baseline-strict-48q.jsonl', 'lexical-fusion-strict-48q.jsonl', 'lexical-fusion-flexible-48q.jsonl']) {
  const L = ledgers[f];
  console.log(`     ${f}: brut ${((100 * L.rows.filter((r) => r.correct).length) / 48).toFixed(1)} % -> repondéré (CALCUL CONDITIONNEL, n=8 par catégorie) ${reweight(L.rows).toFixed(1)} %`);
}

// ── 9. Calculs conditionnels sur gpt4_76048e76 ──────────────────────────────
console.log('\n9. Calculs conditionnels (un seul verdict réexaminé, les autres non réévalués)');
const fs_ = ledgers['lexical-fusion-strict-48q.jsonl'].rows.filter((r) => r.correct).length;
const ff_ = ledgers['lexical-fusion-flexible-48q.jsonl'].rows.filter((r) => r.correct).length;
console.log(`     strict: ${fs_}/48 -> ${fs_ - 1}/48 = ${((100 * (fs_ - 1)) / 48).toFixed(1)} % ; flexible: ${ff_}/48 -> ${ff_ - 1}/48 = ${((100 * (ff_ - 1)) / 48).toFixed(1)} %`);

// ── 10. BEAM ────────────────────────────────────────────────────────────────
console.log('\n10. BEAM : recalcul indépendant');
const BR = join(ROOT, 'beam-2026-09', 'runs');
const bread = (f) => JSON.parse(readFileSync(join(BR, f), 'utf8'));
const CATS = ['abstention', 'contradiction_resolution', 'event_ordering', 'information_extraction', 'instruction_following', 'knowledge_update', 'multi_session_reasoning', 'preference_following', 'summarization', 'temporal_reasoning'];
const beamScore = (v, eoField = 'tauNorm') => {
  const rows = Object.values(v); const chats = [...new Set(rows.map((r) => r.chatId))];
  const cat = CATS.map((c) => { const pc = chats.map((ch) => { const x = rows.filter((r) => r.chatId === ch && r.category === c).map((r) => (c === 'event_ordering' ? r.eventOrdering[eoField] : r.judgeScore)); return x.reduce((a, b) => a + b, 0) / x.length; }); return pc.reduce((a, b) => a + b, 0) / pc.length; });
  return { overall: (100 * cat.reduce((a, b) => a + b, 0)) / cat.length, flat: (100 * rows.reduce((a, r) => a + (r.category === 'event_ordering' ? r.eventOrdering[eoField] : r.judgeScore), 0)) / rows.length };
};
for (const [f, exp, af] of [['beam-100K-full.judged-gpt-4.1-mini.json', 61.7, 'beam-100K-full.answers.json'], ['beam-10M-v1.judged-gpt-4.1-mini.json', 49.2, 'beam-10M-v1.answers.json']]) {
  const v = bread(f), a = bread(af);
  const s = beamScore(v);
  check(Number(s.overall.toFixed(1)) === exp, `${f}: ${s.overall.toFixed(2)} % (publié ${exp}) ; moyenne à plat ${s.flat.toFixed(1)} %`);
  const rowsV = Object.values(v);
  const meanOk = rowsV.every((r) => Math.abs(r.items.reduce((x, i) => x + i.score, 0) / r.items.length - r.judgeScore) < 1e-9);
  check(meanOk, `${f}: judgeScore == moyenne des items de rubrique (règle BEAM post-correctif b2da22e, float)`);
  const itemScores = new Set(rowsV.flatMap((r) => r.items.map((i) => i.score)));
  console.log(`     valeurs de score par item: ${[...itemScores].sort().join(', ')}`);
  const intTrunc = beamScore(Object.fromEntries(Object.entries(v).map(([k, r]) => [k, { ...r, judgeScore: r.items.reduce((x, i) => x + Math.trunc(i.score), 0) / r.items.length }])));
  console.log(`     CONDITIONNEL — barème BEAM antérieur au 2026-08-30 (int(score), 0.5 -> 0): ${intTrunc.overall.toFixed(1)} %`);
  check(Object.keys(v).length === Object.keys(a).length && Object.keys(v).every((k) => k in a), `${f}: mêmes ids que ${af}`);
  // Abstention : réponses notées >0 par le juge officiel alors que la rubrique exige l'absence d'information
  const abst = rowsV.filter((r) => r.category === 'abstention');
  const ABST_MARK = /(no information|not (?:mentioned|specified|available|contain|provide)|does not (?:contain|mention|include|provide)|cannot (?:find|determine)|there is no|isn't any|is no record|no record|not recorded|don't have|do not have)/i;
  const suspicious = abst.filter((r) => r.judgeScore > 0 && !ABST_MARK.test(a[r.id].answer));
  console.log(`     abstention: ${abst.length} q ; notées >0 sans marqueur d'abstention dans la réponse (CANDIDATS à revue humaine): ${suspicious.length} -> ${suspicious.map((r) => `${r.id}=${r.judgeScore}`).join(', ')}`);
  const absScoreWithout = beamScore(Object.fromEntries(Object.entries(v).map(([k, r]) => [k, suspicious.some((s2) => s2.id === k) ? { ...r, judgeScore: 0 } : r])));
  console.log(`     CONDITIONNEL si ces candidats valaient 0: ${absScoreWithout.overall.toFixed(1)} %`);
  console.log(`     variante event_ordering = finalScore (tau×F1) au lieu de tauNorm: ${beamScore(v, 'finalScore').overall.toFixed(1)} %`);
}

console.log(`\n${failures ? `ÉCHEC: ${failures} assertion(s)` : 'Toutes les assertions d\'intégrité passent'}`);
process.exit(failures ? 1 : 0);
