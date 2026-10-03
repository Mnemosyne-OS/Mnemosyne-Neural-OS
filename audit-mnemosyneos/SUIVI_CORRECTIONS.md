# Suivi des corrections

## 2026-09-28 : MnemosyneOS---benchmarks@7c2b09d (erratum)

Vérifié hors réseau (traces T21 à T25).

| Point de l'audit | État à 7c2b09d | Preuve |
|---|---|---|
| gpt4_76048e76 compté HIT | Corrigé : MISS par audit humain, verdict du juge conservé et visible | `lexical-2026-08/human-audit.json`, registres, T21 |
| 6ade9755 (run 2 contradictoire) | Corrigé : MISS par audit humain (règle des deux runs) | idem |
| 0edc2aef (préférence discutable) | Maintenu HIT, avec justification publiée | `human-audit.json` |
| Scores strict et flexible | 35/48 et 37/48, recalculés ; +9/−3 (p = 0,146) et +7/−4 (p = 0,549), vérifiés | T21, calcul indépendant |
| « 72,9 % lower bound » | Retiré | `ERRATUM.md` |
| Règle heuristique et juge | Publiée : `finalVerdict()`, le juge décide, l'heuristique est informative | `scoring.js`, selftest 22/22 (T22) |
| Juge sans question, « strict » = branche par défaut | Documenté | `ERRATUM.md`, `METHODOLOGY.md` |
| Repli `includes(numericRaw)` | Corrigé (nombres entiers seulement) ; 5 cas numériques adverses conformes (T25) | `scoring.js` |
| « Every HIT replayed » | Corrigé : les bras à un seul run sont nommés | `ERRATUM.md` §4 |
| Holdout « confirmed » | Corrigé : récupération seulement | `ERRATUM.md` §5 |
| Régénération des registres | Identique à l'octet (T24) | `extract-ledgers.mjs` |
| BEAM « 0.30 → 0.12, 60 % » | **Non corrigé** : `README.md` L94, `beam-2026-09/verify.js` L189-L190 | grep |
| README produit (77,1 %, « lower bound », « never leaves it ») | **Non corrigé** : Mnemosyne-Neural-OS main inchangé depuis 580f1fe | grep |
| Sorties brutes du juge, transcription aae3761f, règle du holdout, version du corpus | Annoncés, non publiés | `ERRATUM.md` |
| Protocole du nouveau run | Accepté (5 points), non publié | commentaire PR n° 47 |

Nuance : l'audit humain a relu les HIT du bras fusion seulement. Les HIT du bras de référence et les MISS des deux bras n'ont pas été relus. C'est conservateur pour le gain annoncé, mais le delta apparié pourrait encore bouger dans un sens ou dans l'autre.

Défauts résiduels de l'heuristique (négation, unités, ordre) : sans effet sur les verdicts, puisque le juge décide seul. `parseJudgeVerdict` (règle « dernier YES/NO ») reste inchangé ; effet non observable sans les sorties brutes du juge.

## 2026-09-30 : rerun pré-enregistré, MnemosyneOS---benchmarks@69c5bbc (protocole) et @b4a24f0 (résultats)

Vérifié hors réseau : `verify.js` du dépôt (T26, rc=0) et une vérification indépendante en Python (T27, rc=0), qui importe le code original d'`evaluate_qa.py` de LongMemEval@9e0b455.

| Contrôle | Résultat | Preuve |
|---|---|---|
| Sel : SHA-256 = valeur gelée dans le protocole | Conforme | T27 §1 |
| Table d'anonymisation (29 779 ids) recalculée depuis le sel | 0 écart | T27 §2 |
| Identifiants du jeu (`answer_`, `sharegpt_`, `ultrachat_`) dans les 384 réponses | 0 | T27 §3 |
| Prompts du juge officiel (768) identiques à `get_anscheck_prompt()` ; modèle gpt-4o-2024-08-06 ; verdict = règle « yes » officielle | 0 écart | T27 §4-5 |
| 8 scores publiés (deux passes requises, après audit humain) | Reproduits : holdout officiel fusion 37/48, vector 38/48 | T27 §6 |
| Audit humain : 5 renversements, tous de YES à NO | Sans effet sur le holdout ; dev −1 sur trois scores | `human-audit.json`, T27 §6 |
| Fusion contre vector, holdout, juge officiel | +2/−3 (dans le bruit, comme publié) | T27 §6 |
| Échantillon dev = les 48 questions auditées en août | Conforme | T27 §7 |
| Holdout = règle publiée (tri lexicographique, 8 premiers par type parmi 452), recalculée sur la liste tierce des 500 ids | 48/48 ; 5 `_abs` ; identique au holdout d'août | T27 §7 |
| Empreinte du `dist` du moteur identique au protocole dans les 8 runs | Conforme (valeur auto-déclarée, moteur fermé) | T27 §8 |
| Protocole modifié après le run | Seule la section 10 « Deviations » a été remplie (changement de commit du monorepo pendant le run, registres remplacés par les fichiers bruts, une nouvelle tentative réseau) | `git diff 69c5bbc b4a24f0 -- PROTOCOL.md` |

Limites :
- **Pré-enregistrement** : l'ordre des commits est établi, mais leurs dates sont fixées par l'auteur. L'antériorité réelle de la publication de `69c5bbc` par rapport au run se lit dans l'historique des pushes GitHub. Je n'ai pas pu y accéder depuis cet environnement (API refusée).
- **Holdout non vierge** : il a servi trois fois à mesurer la récupération (déclaré), et une mesure sur les 96 questions a guidé le choix « question nue » (PROTOCOL §11).
- **Audit humain** : il ne relit pas les réponses fausses acceptées par les deux juges (déclaré).
- **Comparabilité** : le lecteur (`gemini-3.8-flash`), le juge strict et le moteur ont changé en même temps (déclaré). Ces scores ne prolongent pas les précédents.
- **Corpus** : l'empreinte `longmemeval_m_cleaned.json` n'a pas été recalculée (téléchargement bloqué ici). La taille (2 737 100 077 octets) correspond à celle du Hub.
- **Moteur** : fermé. Le rerun mesure la porte SDK/MCP, pas le chat de l'application (déclaré).

Encore ouverts (selon Tony lui-même) : la phrase BEAM « 60 % », le README produit, la ligne de portée à côté du nom, et la transcription `aae3761f`.

## 2026-09-30 (soir) : benchmarks@3800a04, produit@1fea50d

| Point | État | Preuve |
|---|---|---|
| BEAM « 0.30 → 0.12 / 60 % » | Corrigé : RAG −22 à −29 %, modèles lisant toute la conversation −50 à −57 % | benchmarks `README.md` L102-L103, `beam-2026-09/verify.js` L190-L191, `ERRATUM.md` item 7 (`a5d9205`) |
| README produit : « lower bound » | Retiré du README | produit `README.md` (`432b879`) |
| README produit : localité et score | Le score est décrit en « hybrid mode », avec réponses par un modèle cloud nommé (gemini-3.8-flash) | produit `README.md` L110-L113 (`1fea50d`) |
| Emplacement des pièces demandées | Indiqué dans `ERRATUM.md` | `3800a04` |
| Ligne de portée | Ajoutée à la **fin** d'`ERRATUM.md` (L107-L108), pas à la première mention du nom (L3). Absente du bandeau du README de benchmarks (L15), de `PROTOCOL.md`, de la synthèse du rerun, de `RESULTS.md` et d'`index.html`, où le nom figure aussi | grep |

Nuances restantes :
- **« never seen » / « unseen questions »** (badge du README produit L24, L110, L244) : le holdout n'avait jamais reçu de réponse, mais il a servi trois fois à mesurer la récupération, et une mesure sur les 96 questions a guidé un choix de configuration (PROTOCOL §3 et §11). « Never answered » serait exact ; « never seen » ne l'est pas.
- **`aae3761f`** : l'erratum reconnaît que la transcription complète n'existe pas. Pourtant, le registre `engine-multisession-8q.jsonl` contient toujours le texte « … total 15 hours. », absent du journal, et un `discard_reason` qui affirme « The first run answered 15 hours ».
- **Livre blanc** : `doc/RESONANCE_ENGINE_WHITEPAPER.md` L229 du dépôt produit dit encore « 72.9 % is a stated lower bound ». Tony annonce une correction de la version Zenodo.
- **Image d'en-tête** du README produit (L56, `strip-specs.png`) : son texte alternatif dit encore « 100% local, your memory never leaves your machine », mais elle n'est plus accolée au score.
- **Sites et article comparatif** : leur correction est annoncée, mais je n'ai pas pu la vérifier (domaines bloqués ici).

## 2026-10-01 : produit@59c5352 (livre blanc v2.2)

| Point | État | Preuve |
|---|---|---|
| Livre blanc : « 72.9 % is a stated lower bound » | Corrigé : « The previous edition called it a lower bound. That was wrong » ; le 77,1 % du rerun est décrit en « hybrid mode », avec « 48 holdout questions with no answer generated before ». Ton nom n'apparaît pas | `doc/RESONANCE_ENGINE_WHITEPAPER.md` L222-L282 (`78bee30`) ; DOI v2.2 10.5281/zenodo.23070331 (`df58500`, non consulté : Zenodo non vérifié ici) |
| « never seen » (README produit), « total 15 hours » (registre `aae3761f`), ligne de portée dans le bandeau du README de benchmarks | Inchangés : aucun commit sur benchmarks après `3800a04`, ni sur le README produit après `1fea50d` | `git log` |

## 2026-10-01 : publication LinkedIn de Tony, commentaire public de Julien

Le post de Tony (texte transmis par Julien) reprend :
- « 48 questions que le moteur n'avait jamais vues », contredit par PROTOCOL §3 : questions jamais répondues, mais déjà utilisées pour mesurer la récupération ;
- une progression implicite de 72,9 % à 77,1 % attribuée aux changements du moteur, alors que le lecteur, le juge et l'ensemble de questions ont aussi changé, comme le reconnaît la synthèse du rerun (« the gain cannot be split ») ;
- la ligne de portée (« Son audit portait sur nos fichiers publiés, pas sur le produit ni sur le moteur »).

Julien a répondu publiquement sous le post avec ces deux précisions et le rappel de portée. La page LinkedIn n'est pas consultable depuis cet environnement : le suivi de ce fil reste manuel.

## 2026-10-02 : produit@f74605e (« never seen » reformulé)

| Point | État | Preuve |
|---|---|---|
| « never seen » / « unseen questions » | Remplacé partout par « holdout questions, never used to tune the engine » : badge (L24), paragraphe (L110-L111), tableau (L244), `ROADMAP.md`, `doc/README.md`, `llms.txt`. Le README dit aussi (L255) « The holdout questions had never been answered before », formulation exacte | `f74605e` (2026-10-01), `git grep` sur `origin/main` |
| Nouvelle formulation « never used to tune the engine » | **Encore trop forte au regard de PROTOCOL §11** : le choix « bare question for retrieval » a été retenu « for the better retrieval », mesurée « on the 96 questions », donc holdout compris (87 contre 83, +8/−2, p = 0,11). C'est un réglage de la requête de récupération plutôt que du moteur lui-même, mais il est mesuré sur le holdout. « Never answered » reste la seule formulation que les pièces établissent | `longmemeval-rerun-2026-10/PROTOCOL.md` §3 (L45-L48) et §11 (L216-L223), benchmarks@3800a04 |
| Registre `aae3761f` « total 15 hours » ; ligne de portée dans le bandeau du README de benchmarks | Inchangés : aucun commit sur benchmarks après `3800a04` | `git log` |
| PR n° 47 | Ouverte, aucun nouveau commentaire depuis le message de Julien du 30 septembre | page de la PR |
| Usage du nom de Julien | Dans le dépôt produit, seul le message du commit `f74605e` le cite (« Wording raised by Julien Gelee »), sans présentation de validation. Sites mnemosyne-os.io/.com toujours bloqués ici, non vérifiés | `git grep`, `git log` |

## 2026-10-03 : état inchangé, identité des commits corrigée

| Point | État | Preuve |
|---|---|---|
| Benchmarks | Aucun commit après `3800a04` : registre `aae3761f` (« total 15 hours ») et bandeau du README sans ligne de portée inchangés | `git log` |
| Produit | Trois commits après `f74605e` (`9ff64ec`, `11def71`, `53701ab`) : version 1.7.0 et paquets npm, sans rapport avec le benchmark, le 77,1 % ou l'audit. « Never used to tune the engine » reste en place, avec la réserve du 2 octobre | `git diff f74605e 53701ab` |
| Identité des commits de cette branche | Les commits précédents portaient l'adresse `kab@users.noreply.github.com`, que GitHub rattache à un compte tiers sans lien avec cet audit. Ils sont réattribués à `KAB`, compte Krigsexe. Arbres, dates et messages inchangés | `git log --format='%T %at %ct %s'` identique avant et après |
