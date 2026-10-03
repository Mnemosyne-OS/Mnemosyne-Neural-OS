#!/usr/bin/env bash
# Contrôles de mutation : un défaut injecté dans une COPIE doit être détecté.
# Usage: tests/mutation_checks.sh <bench-root-original>
# Sortie 0 seulement si chaque mutation produit l'effet attendu.
set -u
SRC="$1"; HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
fail=0
fresh() { rm -rf "$WORK/b"; cp -a "$SRC" "$WORK/b"; }

# M1 : inverser un verdict dans le registre fusion strict -> verify.js doit sortir 1
fresh
node -e '
const fs=require("fs"),p=process.argv[1];const L=fs.readFileSync(p,"utf8").split("\n");
for(let i=1;i<L.length;i++){if(!L[i].trim())continue;const o=JSON.parse(L[i]);if(o.question_id==="gpt4_76048e76"){o.correct=false;L[i]=JSON.stringify(o);break;}}
fs.writeFileSync(p,L.join("\n"));' "$WORK/b/verification-kit/results/lexical-fusion-strict-48q.jsonl"
(cd "$WORK/b/verification-kit" && node verify.js >/dev/null 2>&1); rc=$?
echo "M1 verify.js après inversion d'un verdict: rc=$rc (attendu 1)"; [ $rc -eq 1 ] || fail=1

# M2 : même mutation -> independent_recompute.mjs doit sortir 1
(node "$HERE/independent_recompute.mjs" "$WORK/b" >/dev/null 2>&1); rc=$?
echo "M2 independent_recompute après inversion: rc=$rc (attendu 1)"; [ $rc -eq 1 ] || fail=1

# M3 : supprimer une ligne du fichier brut run2 -> independent_recompute doit sortir != 0
fresh
node -e '
const fs=require("fs"),p=process.argv[1];const d=JSON.parse(fs.readFileSync(p,"utf8"));d.results=d.results.slice(1);fs.writeFileSync(p,JSON.stringify(d));' "$WORK/b/lexical-2026-08/runs/duel-full-lexfusion-r2.json"
(node "$HERE/independent_recompute.mjs" "$WORK/b" >/dev/null 2>&1); rc=$?
echo "M3 independent_recompute après suppression d'une ligne brute: rc=$rc (attendu !=0)"; [ $rc -ne 0 ] || fail=1

# M4 : BEAM, un judgeScore modifié -> beam verify.js doit sortir 1
fresh
node -e '
const fs=require("fs"),p=process.argv[1];const d=JSON.parse(fs.readFileSync(p,"utf8"));const k=Object.keys(d).find(k=>d[k].judgeScore===0&&d[k].category!=="event_ordering");d[k].judgeScore=1;d[k].items.forEach(i=>i.score=1);fs.writeFileSync(p,JSON.stringify(d));' "$WORK/b/beam-2026-09/runs/beam-100K-full.judged-gpt-4.1-mini.json"
(cd "$WORK/b/beam-2026-09" && node verify.js >/dev/null 2>&1); rc=$?
echo "M4 beam verify.js après un verdict 0->1: rc=$rc (attendu 1 si l'arrondi à 0,1 bouge)"
# un seul verdict déplace le score de 1/(40*10)*... ; on consigne sans exiger
# M5 : scoring.js corrigé (suppression du repli includes(numericRaw)) -> A01/A05/A06/A02/A14 deviennent conformes
fresh
sed -i 's/return numRegex.test(genNumClean) || genLower.includes(numericRaw) || wordMatch/return numRegex.test(genNumClean) || wordMatch/' "$WORK/b/verification-kit/scoring.js"
grep -q 'genLower.includes(numericRaw)' "$WORK/b/verification-kit/scoring.js" && { echo "M5 sed n'a pas appliqué la mutation"; fail=1; }
out=$(node "$HERE/adversarial_scoring.mjs" "$SRC" --scoring "$WORK/b/verification-kit/scoring.js" 2>/dev/null | grep -E '^(CONFORME|DEFAUT)' | grep -E ' (A01|A05|A06|A02|A14) ')
echo "$out" | sed 's/^/   /'
n=$(echo "$out" | grep -c '^CONFORME'); echo "M5 cas numériques conformes après correctif local: $n/5 (attendu 5 : la cause racine est le repli includes(numericRaw))"; [ "$n" -eq 5 ] || fail=1
exit $fail
