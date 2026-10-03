/**
 * scoring.js — the exact grader used to score every Mnemosyne OS benchmark run.
 *
 * This is the WHOLE grading logic: a deterministic heuristic pass
 * (exact / numeric / fuzzy / abstention matching) plus the LLM-judge prompt
 * and its verdict parser. It depends on nothing — no memory engine, no network.
 * It is published verbatim so the grading can be audited and re-run against the
 * public LongMemEval ground truth. The number you see is a product of THIS file.
 *
 * Two entry points matter:
 *   scoreAnswer(groundTruth, generated, sourcesCount) -> { correct, matchType, abstained }
 *   judgePrompt(groundTruth, generated, leniency)     -> the exact string sent to the judge model
 *   parseJudgeVerdict(reply)                          -> boolean (last YES/NO wins)
 *
 * Run `node scoring.js --selftest` to see the grader decide a handful of cases.
 */

const WORD_TO_NUMBER = { zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12' };

// Phrases that count as "the assistant declined / said it does not know".
const ABSTAIN_MARKERS = [
  'do not know', "don't know", 'not mentioned', 'did not mention', 'not specified',
  'no information', "i don't have", 'i do not have', 'cannot find', 'unable to find',
  'cannot answer', 'can not answer', 'unable to answer',
  'cannot determine', 'unable to determine', 'not possible to determine',
  'does not contain', 'does not include', 'does not provide', 'does not mention',
  'no mention', 'not explicitly', 'not stated',
  'cannot provide', 'do not have access', "don't have access",
  'aucune information', 'je ne sais pas', 'pas mentionné',
  'ne contient pas', 'ne peux pas répondre', 'impossible de déterminer',
];

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function looksAbstained(generated) {
  const g = generated.toLowerCase();
  return ABSTAIN_MARKERS.some((m) => g.includes(m));
}

// Some ground-truth answers ARE "the user did not mention X" — for those,
// abstaining is the correct behaviour, not a miss.
export function abstentionExpected(groundTruth) {
  const a = groundTruth.toLowerCase();
  return a.includes('did not mention') || a.includes('do not know') || a.includes('not specified');
}

export function scoreAnswer(groundTruth, generated, sourcesCount) {
  const answerLower = groundTruth.toLowerCase().trim();
  const genLower = generated.toLowerCase().trim();
  const abstained = looksAbstained(generated) || (!genLower && sourcesCount === 0);

  if (abstentionExpected(groundTruth)) {
    return abstained ? { correct: true, abstained: true, matchType: 'abstained' }
                     : { correct: false, abstained: false, matchType: 'miss' };
  }
  if (abstained) return { correct: false, abstained: true, matchType: 'abstained' };
  if (!genLower)  return { correct: false, abstained: false, matchType: 'miss' };

  // Numeric questions (counts, money, durations) grade on the number itself.
  const monetaryStripped = answerLower.replace(/[$€£¥]/g, '');
  const numericRaw = monetaryStripped.match(/\b(\d[\d.,]*\d|\d|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/)?.[0] ?? '';
  const cleanNum = numericRaw.replace(/[,\s]/g, '');
  const normalizedNum = WORD_TO_NUMBER[cleanNum] || cleanNum;
  if (normalizedNum.length >= 1 && numericRaw) {
    const genNumClean = genLower.replace(/,/g, '');
    const numRegex = new RegExp(`\\b${escapeRegExp(normalizedNum)}\\b`);
    const wordEquiv = WORD_TO_NUMBER[normalizedNum];
    const wordMatch = wordEquiv ? new RegExp(`\\b${wordEquiv}\\b`).test(genNumClean) : false;
    return numRegex.test(genNumClean) || genLower.includes(numericRaw) || wordMatch
      ? { correct: true, abstained: false, matchType: 'exact' }
      : { correct: false, abstained: false, matchType: 'miss' };
  }

  // Exact substring, or a long-answer prefix match.
  const exact = genLower.includes(answerLower) || (answerLower.length > 15 && genLower.includes(answerLower.slice(0, 30)));
  if (exact) return { correct: true, abstained: false, matchType: 'exact' };

  // Fuzzy: enough of the ground-truth content words appear in the answer.
  const answerWords = answerLower.split(/\s+/).filter((w) => w.length > 3);
  if (answerWords.length > 0) {
    const matched = answerWords.filter((w) => genLower.includes(w)).length;
    const threshold = answerWords.length <= 2 ? 1.0 : 0.5;
    if (matched >= Math.ceil(answerWords.length * threshold)) return { correct: true, abstained: false, matchType: 'fuzzy' };
  }
  return { correct: false, abstained: false, matchType: 'miss' };
}

// The judge is only consulted on top of the heuristic. Three leniency levels;
// the published headline numbers use "flexible".
export function judgePrompt(groundTruth, generated, leniency) {
  let leniencyInstruction = 'Assess if the Generated Answer contains or implies the Expected Ground Truth, explicitly or logically.\nIf the Generated Answer explicitly contains additional information but still correctly answers the Expected Ground Truth, answer YES.';
  if (leniency === 'flexible') {
    leniencyInstruction = 'Assess if the Generated Answer is generally on the right topic or provides a plausible partial answer related to the Expected Ground Truth.\nIf it expresses doubt but mentions relevant concepts, answer YES.';
  } else if (leniency === 'lenient') {
    leniencyInstruction = 'As long as the Generated Answer is not completely hallucinating a different topic, answer YES.\nAccept fuzzy memories, partial matches, and doubts as valid human-like responses.';
  }
  return `Instructions:
You are an impartial judge for an AI benchmark.
${leniencyInstruction}
EXCEPTION (overrides everything above): if the Generated Answer declines to answer, says it cannot determine the answer, or states that the information is unavailable — WITHOUT also giving the expected answer — reply NO.
Expected Ground Truth: "${groundTruth}"
Generated Answer: "${generated}"

Reply STRICTLY with YES or NO.`;
}

export function parseJudgeVerdict(reply) {
  const t = (reply ?? '').toUpperCase();
  const lastIndexOf = (re) => { let last = -1, m; while ((m = re.exec(t)) !== null) last = m.index; return last; };
  const lastYes = lastIndexOf(/\bYES\b/g);
  const lastNo = lastIndexOf(/\bNO\b/g);
  if (lastYes === -1 && lastNo === -1) return false;
  return lastYes >= lastNo;
}

// ── self-test ────────────────────────────────────────────────────────────────
// `node scoring.js --selftest` — shows the heuristic deciding real-shaped cases,
// so a reader can see it is strict, not tuned to inflate.
if (process.argv[1] && process.argv[1].endsWith('scoring.js') && process.argv.includes('--selftest')) {
  const cases = [
    ['Business Administration', 'you graduated with a degree in Business Administration.', 32, true],
    ['45 minutes each way', 'your daily commute is one hour each way.', 32, false],
    ['four', 'you have tried a total of 3 Korean restaurants.', 32, false],
    ['3', 'you need to pick up or return a total of 2 items of clothing.', 32, false],
    ['The Glass Menagerie', 'the play you attended was a production of "The Glass Menagerie".', 32, true],
    ['Tomatoes', 'the marigold seeds were started on March 3rd.', 32, false],
  ];
  let ok = 0;
  for (const [gt, gen, src, want] of cases) {
    const r = scoreAnswer(gt, gen, src);
    const pass = r.correct === want;
    ok += pass ? 1 : 0;
    console.log(`${pass ? 'ok  ' : 'FAIL'} [${r.matchType.padEnd(9)}] want=${want} got=${r.correct}  gt="${gt}"`);
  }
  console.log(`\nself-test: ${ok}/${cases.length} expected verdicts reproduced`);
  process.exit(ok === cases.length ? 0 : 1);
}
