# The Resonance Engine: A Multi-Engine Cognitive Memory Architecture for Sovereign AI Systems

**Technical Whitepaper — v2.0 · Living document**
**Current as of Mnemosyne Neural OS v1.3.3 · Revised July 2026**
**XPACEGEMS LLC** · Miami, FL 33122, USA
**Author:** Tony Trochet, Founder & Lead Architect
**Status:** Production-deployed · Part of Mnemosyne Neural OS

> This is a living document. It tracks the architecture as it ships, not a frozen
> snapshot — it is revised as the engine evolves. Prior editions described the earlier
> "Resonance/NexusGraph" design; this edition reflects the current multi-engine system.

---

## Abstract

Standard Retrieval-Augmented Generation (RAG) retrieves documents by keyword or vector
similarity — a one-dimensional operation that treats memory as a static lookup table.
The **Resonance Engine** is the cognitive memory architecture of the
[Mnemosyne Neural OS](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS). Its name is its
thesis: memory should not be *looked up*, it should **resonate** — the context that
matters vibrates into focus against the intent of the question, while the rest stays
quiet.

Resonance is not a single module. It is a set of independent, purpose-built engines —
**Embedding**, **Spine**, **Retrieval**, **Dream State**, and **Adaptive RAG** — working
in concert, under a governance layer (**Neural Map**) that lets the user decide what the
AI is allowed to remember. It runs entirely on the user's machine, supports fully offline
operation, and never transmits vault content to external servers without explicit user
configuration. Its retrieval quality is measured, not asserted: see
[§8, Proven on LongMemEval-M](#8-proven-on-longmemeval-m).

---

## 1. The Problem with Standard RAG

In a typical RAG pipeline, documents are chunked into embedding vectors, the query is
embedded, the top-N nearest chunks are retrieved by cosine similarity, and those chunks
are prepended to the model's context. This approach has four well-known limitations.

**1.1 Intent blindness.** Pure vector similarity measures geometric proximity in embedding
space. It does not understand *why* the user is asking, what they have been working on, or
what context surrounds the query. Two questions that sound different but carry the same
intent may retrieve unrelated documents.

**1.2 Static memory.** Standard RAG indexes documents as-is, with no semantic enrichment.
A note is only findable if the query matches its exact words. There is no autonomous
understanding of what a document *means* or how it relates to the rest of the vault.

**1.3 No control plane.** Once indexed, every document participates equally in retrieval.
The user cannot say "this one is confidential — exclude it," or reason about what the AI
is allowed to know. There is no governance over memory.

**1.4 Aggregation blindness.** Because raw chunks are retrieved in isolation, questions
that span *time* — "how many times did I…", "what's the running total across the year" —
fail. The evidence is scattered across dozens of sessions the model never assembles. Pure
retrieval can find *a* fact; it cannot *consolidate* facts.

The Resonance Engine addresses all four.

---

## 2. Architecture Overview

Resonance is realized by five engines, plus a governance plane. Each is independently
purpose-built — not one "AI" black box — and they cooperate across both indexation and
retrieval.

```
┌──────────────────────────────────────────────────────────────────────┐
│                          THE RESONANCE ENGINE                         │
│                                                                       │
│   ┌────────────────────────────────────────────────────────────┐    │
│   │  NEURAL MAP — governance & topology                        │    │
│   │  the vault as a living graph · per-node consent control     │    │
│   └───────────────────────────┬────────────────────────────────┘    │
│                               │ governs                               │
│   ┌───────────────────────────▼────────────────────────────────┐    │
│   │  ADAPTIVE RAG ("the gearbox")                              │    │
│   │  context selection scaled to the model & thinking mode      │    │
│   └───────────────────────────┬────────────────────────────────┘    │
│                               │ selects from                         │
│   ┌───────────────────────────▼────────────────────────────────┐    │
│   │  RETRIEVAL ENGINE                                          │    │
│   │  in-RAM int8 vector cache · ANN ∪ exact-term · re-rank      │    │
│   └──────────────┬───────────────────────────┬─────────────────┘    │
│                  │ enriched by               │ augmented by          │
│   ┌──────────────▼──────────────┐  ┌─────────▼──────────────────┐    │
│   │  SPINE ENGINE               │  │  DREAM STATE               │    │
│   │  semantic nature + tags     │  │  idle consolidation ledgers │    │
│   │  taxonomy-as-data           │  │  augment, never replace     │    │
│   └──────────────┬──────────────┘  └────────────────────────────┘    │
│                  │ built on                                           │
│   ┌──────────────▼─────────────────────────────────────────────┐    │
│   │  EMBEDDING ENGINE                                          │    │
│   │  priority-ordered provider chain · fails loud, never null   │    │
│   └────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. The Embedding Engine

Every memory begins as a vector. The Embedding engine is a **priority-ordered chain of
embedding providers** — cloud, local ONNX, and Ollama — tried in order until one succeeds.

Its defining principle is that it **fails loud rather than returning a null vector.** A
failed embedding must never silently become an invisible memory: if no provider can embed
a chunk, the system surfaces the failure instead of storing an un-retrievable record. The
active model is whatever the user selects in Settings — a single, explicit source of truth,
never a hidden bundled default.

This is what makes offline operation first-class: with a local provider available, the
entire ingestion path runs on the user's machine, and no content leaves it.

---

## 4. The Spine Engine — Semantic Classification

Most knowledge systems ask the user to tag their documents — a discipline that collapses
in practice. Resonance inverts this: **the system classifies memories, not the user.**

The Spine engine assigns every memory a **spine** — its semantic *nature* — refined by
optional sub-spines and cross-cutting *tags*. Crucially, this taxonomy **lives as data,
not as hardcoded logic.** New categories do not require a code change; the taxonomy is the
single source of truth from which ranking weights, visual color, and consolidation buckets
all derive.

The result: a note about "Q1 investor relations, board recap, capital allocation"
classifies itself — its nature and tags become the handles the Retrieval and Dream engines
later resonate against, with no manual curation.

---

## 5. The Retrieval Engine

When the user asks a question, the Retrieval engine is what makes the relevant context
resonate. Its pipeline is a substantial departure from a brute-force cosine scan.

1. **In-RAM, quantized cache.** Vectors are decrypted once into memory when a vault opens;
   the data on disk stays encrypted at rest, on installs where encryption is armed. The
   in-RAM cache is **int8-quantized** so it
   stays small enough to scale to a lived-in vault.

2. **ANN ∪ exact-term.** Candidate generation runs an **approximate-nearest-neighbor**
   vector search **unioned with an exact-term match set.** Vector search finds what a
   query *means*; exact-term matching guarantees that rare identifiers, codenames, and
   proper nouns a pure-vector search would miss are never lost.

3. **Dimension-aware routing.** A query is only ever compared against vectors from its own
   embedding space. Mismatched spaces are refused rather than silently — and wrongly —
   compared, so switching embedding models can never quietly corrupt retrieval.

4. **Re-rank.** A final ranking pass refines the candidate pool before the top fragments
   are injected into the model's context, with source attribution. The user sees, in real
   time, how many sources grounded the response.

---

## 6. Dream State — Consolidation While You're Away

Retrieval finds facts. **Dream State** assembles them. It is a **two-speed consolidation
engine** and the direct answer to §1.4's aggregation blindness.

- A **fast, low-latency tier** extracts facts during active use.
- A **heavier tier runs at idle** — while the machine is quiet — re-reading memory by topic,
  resolving contradictions, and linking evidence *across sessions*. It writes compact
  **ledgers**: a factual summary of a topic that has already done the cross-session
  assembly, so an aggregation question ("how many, how much, across time") is answered from
  a consolidated view instead of scattered chunks.

Its single non-negotiable architectural property is **augment, never replace.** Measured
against the alternative, replacing raw memory with summaries was a net loss — so the raw is
always kept, and the ledger is *added alongside it*. On the read path, consolidated output
surfaces through a **reserved tier appended after** the normal results; it never evicts a
raw session. The ledger answers "how many across the year"; the raw still answers the exact
fact. And because every consolidation is a *written* memory, the human can inspect and
revoke it — consolidation is never a silent deletion.

---

## 7. Adaptive RAG — The Gearbox

More context is not better context. Injecting every retrieved candidate drowns a small
local model and wastes a large one. **Adaptive RAG** — the "gearbox" — scales context
selection to *both* the model tier you are running and the thinking mode you pick.

Rather than a fixed top-N, it selects with mechanisms including **top-k, MMR (maximal
marginal relevance), and low-discrepancy sampling** — trading raw relevance against
diversity so the injected set covers the question without redundancy. A laptop LLM and a
frontier cloud model receive context shaped to what each can actually use.

---

## 8. Proven on LongMemEval-M

Resonance is measured against a public, independent benchmark rather than asserted.

|  |  |
|---|---|
| **64.6 % → 72.9 %** | overall accuracy, full-haystack (hard) variant |
| **1/8 → 5/8** | multi-session recall — the category that actually needs a memory engine |

[LongMemEval](https://github.com/xiaowu0162/LongMemEval)'s **full-haystack** variant
surrounds every question's evidence with ~480 distractor sessions — the closest published
setup to a real, lived-in memory vault, and harder than the `-S` slice most reported
numbers use.

**72.9 % is a stated lower bound** — only the multi-session category was re-run with the
full engine; other categories weren't retried yet. And the number is not asked for on faith:
the published grader and per-question verdicts let anyone **audit the score in one
command, no engine and no network.** Every counted HIT was replayed and reproduced before
being counted — no cherry-picked runs.

The evidence is archived and citable, not just linked: the per-question ledgers, the
scoring scripts and the raw run logs are deposited under
**[DOI 10.5281/zenodo.21727140](https://doi.org/10.5281/zenodo.21727140)** (CC BY 4.0).

**→ [Audit it yourself — live results](https://mnemosyne-os.github.io/MnemosyneOS---benchmarks/verification-kit/)**
&nbsp;·&nbsp; [raw logs & methodology](https://github.com/Mnemosyne-OS/MnemosyneOS---benchmarks)

The jump from 1/8 to 5/8 on multi-session recall is the point: it is precisely the category
that a memory *engine* — consolidation plus cross-session linking — exists to fix.

---

## 9. Governance — Neural Map & Vaults

A memory engine that the user cannot govern is a liability, not a feature. Resonance puts
the human in control at two levels.

**Vaults.** Memory is partitioned by life domain — code, notes, research, journal, social —
each its own store (SQLite + vector data, AES-256 encrypted at rest once armed) with its own protection
level and consent boundary. Retrieval for a given context is scoped to the vaults the user
has allowed; domain isolation is enforced, not advisory.

**Neural Map.** The vault is rendered as a living mathematical topology — every node a
memory, every edge a measured semantic link — that is navigable *and* governable. Its
defining capability is not visualization but **consent**: what the AI may read, write, or
sync is controlled here, per the governing tenet of the whole system — *memory perceives,
situates, and reveals; the human governs.* Exclusions are enforced at the query layer,
before any similarity computation. What the human turns off is invisible to the AI.

Access is further bounded by **Fine-Grained Access Control (FGAC)**, scoped short-lived
tokens, and a Zod-validated IPC boundary (242 explicitly declared channels), so a
third-party app or agent sees only what its manifest was granted — never the core.

---

## 10. Operational Properties

**10.1 Local-first, cloud-optional.** With a local embedding provider and a local chat
model (via Ollama), the entire pipeline — ingestion to answer — runs on the user's machine,
with zero cloud dependency and no data leaving the local environment.

**10.2 Incremental indexation.** Memories are indexed incrementally by content hash. When a
document changes, only the changed document is re-embedded; unchanged content incurs zero
cost and is never needlessly re-processed.

**10.3 Graceful degradation.** The system never fails hard on retrieval. If no embedding
provider is available, retrieval degrades to exact-term matching rather than erroring. If a
query's embedding space does not match the stored one, the mismatch is detected and refused,
not silently miscompared — returning honest results instead of wrong ones.

---

## 11. Differentiators vs. Standard RAG

| Capability | Standard RAG | The Resonance Engine |
|---|---|---|
| Indexation | Manual, no enrichment | Automatic semantic classification (Spine, taxonomy-as-data) |
| Retrieval | Vector similarity only | ANN ∪ exact-term + re-rank (rare terms never lost) |
| Aggregation over time | Fails (scattered chunks) | Dream State consolidation ledgers |
| Context selection | Fixed top-N | Adaptive gearbox (top-k / MMR / low-discrepancy), model-aware |
| Memory control | All-or-nothing | Per-node governance via Neural Map |
| Memory scope | Single flat space | Domain-isolated vaults with consent boundaries + FGAC |
| Provider resilience | Single provider | Priority chain, fails loud (never a null vector) |
| Model-switch safety | Undefined behavior | Dimension-aware routing, refuses cross-space compares |
| Storage | Plaintext index | AES-256 at rest when armed, decrypted in-RAM (int8) only when open |
| Verification | Vibes | Public LongMemEval result, auditable in one command |

---

## 12. Implementation Status

The Resonance Engine is **production-deployed** in Mnemosyne Neural OS (current: v1.3.3).

| Engine / component | Status |
|---|---|
| Embedding engine (provider chain, fail-loud) | ✅ Production |
| Spine engine (taxonomy-as-data classification) | ✅ Production |
| Retrieval engine (in-RAM int8 cache, ANN ∪ exact-term, re-rank) | ✅ Production |
| Dream State (two-speed consolidation, augment-never-replace) | ✅ Production |
| Adaptive RAG / gearbox (model- & mode-aware selection) | ✅ Production |
| Neural Map (topology + per-node governance) | ✅ Production |
| Vaults (domain isolation, FGAC) | ✅ Production |
| Encryption at rest (AES-256 / SQLCipher, user-armed, 24-word recovery) | ✅ Production — v1.3.5, off until armed |
| Local-only mode (Ollama, zero cloud) | ✅ Production |

---

## 13. Future Directions

- **Soul-weighted resonance** — Soul Profiles (personality configurations of reasoning
  style and behavioral constraints) that color *how* memory resonates, not just what the
  model is told: a profile tuned for strategic analysis weights recent, high-priority,
  action-oriented fragments more heavily, while a creative profile relaxes scoring to let
  lower-confidence associations surface. The profile system exists today (Soul Protocol);
  wiring it into the retrieval-scoring path is designed and lands in a future update.
- **Temporal weighting** — fragments from recent sessions weighted to reflect the user's
  current focus.
- **Confidence decay** — consolidated summaries lose confidence as their source memories
  age or change.
- **Fully local night-time consolidation** — running the heavier consolidation tier on a
  local reasoning model, so even the "dreaming" needs no cloud (a direction, not yet shipped).
- **Federated resonance** — P2P synchronization of memory between trusted peers over a
  sovereign libp2p transport, enabling shared team memory with no central server.
- **Nonce-based CSP** — removing `unsafe-inline` while preserving the dynamic theme system.

---

## 14. Conclusion

The Resonance Engine is a departure from the prevailing RAG paradigm. Where standard
retrieval is a one-dimensional lookup, Resonance is a cooperative system of engines:
memories classify their own semantic nature, an approximate-plus-exact search locates
proximity across the whole space, idle consolidation assembles facts across time, a gearbox
shapes context to the model, and the human governs — with per-node precision — what the AI
is and is not allowed to know.

The result is a memory architecture that is more intelligent (it understands what memories
mean), more capable (it retrieves by intent and consolidates across time), more sovereign
(the user controls every node, offline if they choose), more resilient (it degrades
gracefully and never corrupts on a model switch), and — uniquely — **measured**, on a
public benchmark anyone can audit.

Resonance is not a feature. It is the cognitive substrate on which Mnemosyne Neural OS is
built — the reason context *resonates* into the right answer instead of being looked up.

---

## About

**XPACEGEMS LLC** — Independent AI Software Lab
Miami, FL 33122, USA

**Tony Trochet** — Founder & Lead Architect
[LinkedIn](https://www.linkedin.com/in/tony-t-19544650/) · [GitHub @yaka0007](https://github.com/yaka0007)

**Part of:** [Mnemosyne Neural OS](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS)
**Built through Neural Coding:** human-architected, with Claude (Anthropic), Antigravity (Google DeepMind), and Cursor directed as instruments.

---

*© 2026 XPACEGEMS LLC. All rights reserved.*
*This whitepaper describes the architecture and design philosophy of the Resonance Engine. No source code is disclosed herein. The Mnemosyne Neural OS platform is proprietary software.*
*The MnemoForge CLI, a companion scaffolding tool, is separately available under the MIT License.*
