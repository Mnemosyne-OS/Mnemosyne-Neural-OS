#!/usr/bin/env node
/**
 * Recompute every BEAM number Mnemosyne publishes, from the per-question rows
 * in ./runs. No network, no dependencies, no memory engine.
 *
 *   node verify.js
 *
 * It exits non-zero on the first mismatch. If we had rounded a score in our
 * favour, this is where it would show.
 *
 * The aggregation is BEAM's, not ours, and it is NOT a flat mean over
 * questions: per (chat, category) take the mean, then the mean over chats, then
 * the mean over the ten categories. `event_ordering` is scored by a normalised
 * Kendall tau rather than by the judge's 0/1. A flat mean gives a different
 * number, so the rule is reproduced here rather than approximated.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const CATEGORIES = [
  'abstention', 'contradiction_resolution', 'event_ordering', 'information_extraction',
  'instruction_following', 'knowledge_update', 'multi_session_reasoning',
  'preference_following', 'summarization', 'temporal_reasoning',
];

const RUNS = path.join(__dirname, 'runs');
const read = (f) => JSON.parse(fs.readFileSync(path.join(RUNS, f), 'utf8'));
const pct = (x) => (x * 100).toFixed(1);

let failures = 0;
const fail = (msg) => { failures++; console.log(`   [FAIL] ${msg}`); };
const pass = (msg) => console.log(`   [ok]   ${msg}`);

/** BEAM's aggregation. */
function scoreOf(verdicts) {
  const rows = Object.values(verdicts);
  const chats = [...new Set(rows.map((r) => r.chatId))].sort((a, b) => Number(a) - Number(b));
  const per = {};
  for (const cat of CATEGORIES) {
    const perChat = chats.map((c) => {
      const vals = rows
        .filter((r) => r.chatId === c && r.category === cat)
        .map((r) => (cat === 'event_ordering' ? (r.eventOrdering?.tauNorm ?? null) : r.judgeScore))
        .filter((x) => x !== null && x !== undefined);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }).filter((x) => x !== null);
    per[cat] = perChat.length ? perChat.reduce((a, b) => a + b, 0) / perChat.length : null;
  }
  const scored = CATEGORIES.map((c) => per[c]).filter((x) => x !== null);
  return {
    perCategory: per,
    overall: scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null,
    conversations: chats.length,
    questions: rows.length,
  };
}

/**
 * What we publish. Anything asserted on the website has to appear here, or the
 * tool is decoration.
 */
const HEADLINES = [
  {
    label: '100K tier',
    answers: 'beam-100K-full.answers.json',
    judged: 'beam-100K-full.judged-gpt-4.1-mini.json',
    evidence: 'beam-100K-full.evidence.json',
    expectScore: 61.7,
    expectQuestions: 400,
    expectConversations: 20,
    expectAnswerModel: 'gemini-2.5-pro',
    expectJudge: 'gpt-4.1-mini',
    expectTopK: 32,
    expectMaxSourceChars: 2400,
  },
  {
    label: '10M tier',
    answers: 'beam-10M-v1.answers.json',
    judged: 'beam-10M-v1.judged-gpt-4.1-mini.json',
    evidence: 'beam-10M-v1.evidence.json',
    expectScore: 49.2,
    expectQuestions: 200,
    expectConversations: 10,
    expectAnswerModel: 'gemini-2.5-pro',
    expectJudge: 'gpt-4.1-mini',
    expectTopK: 32,
    expectMaxSourceChars: 2400,
  },
];

console.log('\nBEAM . 2026-09 - recomputing every published number from its rows\n');

for (const h of HEADLINES) {
  console.log(`${h.label}  (${h.judged})`);
  const answers = Object.values(read(h.answers));
  const verdicts = read(h.judged);
  const s = scoreOf(verdicts);

  const got = Number(pct(s.overall));
  if (got === h.expectScore) pass(`score ${got}% - matches the published figure`);
  else fail(`score ${got}% but we publish ${h.expectScore}%`);

  if (s.questions === h.expectQuestions) pass(`${s.questions} questions, none dropped`);
  else fail(`${s.questions} questions, expected ${h.expectQuestions}`);

  if (s.conversations === h.expectConversations) pass(`${s.conversations} conversations`);
  else fail(`${s.conversations} conversations, expected ${h.expectConversations}`);

  // An unscored row would quietly shrink a per-category mean.
  const unscored = Object.values(verdicts).filter((r) => r.judgeScore === null).length;
  if (unscored === 0) pass('every row carries a verdict (0 unscored)');
  else fail(`${unscored} row(s) have no verdict`);

  // A benchmark run with silent infrastructure failures is not a measurement.
  const infra = answers.filter((r) => r.infra).length;
  if (infra === 0) pass('0 infrastructure failures');
  else fail(`${infra} infrastructure failure(s)`);

  const models = [...new Set(answers.map((r) => r.answerModel))];
  if (models.length === 1 && models[0] === h.expectAnswerModel) pass(`one answering model throughout: ${models[0]}`);
  else fail(`answering model(s): ${models.join(', ')} - expected only ${h.expectAnswerModel}`);

  const judges = [...new Set(Object.values(verdicts).map((r) => r.judgeModel))];
  if (judges.length === 1 && judges[0] === h.expectJudge) pass(`one judge throughout: ${judges[0]}`);
  else fail(`judge(s): ${judges.join(', ')} - expected only ${h.expectJudge}`);

  const topK = [...new Set(answers.map((r) => r.topK))];
  const cap = [...new Set(answers.map((r) => r.maxSourceChars))];
  if (topK.length === 1 && topK[0] === h.expectTopK && cap.length === 1 && cap[0] === h.expectMaxSourceChars) {
    pass(`retrieval settings constant: topK ${topK[0]}, ${cap[0]} chars per source`);
  } else {
    fail(`retrieval settings varied: topK ${topK.join('/')}, cap ${cap.join('/')}`);
  }

  // Deterministic, no LLM: did the top-k actually contain the evidence BEAM names?
  if (fs.existsSync(path.join(RUNS, h.evidence))) {
    const ev = read(h.evidence);
    const withGold = ev.filter((r) => r.gold !== null && r.gold > 0);
    const any = withGold.filter((r) => r.hit > 0).length;
    const all = withGold.filter((r) => r.hit === r.gold).length;
    pass(`evidence served (no LLM involved): any ${pct(any / withGold.length)}%, all ${pct(all / withGold.length)}% of ${withGold.length} questions`);
  }

  console.log('   per category: ' + CATEGORIES.map((c) => `${c} ${pct(s.perCategory[c])}`).join(' . '));
  console.log('');
}

/**
 * The claim that the judge is an instrument, not a detail.
 * The 100K run was read by two judges. Same answers, both files here.
 */
console.log('The judge is an instrument  (same 400 answers, two graders)');
{
  const a = read('beam-100K-full.judged-gpt-4.1-mini.json');
  const b = read('beam-100K-full.judged-gemini-2.5-flash.json');
  const sa = scoreOf(a), sb = scoreOf(b);
  const keys = Object.keys(a).filter((k) => k in b);

  // Two counts, because there are two questions and they have different answers.
  // `effective` is the value that actually enters the score (a normalised
  // Kendall tau for event_ordering, the judge's 0/1 everywhere else); the raw
  // judge verdict is what a reader pictures when they hear "the judge changed
  // its mind". We publish the effective count, since that is the one that moves
  // a number, and we print both so the gap cannot be mistaken for a rounding.
  const effective = (r) => (r.category === 'event_ordering' ? (r.eventOrdering?.tauNorm ?? null) : r.judgeScore);
  const flippedEffective = keys.filter((k) => effective(a[k]) !== effective(b[k])).length;
  const flippedVerdict = keys.filter((k) => a[k].judgeScore !== b[k].judgeScore).length;

  pass(`gpt-4.1-mini ${pct(sa.overall)}%  vs  gemini-2.5-flash ${pct(sb.overall)}%`);
  pass(`${flippedEffective} of ${keys.length} scored values change with the grader alone`);
  pass(`of those, ${flippedVerdict} are a changed 0/1 verdict; the rest are event_ordering, scored by tau`);
  const worst = CATEGORIES
    .map((c) => ({ c, d: Math.abs(sa.perCategory[c] - sb.perCategory[c]) * 100 }))
    .sort((x, y) => y.d - x.d)[0];
  pass(`widest category gap: ${worst.c}, ${worst.d.toFixed(1)} points`);
}

/**
 * The degradation, which is the figure we actually put forward, because it
 * compares this system to itself on one rig rather than to anyone else.
 */
console.log('\nDegradation across the tiers');
{
  const s100 = scoreOf(read('beam-100K-full.judged-gpt-4.1-mini.json')).overall;
  const s10m = scoreOf(read('beam-10M-v1.judged-gpt-4.1-mini.json')).overall;
  const rel = ((s100 - s10m) / s100) * 100;
  pass(`${pct(s100)}% -> ${pct(s10m)}%  =  ${rel.toFixed(0)}% relative loss`);
  console.log("   For scale, BEAM's own paper reports its baselines falling 0.30 -> 0.12 over the");
  console.log('   same jump, a 60% relative loss. That figure is theirs and is NOT recomputed here.');
}

console.log('');
if (failures) {
  console.log(`FAILED - ${failures} mismatch(es). A published number does not follow from its rows.\n`);
  process.exit(1);
}
console.log('All published BEAM figures recompute from the rows in ./runs.\n');
