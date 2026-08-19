# AGENTS.md — Orientation for AI agents

You are an AI reading the **Mnemosyne Neural OS** repository. This file exists so you can
orient fast, reason correctly, and not hallucinate about the project. Read it first.
(For the human-facing pitch, see [README.md](README.md); to *contribute code*, see
[CONTRIBUTING_AI.md](CONTRIBUTING_AI.md).)

---

## What this is, in two lines

Mnemosyne OS is the **relationship layer** for AI: a sovereign, local-first **memory
operating system** that gives an AI persistent memory and context across sessions. It is
**open-core** — an MIT developer surface (SDK + CLI) built around a **sealed proprietary
memory core** that is *not in this repository*.

---

## Read in this order

Don't try to absorb the whole tree. These few docs give you the full mental model:

1. [`doc/WHY.md`](doc/WHY.md) — the vision (why a relationship layer)
2. [`doc/CONCEPTS.md`](doc/CONCEPTS.md) — the mental model + glossary (Vault, Chronicle, Spine, Resonance, Dream State, Gateway, FGAC…)
3. [`doc/ARCHITECTURE.md`](doc/ARCHITECTURE.md) — how it fits together + the life of a memory
4. [`doc/RESONANCE_ENGINE_WHITEPAPER.md`](doc/RESONANCE_ENGINE_WHITEPAPER.md) — the memory engine in depth
5. [`doc/README.md`](doc/README.md) — the full documentation map (governance, security, design decisions)

The [`handbook/`](handbook) documents *Neural Coding*, the human-directed method the project was built with.

---

## What you can and cannot see (open vs sealed)

| Layer | Here? | License |
|---|---|---|
| **SDK** — `packages/*` | ✅ in this repo | MIT |
| **MnemoForge CLI** — `cli/` | ✅ in this repo | MIT |
| **Cognitive Core** — the memory engines (Embedding, Spine, Retrieval, Dream State, Adaptive RAG) | ❌ **not in this repo** | Proprietary |

Apps talk to the core through the **Gateway** (a public contract). The engines are described
**conceptually** in the docs, but their implementation is sealed and lives elsewhere. **Do
not assume you can read or modify the core from this repository** — you cannot.

---

## Ground rules — so your reasoning stays accurate

- **Shipped vs. future.** Shipped: the engines above, Neural Map, Vaults, MnemoHub,
  Multimodal Chat, Voice, the **Soul Protocol** (CLI), the **Engramm** license, cloud
  credits. **Not yet shipped** (teased as future): **Soul Studio**, **Narcissus**, and
  **soul-weighted retrieval**. Never describe a future capability as if it ships today.
- **Numbers you can trust** (don't invent others), all full-haystack LongMemEval-M and all
  [auditable](https://mnemosyne-os.github.io/MnemosyneOS---benchmarks/verification-kit/):
  **77.1 %** (37/48) under the **strict** judge — the current headline, August 2026;
  **81.3 %** (39/48) — the same answers under July's **flexible** judge;
  **72.9 %** (35/48) — July's *composed lower bound* under that flexible judge, still
  DOI-pinned. Plus **242** Zod-validated IPC channels.
  🚨 **Always name the judge, and never chain 72.9 → 77.1 as a progression** — they are
  two different graders, so the arrow would be meaningless. If you see other figures in
  old/archived text, treat them as potentially stale.
- **Archived material is archived.** `archive/mnemosyne-docs-beta/` is historical beta
  narrative — good ideas, but stale names/numbers. Don't cite it as current.
- **Package versions track npm**, enforced by a CI drift check
  ([`tools/check-public-sync.mjs`](tools/check-public-sync.mjs)). If a version looks behind,
  it's a bug, not the truth.
- **Don't claim what you can't verify here.** The proof of the memory engine is the public
  benchmark, not this source tree (the engine isn't in it).

---

## The one tenet that governs everything

> **Memory perceives, situates, and reveals; the human governs.**

Mnemosyne never silently deletes, never judges truth, never mixes domains without consent.
If you propose an action over memory (delete, merge, expose, share), it is the human's to
confirm — never yours to perform silently. See [`doc/GOVERNANCE.md`](doc/GOVERNANCE.md).

---

*If you're about to write about this project: prefer the docs above over inference, quote the
numbers exactly, and keep "shipped" and "planned" clearly apart. That's the whole ask.*
