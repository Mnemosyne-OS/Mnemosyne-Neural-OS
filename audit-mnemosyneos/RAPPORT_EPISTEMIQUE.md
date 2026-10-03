# Rapport épistémique : audit des annonces publiques de MnemosyneOS

Audit KAB / ARES, réalisé le 2026-09-28 (UTC) dans un conteneur cloud isolé. Versions figées : voir `SOURCES_ET_VERSIONS.json`.

| Dépôt | Commit examiné | Date du commit |
|---|---|---|
| Mnemosyne-OS/Mnemosyne-Neural-OS | `580f1fe9e220659907285bd56daa9d6ca1d4774d` | 2026-09-24 |
| Mnemosyne-OS/MnemosyneOS---benchmarks | `d69c78264c532eb27255a248be32ea235d7e7a64` | 2026-09-27 |
| Mnemosyne-OS/agent-memory-skill | `a4014d43572e0e98d4c7fdaebe44869eb1d219d0` | 2026-08-31 |
| xiaowu0162/LongMemEval | `9e0b455f4ef0e2ab8f2e582289761153549043fc` | 2026-05-11 |
| mohammadtavakoli78/BEAM | `b2da22eac88bb0874c64665f13457eb99835774a` | 2026-08-30 |
| snap-research/locomo | `3eb6f2c585f5e1699204e3c3bdf7adc5c28cb376` | 2024-08-12 (non utilisé : aucune campagne LoCoMo publiée) |

Conventions. `E..` renvoie à `REGISTRE_PREUVES.jsonl`, `A..` à `REGISTRE_ANNONCES.csv`, `T..` à `traces/`. « Calcul conditionnel » désigne un total recalculé après réexamen d'un nombre limité de verdicts, les autres n'ayant pas été réévalués. Ce n'est pas un nouveau score validé.

---

## 1. Ce qui a effectivement été audité

**Lu intégralement et exécuté.** L'intégralité du code et de la documentation du dépôt de benchmarks :

- `scoring.js`, `verify.js` (kit), `beam-2026-09/verify.js` et `extract-ledgers.mjs`, tous exécutés hors réseau (`unshare -n`) ;
- les trois fichiers bruts de la campagne lexicale, lus ligne à ligne (T02) ;
- les 60 réponses BEAM de la catégorie abstention, lues une à une (T10).

**Lu intégralement, sans exécution.** Le code d'évaluation officiel de LongMemEval (`evaluate_qa.py`) et de BEAM (`compute_metrics.py`, `run_evaluation.py`, `report_results.py`, `llm.py`, ainsi que le diff du commit `b2da22e`).

**Dépôt produit.** `client.ts` (SDK) a été lu intégralement. Les suites de tests MCP ont été exécutées : 202 tests. Documentation et annonces : recherche ciblée par mots-clés et lecture des passages pertinents. Couverture fichier par fichier : `COUVERTURE_LECTURE.csv`.

**Sources primaires de données, lecture partielle.**

- L'élément `gpt4_76048e76` des deux fichiers oracle LongMemEval, original et nettoyé, lu par le connecteur Hugging Face (octets 0 à 119 999).
- La Table 1 et le protocole du papier BEAM v1, lus via `hf://papers/2510.27246`.
- Le texte des questions LongMemEval a été récupéré depuis une **copie tierce**, `JordanMcCann/agentmemory@3aa3b83`. Cette source est secondaire. Sa fiabilité a été recoupée : les 48 références coïncident avec celles de Mnemosyne, et les éléments 0 à 2 coïncident avec l'oracle officiel.

**Non audité.**

- Le moteur de Mnemosyne, absent des dépôts publics.
- Le harnais de benchmark, privé.
- Les fichiers LongMemEval-M complets et les sites web, bloqués par la politique réseau du conteneur.
- La reproduction de la récupération et de la génération.

Détail : `INCONNUS_ET_CODE_INACCESSIBLE.md`.

---

## 2. Frontière d'auditabilité

| Composant | Source | Licence | Construisible | Exécutable localement | Tests | Dépendance inaccessible |
|---|---|---|---|---|---|---|
| SDK `@mnemosyne_os/sdk` | oui | MIT | oui (tsup), non testé | client seul | aucun test dans le paquet | l'application desktop (serveur WS 127.0.0.1:7799) |
| MCP `@mnemosyne_os/mcp` | oui | MIT | oui | tests seulement | 202 tests, 199 réussis, 3 ignorés (T15) | `daemon.ts` absent du miroir ; application desktop |
| CLI MnemoForge | oui | MIT | non tenté | non tenté | non examinés | n/a |
| Cognitive Core (Embedding, Spine, Retrieval, Dream State, BM25/RRF) | **non** | propriétaire (déclaré) | non | non | n/a | entièrement privé |
| Harnais de benchmark (`spine-dream-fh.cjs`, etc.) | **non** | n/a | non | non | n/a | privé, « sur demande motivée » |
| Vérificateurs (`scoring.js`, `verify.js`, `extract-ledgers.mjs`) | oui | MIT | n/a | **oui, exécutés** | selftest 6 cas | aucune |
| Journaux, registres, réponses | oui | CC-BY 4.0 (données Mnemosyne) ; champs benchmark sous MIT de leurs auteurs | n/a | n/a | n/a | transcriptions non tronquées « sur demande » |

Chemin d'un appel (E32) : application → `MnemoClient.connect` (manifeste chargé et contrôlé **côté client**) → WebSocket `ws://127.0.0.1:7799` (JSON-RPC, jeton obtenu par `sdk.register`) ou IPC Electron (`window.mnemosyne.*`).

**Frontière.** Tout ce qui suit la réception de la requête par le serveur est fermé : validation, isolement par `source_app_id`, embeddings, index, génération, consolidation. Un client SDK ou un schéma de types ne démontre pas le traitement serveur.

---

## 3. Constats

### C01. L'arithmétique publiée est exacte (contrôle A)

- **Annonces** : A13, A14, et la partie arithmétique de A01 à A04, A09, A10 et A24.
- **Attendu** : chaque score est la somme exacte des lignes publiées.
- **Preuves** : E06, E07, E05.
- **Observation** : les quatre scripts originaux sortent avec le code 0 (T05, T06, T07, T08). `extract-ledgers.mjs` régénère les registres lexicaux à l'octet près. Un recalcul indépendant, écrit sans réutiliser `verify.js`, confirme totaux, arrondis, unicité des identifiants, règle de conjonction et agrégation BEAM (T09). Les mutations sont détectées (T17).
- **Validation** : **confirmé sur ce périmètre**.
- **Limite** : ce contrôle ne dit rien de la validité des verdicts (C03 à C05), ni de la sélection des questions (C06). L'auteur le reconnaît lui-même.
- **Reproduction** : `README_REPRO.md` §3.
- **Décision** : conserver.

### C02. Alignement entre journaux bruts et registres (contrôle B)

- **Annonce** : A19, « Never hand-write a ledger row ».
- **Observation (E25, E06)** :
  - Campagne lexicale : registres identiques à l'extraction mécanique.
  - Juillet : 48/48 verdicts de la baseline concordent avec `grand-run.log`, et 16/16 verdicts du moteur concordent avec le bras `ALL` des journaux cités.
  - Deux textes de réponse du registre moteur ne sont pas extractibles tels quels des journaux. Pour `3a704032`, il s'agit d'une abréviation. Pour `aae3761f` run 1, le registre contient « total 15 hours », que le journal ne contient pas ; le préfixe journalisé annonce « two road trip destinations ».
- **Interprétation et alternatives** : les journaux tronquent les réponses à environ 160 caractères, et la réponse complète a pu contenir 15 heures. Le verdict est écarté de toute façon (MISS), donc sans effet sur le score. En revanche, la qualification « answer variance, not judge noise » n'est pas démontrable depuis les pièces publiées.
- **Validation** : partiellement confirmé.
- **Décision** : demander la transcription complète, ou requalifier le cas en « indéterminé ».

### C03. `gpt4_76048e76` : une erreur présente dans un résultat publié

- **Annonces** : A01, A02, A04.
- **Version** : `lexical-2026-08/runs/duel-full-lexfusion.json` et `-r2.json`, ligne 397 ; `verification-kit/results/lexical-fusion-strict-48q.jsonl` et `-flexible-48q.jsonl`.
- **Attendu** : la question est « Which vehicle did I take care of first in February, the bike or the car? », et la référence officielle est « bike ».
- **Preuves** : E09, E10, E11.
- **Observation** :
  - Les deux runs du bras fusion concluent « you took care of your car first in February … washed your car on February 3rd (Source 5) ». Les deux verdicts, strict et flexible, sont HIT, et l'heuristique indique `exact` (le mot « bike » figure dans la réponse).
  - Le bras de référence concluait « bike » (juste).
  - Les sessions probantes officielles (oracle, original et nettoyé) disent : vélo réparé « in mid-February », Corolla lavée « Monday, February 27th ». Aucune date du 3 février n'y figure.
  - Avec fusion, la récupération trouve les deux sessions probantes (`found 2/2`, contre 1/2 sans fusion).
- **Interprétation** : la réponse contredit la référence et les preuves officielles, et le verdict HIT est faux au regard du barème déclaré. Cause probable : le juge ne reçoit pas la question (E03). « bike » est « contenu » dans la réponse, et sans la question le juge ne peut pas voir que l'ordre est inversé.
- **Explications alternatives examinées** :
  1. Référence ambiguë ou erronée : infirmé par l'oracle officiel.
  2. Une session distractrice du corpus M mentionnant un lavage le 3 février a pu tromper le lecteur. C'est plausible mais **indéterminé** (fichier M inaccessible). Cela expliquerait l'erreur de réponse, pas le verdict.
- **Effet démontré** : la ligne compte pour 1 dans 37/48 et 39/48. C'est une régression réelle (juste en base, faux en fusion) comptée comme « stable HIT ». **Calcul conditionnel** : 36/48 = 75,0 % en strict, 38/48 = 79,2 % en flexible, bascules appariées +9/−2 et p = 0,065 (E16).
- **Validation** : **confirmé** (erreur publiée). L'effet sur le score est démontré pour cette ligne, sans réévaluation des 47 autres.
- **Limites** : ma revue des 48 lignes signale deux autres HIT discutables. Pour `6ade9755`, le run 2 conclut que l'information « supersedes the earlier mention of attending Serenity Yoga ». Pour `0edc2aef`, la réponse recommande Airbnb pour une question sur un hôtel. Je ne les compte pas sans arbitrage humain.
- **Décision proposée** : corriger ou annoter la ligne ; publier la règle de combinaison et les sorties brutes du juge ; rejouer la notation avec un juge qui reçoit la question.
- **Condition de révision** : erratum officiel LongMemEval sur cette question.

### C04. `scoring.js` : défauts de l'heuristique (contre-exemples synthétiques) et effet publié limité

- **Annonces** : A15, A16.
- **Attendu** : une réponse est correcte si elle donne la référence (METHODOLOGY §3 ; `evaluate_qa.py`).
- **Preuves** : E01, E02, E04, E05, E08.
- **Observation (T16)** : 17 non-conformités sur 27 cas synthétiques. Le repli `genLower.includes(numericRaw)` de `scoring.js` L69 accepte 3/30, 3 dans « Source 33 », 3 dans une date, 4/14 et four/fourteen. Le supprimer dans une copie corrige les 5 cas (T17). S'y ajoutent :
  - négation (Paris / « Not Paris, but Lyon »), unités (45 minutes / 45 hours ; $185 / 185 miles), ordre (bike/car, Samsung/Dell), valeur obsolète ($400,000) ;
  - faux négatifs : « 4 » contre « four », et réponse correcte contenant « not specified » ;
  - `parseJudgeVerdict` se trompe sur deux sorties verbeuses.
- **Effet sur les résultats publiés** : la forme 3/« Source 33 » apparaît réellement dans les données. Pour `0a995998` (base, réponse « 2 »), `6d550036` ×3 et `3a704032` (base), l'heuristique dit HIT, mais le verdict final est MISS : le juge l'a renversée (E08). **Aucun effet sur le score n'est démontré pour ces cas.** Le seul faux positif non renversé est `gpt4_76048e76` (C03), et on ne peut pas savoir si l'heuristique ou le juge a décidé.
- **Distinction** : faiblesse théorique et contre-exemples synthétiques reproduits ; erreur publiée pour un cas ; effet sur un score prouvé pour ce seul cas.
- **Décision** : corriger `scoring.js` et étendre le selftest aux cas adverses.

### C05. La règle qui produit le verdict n'est pas publiée ; « strict » n'est défini nulle part ; le juge ne voit pas la question

- **Annonce** : A15, « This is the WHOLE grading logic ».
- **Preuves** : E03, E08.
- **Observation** :
  - Dans les fichiers bruts, les quatre combinaisons heuristique × verdict existent. `correct` n'est donc ni « heuristique OU juge », ni « heuristique ET juge ».
  - `judgePrompt` a trois branches : défaut, `flexible` et `lenient`. `'strict'` tombe dans la branche par défaut (vérifié, T16).
  - Aucun paramètre ne transmet la question au juge.
  - La branche `flexible` demande YES pour « a plausible partial answer » et pour une réponse qui « expresses doubt but mentions relevant concepts ».
- **Interprétation** : l'orchestration de la notation (ordre, retries, parsing, arbitrage) est dans le harnais privé. Je ne reconstruis pas d'appel imaginaire.
- **Validation** : l'annonce « WHOLE grading logic » est **contredite** telle que formulée.
- **Décision** : publier la règle de décision, les sorties brutes du juge et les paramètres (température, retries).

### C06. Protocole LongMemEval : non officiel, sous-échantillon déterministe, version du corpus non déclarée

- **Annonces** : A01, A25, A08.
- **Preuves** : E12, E17, E18.
- **Observation** :
  - Les 48 questions sont **les 8 premières de chaque catégorie dans l'ordre du fichier**. Aucune question d'abstention (`_abs`) n'est incluse, alors que l'abstention est l'une des cinq capacités définies par LongMemEval.
  - Le holdout de 48 questions est disjoint et dispersé.
  - Le juge (gemini-2.5-flash, sans question, prompt unique) diffère du juge officiel (gpt-4o-2024-08-06 avec la question et des prompts par catégorie : tolérance off-by-one en temporel, rubrique en préférence).
  - Les registres ne déclarent pas si le corpus est l'original ou la version nettoyée de septembre 2025.
- **Interprétation** : une règle « 8 premières » est neutre, sans sélection post hoc visible. Mais c'est un échantillon de développement, et les scores ne sont pas comparables aux scores LongMemEval publiés ailleurs (l'auteur le dit pour les comparaisons de produits). Le juge « strict » sanctionne fortement la préférence (1/8), là où le prompt officiel est plus tolérant. Il est en revanche aveugle à l'ordre temporel (C03).
- **Calcul conditionnel (E07 §8)** : repondérer par la distribution officielle des catégories **ne baisse pas** le score de fusion (84,6 % au lieu de 77,1 %, n = 8 par catégorie, très instable). La pondération n'est donc pas un facteur d'inflation. Je corrige ici une piste que j'avais moi-même envisagée.
- **Validation** : partiellement confirmé.
- **Décision** : déclarer la version et l'empreinte du corpus, la règle de sélection, et l'exclusion de l'abstention.

### C07. « 72,9 % est une borne inférieure » : contredit

- **Annonce** : A03.
- **Preuves** : E13, E14.
- **Attendu** : une borne inférieure exige que toute exécution complète du moteur obtienne au moins 35/48. Or aucune preuve de monotonie n'est fournie : une consolidation peut aussi dégrader une réponse, et le bruit du juge est de ±2,6/48 selon l'auteur.
- **Observation** : le run d'août « full engine (spine-sort + dream ledgers), vector-only » est la même architecture (topK 32 + 3 emplacements de consolidation, juge flexible, 48 questions). Il obtient **34/48 = 70,8 %**. Sur les 40 questions reportées, une passe de HIT à MISS (`51a45a95`) et une de MISS à HIT (`08f4fc43`). En multi-session : 4/8 contre 5/8.
- **Explications alternatives** : le build d'août diffère (non tamponné) ; l'écart d'une question est dans le bruit ; le run d'août n'est qu'un run.
- **Conclusion** : ces réserves n'établissent pas une monotonie, elles renforcent l'absence de borne. La composition 35/48 est exacte. Le qualificatif « lower bound » et la phrase « can only raise » ne sont pas soutenus, et sont contredits par un run publié par l'auteur. Le texte figure toujours dans `verify.js` L100-L105, `METHODOLOGY.md` L110-L112 et `index.html` au 2026-09-27.
- **Décision** : retirer « lower bound » et parler d'« estimation composée ».

### C08. Discipline de rejeu : réelle mais asymétrique, et elle ne rejoue pas la consolidation

- **Annonces** : A05, A18.
- **Preuves** : E15, E25, E26.
- **Observation** :
  - Bras fusion : conjonction de deux runs, avec 47 réponses sur 48 différentes entre R1 et R2. Il s'agit donc d'une vraie régénération (T01).
  - Bras de référence d'août (29/48) et baseline de juillet (31/48, dont 30 HIT reportés dans 72,9 %) : **un seul run**.
  - Juillet : le run 2 (`exp-verify.log`) est un run « VERIFY-PASS ». L'auto-vérification n'a changé aucun verdict (draft = final ×16).
  - Juillet encore : run 1 en 39 à 96 min par question, run 2 en environ 1 min. **Déduction** : la consolidation (tri et écriture des registres) n'a pas été refaite. Le rejeu mesure la variance de génération et de jugement, pas celle de la consolidation.
- **Validation** : « Every HIT … replayed » est **contredit** pour les bras de référence. La conjonction appliquée au seul bras traité est prudente pour le delta, mais elle rend l'annonce inexacte.
- **Décision** : restreindre l'annonce au bras traité.

### C09. Test statistique

- **Annonce** : A04.
- **Preuve** : E16.
- **Observation** : p = 0,0215 est correct pour un test du signe exact bilatéral sur 9 contre 1. Les 48 questions proviennent de 48 historiques distincts (dans LongMemEval, une histoire par question), donc l'hypothèse d'indépendance des paires est plausible. Mais :
  1. l'échantillon a servi au développement (déclaré) ;
  2. une régression réelle est comptée « stable HIT » (C03), et avec elle p = 0,065 ;
  3. le test porte sur le jugement, pas sur la validité des verdicts.
- **Validation** : partiellement confirmé.

### C10. Holdout : il mesure la récupération, pas le score de réponse

- **Annonces** : A06, A07.
- **Preuves** : E06, E11, E12.
- **Observation** : +4/−0 sessions et +2/−0 fragments se recalculent, et les identifiants sont disjoints de l'échantillon de développement. « Never seen during development » reste une déclaration. Le ROADMAP écrit « 77.1% … confirmed on a 48-question holdout », or aucun score de réponse n'existe sur le holdout. `gpt4_76048e76` montre qu'un gain de récupération peut coexister avec une réponse dégradée.
- **Validation** : A06 partiellement confirmé ; A07 contredit.

### C11. Intégrité expérimentale : les identifiants de session du benchmark atteignent le lecteur

- **Annonce** : A17.
- **Preuve** : E28.
- **Observation** : des réponses publiées citent `answer_40a90d51`, `answer_f6168136`, `answer_526354c8_2` et `sharegpt_YkWn1Ne_0`. Dans l'oracle, les sessions probantes lues portent le préfixe `answer_`.
- **Interprétation** : des identifiants de session du benchmark sont servis au modèle qui répond. Le README de LongMemEval ne documente pas de convention de nommage (vérifié), mais dans l'oracle les sessions probantes lues sont préfixées `answer_`. Un tel identifiant peut donc signaler la session probante. C'est un **vecteur de fuite de métadonnées du benchmark**, distinct de la « consolidation aveugle aux questions ». La convention n'est pas universelle (`sharegpt_` pour la question 89527b6b), et l'effet sur les scores n'est pas mesurable depuis les pièces publiées. Ce n'est **pas** une accusation de fuite volontaire : c'est un risque démontré, à neutraliser.
- **Non vérifiable** : entrée des champs `has_answer` ou des réponses dans le corpus, les caches ou les prompts de consolidation (code fermé).
- **Validation** : A17 indéterminé ; le risque est confirmé.
- **Décision** : rejouer avec des identifiants de session anonymisés.

### C12. BEAM : protocole conforme, rubriques d'abstention parfois contredites par la source, citations inexactes

- **Annonces** : A09 à A13.
- **Preuves** : E19 à E24.
- **Conformité (confirmé)** :
  - juge gpt-4.1-mini, identique au code BEAM ;
  - échelle 0 / 0,5 / 1, avec `judgeScore` égal à la moyenne des items ;
  - agrégation par conversation, puis par catégorie, puis moyenne des dix catégories ;
  - `event_ordering` noté par `tau_norm`, comme `report_results.py` ;
  - 400 et 200 questions, 0 échec d'infrastructure.
- **Barème** : les fichiers suivent la règle en vigueur **après** le correctif BEAM du 2026-08-30 (`int` remplacé par `float`), soit deux semaines avant la publication. **Calcul conditionnel** avec le barème antérieur : 60,2 % et 48,5 % (E21). C'est cohérent : Mnemosyne applique la version courante.
- **Validité des verdicts en abstention (révisé, T20)** : **aucun faux positif du juge n'est établi.** La relecture des réponses seules (T10) avait classé 7 cas en « faux positifs nets ». La confrontation aux conversations sources BEAM@b2da22e infirme ce classement.
  - Dans 3 cas, les faits affirmés par Mnemosyne figurent dans la conversation, alors que la rubrique officielle dit « no information » :
    - `100K/3/abstention/1` : l'utilisateur écrit « without setting up a backend » ;
    - `10M/2/abstention/0` : les étapes de débogage 0x80070005 sont présentes ;
    - `10M/7/abstention/0` : « Samuel's Advice: "Diversify your investments and rebalance…" ».
  - Dans les 4 autres cas, la réponse attribue à l'utilisateur une suggestion de l'assistant, ou tire une inférence : `100K/1/abstention/0`, `100K/3/abstention/0`, `100K/4/abstention/0`, `10M/3/abstention/1`.

  Les rubriques d'abstention BEAM dérivent des « plans » de génération (champ `why_unanswerable`), et la conversation générée contient parfois davantage. **C'est un défaut de référence du benchmark, qui joue dans les deux sens** : des réponses étayées notées 0 seraient aussi pénalisées à tort. Le calcul conditionnel de la version 1 (60,7 % et 47,7 %) est **retiré**. Les neuf autres catégories n'ont pas été relues.
- **« At both tiers the benchmark ships »** : **contredit**. BEAM fournit 4 paliers.
- **« Baselines falling 0.30 → 0.12, 60 % »** : **contredit** dans la Table 1 de la v1, où aucune ligne ne correspond. Les baselines RAG perdent 22 à 29 %, soit l'ordre de grandeur des 20 % de Mnemosyne. Seules les baselines Vanilla, à contexte tronqué à 10M, perdent 50 à 57 %. La comparaison mise en avant oppose le système à la catégorie de baseline la plus défavorable.
- **Limites** : papier lu via le rendu HF de la v1, sans les notes de bas de page ; build du moteur non tamponné (reconnu par l'auteur).
- **Décision** : corriger les deux formulations ; publier le prompt effectivement envoyé ; confronter chaque rubrique d'abstention à la conversation source avant d'interpréter la catégorie.

### C13. Localité et confidentialité

- **Annonce** : A21.
- **Preuves** : E27, E29, E34, E35.
- **Observation** :
  - Le README juxtapose « your data never leaves it » et « it scores 77.1% ». Or les 77,1 % sont produits avec gemini-2.5-pro via Vertex, et les journaux montrent « Local models unavailable — falling back to CLOUD ».
  - Le seul chiffre entièrement local publié est 6/12, sur l'oracle (étiqueté « LongMemEval-M »).
  - La documentation du skill indique correctement que la destination dépend de l'embedder.
- **Interprétation** : la localité est une configuration possible, pas une propriété de la configuration qui produit le score mis en avant. Une dépendance au cloud n'est pas une fuite. Et l'absence d'appel dans le SDK ne prouve rien pour le moteur.
- **Validation** : partiellement confirmé.
- **Décision** : restreindre l'annonce au « mode local » et séparer score cloud et annonce de localité.

### C14. Ouverture du code

- **Annonce** : A20.
- **Preuve** : E30.
- **Observation** : aux SHA figés, le projet se décrit comme « open core » : MIT sur le SDK, le CLI, les exemples et le handbook ; moteur « sealed » et propriétaire. Aucune occurrence de « tout est open source » n'a été trouvée. Le handbook relate même la correction d'un texte qui qualifiait le projet d'« open source ».
- **Non vérifié** : sites, blog et réseaux sociaux (bloqués).
- **Validation** : l'attribution d'une annonce « tout est open source » est **indéterminée** et ne doit pas être faite sans citation datée.

### C15. Chiffres générés et vérificateur de forme

- **Annonce** : A22.
- **Preuve** : E31.
- **Observation** : le nombre de canaux IPC vaut 572 dans AGENTS.md et `metrics.json`, 400 dans le README (trois occurrences) et 242 dans quatre autres documents. `check-public-sync.mjs` ne compare que AGENTS.md à `metrics.json`. La provenance n'est vérifiée que sur sa **forme** (40 caractères hexadécimaux, branche `main`), vers un commit privé.
- **Validation** : partiellement confirmé.
- **Décision** : étendre le contrôle à toutes les occurrences, ou supprimer les chiffres non contrôlés.

### C16. SDK et connecteur MCP

- **Annonces** : A23, A26.
- **Preuves** : E32, E33.
- **Observation** :
  - Tests MCP : 199/202 réussis, 3 ignorés (fichiers privés).
  - Le script `pnpm test` n'est pas exécutable avec les dépendances déclarées (`tsx` absent).
  - Contrôles de portée côté client uniquement dans le SDK.
  - En IPC, 7 méthodes seulement sont mappées : `ask`, `vaultsList`, les méthodes voix et d'autres échouent. `ingest`, `query` et `correlate` appellent la même fonction sans nom de méthode.
- **Limite** : ces tests valident le connecteur, **pas le moteur**. L'isolement entre applications est une garantie serveur, invérifiable ici.
- **Décision** : déclarer `tsx` et compléter `ipcMap`. Pour l'isolement, un test en boîte noire est possible avec autorisation spécifique.

### C17. Mémoire dans la durée : NON EXÉCUTÉ

Les scénarios prévus par le plan d'audit dépendent du moteur fermé : correction d'une source et de ses dérivés, retrait sans réapparition après reconstruction, limites entre coffres et agents, reprise après interruption, double ingestion, export et réimport. Ils sont livrés avec leurs attendus dans `INCONNUS_ET_CODE_INACCESSIBLE.md` §4, marqués NON EXÉCUTÉ. Les campagnes publiées ne mesurent aucune de ces propriétés : elles mesurent le rappel et la réponse sur des historiques figés.

---

## 4. Portée réelle des chiffres

| Chiffre | Ce qu'il mesure réellement | Ce qu'il ne mesure pas |
|---|---|---|
| 77,1 % (37/48) | Réponses d'un lecteur cloud (gemini-2.5-pro) sur un moteur Mnemosyne avec canal lexical. 48 questions de développement (8 par catégorie, sans abstention), juge maison sans question, conjonction de 2 runs. Au moins 1 verdict faux (C03). | Le score LongMemEval officiel ; le fonctionnement 100 % local ; le transfert hors échantillon ; la version du corpus. |
| 81,3 % (39/48) | Les mêmes réponses sous un prompt qui accepte les réponses partielles. | L'exactitude. |
| 72,9 % (35/48) | Une composition de 30 HIT d'une baseline en un run et de 5 HIT du moteur en multi-session. | Une borne inférieure (contredit, C07). |
| +9/−1, p = 0,0215 | Des bascules jugées sur l'échantillon de développement. | Une preuve robuste (p = 0,065 si C03 est corrigé). |
| Holdout +4/−0 | Un gain de récupération déterministe. | Un gain de réponse. |
| BEAM 61,7 % et 49,2 % | L'agrégation officielle, avec le juge officiel, sur 2 des 4 paliers. | Des verdicts vérifiés : certaines rubriques d'abstention sont contredites par la conversation source ; une comparaison avec d'autres systèmes. |
| Perte de 20 % de 100K à 10M | Une dégradation interne. | Une supériorité sur « les baselines du papier » : les RAG perdent 22 à 29 %. |

---

## 5. Affirmations antérieures réexaminées

Ces signalements provenaient d'analyses antérieures. Ils ont été repris comme pistes, pas comme preuves.

| Signalement | Verdict | Détail |
|---|---|---|
| `verification-kit/verify.js` « défectueux » | **Infirmé** comme défaut | Il est purement arithmétique et le dit. Le problème est la portée qu'on attribue à son « ✓ », et son texte « can only raise » (C07). |
| `verification-kit/scoring.js` défectueux | **Confirmé** (synthétique) ; effet publié limité | C04. |
| `beam-2026-09/verify.js` défectueux | **Infirmé** pour l'arithmétique ; **confirmé** pour la citation 0,30 → 0,12 qu'il affiche (C12) | n/a |
| `duel-full-lexfusion(.r2).json` et `lexical-fusion-strict-48q.jsonl`, question `gpt4_76048e76`, vélo/voiture | **Confirmé**, et la référence est étayée par l'oracle officiel | C03. |
| 3/30 | **Confirmé** en synthétique ; forme réelle (« Source 33 ») présente dans les données mais neutralisée par le juge ; **aucun effet démontré** sur un score | C04. |
| Paris / « Not Paris, but Lyon » | **Confirmé** en synthétique ; analogue publié discutable (`6ade9755` R2), non compté | C04, C03. |
| 45 minutes / 45 hours | **Confirmé** en synthétique ; le cas publié `118b2229` est correctement MISS | C04. |
| 4/four | **Confirmé**, dans les deux sens : « 4 » contre « four » donne un faux négatif, « four » contre « fourteen » un faux positif. Aucun effet publié trouvé | C04. |

Toute affirmation selon laquelle ces défauts d'heuristique « gonflent les scores publiés » **ne résiste pas** au-delà de `gpt4_76048e76`. Aucun élément ne soutient une falsification des journaux : verdicts cohérents, régénération réelle, résultats négatifs publiés.

---

## 6. Éléments favorables à conserver

- Les registres, journaux et bras rejetés sont publiés, y compris les résultats négatifs (bras master-merge, relations, flash A/B).
- L'arithmétique est intégralement reproductible, et l'extraction lexicale est mécanique et vérifiable.
- Le juge est systématiquement nommé ; la sensibilité au juge est publiée pour BEAM (136/400 valeurs changent).
- Le caractère composé de 72,9 % est étiqueté partout.
- Le build BEAM non tamponné et l'échantillon de développement plus facile sont reconnus par l'auteur.
- L'agrégation BEAM respecte le code officiel, y compris le correctif récent.
- Le projet se présente comme « open core », ce qui est exact.

---

## 7. Prochaines vérifications utiles

1. Obtenir `longmemeval_m` et `longmemeval_m_cleaned` avec leurs empreintes. Vérifier la présence d'une session « car washed February 3 » et la convention de nommage des distracteurs.
2. Arbitrage humain indépendant des 96 verdicts appariés de la campagne lexicale, puis réévaluation avec le juge officiel LongMemEval (gpt-4o, avec la question). Ce second point exige un appel payant, donc un accord.
3. Confrontation de toutes les rubriques BEAM (400 et 200 questions) aux conversations sources, puis revue humaine des verdicts.
4. Demande au porteur du projet :
   - la règle de combinaison heuristique et juge, et les sorties brutes du juge ;
   - la transcription complète de `aae3761f` run 1 ;
   - la règle de tirage du holdout ;
   - la référence exacte 0,30 → 0,12.
5. Test en boîte noire du binaire en mode local, sous capture réseau.
6. Rejeu avec des identifiants de session anonymisés (à demander au porteur).
