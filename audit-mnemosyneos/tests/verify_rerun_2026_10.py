#!/usr/bin/env python3
"""Vérification indépendante du rerun LongMemEval-M 2026-10 (MnemosyneOS---benchmarks@b4a24f0).

N'utilise pas le verify.js du dépôt. Contrôles :
  1. SHA-256 du sel == valeur gelée dans PROTOCOL.md@69c5bbc ;
  2. id-map : chaque entrée == 's_' + sha256(sel + id)[:12] ;
  3. aucune trace d'identifiant de session du jeu de données (answer_/sharegpt_/ultrachat_) dans les réponses ;
  4. prompts du juge officiel == get_anscheck_prompt() de LongMemEval@9e0b455 (code original importé) ;
  5. verdict officiel == ('yes' in reply.lower()), règle du code officiel ;
  6. scores « deux passes » par ensemble, bras et juge, avant et après human-audit.json ;
  7. questions : dev == échantillon audité ; holdout == règle publiée (tri lexicographique, 8 premiers
     par type parmi les 452 autres), recalculée depuis la liste tierce des 500 ids ;
  8. build moteur identique dans tous les runs.
Usage : python3 verify_rerun_2026_10.py <rerun-dir> <LongMemEval-dir> <mirror-json> <lexical-runs-dir>
Sortie 1 si une propriété échoue.
"""
import hashlib, json, os, re, sys, types, glob, importlib.util
from collections import defaultdict

RERUN, LME, MIRROR, LEXRUNS = sys.argv[1:5]
PROTO_SALT_SHA = '8a5309dc094b2cd0c5519f1596c7368ff3358b85a3c06c956cff01702e43861e'
PROTO_DIST_SHA = 'ca95266d990bd39cdc28834a61a4b03370dbe50e01cdee08374593dff4b30a3f'
fails = 0
def check(ok, msg):
    global fails
    print(('  [ok]   ' if ok else '  [FAIL] ') + msg)
    if not ok: fails += 1
J = lambda p: json.load(open(p, encoding='utf-8'))

print('1-2. Sel et table d\'anonymisation')
salt = open(os.path.join(RERUN, 'salt.txt'), encoding='utf-8').read().strip()
check(hashlib.sha256(salt.encode()).hexdigest() == PROTO_SALT_SHA, f'sha256(sel) == hash gelé ({PROTO_SALT_SHA[:12]}…)')
idmap = J(os.path.join(RERUN, 'id-map.json'))
bad = [k for k, v in idmap.items() if v != 's_' + hashlib.sha256((salt + k).encode()).hexdigest()[:12]]
check(not bad, f'id-map : {len(idmap)} entrées recalculées, {len(bad)} écart(s)')
vals = list(idmap.values()); check(len(set(vals)) == len(vals), 'id anonymisés uniques')

print('3. Fuite d\'identifiants du jeu de données dans les réponses')
leak = re.compile(r'\b(answer|sharegpt|ultrachat)_[A-Za-z0-9]{5,}')
answers = {}
for f in sorted(glob.glob(os.path.join(RERUN, 'runs', 'answers-*.json'))):
    d = J(f); rows = d['rows'] if isinstance(d['rows'], list) else list(d['rows'].values())
    answers[os.path.basename(f)] = (d, {r['id']: r for r in rows})
    hits = [(r['id'], m.group(0)) for r in rows for m in leak.finditer(json.dumps(r.get('answer', '')) + json.dumps(r.get('sources', '')))]
    check(not hits, f'{os.path.basename(f)} : {len(rows)} réponses, identifiants du jeu trouvés : {len(hits)} {hits[:3]}')

print('4-5. Juge officiel : prompt et règle de décision du code LongMemEval')
for mod in ('openai', 'backoff', 'tqdm', 'numpy'):
    m = types.ModuleType(mod); sys.modules[mod] = m
sys.modules['openai'].OpenAI = object; sys.modules['openai'].RateLimitError = Exception; sys.modules['openai'].APIError = Exception
sys.modules['backoff'].on_exception = lambda *a, **k: (lambda f: f); sys.modules['backoff'].expo = None
sys.modules['tqdm'].tqdm = lambda x: x
spec = importlib.util.spec_from_file_location('evaluate_qa', os.path.join(LME, 'src', 'evaluation', 'evaluate_qa.py'))
eq = importlib.util.module_from_spec(spec); spec.loader.exec_module(eq)
judged = {}
for f in sorted(glob.glob(os.path.join(RERUN, 'runs', 'judged-*.json'))):
    d = J(f); name = os.path.basename(f); judged[name] = d
    ad, arows = answers[d['answers']]
    pm = vm = 0
    for qid, r in d['rows'].items():
        a = arows[qid]
        want = eq.get_anscheck_prompt(a['type'], a['question'], a['expected'], a['answer'], abstention='_abs' in qid)
        if r['official']['prompt'] != want: pm += 1
        if r['official']['verdict'] != ('yes' in r['official']['reply'].lower()): vm += 1
    check(pm == 0 and vm == 0 and d['officialJudge'] == 'gpt-4o-2024-08-06', f'{name} : {len(d["rows"])} prompts officiels identiques au code ({pm} écart), verdicts = règle « yes » ({vm} écart), modèle {d["officialJudge"]}')

print('6. Scores (deux passes requises), avant et après audit humain')
audit = J(os.path.join(RERUN, 'human-audit.json'))
over = defaultdict(set)  # (file, judge) -> qids
for o in audit['overrides']:
    for f in o['runs']:
        for jn in o['judges']: over[(f, jn)].add(o['question_id'])
def v(fname, qid, judge, audited):
    r = judged[fname]['rows'][qid][judge]['verdict']
    return False if audited and qid in over[(fname, judge)] else r
res = {}
for s in ('holdout', 'dev'):
    for arm in ('fused', 'vector'):
        for judge in ('official', 'strict'):
            for audited in (False, True):
                p1, p2 = f'judged-{s}-{arm}-p1.json', f'judged-{s}-{arm}-p2.json'
                ids = judged[p1]['rows'].keys()
                res[(s, arm, judge, audited)] = sum(1 for q in ids if v(p1, q, judge, audited) and v(p2, q, judge, audited))
for s in ('holdout', 'dev'):
    for judge in ('official', 'strict'):
        print(f'     {s:7s} {judge:8s} fused {res[(s,"fused",judge,False)]}/48 -> {res[(s,"fused",judge,True)]}/48 après audit ; vector {res[(s,"vector",judge,False)]}/48 -> {res[(s,"vector",judge,True)]}/48')
PUB = {('holdout','fused','official'):37, ('holdout','vector','official'):38, ('holdout','fused','strict'):38, ('holdout','vector','strict'):37,
       ('dev','fused','official'):39, ('dev','vector','official'):38, ('dev','fused','strict'):41, ('dev','vector','strict'):38}
check(all(res[k + (True,)] == n for k, n in PUB.items()), 'les 8 scores publiés (après audit) sont reproduits')
g = sum(1 for q in judged['judged-holdout-fused-p1.json']['rows'] if (v('judged-holdout-fused-p1.json', q, 'official', True) and v('judged-holdout-fused-p2.json', q, 'official', True)) and not (v('judged-holdout-vector-p1.json', q, 'official', True) and v('judged-holdout-vector-p2.json', q, 'official', True)))
l = sum(1 for q in judged['judged-holdout-fused-p1.json']['rows'] if not (v('judged-holdout-fused-p1.json', q, 'official', True) and v('judged-holdout-fused-p2.json', q, 'official', True)) and (v('judged-holdout-vector-p1.json', q, 'official', True) and v('judged-holdout-vector-p2.json', q, 'official', True)))
print(f'     holdout, juge officiel : fusion contre vector +{g}/−{l}')
# désaccords de passes et de juges (information)
dis = sum(1 for q in judged['judged-holdout-fused-p1.json']['rows'] if judged['judged-holdout-fused-p1.json']['rows'][q]['official']['verdict'] != judged['judged-holdout-fused-p2.json']['rows'][q]['official']['verdict'])
print(f'     holdout fusion, juge officiel : {dis} question(s) où les deux passes divergent')

print('7. Questions')
q = J(os.path.join(RERUN, 'questions.json'))
dev = [x['question_id'] for x in q['dev']]; hold = [x['question_id'] for x in q['holdout']]
aug = [r['id'] for r in J(os.path.join(LEXRUNS, 'duel-full.rejudged.json'))['results']]
check(sorted(dev) == sorted(aug), 'dev == les 48 questions auditées en août')
mirror = J(MIRROR)['per_case']
bytype = defaultdict(list)
for m in mirror:
    if m['question_id'] not in set(dev): bytype[m['question_type']].append(m['question_id'])
rule = sorted(i for t, ids in bytype.items() for i in sorted(ids)[:8])
check(len(mirror) == 500 and sum(len(x) for x in bytype.values()) == 452, 'liste tierce : 500 ids, 452 hors dev')
check(sorted(hold) == rule, f'holdout == règle publiée recalculée ({len(set(hold) & set(rule))}/48 communs) ; _abs dans le holdout : {sum(1 for i in hold if i.endswith("_abs"))}')
aug_hold = [r['id'] for r in J(os.path.join(LEXRUNS, 'recall-hold-off.json'))['rows']]
print(f'     recouvrement avec le holdout d\'août : {len(set(hold) & set(aug_hold))}/48')

print('8. Build moteur')
dists = {d['build']['coreDistSha256'] for d, _ in answers.values()}
commits = sorted({d['build']['monorepoCommit'][:9] for d, _ in answers.values()})
check(dists == {PROTO_DIST_SHA}, f'coreDistSha256 identique au protocole dans les {len(answers)} runs')
print(f'     commits du monorepo dans les runs : {commits} (déviation déclarée) ; valeurs auto-déclarées, moteur fermé')
infra = sum(1 for _, rows in answers.values() for r in rows.values() if r.get('infra'))
check(infra == 0, f'échecs d\'infrastructure finaux : {infra}')

print(f'\n{"ÉCHEC : " + str(fails) + " propriété(s)" if fails else "Toutes les propriétés vérifiées"}')
sys.exit(1 if fails else 0)
