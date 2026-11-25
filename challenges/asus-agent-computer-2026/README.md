# Mnemosyne OS : dossier pour l'ASUS Agent Computer Challenge

Catégorie : **High-End**.

---

## 1. Le projet

Mnemosyne OS est un système d'exploitation IA qui tourne sur votre PC.
Il marche sous Windows, macOS et Linux, avec une interface en 7 langues.
La version 2.3.0 est sortie le 20/11/2026.

Au centre, il y a votre mémoire.
L'application range vos notes, vos documents, votre code et vos conversations dans des coffres.
Les données restent sur votre disque.

Autour de cette mémoire, l'application fait tourner :
- Irina, une assistante qui parle et écoute en local ;
- l'agent Hermes, qui gère votre agenda et vos tâches et répond sur Telegram ;
- vos agents de code (Claude Code, Cursor, Antigravity), branchés par MCP ;
- une salle de contrôle où vos agents de code apparaissent en cartes : une commande risquée attend votre accord ;
- Theia, un moteur de vision qui indexe vos images en local ;
- des applications installées depuis MnemoHub : CRM, lecteur de PDF à voix haute, traducteur, suite pour restaurant ;
- un bureau qui se pilote à la voix, ou aux gestes par la webcam ;
- Synaptic P2P, qui relie vos machines sur le réseau local, sans cloud.

Tous ces éléments lisent la même mémoire.

## 2. Tester la démo en 15 minutes

Ce parcours suit le règlement : les experts testent une démo qui fonctionne.

### Étape 1 : vérifier et installer l'application

1. Téléchargez l'installeur de la version 2.3.0 :
   https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS/releases/tag/v2.3.0-infinity
2. Vérifiez que le fichier vient bien de notre CI :
   ```bash
   gh attestation verify Mnemosyne-OS-Infinity-2.3.0-Setup-x64.exe -R Mnemosyne-OS/Mnemosyne-Neural-OS
   ```
3. Lancez l'installeur. L'application démarre en local, sans compte ni licence.

### Étape 2 : remplir un coffre

1. Créez un coffre, par exemple « Projet ».
2. Déclarez un dossier de documents ou un dépôt de code.
3. L'application découpe les fichiers et calcule leurs vecteurs sur votre machine.

### Étape 3 : interroger la mémoire

1. Posez une question à Irina, l'assistante de l'application.
2. Elle répond à partir de vos documents.
3. Vous pouvez lui parler : la dictée et la voix tournent en local, sous Windows et Linux.

### Étape 4 : brancher un agent de code

1. Dans Claude Code, Cursor ou tout client MCP, ajoutez le serveur :
   ```bash
   npx -y @mnemosyne_os/mcp
   ```
2. Demandez à l'agent ce que le coffre « Projet » contient.
3. L'agent interroge la mémoire par `127.0.0.1:7799`. Le serveur MCP n'ouvre aucun autre port.

### Étape 5 : voir les autres agents de la machine

Les outils `mnemosyne_agent_list` et `mnemosyne_agent_collisions` lisent les journaux
que Claude Code, Antigravity et Cursor écrivent déjà sur le disque.
Ils signalent quand deux agents modifient le même fichier.
Ils marchent même application fermée, sans dépenser de token.

### Étape 6 : installer une application

1. Ouvrez MnemoHub, le magasin d'applications.
2. Installez MnemoReader, puis ouvrez un PDF.
3. Il le lit à voix haute et surligne chaque mot lu.

Le code source de MnemoReader est public :
https://github.com/Mnemosyne-OS/MnemoReader---MnemosyneOS

## 3. Le code à lire dans le dépôt

| Dossier | Contenu |
|---|---|
| `packages/mcp` | Le serveur MCP publié sur npm (licence MIT) |
| `packages/sdk`, `packages/cartridge-sdk` | Le SDK pour écrire une application dans Mnemosyne OS |
| `packages/eval-sdk` | Les outils d'évaluation de la mémoire |
| `packages/agent-transcripts` | La lecture des journaux des agents de code |
| `cli` | MnemoForge, la ligne de commande (licence MIT) |
| `doc/ARCHITECTURE.md` | L'architecture générale |
| `doc/IPC_SECURITY_BRIDGE.md` | La frontière de sécurité entre l'interface et le moteur |

La CI du dépôt tourne à chaque push. Chaque installeur porte une attestation
GitHub qui le relie au commit qui l'a construit.

## 4. Ce qui est privé, et pourquoi

Mnemosyne OS suit un modèle open core.
Le dépôt public contient le SDK, le serveur MCP, la ligne de commande et la documentation.
Le moteur de mémoire et l'application restent privés.
La vidéo suivante explique ce choix : https://www.youtube.com/watch?v=2GrY9opYV38

Pour l'évaluation, nous proposons au jury :
- une démonstration en direct, en visio, avec questions sur l'architecture ;
- une licence de test avec du crédit, sur demande, pour les fonctions qui passent par un modèle cloud.

## 5. Une mémoire mesurée

Sur les questions holdout de LongMemEval-M, Mnemosyne OS répond juste à 37 questions
sur 48 (77,1 %), avec gpt-4o comme juge.
Le kit qui permet de refaire la mesure est public :
https://github.com/Mnemosyne-OS/MnemosyneOS---benchmarks/tree/main/longmemeval-rerun-2026-10

## 6. Le matériel : ce qui bloque aujourd'hui

Ma machine de développement est un PC portable :
- Intel Core Ultra 7 155H, 32 Go de RAM ;
- NVIDIA RTX 4050 Laptop, 6 Go de VRAM, limitée à 25 W ;
- Intel Arc intégré et NPU Intel AI Boost.

Mesures du 25/11/2026 sur la RTX 4050, en Vulkan comme dans l'application.
Quantification Q4_K_M, même script pour chaque ligne.

| Modèle local | Fichier | Tient en 6 Go ? | Génération | Lecture du prompt |
|---|---|---|---|---|
| Ministral 3 3B (dense) | ~2 Go | oui | 42,4 tok/s | 1 987 tok/s |
| Ministral 3 8B (dense) | ~5 Go | à la limite | 11,2 tok/s | 596 tok/s |
| LFM2.5 8B-A1B (MoE) | 5,2 Go | oui, 4,5 Go chargés | 50,6 tok/s | 1 489 tok/s |
| LFM2.5 24B-A2B (MoE) | 14,5 Go | non | 3,0 tok/s | 37,5 tok/s |

Le 8B dense remplit la carte et tombe à 11,2 tok/s.
Le 8B-A1B n'active qu'un milliard de paramètres par mot, et il garde 50 tok/s.
Le 24B ne tient pas en 6 Go : il écrit 3 tokens par seconde.
Son premier token arrive après 17,5 secondes.
En local, l'agent Hermes tourne donc sur le 8B.
Le 24B est trois fois plus grand, mais il est trop lent pour s'en servir.

Un tour de l'agent Hermes sur un modèle cloud coûte environ 0,52 $ la question.
Sur un modèle local, ce coût tombe à zéro, mais le modèle doit tenir en VRAM.

## 7. Ce que la Radeon AI PRO R9700 changerait

La carte de 6 Go sert aussi à la dictée, à la voix et à la vision.
Le 17/11, j'ai mesuré le 8B pendant que d'autres programmes occupaient la carte.
Avec 2 Go déjà pris, il écrit 66 tokens par seconde.
Avec 5 Go déjà pris, il tombe à 31,5.

La R9700 a 32 Go de VRAM.
Le fichier du 24B fait 14,5 Go : il y tient entier, avec de la place pour un long contexte.
L'agent Hermes pourrait alors tourner en local sur un modèle trois fois plus grand.

L'application calcule déjà sur Vulkan.
L'installeur n'embarque pas CUDA, donc une carte AMD marche sans réécriture.

Si nous gagnons, nous publierons dans ce dossier :
1. le même tableau de mesures, refait sur la R9700 ;
2. le coût d'une semaine de travail d'agent, en cloud et en local ;
3. une courte vidéo de la démo sur la nouvelle carte.

## 8. Contact

- Mail : dev@mnemosyne-os.com
- Site : https://mnemosyne-os.io
