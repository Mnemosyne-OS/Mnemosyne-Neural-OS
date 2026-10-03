# Synthèse : audit des annonces de MnemosyneOS

Audit du 2026-09-28. Dépôts figés : benchmarks `d69c782`, produit `580f1fe`. Détails et preuves : `RAPPORT_EPISTEMIQUE.md`.

## La réponse courte

Les chiffres publiés sont **arithmétiquement exacts** et **traçables** jusqu'aux lignes publiées. Ce que ces lignes signifient est plus étroit que ce qu'annoncent le README et le ROADMAP. Et plusieurs formulations sont contredites par les pièces que l'auteur publie lui-même.

## Établi

- **Arithmétique confirmée** : 77,1 %, 81,3 %, 72,9 % (composition), 64,6 %, +9/−1 et p = 0,0215, holdout +4/−0, BEAM 61,7 % et 49,2 %. Les scripts originaux ont été exécutés hors réseau, un recalcul indépendant a été écrit, et les mutations sont détectées.
- **Registres fidèles aux fichiers bruts** : extraction lexicale identique à l'octet ; 48/48 et 16/16 verdicts de juillet concordent avec les journaux.
- **Protocole BEAM conforme au code officiel** : juge gpt-4.1-mini, échelle 0 / 0,5 / 1, agrégation, tau.
- **Le projet se déclare « open core »** (SDK et CLI sous MIT, moteur propriétaire). Aucune annonce « tout est open source » n'a été trouvée dans les dépôts.

## Contredit ou corrigé

1. **Une erreur de notation publiée**, `gpt4_76048e76`. La réponse « car first » contredit la référence « bike », étayée par les sessions probantes officielles, et elle est notée HIT dans les deux runs. Calcul conditionnel : 36/48 = 75,0 %, et p = 0,065 au lieu de 0,0215.
2. **« 72,9 % est une borne inférieure »** : contredit. Le run d'août du moteur complet, même juge, 48 questions, obtient 34/48 = 70,8 %.
3. **« Every HIT replayed »** : faux pour les bras de référence, qui reposent sur un seul run. Le rejeu de juillet ne refait pas la consolidation (déduit des durées).
4. **« 77,1 % confirmé sur le holdout »** : le holdout ne mesure que la récupération.
5. **BEAM, « both tiers the benchmark ships »** : BEAM fournit 4 paliers.
6. **BEAM, « the paper's baselines fall 0.30 → 0.12 »** : aucune ligne correspondante dans la Table 1 (v1). Les baselines RAG perdent 22 à 29 %, comme Mnemosyne (20 %).
7. **« scoring.js is the WHOLE grading logic »** : la règle qui combine heuristique et juge n'est pas publiée, « strict » n'est pas défini, et le juge ne reçoit pas la question.
8. **Heuristique `scoring.js`** : 17 défauts sur 27 cas synthétiques (3/30, 4/14, négation, unités, ordre). Effet publié démontré seulement pour `gpt4_76048e76`. Les autres cas réels ont été renversés par le juge.
9. **BEAM, catégorie abstention (révisé)** : aucun faux positif du juge n'est établi. Au contraire, 3 rubriques officielles « no information » sont contredites par la conversation BEAM elle-même. C'est un défaut du benchmark, qui peut pénaliser comme avantager.
10. **Localité** : les 77,1 % sont produits avec un lecteur cloud (Vertex), alors que le README les juxtapose à « your data never leaves it ».

## Risque d'intégrité à traiter

Des identifiants de session LongMemEval apparaissent dans les réponses du lecteur (`answer_…`, `sharegpt_…`). Dans l'oracle, les sessions probantes lues portent le préfixe `answer_`. Ce n'est pas une convention documentée, ni systématique. Un signal de preuve a donc pu être visible du modèle. L'effet sur les scores n'est pas mesurable, et ce n'est pas une accusation.

## Ce que le code public ne permet pas d'établir

Le moteur, le harnais, l'ingestion et la consolidation sont fermés. Par conséquent, aucune reproduction de la récupération ou de la génération n'est possible. Restent aussi invérifiables : l'isolement entre applications (contrôlé seulement côté client dans le SDK), l'absence d'appels réseau en mode local, et la « consolidation aveugle aux questions ». Les propriétés de mémoire dans la durée (correction, oubli, reconstruction) ne sont mesurées par aucune campagne publiée. Les essais correspondants sont livrés NON EXÉCUTÉS.

## Lacunes de cet audit

- `huggingface.co`, `arxiv.org` et les sites Mnemosyne sont bloqués par la politique réseau du conteneur.
- LongMemEval-M n'a pas été récupéré, et les empreintes des données HF n'ont pas pu être calculées.
- Le texte des questions provient d'une copie tierce recoupée (48/48 références identiques).
- Les verdicts BEAM hors abstention n'ont pas été relus.
