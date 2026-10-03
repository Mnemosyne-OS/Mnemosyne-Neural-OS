# Reproduction

Chaque commande ci-dessous a été exécutée dans cette session. Sa trace (commande, répertoire, date UTC, durée, sortie standard, sortie d'erreur, code de retour) se trouve dans `traces/<ID>.{cmd,out,err,rc}`.

## 1. Environnement constaté

- Linux 6.18 (conteneur cloud), 4 vCPU, 15 Go de RAM, 30 Go de disque disponibles.
- Node v22.22.2, Python 3.11.15, git 2.43.0, pnpm 10.25.0.
- Réseau sortant par proxy. `github.com` et `registry.npmjs.org` sont accessibles. `huggingface.co`, `arxiv.org`, `mnemosyne-os.io`, `mnemosyne-os.com` et `docs.mnemosyne-os.io` sont **bloqués**.
- Aucun processus Mnemosyne dans le conteneur.
- Isolement : les exécutions passent par `unshare -n`, qui coupe tout réseau. Quand un test a besoin de la boucle locale, `tests/netns_lo_up.sh` l'active dans l'espace isolé. Accès externe vérifié impossible (curl, code 6).

## 2. Récupération des sources (versions figées)

```bash
SRC=<dossier de travail>
git clone https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS      && git -C Mnemosyne-Neural-OS checkout 580f1fe9e220659907285bd56daa9d6ca1d4774d
git clone https://github.com/Mnemosyne-OS/MnemosyneOS---benchmarks && git -C MnemosyneOS---benchmarks checkout d69c78264c532eb27255a248be32ea235d7e7a64
git clone https://github.com/Mnemosyne-OS/agent-memory-skill       && git -C agent-memory-skill checkout a4014d43572e0e98d4c7fdaebe44869eb1d219d0
git clone https://github.com/xiaowu0162/LongMemEval                # 9e0b455f4ef0e2ab8f2e582289761153549043fc
git clone https://github.com/mohammadtavakoli78/BEAM               # b2da22eac88bb0874c64665f13457eb99835774a (4,2 Go)
git clone https://github.com/JordanMcCann/agentmemory mirror_JordanMcCann_agentmemory  # 3aa3b8389896f81dd813fdf9176ef3ca122d809e (source secondaire)
```

Les empreintes SHA-256 des 56 fichiers du dépôt de benchmarks et des autres fichiers clés sont dans `SOURCES_ET_VERSIONS.json`.

## 3. Scripts originaux (dépôt de benchmarks, sans modification)

```bash
B=$SRC/MnemosyneOS---benchmarks
cp -a $B work                                         # copie de travail
(cd work/verification-kit && unshare -n node verify.js)             # T05, rc=0
(cd work/verification-kit && unshare -n node scoring.js --selftest) # T06, rc=0, 6/6
(cd work/beam-2026-09     && unshare -n node verify.js)             # T07, rc=0
(cd work && unshare -n node lexical-2026-08/extract-ledgers.mjs && git status --porcelain)  # T08, rc=0, aucun écart
```

## 4. Contrôles indépendants (dossier `tests/`)

```bash
A=<ce dossier>
$A/tests/trace.sh T01_inspect_lexical        $A/tests node inspect_lexical_runs.mjs $B          # rc=0
$A/tests/trace.sh T02_dump_lexical           $A/tests node dump_lexical_table.mjs $B            # rc=0 (tableau des 48 questions)
$A/tests/trace.sh T03_crossref_questions     $A/tests node crossref_questions.mjs $B $SRC/mirror_JordanMcCann_agentmemory/longmemeval_results_opus6.json  # rc=0
$A/tests/trace.sh T04_inspect_beam           $A/tests node inspect_beam_runs.mjs $B             # rc=0
$A/tests/trace.sh T09_independent_recompute  $A/tests unshare -n node independent_recompute.mjs $B  # rc=0
$A/tests/trace.sh T10_beam_abstention        $A/tests unshare -n node dump_beam_abstention.mjs $B   # rc=0 (60 réponses)
$A/tests/trace.sh T16_adversarial_scoring    $A/tests unshare -n node adversarial_scoring.mjs $B    # rc=1 VOULU : 17 défauts détectés dans scoring.js
$A/tests/trace.sh T17_mutation_checks        $A/tests unshare -n ./mutation_checks.sh $B            # rc=0 : toutes les mutations détectées
$A/tests/trace.sh T18_july_logs              $A/tests unshare -n node check_july_logs.mjs $B        # rc=2 VOULU : verdicts concordants, 2 textes non retrouvés
$A/tests/trace.sh T19_gen_sources            $A/tests node gen_sources_coverage.mjs $SRC $A        # rc=0
```

Codes de retour propres aux tests :

- `adversarial_scoring.mjs` sort avec 1 dès qu'un cas n'obtient pas l'attendu. Un rc=1 signale ici un défaut de `scoring.js`.
- `check_july_logs.mjs` sort avec 1 si un verdict diverge, avec 2 si seuls des textes ne sont pas retrouvés.

## 5. Tests du connecteur MCP (dépôt produit)

```bash
cp -a $SRC/Mnemosyne-Neural-OS mnos-work
(cd mnos-work && pnpm install --frozen-lockfile --ignore-scripts)                  # T11, rc=0, 317 paquets
(cd mnos-work/packages/mcp && unshare -n pnpm test)                                 # T12, rc=1 : tsx non déclaré
mkdir tools && (cd tools && npm init -y && npm i --ignore-scripts tsx@4.19.2)       # outil externe, version épinglée
(cd mnos-work/packages/mcp && unshare -n $A/tests/netns_lo_up.sh ../../../tools/node_modules/.bin/tsx --test src/*.test.ts)  # T15, rc=0 : 202 tests, 199 réussis, 3 ignorés
```

- **T13** : run interrompu, invalide. Les échecs ENETUNREACH venaient de la boucle locale inactive, un artefact de mon dispositif. Voir `T13_mcp_tests_tsx.NOTE.txt` : il n'y a ni `.cmd` ni `.rc`.
- **T14** : run partiel sur 13 des 22 fichiers de test, rc=0 (148 tests, 146 réussis, 2 ignorés). Un essai antérieur sous le même nom avait échoué faute de l'utilitaire `ip` (rc=127) ; sa trace a été écrasée.
- **T15** fait foi.

## 6. Lectures par connecteur (non rejouables par script ici)

- Oracle LongMemEval, élément `gpt4_76048e76`, via `mcp Hugging_Face hf_fs cat` : `hf://datasets/xiaowu0162/longmemeval-cleaned/longmemeval_oracle.json` et `hf://datasets/xiaowu0162/longmemeval/longmemeval_oracle`, offsets 0, 40000 et 80000. Pas d'empreinte, faute d'octets bruts sur disque.
- Papier BEAM via `hf://papers/2510.27246/paper.md`.

Avec un accès à `huggingface.co`, on peut les rejouer par script :

```bash
wget https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_oracle.json
sha256sum longmemeval_oracle.json
```

## 7. Archive

```bash
cd <parent> && zip -r audit-mnemosyneos.zip audit-mnemosyneos -x '*/node_modules/*'
mkdir /tmp/x && cd /tmp/x && unzip -q .../audit-mnemosyneos.zip && cd audit-mnemosyneos && sha256sum -c MANIFEST.sha256
```

## 8. Note sur les chemins

Les chemins temporaires des traces ont été normalisés en `/tmp/kab-0/...` après exécution. Les commandes, sorties et codes de retour sont inchangés par ailleurs, et les empreintes du manifeste portent sur les fichiers normalisés.
