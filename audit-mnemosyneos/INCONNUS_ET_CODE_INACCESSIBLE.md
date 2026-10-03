# Inconnus et code inaccessible

## 1. Code absent du périmètre public

| Pièce | Où l'appel sort du code accessible | Déclaré par l'auteur | Test de comportement encore possible ? |
|---|---|---|---|
| Cognitive Core : embeddings, Spine, Retrieval, Dream State, BM25/RRF, Adaptive RAG | après `ws://127.0.0.1:7799` ou `window.mnemosyne.*` (`client.ts` L141-L147, L240-L264) | propriétaire, « sealed » | oui, en boîte noire sur le binaire officiel ; exige une autorisation spécifique (installation de l'application propriétaire) |
| Serveur SDK (`SdkWsServer`), gestion de `sdk.register`, attribution des portées | réception du JSON-RPC | privé | oui, en boîte noire |
| `daemon.ts` (MCP) | 3 tests ignorés (T15) | absent du miroir | non |
| Harnais de benchmark (`spine-dream-fh.cjs`, orchestration de la notation, construction des coffres) | n/a | « available on motivated request » | non |
| Règle de combinaison heuristique et juge, retries, parsing effectif, température du juge | harnais | non documentée | non (seulement une inférence partielle depuis les fichiers bruts, E08) |
| Prompts de consolidation (« question-blind ») | moteur | déclaré aveugle aux questions | non |
| Générateur de `tools/metrics.json` (commit `9c459cc` du monorepo privé) | monorepo | « generated, not typed » | non |

## 2. Données et pages non consultées

| Pièce | Raison | Conséquence |
|---|---|---|
| `longmemeval_m` et `longmemeval_m_cleaned` (2,7 Go) | `huggingface.co` bloqué par le proxy de l'environnement | Impossible de vérifier : la présence d'une session « car washed February 3 », la convention de nommage des distracteurs, la version utilisée et les empreintes |
| Oracle LongMemEval (fichier complet) | idem ; lecture partielle via le connecteur HF (octets 0 à 119 999) | Sessions probantes vérifiées pour `gpt4_76048e76` seulement ; les autres questions ont été recoupées sur une copie tierce |
| Papier BEAM : notes de bas de page, prompts, figures | rendu HF incomplet ; `arxiv.org` bloqué | Juge du papier non nommé dans le texte lisible |
| mnemosyne-os.io, mnemosyne-os.com, docs.mnemosyne-os.io, billets de blog cités | bloqués | Annonces des sites (dont un éventuel « tout est open source » et le comparatif « mem0, Zep, Letta… ») non examinées |
| Transcriptions non tronquées (« on motivated request ») | non publiées | `aae3761f` run 1 : l'affirmation « 15 hours » reste invérifiable |
| Sorties brutes du juge LongMemEval | non publiées | Impossible de séparer heuristique et juge dans le cas `gpt4_76048e76` |

## 3. Inconnus analytiques

- **U01** : version du corpus LongMemEval-M utilisée (original ou nettoyée, septembre 2025).
- **U02** : règle de sélection et date de constitution du holdout ; « never seen during development » n'est pas vérifiable.
- **U03** : résultats sur l'ensemble parent qui fondent « ~13 points easier ».
- **U04** : build du moteur derrière chaque campagne (BEAM : absence de tampon reconnue par l'auteur ; LongMemEval : aucun tampon non plus).
- **U05** : le rejeu de juillet a-t-il reconstruit la consolidation ? Déduction négative, fondée sur les durées (E26).
- **U06** : effet de l'exposition des identifiants de session `answer_*` sur les réponses (E28).
- **U07** : sens des champs `arm: "raw"` et `encoder: "gpu"` du fichier BEAM 10M.
- **U08** : sémantique exacte du rebasculement automatique vers le cloud (« Local models unavailable — falling back to CLOUD ») dans le produit livré, par opposition au harnais.

## 4. Scénarios de mémoire dans la durée : NON EXÉCUTÉ

Dépendance manquante pour tous : le moteur (application desktop propriétaire) et une autorisation spécifique de l'installer et de l'exécuter localement. Un mock du serveur WS vérifierait le dispositif de test, pas le moteur.

| Id | Scénario | Attendu |
|---|---|---|
| S01 | Ingérer une source S, laisser tourner la consolidation (Dream State), puis corriger S | Les résumés et ponts dérivés de S sont invalidés ou reconstruits ; aucune requête ne renvoie l'ancienne valeur comme état actuel |
| S02 | Ingérer une hypothèse, puis une décision, puis un doute | La classification spine ne transforme pas l'hypothèse en fait ; `ask` distingue les statuts |
| S03 | Mise à jour d'un fait (A, puis A′) | Historique conservé ; `ask` renvoie A′ comme état actuel, en citant A comme antérieur |
| S04 | Retrait d'une chronique, puis reconstruction de l'index, du coffre et des consolidations | La chronique ne réapparaît dans aucune couche (source, index lexical, vecteurs, cache, registres de consolidation, sauvegarde). Une recherche vide ne prouve pas la destruction physique ; il faut inspecter le stockage |
| S05 | Deux applications A et B, avec des manifestes distincts ; B forge un JSON-RPC brut qui demande `vault:read` sur le coffre de A | Refus côté serveur, indépendamment des contrôles client (`assertScope`) |
| S06 | `readFile` avec `../` depuis une application sans portée `monorepo:read` | Refus côté serveur |
| S07 | Arrêt brutal pendant `ingest`, puis double ingestion du même contenu | Aucune corruption ; déduplication ou doublon explicitement signalé |
| S08 | Export, puis réimport sur une machine vierge sans réseau | Reconstruction complète sans ressource cachée ni appel cloud |
| S09 | Mode « 100 % local » sous capture réseau (pcap) pendant `ingest`, `ask` et Dream State | Aucun trafic sortant ; en cas d'indisponibilité du modèle local, un échec explicite plutôt qu'un rebasculement cloud silencieux |
