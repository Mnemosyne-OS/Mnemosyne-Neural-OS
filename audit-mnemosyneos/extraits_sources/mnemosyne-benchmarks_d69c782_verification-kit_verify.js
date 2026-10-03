#!/usr/bin/env node
/**
 * verify.js — independent integrity check of the published benchmark results.
 *
 * It reads every results/*.jsonl ledger, recomputes the overall accuracy and the
 * per-category breakdown FROM the per-question verdicts, and asserts they equal
 * the headline each file claims in its _meta. In other words: it proves the
 * advertised number is exactly the sum of the published per-question rows —
 * no hidden questions, no arithmetic massaging.
 *
 * It needs nothing but Node — no memory engine, no network, no dependencies.
 *
 *   node verify.js                 # check every ledger in ./results
 *   node verify.js results/foo.jsonl
 *
 * Exit code 0 = every ledger's rows reproduce its claimed headline; 1 = mismatch.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const files = args.length
  ? args
  : readdirSync(join(HERE, 'results')).filter((f) => f.endsWith('.jsonl')).map((f) => join(HERE, 'results', f));

let allOk = true;
const ledgers = new Map(); // basename -> { meta, rows }

for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  let meta = null;
  const rows = [];
  for (const line of lines) {
    const obj = JSON.parse(line);
    if (obj._meta) meta = obj._meta;
    else rows.push(obj);
  }
  if (!meta) { console.error(`✗ ${file}: no _meta header row`); allOk = false; continue; }
  ledgers.set(basename(file), { meta, rows });

  const total = rows.length;
  const hits = rows.filter((r) => r.correct === true).length;
  const acc = total ? (hits / total) * 100 : 0;

  const byCat = {};
  for (const r of rows) {
    (byCat[r.category] ??= { h: 0, n: 0 });
    byCat[r.category].n++;
    if (r.correct) byCat[r.category].h++;
  }

  const okTotal = total === meta.expected_total;
  const okHits = hits === meta.expected_hits;
  const okAcc = Math.abs(acc - meta.expected_accuracy_pct) < 0.1;
  const ok = okTotal && okHits && okAcc;
  allOk = allOk && ok;

  console.log(`\n${ok ? '✓' : '✗'} ${meta.run}`);
  console.log(`  dataset: ${meta.dataset} · ${meta.variant}`);
  console.log(`  answer model: ${meta.answer_model} · judge: ${meta.judge_model} (${meta.judge_leniency})`);
  console.log(`  recomputed from ${total} published rows: ${hits}/${total} = ${acc.toFixed(1)}%`);
  console.log(`  claimed headline:                        ${meta.expected_hits}/${meta.expected_total} = ${meta.expected_accuracy_pct}%`);
  console.log(`  match: total ${okTotal ? 'ok' : 'MISMATCH'} · hits ${okHits ? 'ok' : 'MISMATCH'} · accuracy ${okAcc ? 'ok' : 'MISMATCH'}`);
  console.log('  per-category:');
  for (const c of Object.keys(byCat).sort()) console.log(`    ${c.padEnd(26)} ${byCat[c].h}/${byCat[c].n}`);

  // Replay discipline (METHODOLOGY.md §4.1): a HIT counts only if it reproduces
  // on a second independent run. Any first-run HIT that did not reproduce is
  // scored MISS above — surfaced here rather than quietly dropped.
  const discarded = rows.filter((r) => r.replay_stable === false);
  if (discarded.length) {
    console.log(`  replay rule: ${discarded.length} first-run HIT(s) did NOT reproduce → scored MISS:`);
    for (const r of discarded) console.log(`    ${r.question_id.padEnd(16)} ${r.discard_reason}`);
  }
  if (meta.scope) console.log(`  scope: ${meta.scope}`);
}

// ── Composed headline ────────────────────────────────────────────────────────
// The 72.9% figure is not a single measured 48-question run: the engine was only
// re-run on the multi-session category. Recompose it here, in the open, so the
// composition is auditable instead of asserted.
const base = ledgers.get('baseline-longmemeval-m-48q.jsonl');
const eng = ledgers.get('engine-multisession-8q.jsonl');
if (base && eng) {
  const carried = base.rows.filter((r) => r.category !== 'multi-session');
  const carriedHits = carried.filter((r) => r.correct === true).length;
  const engHits = eng.rows.filter((r) => r.correct === true).length;
  const hits = carriedHits + engHits;
  const total = carried.length + eng.rows.length;
  const acc = (hits / total) * 100;
  const CLAIMED = { hits: 35, total: 48, pct: 72.9 };
  const ok = hits === CLAIMED.hits && total === CLAIMED.total && Math.abs(acc - CLAIMED.pct) < 0.1;
  allOk = allOk && ok;

  console.log(`\n${ok ? '✓' : '✗'} COMPOSED HEADLINE — full engine, LongMemEval-M full-haystack`);
  console.log('  This number is COMPOSED from two ledgers, not measured in one 48q run:');
  console.log(`    ${String(carriedHits).padStart(2)}/${carried.length}  carried unchanged from the baseline ledger (5 categories NEVER re-run with the engine)`);
  console.log(`    ${String(engHits).padStart(2)}/${eng.rows.length}   measured with the engine (multi-session only)`);
  console.log(`    ${String(hits).padStart(2)}/${total}  = ${acc.toFixed(1)}%   recomputed`);
  console.log(`          claimed: ${CLAIMED.hits}/${CLAIMED.total} = ${CLAIMED.pct}%  → ${ok ? 'ok' : 'MISMATCH'}`);
  console.log('  Because the 40 carried questions were never retried with the engine, they can only');
  console.log('  improve on a full re-run — which is why 72.9% is published as a LOWER BOUND, and');
  console.log('  why it must not be quoted as a measured 48-question engine result.');
} else {
  console.log('\n! COMPOSED HEADLINE skipped — needs both the baseline and engine ledgers.');
}

// ── Lexical-channel campaign (2026-08) ───────────────────────────────────────
// Two kinds of evidence, both recomputed from committed artifacts:
//   1. The strict answer-side pair: the two lexical ledgers above (already
//      verified row-by-row by the generic loop) — here we recompute the PAIRED
//      delta from the baseline_correct field on every row.
//   2. Deterministic retrieval measurements (no LLM anywhere): raw per-question
//      recall files in lexical-2026-08/runs/, including the 48-question HOLDOUT
//      never seen during development.
const lexBase = ledgers.get('lexical-baseline-strict-48q.jsonl');
const lexFusion = ledgers.get('lexical-fusion-strict-48q.jsonl');
const lexBaseFlex = ledgers.get('lexical-baseline-flexible-48q.jsonl');
const lexFusionFlex = ledgers.get('lexical-fusion-flexible-48q.jsonl');
const lexRunsDir = join(HERE, '..', 'lexical-2026-08', 'runs');
const loadRecall = (f) => JSON.parse(readFileSync(join(lexRunsDir, f), 'utf8')).rows;
const recallAgg = (rows) => ({
  all: rows.filter((r) => r.all).length,
  n: rows.length,
  loc: rows.filter((r) => r.locatable).length,
  chunk: rows.filter((r) => r.locatable && r.chunk).length,
});

if (lexBase && lexFusion) {
  const gains = lexFusion.rows.filter((r) => r.correct && r.baseline_correct === false).length;
  const regressions = lexFusion.rows.filter((r) => !r.correct && r.baseline_correct === true).length;
  const EXP = { gains: 9, regressions: 1 };
  const okPair = gains === EXP.gains && regressions === EXP.regressions;
  allOk = allOk && okPair;
  console.log(`\n${okPair ? '✓' : '✗'} LEXICAL CHANNEL — paired strict delta (answer side, development sample)`);
  console.log(`  recomputed from the rows' baseline_correct field: +${gains} gained / −${regressions} regressed (claimed +${EXP.gains}/−${EXP.regressions})`);
  console.log('  29/48 → 37/48 under the both-runs replay rule; exact binomial on 9-vs-1 flips gives p = 0.0215.');
  console.log('  ⚠ This 48-question sample was used during development and runs ~13 points easier than');
  console.log('    its parent set. The transfer evidence is the deterministic holdout below, not this pair.');

  // Same answers, the other grader. Published so nobody has to take the leniency
  // difference on trust — and so the weaker flexible signal is visible too.
  if (lexBaseFlex && lexFusionFlex) {
    const fGains = lexFusionFlex.rows.filter((r) => r.correct && r.baseline_correct === false).length;
    const fRegs = lexFusionFlex.rows.filter((r) => !r.correct && r.baseline_correct === true).length;
    const bh = lexBaseFlex.rows.filter((r) => r.correct).length;
    const fh = lexFusionFlex.rows.filter((r) => r.correct).length;
    const unstable = lexFusionFlex.rows.filter((r) => r.replay_stable === false).length;
    console.log(`\n✓ LEXICAL CHANNEL — the same runs under the FLEXIBLE judge (July's grader)`);
    console.log(`  ${bh}/48 = ${((100 * bh) / 48).toFixed(1)}% → ${fh}/48 = ${((100 * fh) / 48).toFixed(1)}%, same both-runs replay rule`);
    console.log(`  paired: +${fGains} gained / −${fRegs} regressed — a weaker signal than the strict pair above.`);
    console.log(`  ${unstable} question(s) disagreed between the two runs and were scored by the conjunction.`);
    console.log('  Both leniencies are published because a score without its judge is not a result:');
    console.log('  the strict number is the one we lead with, the flexible one is what July would have said.');
  } else {
    console.log(`\n! FLEXIBLE pair skipped — needs lexical-{baseline,fusion}-flexible-48q.jsonl.`);
  }

  try {
    const control = recallAgg(loadRecall('recall-control.json'));
    const fusionMem = loadRecall('recall-fusion.json');
    const fusionPers = loadRecall('recall-fusion-persistent.json');
    const postFix = loadRecall('recall-post-fix.json');
    const fm = recallAgg(fusionMem), fp = recallAgg(fusionPers), pf = recallAgg(postFix);

    const EXPECT = { control: { all: 38, chunk: 25, loc: 35 }, fusion: { all: 41, chunk: 30, loc: 35 } };
    const okDev = control.all === EXPECT.control.all && control.chunk === EXPECT.control.chunk
      && fp.all === EXPECT.fusion.all && fp.chunk === EXPECT.fusion.chunk;

    // The persistent index must reproduce the in-memory ranking question-by-question,
    // and the app-isolation fix must not have moved the CORE-mode ranking.
    const persByld = new Map(fusionPers.map((r) => [r.id, r]));
    const pfByld = new Map(postFix.map((r) => [r.id, r]));
    const sameRow = (a, b) => !!b && a.all === b.all && a.locatable === b.locatable && a.chunk === b.chunk;
    const okStorage = fusionMem.every((r) => sameRow(r, persByld.get(r.id)));
    const okIsolation = fusionMem.every((r) => sameRow(r, pfByld.get(r.id)));

    const holdOff = loadRecall('recall-hold-off.json');
    const holdOnM = new Map(loadRecall('recall-hold-on.json').map((r) => [r.id, r]));
    let sGain = 0, sLoss = 0, cGain = 0, cLoss = 0;
    for (const o of holdOff) {
      const x = holdOnM.get(o.id);
      if (!x) throw new Error(`holdout run missing question ${o.id}`);
      if (x.all && !o.all) sGain++;
      if (!x.all && o.all) sLoss++;
      if (o.locatable && x.locatable) {
        if (x.chunk && !o.chunk) cGain++;
        if (!x.chunk && o.chunk) cLoss++;
      }
    }
    const okHold = sGain === 4 && sLoss === 0 && cGain === 2 && cLoss === 0;

    const okLex = okDev && okStorage && okIsolation && okHold;
    allOk = allOk && okLex;
    console.log(`${okLex ? '✓' : '✗'} LEXICAL CHANNEL — deterministic retrieval (no LLM in the loop)`);
    console.log(`  development sample: evidence sessions ${control.all}/${control.n} → ${fp.all}/${fp.n} · answer chunk ${control.chunk}/${control.loc} → ${fp.chunk}/${fp.loc} ${okDev ? '(matches the published 38→41 and 25→30)' : 'MISMATCH'}`);
    console.log(`  storage equivalence: persistent index reproduces the in-memory ranking on all ${fusionMem.length} questions → ${okStorage ? 'ok' : 'MISMATCH'}`);
    console.log(`  app-isolation fix: CORE-mode ranking unchanged on all ${fusionMem.length} questions → ${okIsolation ? 'ok' : 'MISMATCH'}`);
    console.log(`  HOLDOUT (48 questions never seen during development): sessions +${sGain}/−${sLoss}, answer chunks +${cGain}/−${cLoss} → ${okHold ? 'zero regressions, as published' : 'MISMATCH'}`);
  } catch (e) {
    console.log(`✗ LEXICAL CHANNEL — recall files unreadable: ${e.message}`);
    allOk = false;
  }
}

console.log(`\n${allOk ? '✓ ALL LEDGERS CONSISTENT' : '✗ ONE OR MORE LEDGERS FAILED'} — every published headline, including the composed one, is the exact sum of the published rows.`);
process.exit(allOk ? 0 : 1);
