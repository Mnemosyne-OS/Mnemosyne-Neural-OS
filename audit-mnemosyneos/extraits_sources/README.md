# Extraits de sources

| Fichier | Origine | Licence |
|---|---|---|
| `mnemosyne-benchmarks_d69c782_*.js` | Mnemosyne-OS/MnemosyneOS---benchmarks@d69c782, copie intégrale non modifiée | MIT (`mnemosyne-benchmarks_LICENSE-CODE.txt`) |
| `gpt4_76048e76_lignes_publiees.json`, `beam_abstention_faux_positifs.json`, `aae3761f_registre.jsonl`, `spine-dream-multirun_log_*.txt` | Mnemosyne-OS/MnemosyneOS---benchmarks@d69c782 (données). Les champs question/gold/rubric appartiennent à LongMemEval ou à BEAM | données Mnemosyne : CC-BY 4.0, attribution Mnemosyne OS / XPACEGEMS ; champs de benchmark : MIT de leurs auteurs |
| `longmemeval_9e0b455_evaluate_qa_L24-48.py` | xiaowu0162/LongMemEval@9e0b455 | MIT (`LongMemEval_LICENSE.txt`) |
| `beam_commit_b2da22e.diff` | mohammadtavakoli78/BEAM, commit b2da22e | MIT (`BEAM_LICENSE.txt`) |

## Transcriptions de lectures par connecteur

Ces transcriptions ne sont pas des copies à l'octet : elles ont été lues via le connecteur Hugging Face, `huggingface.co` étant bloqué pour les téléchargements dans cet environnement.

### LongMemEval oracle, `gpt4_76048e76`

Source lue : `longmemeval-cleaned/longmemeval_oracle.json` et `longmemeval/longmemeval_oracle`, élément d'indice 2. Licence MIT.

- question : "Which vehicle did I take care of first in February, the bike or the car?"
- answer : "bike" ; question_date : "2023/03/10 (Fri) 23:15"
- answer_session_ids : ["answer_b535969f_2", "answer_b535969f_1"]
- answer_b535969f_2 (2023/03/10 22:50), tour utilisateur 1, has_answer=true : "I'm thinking of getting a new bike rack for my car. Do you have any recommendations? By the way, I've been having some issues with my bike lately - in mid-February, I had to take it in for repairs because the gears were acting up and I couldn't shift properly."
- answer_b535969f_1 (2023/03/10 08:11), tour utilisateur 1, has_answer=true : "I'm thinking of getting a newer car and I'm researching the new hybrid model of my current Toyota Corolla. [...] By the way, I just washed my current Corolla on Monday, February 27th, after not doing so for over a month - it was getting pretty dirty after that snowstorm we had a few weeks prior!"
- Seules références à février dans l'élément : « mid-February » (×2) et « Monday, February 27th » (×1).
- Original et version nettoyée : identiques sur cet élément (comparaison visuelle, sans empreinte).

### Papier BEAM v1 (arXiv 2510.27246), Table 1, lignes « Average »

Lu via `hf://papers/2510.27246/paper.md`.

| Backbone / méthode | 100K | 500K | 1M | 10M | perte relative 100K → 10M |
|---|---|---|---|---|---|
| Qwen 2.5 Vanilla | 0.280 | 0.200 | 0.193 | 0.133 | 52,5 % |
| Qwen 2.5 RAG | 0.269 | 0.291 | 0.285 | 0.211 | 21,6 % |
| Qwen 2.5 LIGHT | 0.311 | 0.316 | 0.309 | 0.238 | 23,5 % |
| Llama Maverick Vanilla | 0.240 | 0.283 | 0.259 | 0.104 | 56,7 % |
| Llama Maverick RAG | 0.323 | 0.330 | 0.307 | 0.249 | 22,9 % |
| Llama Maverick LIGHT | 0.358 | 0.359 | 0.336 | 0.266 | 25,7 % |
| Gemini 2 Flash Vanilla | 0.242 | 0.257 | 0.199 | 0.122 | 49,6 % |
| Gemini 2 Flash RAG | 0.280 | 0.267 | 0.271 | 0.216 | 22,9 % |
| Gemini 2 Flash LIGHT | 0.294 | 0.292 | 0.284 | 0.192 | 34,7 % |
| GPT-4.1-nano Vanilla | 0.239 | 0.194 | 0.191 | 0.109 | 54,4 % |
| GPT-4.1-nano RAG | 0.309 | 0.314 | 0.302 | 0.218 | 29,4 % |
| GPT-4.1-nano LIGHT | 0.345 | 0.335 | 0.336 | 0.226 | 34,5 % |

La section 4.1 du papier précise : à 10M, les baselines Vanilla sont évaluées sur « the largest recent dialogue segment fitting their window ».
