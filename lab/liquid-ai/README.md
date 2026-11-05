# Lab notes: Liquid AI models in Mnemosyne OS

We test open models on one consumer laptop before they enter Mnemosyne OS.
These notes cover the Liquid AI models we ran on 2026-11-05.
Each entry gives the setup, the numbers, and what we did with the result.
A run that failed stays in the notes too.

## The machine

- Laptop, Windows 11, 32 GB of RAM.
- NVIDIA RTX 4050 Laptop GPU, 6 GB, power-limited by the vendor profile.
- An Intel Arc integrated GPU next to it.
- llama.cpp b12080 (CPU and Vulkan builds) for every model below.
- "App open" means Mnemosyne OS was running and held about 4 GB of the GPU.

## Summary

| Model | What we tried | Result | Status in Mnemosyne OS |
|---|---|---|---|
| LFM3-VL-2B (Q4_K_M) | Describe attached images | Works, 9 s per image | Integrated |
| LFM2.5-8B-A1B (Q4_K_M) | Local chat and voice turns | Works, 79 tok/s on the GPU | Integrated |
| LFM2.5-24B-A2B (Q4_K_M) | Local chat through llama-server | Works, 25 tok/s | Integrated |
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

## LFM2.5-8B-A1B: local chat and voice

| Placement | Speed |
|---|---|
| All 25 layers on the GPU (Vulkan), app closed | ~79 tok/s |
| CPU only | ~27 tok/s |
| GPU shared with the app | ~11 tok/s |

Answers came in 4.2 s, then 1.2 s once warm.

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
- CPU only: 14 to 17 tok/s.
- llama-server with `--n-cpu-moe 99`: ~25 tok/s.

The model deliberates at length (about 2 500 characters).
One answer took 30 s, the next 22 s.
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

## Questions we have

1. For LFM3-Omni-2B and LFM3-Audio-2B over `/v1/realtime`, which sampling
   settings give intelligible speech?
2. Is reasoning at thought budget 0 expected for LFM2.5-8B-A1B and 24B-A2B?
3. Is there a recommended `--image-max-tokens` for LFM3-VL on large images?
