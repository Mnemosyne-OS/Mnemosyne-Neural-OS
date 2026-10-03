# Révisions en cours d'audit

Affirmations provisoires corrigées au cours de l'audit.

| Id | Hypothèse ou lecture initiale | Correction | Cause |
|---|---|---|---|
| R01 | « Le verdict = l'heuristique quand elle dit HIT » (lecture des premières lignes brutes) | Faux : 4 combinaisons observées ; le juge renverse parfois l'heuristique (E08) | Recalcul complet (T09 §4) |
| R02 | « 16 faux positifs d'abstention BEAM à 100K » (filtre par mots-clés) | 4 faux positifs nets et 5 discutables après lecture humaine ; les autres « candidats » étaient de vraies abstentions | Revue de T10 |
| R03 | « La pondération 8×6 gonfle le score » (piste) | Infirmé : la repondération officielle ne fait pas baisser le score de fusion (calcul conditionnel, n = 8) | T09 §8 |
| R04 | Premier contrôle des journaux de juillet : 16 écarts | Artefact de mon analyseur (format multi-bras) ; après correction, 16/16 verdicts concordants et 2 écarts de texte | T18 |
| R05 | Premier run des tests MCP : échecs `ENETUNREACH` | Artefact de mon isolement réseau (boucle locale inactive) ; T13 invalide, T15 fait foi | T13, T15 |
| R06 | Commentaire prédictif du script de mutation (« A02/A14 resteront en défaut ») | Faux : les 5 cas deviennent conformes ; commentaire corrigé et trace T17 régénérée | T17 |
| R07 | « Toutes les sessions probantes sont préfixées `answer_` » | Non universel : `89527b6b` cite `sharegpt_YkWn1Ne_0` | E28 |
| R08 | « 7 faux positifs nets du juge BEAM en abstention » (revue des réponses seules, T10) | **Infirmé** par la confrontation aux conversations sources (T20) : dans 3 cas l'information existe dans la conversation (rubrique BEAM contredite) ; 4 cas discutables. Calcul conditionnel 60,7 % et 47,7 % retiré | Vérification à la source primaire (T20) |
| R09 | « Le préfixe `answer_` marque les sessions probantes » | Restreint : observé dans l'oracle, non documenté par le README LongMemEval, non systématique | Vérification du README officiel |
