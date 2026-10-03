// Génère SOURCES_ET_VERSIONS.json et COUVERTURE_LECTURE.csv à partir des copies figées.
// Usage: node gen_sources_coverage.mjs <src-dir> <audit-dir>
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const [SRC, AUD] = process.argv.slice(2);
const sh = (c, cwd) => execSync(c, { cwd, encoding: 'utf8' }).trim();
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const REPOS = [
  ['Mnemosyne-OS/Mnemosyne-Neural-OS', 'Mnemosyne-Neural-OS', 'objet audité (SDK, CLI, docs)'],
  ['Mnemosyne-OS/MnemosyneOS---benchmarks', 'MnemosyneOS---benchmarks', 'objet audité (campagnes, registres, vérificateurs)'],
  ['Mnemosyne-OS/agent-memory-skill', 'agent-memory-skill', 'objet audité (skill documentaire)'],
  ['xiaowu0162/LongMemEval', 'LongMemEval', 'référence primaire LongMemEval (code d\'évaluation)'],
  ['mohammadtavakoli78/BEAM', 'BEAM', 'référence primaire BEAM (code d\'évaluation, données)'],
  ['snap-research/locomo', 'locomo', 'référence primaire LoCoMo (non utilisée : aucune campagne LoCoMo publiée trouvée)'],
  ['JordanMcCann/agentmemory', 'mirror_JordanMcCann_agentmemory', 'SOURCE SECONDAIRE : texte des questions LongMemEval (recoupé sur les 48 références)'],
];
const repos = REPOS.map(([slug, dir, role]) => {
  const d = join(SRC, dir);
  return {
    url: `https://github.com/${slug}`, role, branch: sh('git rev-parse --abbrev-ref HEAD', d), commit: sh('git rev-parse HEAD', d),
    commit_date: sh('git log -1 --format=%cI', d), clone: sh('git rev-parse --is-shallow-repository', d) === 'true' ? 'shallow (--depth 1)' : 'complet',
    local_state: sh('git status --porcelain', d) === '' ? 'propre (aucune modification)' : 'MODIFIÉ', retrieved_utc: '2026-09-28T09:0xZ (clone de session, voir traces)',
  };
});
const bench = join(SRC, 'MnemosyneOS---benchmarks');
const benchFiles = sh('git ls-files', bench).split('\n');
const fileHashes = Object.fromEntries(benchFiles.map((f) => [f, sha(join(bench, f))]));
const extra = {
  'LongMemEval/src/evaluation/evaluate_qa.py': sha(join(SRC, 'LongMemEval/src/evaluation/evaluate_qa.py')),
  'BEAM/src/evaluation/compute_metrics.py': sha(join(SRC, 'BEAM/src/evaluation/compute_metrics.py')),
  'BEAM/src/evaluation/report_results.py': sha(join(SRC, 'BEAM/src/evaluation/report_results.py')),
  'BEAM/src/llm.py': sha(join(SRC, 'BEAM/src/llm.py')),
  'Mnemosyne-Neural-OS/packages/sdk/src/client.ts': sha(join(SRC, 'Mnemosyne-Neural-OS/packages/sdk/src/client.ts')),
  'Mnemosyne-Neural-OS/tools/metrics.json': sha(join(SRC, 'Mnemosyne-Neural-OS/tools/metrics.json')),
  'Mnemosyne-Neural-OS/tools/check-public-sync.mjs': sha(join(SRC, 'Mnemosyne-Neural-OS/tools/check-public-sync.mjs')),
  'Mnemosyne-Neural-OS/AGENTS.md': sha(join(SRC, 'Mnemosyne-Neural-OS/AGENTS.md')),
  'Mnemosyne-Neural-OS/README.md': sha(join(SRC, 'Mnemosyne-Neural-OS/README.md')),
  'mirror_JordanMcCann_agentmemory/longmemeval_results_opus6.json': sha(join(SRC, 'mirror_JordanMcCann_agentmemory/longmemeval_results_opus6.json')),
};
const out = {
  generated_utc: new Date().toISOString(),
  environment: { node: process.version, python: sh('python3 --version'), git: sh('git --version'), pnpm: sh('pnpm --version'), os: sh('uname -srm'), network: 'proxy sortant ; huggingface.co, arxiv.org, mnemosyne-os.io/.com, docs.mnemosyne-os.io BLOQUÉS ; github.com et registry.npmjs.org accessibles ; exécutions de test sous unshare -n' },
  repositories: repos,
  benchmark_repo_file_sha256: fileHashes,
  other_file_sha256: extra,
  datasets: [
    { name: 'LongMemEval oracle (cleaned)', uri: 'hf://datasets/xiaowu0162/longmemeval-cleaned/longmemeval_oracle.json', size: 15388478, sha256: 'NON CALCULÉ (huggingface.co bloqué ; lecture par le connecteur HF, octets 0-119999, élément gpt4_76048e76)', updated: '2025-09-19 (métadonnées Hub)' },
    { name: 'LongMemEval oracle (original)', uri: 'hf://datasets/xiaowu0162/longmemeval/longmemeval_oracle', size: 15388478, sha256: 'NON CALCULÉ (idem)' },
    { name: 'LongMemEval M cleaned / original', uri: 'hf://datasets/xiaowu0162/longmemeval-cleaned/longmemeval_m_cleaned.json ; hf://datasets/xiaowu0162/longmemeval/longmemeval_m', size: '2737100077 / 2745274681', sha256: 'NON RÉCUPÉRÉ' },
    { name: 'BEAM (chats 100K/500K/1M/10M)', uri: 'https://github.com/mohammadtavakoli78/BEAM @ b2da22e (répertoire chats/)', note: 'non utilisé pour recalcul ; rubriques et questions lues dans les fichiers Mnemosyne' },
    { name: 'BEAM paper', uri: 'hf://papers/2510.27246/paper.md (arXiv 2510.27246v1, 2025-10-31)', sha256: 'NON CALCULÉ (lu par le connecteur HF)' },
  ],
  web_pages: [
    { url: 'https://mnemosyne-os.io/', status: 'BLOQUÉ par le proxy' }, { url: 'https://mnemosyne-os.com/', status: 'BLOQUÉ' },
    { url: 'https://docs.mnemosyne-os.io/', status: 'BLOQUÉ' }, { url: 'https://mnemosyne-os.github.io/MnemosyneOS---benchmarks/verification-kit/', status: 'non consulté ; source index.html lue dans le dépôt @ d69c782' },
  ],
};
writeFileSync(join(AUD, 'SOURCES_ET_VERSIONS.json'), JSON.stringify(out, null, 2) + '\n');

// Couverture de lecture
const LEVEL = {
  'README.md': 'lu intégralement', 'AGENTS.md': 'lu intégralement', 'LICENSE': 'partiellement inspecté (en-tête)', 'LICENSE-CODE': 'non lu (licence MIT déclarée)',
  'verification-kit/README.md': 'lu intégralement', 'verification-kit/METHODOLOGY.md': 'lu intégralement', 'verification-kit/RESULTS.md': 'lu intégralement',
  'verification-kit/scoring.js': 'lu intégralement + exécuté + testé (adverse, mutation)', 'verification-kit/verify.js': 'lu intégralement + exécuté + mutation',
  'verification-kit/index.html': 'analysé par outil (extraction de phrases clés)',
  'lexical-2026-08/SUMMARY.md': 'lu intégralement', 'lexical-2026-08/extract-ledgers.mjs': 'lu intégralement + exécuté (sortie identique au dépôt)',
  'lexical-2026-08/runs/duel-full.rejudged.json': 'lu intégralement (tableau par question T02) + analysé par outil',
  'lexical-2026-08/runs/duel-full-lexfusion.json': 'lu intégralement (T02) + analysé par outil', 'lexical-2026-08/runs/duel-full-lexfusion-r2.json': 'lu intégralement (T02) + analysé par outil',
  'beam-2026-09/SUMMARY.md': 'lu intégralement', 'beam-2026-09/verify.js': 'lu intégralement + exécuté + mutation',
  'fullhaystack-2026-07/SUMMARY.md': 'lu intégralement', 'fullhaystack-2026-07/logs/grand-run.log': 'analysé par outil (48 lignes-verdict) + lecture partielle',
  'fullhaystack-2026-07/logs/exp-verify.log': 'analysé par outil + lecture partielle', 'fullhaystack-2026-07/logs/spine-dream-multirun.log': 'analysé par outil + lecture partielle (l. 1240-1270)',
};
const rows = [['depot', 'commit', 'chemin', 'categorie', 'octets', 'sha256', 'niveau_inspection']];
const cat = (f) => /\.(md|txt|html)$/.test(f) ? 'documentation' : /\.(js|mjs|ts)$/.test(f) ? 'code' : /\.log$/.test(f) ? 'journal brut' : /\.jsonl?$/.test(f) ? 'données/résultats' : 'autre';
const bc = sh('git rev-parse HEAD', bench);
for (const f of benchFiles) {
  let lvl = LEVEL[f];
  if (!lvl) lvl = f.startsWith('verification-kit/results/') ? 'analysé par outil (recalcul indépendant, alignement brut)'
    : f.startsWith('beam-2026-09/runs/') ? 'analysé par outil (recalcul, distribution, abstention lue intégralement T10)'
    : f.startsWith('lexical-2026-08/runs/') ? 'analysé par outil (via verify.js et recalcul)'
    : f.startsWith('fullhaystack-2026-07/logs/') ? 'analysé par outil (extraction des verdicts par bras T18)' : 'non lu';
  rows.push(['MnemosyneOS---benchmarks', bc, f, cat(f), statSync(join(bench, f)).size, fileHashes[f], lvl]);
}
const prod = join(SRC, 'Mnemosyne-Neural-OS'); const pc = sh('git rev-parse HEAD', prod);
const PROD = {
  'AGENTS.md': 'lu intégralement (objet d\'audit)', 'LICENSE': 'lu intégralement', 'packages/sdk/src/client.ts': 'lu intégralement',
  'tools/metrics.json': 'lu intégralement', 'tools/check-public-sync.mjs': 'partiellement inspecté (l. 1-80 lues, reste par recherche ciblée)',
  'package.json': 'lu intégralement', 'pnpm-workspace.yaml': 'lu intégralement', 'packages/sdk/package.json': 'analysé par outil', 'packages/mcp/package.json': 'analysé par outil',
  'README.md': 'recherche de mots-clés (non lu intégralement)', 'doc/DESIGN_DECISIONS.md': 'recherche de mots-clés', 'doc/ARCHITECTURE.md': 'recherche de mots-clés',
  'doc/IPC_SECURITY_BRIDGE.md': 'recherche de mots-clés', 'doc/RESONANCE_ENGINE_WHITEPAPER.md': 'recherche de mots-clés', 'doc/GOVERNANCE.md': 'recherche de mots-clés',
  'handbook/02-the-three-pillars/03-the-veto.md': 'recherche de mots-clés (l. 204-212 lues)', 'packages/sdk/README.md': 'recherche de mots-clés',
};
for (const f of sh('git ls-files', prod).split('\n')) {
  let lvl = PROD[f] ?? (f.startsWith('packages/mcp/src/') && f.endsWith('.test.ts') ? 'exécuté (suite de tests, T15)' : f.startsWith('packages/mcp/src/') ? 'exécuté indirectement par les tests (non lu)' : f.startsWith('archive/') ? 'exclu (archive déclarée historique)' : /\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(f) ? 'exclu (image)' : 'non lu');
  rows.push(['Mnemosyne-Neural-OS', pc, f, /\.(ts|js|mjs|cjs)$/.test(f) ? (/\.test\./.test(f) ? 'test' : 'code') : /\.(md|txt)$/.test(f) ? 'documentation' : /\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(f) ? 'binaire (image)' : 'autre', statSync(join(prod, f)).size, '', lvl]);
}
const skill = join(SRC, 'agent-memory-skill'); const scm = sh('git rev-parse HEAD', skill);
for (const f of sh('git ls-files', skill).split('\n')) rows.push(['agent-memory-skill', scm, f, 'documentation', statSync(join(skill, f)).size, sha(join(skill, f)), 'recherche de mots-clés']);
for (const [f, l] of [['LongMemEval/src/evaluation/evaluate_qa.py', 'lu intégralement'], ['BEAM/src/evaluation/compute_metrics.py', 'lu intégralement'], ['BEAM/src/evaluation/run_evaluation.py', 'lu intégralement'], ['BEAM/src/evaluation/report_results.py', 'lu intégralement'], ['BEAM/src/llm.py', 'lu intégralement'], ['BEAM/src/prompts.py', 'partiellement inspecté (unified_llm_judge_base_prompt)'], ['BEAM/README.md', 'recherche de mots-clés']])
  rows.push([f.split('/')[0], sh('git rev-parse HEAD', join(SRC, f.split('/')[0])), f.split('/').slice(1).join('/'), 'référence', statSync(join(SRC, f)).size, sha(join(SRC, f)), l]);
const esc = (v) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
writeFileSync(join(AUD, 'COUVERTURE_LECTURE.csv'), rows.map((r) => r.map(esc).join(',')).join('\n') + '\n');
console.log(`SOURCES_ET_VERSIONS.json: ${repos.length} dépôts, ${benchFiles.length} fichiers hachés ; COUVERTURE_LECTURE.csv: ${rows.length - 1} lignes`);
