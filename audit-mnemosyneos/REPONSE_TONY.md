# Message à Tony


---

Bonjour Tony,

Suite à notre échange d'hier soir, voici ma relecture complète de tes dépôts de benchmark, à des commits figés : `MnemosyneOS---benchmarks@d69c782` et `Mnemosyne-Neural-OS@580f1fe`. J'ai exécuté tes vérificateurs hors réseau et écrit un recalcul indépendant.

**Ce qui tient.** Ton arithmétique est exacte partout : 77,1, 81,3, la composition 35/48, +9/−1 avec p = 0,0215, le holdout, et BEAM 61,7 et 49,2. `extract-ledgers.mjs` régénère tes registres à l'octet près. Tes verdicts de juillet concordent avec tes journaux. Ton agrégation BEAM suit le code officiel, correctif du 30 août compris. Publier les bras rejetés et la sensibilité au juge, c'est rare, et je le note.

**Les points que je relève, pièces à l'appui :**

1. **`gpt4_76048e76` (vélo/voiture).** Déjà transmis hier soir, tu es en train de corriger. Je le rappelle pour l'effet chiffré : c'est une régression réelle (juste en base, fausse dans les deux runs de fusion), comptée comme « stable HIT ». Recalcul conditionnel : 36/48, +9/−2, p ≈ 0,065.
2. **« 72,9 % lower bound, can only raise »** (`METHODOLOGY.md` L110-L112, `verify.js` L100-L105). Ton run d'août est « full engine (spine-sort + dream ledgers), vector-only », avec topK 32 + 3, le même juge flexible et les mêmes 48 questions. Il donne 34/48 (`lexical-baseline-flexible-48q.jsonl`). Le build n'est peut-être pas identique, mais aucune pièce ne démontre la monotonie annoncée.
3. **« Every HIT above | replayed and reproduced »** (README). Dans les fichiers publiés, le bras vector-only (29/48) n'a qu'un run (`duel-full.rejudged.json`). La baseline de juillet (31/48) est, selon ta propre METHODOLOGY, « a single measured run ». Si des rejeux existent, ils ne sont pas publiés.
4. **ROADMAP : « 77.1% … confirmed on a 48-question holdout ».** Les fichiers du holdout (`recall-hold-*.json`) ne contiennent que de la récupération, sans aucune réponse ni verdict.
5. **BEAM.** « Both tiers the benchmark ships » : le README BEAM liste quatre tailles (128K, 500K, 1M, 10M). Pour « baselines 0.30 → 0.12 » : je ne le trouve ni dans les lignes « Average » de la Table 1 ni dans les Main Results de la v1 (arXiv 2510.27246). Les baselines RAG y perdent 22 à 29 %, les Vanilla 50 à 57 %. Tu as peut-être une autre version : laquelle ?
6. **`scoring.js`.** Le repli `genLower.includes(numericRaw)` (L69) accepte 3 pour 30 ou « Source 33 », et 4 pour 14. Dans tes données, le juge a rattrapé tous ces cas ; je n'y vois pas d'effet sur un score. Deux choses ne sont pas dans le fichier : la règle qui combine heuristique et juge, et un niveau « strict » (seuls `flexible`, `lenient` et la branche par défaut existent). `judgePrompt` ne transmet pas la question au juge. Si ton harnais utilise un autre prompt pour « strict », il faudrait le publier.
7. **Identifiants de session.** Certaines réponses citent `answer_40a90d51`, `answer_526354c8_2` ou `sharegpt_YkWn1Ne_0`. Les identifiants du benchmark arrivent donc jusqu'au lecteur. Dans l'oracle, les sessions probantes que j'ai lues sont préfixées `answer_`. LongMemEval ne le documente pas comme une convention, et ce n'est pas systématique. Je ne sais pas si cela a pesé. Les anonymiser avant ingestion lèverait le doute.
8. **Pour info, côté BEAM et en ta faveur.** Plusieurs rubriques d'abstention sont contredites par la conversation BEAM elle-même. Exemple : `100K/3/abstention/1`, où l'utilisateur écrit « without setting up a backend », alors que la rubrique dit « no information ». Même chose pour `10M/2/abstention/0` et `10M/7/abstention/0`. Ce défaut du benchmark peut pénaliser des réponses correctes.

**Ce que je ne peux pas établir** : tout ce qui passe par le moteur fermé, c'est-à-dire la récupération, la consolidation, l'isolement serveur et le fonctionnement 100 % local.

Je serais preneur de quatre choses : la règle de combinaison heuristique et juge avec les sorties brutes du juge, la transcription complète de `aae3761f` run 1 (ton registre cite « total 15 hours », absent du journal tronqué), la règle de tirage du holdout, et la version exacte du corpus LongMemEval-M.

Julien
