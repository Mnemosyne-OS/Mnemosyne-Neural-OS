# Lab notes: Liquid AI models in Mnemosyne OS

We test open models on one consumer laptop before they enter Mnemosyne OS.
These notes cover the Liquid AI models we ran on 2026-11-05.
Each entry gives the setup, the numbers, and what we did with the result.
A run that failed stays in the notes too.

## The machine

- Laptop, Windows 11, 32 GB of RAM.
- NVIDIA RTX 4050 Laptop GPU, 6 GB, power-limited by the vendor profile.
- An Intel Arc integrated GPU next to it.
- llama.cpp b12080 (CPU and Vulkan builds), and b11742 (CUDA), the build
  Mnemosyne OS uses on NVIDIA cards.
- "App open" means Mnemosyne OS was running and held 1.5 to 4 GB of the GPU.

**Correction, evening of 2026-11-05.** The first version of these notes gave
the 24B 25 tok/s on llama-server. That run was on the CPU only. The
llama-server build we used had no CUDA runtime next to it, so it never
touched the GPU. The numbers below are measured again on the CUDA build.

## Summary

| Model | What we tried | Result | Status in Mnemosyne OS |
|---|---|---|---|
| LFM3-VL-2B (Q4_K_M) | Describe attached images | Works, 9 s per image | Integrated |
| LFM2.5-8B-A1B (Q4_K_M) | Local chat and voice turns | Works, 41 to 70 tok/s depending on free GPU memory | Integrated |
| LFM2.5-24B-A2B (Q4_K_M) | Local chat through llama-server | Works, ~35 tok/s, app open | Integrated |
| LFM2.5 1.2B Instruct and 2.6B (Q4_K_M) | Short chat in French | Answer like assistants | Listed for testing |
| LFM2.5 230M, 350M and 1.2B Thinking (Q4_K_M) | Short chat in French | Shallow, or slow at thinking off | Not listed |
| LFM2.5-Embedding-350M (Q8_0) | Retrieval over our docs | Better top-1 in 5 of 6 languages | Not integrated |
| LFM3-Omni-2B and LFM3-Audio-2B (Q4_K_M) | Speech to text, speech to speech | Speech input works, speech output unclear | Not integrated |

"Integrated" means merged in our development branch.
It ships in a later release.

## LFM3-VL-2B: reading images on the machine

Mnemosyne OS has a local mode.
Until now that mode refused every image, because our local engine has no vision.
LFM3-VL now reads the attached image and writes a description.
The local model answers from that description.
The image never leaves the machine.

We run `llama-mtmd-cli` once per image.
The model loads, reads, answers and exits.

**CPU or GPU.** We started on the GPU.
With the app open, the GPU spilled into shared memory.

| Image 3000×2000 | Time | Small text copied right |
|---|---|---|
| RTX 4050, app open | 95 s | yes |
| CPU, app open | 25 s | yes |

So the reader runs on the CPU.
We could not pick the GPU by its free memory.
`--list-devices` reported 5 152 MiB free while `nvidia-smi` showed 4 037 of
6 141 MiB in use.

**Context size.** At `-c 4096` a large image filled the context a few words
into the answer: `failed to find a memory slot for batch of size 1`.
At `-c 8192` with `--image-max-tokens 7168` the same image read in full.

**Image size.** We resize large images before the reading.
The test image had text 11 px tall. Each size ran twice, same result both times.

| Longest side | Time (CPU) | Text read |
|---|---|---|
| 3000 px | 18 s | exact |
| 2048 px | 9 s | exact |
| 1920 px | 8 s | one letter group wrong |
| 1792 px | 7 s | wrong |
| 1664 px | 6 to 8 s | wrong |
| 1536 px | 6 s | wrong |

The text stays readable down to about 7.5 px tall.
We give the reader at most 2048 px on the longest side.
The resize happens in memory, and the user's file is left as it is.

**A second image in the same conversation.** The chat model reads the
description, not the image. With two descriptions in one prompt, it described
the first image again. We tested where to put them, on a conversation that
had already described image 1, two runs each on LFM2.5-8B-A1B.

| Layout | Image described |
|---|---|
| Both descriptions before the whole history | Both, mixed |
| Both descriptions right before the question | The first one, 2 of 2 |
| The new description alone, right before the question | The new one, 2 of 2 |

So a message with an image now carries that image alone. The earlier
descriptions come back only for a question without an image.

## LFM2.5-8B-A1B: local chat and voice

| Placement | Speed |
|---|---|
| All 25 layers on the GPU (Vulkan), app closed | ~79 tok/s |
| CPU only | ~27 tok/s |
| GPU shared with the app, node-llama-cpp | ~11 tok/s |
| llama-server b11742 (CUDA), `--fit`, app open | 81.5 tok/s |

Answers came in 4.2 s, then 1.2 s once warm.
Inside the app, node-llama-cpp put every layer on the GPU and spilled into
shared memory. On llama-server with `--fit` the same model read a 1 775-token
prompt at 918 tok/s and gave its first words at 2.0 s. So the 8B now runs on
llama-server on NVIDIA cards.

**Reasoning at thought budget 0.** Our voice turns run with thinking off.
At budget 0 the model still reasoned, and the reasoning arrived as answer
text, closed by a literal `</think>`.
The voice would have read it aloud.
At a budget of 300 the default chat wrapper split it correctly.
We added a guard that holds a flagged model's stream until its own
`</think>`. On the real model it folded the reasoning 3 times out of 3.
A custom thought template and a `<think></think>` response prefix did not
fix it.

## LFM2.5-24B-A2B: the larger MoE

- node-llama-cpp on Vulkan with automatic layers: out of GPU memory at load.
- 14 layers on the GPU: 4 to 8 tok/s.
- CPU only (llama-server): 69 tok/s read, 16 to 21 written.
- llama-server b11742 (CUDA), `--fit`, app open: 358 tok/s read, ~35 written,
  first words at 5.0 s for a 1 776-token prompt.

The model deliberates at length (about 2 500 characters).
We run it through llama-server.

## LFM2.5-Embedding-350M: retrieval

We compared it with our default embedder, multilingual-e5-base (int8, CPU).
The corpus is our own architecture docs, split by heading into 7 485 chunks.
We asked 24 architecture questions in six languages.

| Language | hit@1 e5 → Liquid | hit@10 e5 → Liquid |
|---|---|---|
| French | 6 → 15 | 18 → 21 |
| English | 16 → 18 | 21 → 23 |
| German | 12 → 17 | 21 → 22 |
| Portuguese | 9 → 17 | 16 → 21 |
| Russian | 15 → 13 | 23 → 21 |
| Chinese | 2 → 15 | 21 → 20 |

The Liquid embedder puts the right chunk first more often in every language
except Russian.
Timing is left out: the Liquid run shared the CPU with other work.
Switching embedders means re-embedding every vault, so we have not switched.
It could become an option for new vaults.

## LFM3-Omni-2B and LFM3-Audio-2B: speech

**Speech to text.** Omni transcribed an 8 s French phrase exactly, in 0.5 s
on the GPU.
Our current Whisper large-v3-turbo (faster-whisper, CUDA, float16) took
0.56 s for the same text.
One 2B model that hears and answers is still interesting: text from audio
came in 0.4 s.

**Speech to speech.** The `/v1/realtime` endpoint of `llama serve` answered,
with the first audio in 0.4 to 1.2 s.
We sent PCM16 at 16 kHz and received 24 kHz.
The speech we got back was not intelligible, in French and in English, with
Omni and with Audio.
We checked it by running the output through Whisper.
We found no audio sampling option in `llama serve --help`.
This is likely our setup. We would welcome a pointer.

## What we explore next

We want to understand how these models work in more detail.
The numbers above tell us what runs. They do not yet tell us why.

Mnemosyne OS already decides where its own workloads run.
The image reader moved to the CPU because the app holds most of the GPU.
The 24B model keeps its experts on the CPU and the rest on the GPU.

The next step is to let the model follow that balance.
The idea is that the model spreads its layers and experts across the CPU, the
GPU and the integrated GPU, based on what the machine has free at that moment.
The goal is a faster answer and less memory held while the app runs.
This is an idea we are testing. Nothing of it is built yet.

P.S. This idea keeps spinning in my head. I will try a few things tonight.
To be continued.

## The same evening: where should the model run?

We loaded the two MoE models many times, each time on a different split, with
the app open. Every run read the same 1 776-token prompt, then wrote an
answer. The free GPU memory came from `nvidia-smi`.

**The drivers overstate the free memory.** With the app open, `nvidia-smi`
counted 2 426 MiB free. Vulkan announced 5 152 MiB free, and CUDA 5 072. Any
split chosen from the driver's figure starts from the wrong number.

**LFM2.5-24B-A2B**, app open, about 2.2 GB of the RTX free:

| Where it ran | GPU memory taken | Read | Write |
|---|---|---|---|
| CPU only | 0 | 69 tok/s | 16 to 21 tok/s |
| Vulkan, RTX, all experts on the CPU | 1.4 GB | 77 tok/s | 16 to 19 tok/s |
| Vulkan, RTX, 8 expert layers on the GPU | 1.5 GB, card full | 145 tok/s | 4.7 tok/s |
| Vulkan, both GPUs: 13.7 GB of weights on the iGPU, 177 MB on the RTX | 0.7 GB | 97 tok/s | 11 to 13 tok/s |
| Vulkan, everything on the Intel iGPU | 0 | 108 tok/s | 21 tok/s |
| CUDA, RTX, `--fit` | up to the card's limit | 358 tok/s | ~35 tok/s |

**LFM2.5-8B-A1B**, same conditions:

| Where it ran | Read | Write | First words |
|---|---|---|---|
| CPU only | 176 tok/s | 37 tok/s | 10.2 s |
| Vulkan, Intel iGPU | 201 tok/s | 35 tok/s | 8.9 s |
| Vulkan, RTX, everything on the card | 840 tok/s | 5.4 tok/s | 2.5 s |
| Vulkan, RTX, all experts on the CPU | 695 tok/s | 35 to 40 tok/s | 2.6 s |
| Vulkan, RTX, `--fit` | 841 tok/s | 6.2 tok/s | 2.5 s |
| CUDA, RTX, `--fit` | 918 tok/s | 81.5 tok/s | 2.0 s |

What we take from one evening on one laptop:

1. On Vulkan, `--fit` chose a split that wrote 4 to 6 times slower than
   "all experts on the CPU". A margin that corrected the wrong free figure did
   not change that.
2. On CUDA, `--fit` chose well for both models that evening, with the other
   processes on the card idle. The next section shows where that stopped
   being true.
3. The integrated GPU ran the 24B as fast as the best CPU split, read 57 %
   faster, and left the RTX and the CPU free. Nothing in the app uses it yet.
4. The image reader is the exception: 8 s on the CPU, 17 to 19 s on the iGPU
   for a 2048 px image. It stays on the CPU.

One open question. While the CUDA runs loaded, the app's own share of the GPU
dropped from about 4 GB to 1.4 GB and stayed there. Either the app released
an idle model, or Windows moved its memory out to make room. A video playing
on the machine froze once, briefly, during these runs. The next section
answers it: Windows moved the memory out.

## The next night: the split follows the real free memory

**What broke.** In the app, the 8B loaded with `--fit` while the app already
held 2.4 GB of the GPU. `--fit` left 0.35 GB free. A chat answer had produced
nothing after 14 minutes.

**Why.** On this Windows laptop, CUDA reports 5 072 MiB free whether the card
is empty or 3.7 GB are held by other processes. `--fit` sizes the split from
that figure. Windows then moves the other processes' memory into system RAM to
make room, and the model spills into shared memory when there is no room left.

**What we measured.** We held part of the GPU with two small resident models,
restarted before each run. Then we loaded the 8B on the CUDA build with our
app's server arguments and a 32 768-token window, and sent a 9 491-token
prompt. Free memory is `nvidia-smi` `memory.free`.

| Really free | `--fit` with a corrected margin | All experts on the CPU | All on the GPU |
|---|---|---|---|
| 5 920 MiB | 68.8 tok/s | 40.8 tok/s | 83.1 tok/s |
| 4 388 MiB | 69.7 tok/s | 41.7 tok/s | 83.2, others pushed out |
| 2 626 MiB | 50.0 tok/s | 41.8 tok/s | 62.1, others pushed out |
| 1 458 MiB | 19.1 tok/s | 41.0 tok/s | not run |
| 1 276 MiB | 18.1 tok/s | 44.5 tok/s | not run |
| 864 MiB | 20.7 tok/s | 43.5 tok/s | 78.9, others pushed out |

"Corrected margin" means `--fit on -fitt (768 + driver free − real free)`.
The margin absorbs what the driver overstates. That `--fit` never pushed
another process out, at any level. "All on the GPU" was the fastest every
time, by taking the others' memory: 5 GB of theirs went down to 128 MB.
At 864 MiB free, the integrated GPU wrote 29.9 tok/s and the CPU alone 22.8,
but the first word came after 50 and 100 seconds.

**Larger models need more room.** We ran the same comparison on the 24B and on
gpt-oss 20B. Each cell gives corrected `--fit` / all experts on the CPU, in
written tok/s.

| Really free | LFM2.5-24B-A2B | gpt-oss 20B |
|---|---|---|
| 5 920 MiB | 32.5 / 27.0 | 25.8 / 21.3 |
| 4 388 MiB | 30.7 / 27.9 | 28.3 / 23.9 |
| 2 626 MiB | 27.0 / 28.9 | 11.1 / 20.4 |

At 2 626 MiB the 24B also gave its first word at 41 s on `--fit`, and at 20 s
with the experts on the CPU.

With the plain `--fit` and 2 626 MiB free, both fell to 5.1 tok/s and pushed
the other processes out. So did the 8B, at 6.9 tok/s.

**The rule now in Mnemosyne OS:**

1. Read the real free memory with `nvidia-smi` when the model loads.
2. Every model on our llama-server gets `--fit` with the corrected margin.
   With an empty GPU it is the same as the plain `--fit`.
3. The three MoE models above also have a floor. Below it, or without
   `nvidia-smi`, every expert stays on the CPU and the rest goes on the GPU.
   The floor is 2 560 MiB for the 8B, and 3 584 MiB for the 24B and gpt-oss.

With a free GPU the 8B writes about 69 tok/s, and about 43 when the GPU is
nearly full. The rule is applied when the model loads, and it is not applied
again while the model runs.

**The window.** Our server opened 16 384 tokens, and a long chat then had room
for one memory out of four. A 32 768-token window costs the 8B 166 MB more on
the GPU and the 24B 234 MB, at the same speed. Both now open 32 768.

## How we test

The scripts are in [`bench/`](bench/). They need llama.cpp, Python 3, curl and,
for the GPU numbers, `nvidia-smi`.

1. Check the download. Compare the file's SHA-256 with the `lfs.oid` that
   Hugging Face lists for it.
2. Ask the model two short questions with thinking off. A `</think>` inside
   the answer means the reasoning leaked.
   [`leak-ask.py`](bench/leak-ask.py) does it against a running llama-server.
3. Measure each placement with the app open, because that is how people run
   it. [`split-bench.sh`](bench/split-bench.sh) loads the model once per
   placement and reads the GPU memory before and after.
   For example:
   `SERVER=llama-server MODEL=model.gguf CTX=doc.txt sh split-bench.sh run1 cpu igpu gpu 99`
4. For a vision model, draw the test image with
   [`make-test-image.py`](bench/make-test-image.py), then time
   [`vl-ask.py`](bench/vl-ask.py) on each size.

What we learned to check before trusting a number:

- **The free GPU memory.** On this laptop Vulkan and CUDA both reported about
  5 GB free while `nvidia-smi` counted 2.4 GB. We read `nvidia-smi`.
- **That the GPU is really used.** A llama-server build without its CUDA
  runtime next to it runs on the CPU and prints no error. Its log has no
  `CUDA0` line, and `nvidia-smi` does not move. That is how our first 24B
  figure was wrong.
- **Where the weights went.** With `-lv 4` the loader prints one
  `model buffer size` line per device. A split we had named "attention on the
  RTX" turned out to put 13.7 GB on the iGPU and 177 MB on the RTX.
- **Who else is on the GPU.** Two processes on the same card slow each other
  down. `nvidia-smi --query-compute-apps=pid,used_memory --format=csv` lists them.

## Questions we have

1. For LFM3-Omni-2B and LFM3-Audio-2B over `/v1/realtime`, which sampling
   settings give intelligible speech?
2. Is reasoning at thought budget 0 expected for LFM2.5-8B-A1B and 24B-A2B?
3. Is there a recommended `--image-max-tokens` for LFM3-VL on large images?
4. Have you measured the LFM2.5 MoE models with their experts on an
   integrated GPU? On our laptop the Intel iGPU matched the CPU for writing and
   read faster.
