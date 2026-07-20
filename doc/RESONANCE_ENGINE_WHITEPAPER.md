# The Resonance Engine: A Multi-Layer Cognitive Memory Architecture for Sovereign AI Systems

**Technical Whitepaper — v1.0**  
**XPACEGEMS LLC** · Miami, FL 33122, USA  
**Author:** Tony Trochet, Founder & Lead Architect  
**Date:** April 2026  
**Status:** Production-deployed · Part of Mnemosyne Neural OS v1.0

---

## Abstract

Standard Retrieval-Augmented Generation (RAG) systems retrieve documents by keyword or vector similarity — a one-dimensional operation that treats memory as a static lookup table. The **Resonance Engine** is a cognitive memory architecture built for the [Mnemosyne Neural OS](https://github.com/yaka0007/Mnemosyne-Neural-OS) that operates across three simultaneous layers: *semantic crystallization*, *multi-dimensional vector retrieval*, and *interactive graph control*. The result is a system that does not simply retrieve information — it perceives relevance, organizes knowledge autonomously, and allows the user to govern what the AI is allowed to remember.

Resonance operates entirely on the user's local machine, with support for fully offline operation via local embedding models. No vault content is transmitted to external servers without explicit user configuration.

---

## 1. The Problem with Standard RAG

Retrieval-Augmented Generation has become the dominant approach for grounding AI responses in personal or organizational knowledge bases. In a typical RAG pipeline:

1. Documents are chunked and converted to embedding vectors
2. A user query is also converted to a vector
3. The system retrieves the N chunks with the highest cosine similarity
4. These chunks are prepended to the AI's context as "retrieved memory"

This approach has three well-known limitations:

**1.1 Intent Blindness**  
Pure vector similarity measures geometric proximity in embedding space. It does not understand *why* a user is asking, what emotional or strategic context surrounds the query, or what the user has been working on recently. Two queries that sound different but carry the same intent may retrieve completely unrelated documents.

**1.2 Static Memory**  
Standard RAG indexes documents as they are — with no semantic enrichment. A document about "the Brazil project status update from last Tuesday" is only findable if the user's query semantically matches those exact words. There is no autonomous understanding of what the document *means*, what topics it covers, or how it relates to other documents.

**1.3 No User Control Plane**  
Once indexed, all documents participate equally in retrieval. Users cannot tell the system "this document is confidential — exclude it from AI context" or "these two projects should share memory during this session." There is no governance layer over what the AI is allowed to know.

The Resonance Engine addresses all three.

---

## 2. Architecture Overview

The Resonance Engine is composed of three interlocking layers that work in concert during both indexation and retrieval.

```
┌─────────────────────────────────────────────────────────────┐
│                    RESONANCE ENGINE                          │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  LAYER 3 — NexusGraph Control Plane                 │   │
│  │  Interactive graph · Node enable/disable ·          │   │
│  │  Exclusion lists · Visual vault topology            │   │
│  └─────────────────────┬───────────────────────────────┘   │
│                        │ governs                             │
│  ┌─────────────────────▼───────────────────────────────┐   │
│  │  LAYER 2 — Vector Memory (Global Index)             │   │
│  │  Multi-provider embedding cascade (5 providers)     │   │
│  │  Cosine similarity · Tag boost · Text fallback      │   │
│  │  Dimension-aware · Local-first · Adaptive delay      │   │
│  └─────────────────────┬───────────────────────────────┘   │
│                        │ enriched by                         │
│  ┌─────────────────────▼───────────────────────────────┐   │
│  │  LAYER 1 — Semantic Crystallization                 │   │
│  │  LLM-driven tag + summary extraction per chunk      │   │
│  │  Paragraph-level chunking · Hashtag normalization   │   │
│  │  Multi-provider (Ollama → Gemini) · Rate-aware      │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Layer 1 — Semantic Crystallization

### 3.1 The Problem with Manual Tagging

Most knowledge management systems require users to manually tag their documents — a discipline that breaks down quickly in practice. Notes accumulate without tags; the knowledge base becomes an opaque blob that neither the user nor the AI can navigate.

Resonance's Crystallization layer inverts this assumption: **the AI tags the documents, not the user.**

### 3.2 How It Works

When a new document is added to the MnemoVault, the Crystallization engine:

1. **Chunks the document** into coherent paragraphs of 200–4,000 characters, preserving semantic boundaries
2. **Calls a language model** (local via Ollama or cloud via Gemini) with a structured extraction prompt
3. **Extracts 3–8 semantic hashtags** and a one-sentence summary from each chunk
4. **Normalizes and deduplicates** the tags (e.g., `AI Research`, `#AI-Research`, `ai_research` → unified `#ai_research`)
5. **Stores enriched entries** in the project's `RESONANCE_INDEX.json`, mapping each hashtag to the source chunks and documents

The result: a document about "Q1 investor relations, board meeting recap, capital allocation discussion" automatically crystallizes into tags like `#investor_relations`, `#board_meeting`, `#capital_allocation` — without the user doing anything.

### 3.3 Sovereign by Design

The Crystallization engine operates with a strict **local-first cascade**:
- **Ollama** (local, no network, no API key) — attempted first
- **Gemini API** — fallback if Ollama is unavailable, with exponential backoff on rate limits

When operating in Local mode, no document content leaves the machine.

---

## 4. Layer 2 — Multi-Dimensional Vector Memory

### 4.1 The Global Index

Resonance maintains a persistent `resonance.index.json` in the user's application data directory. This index stores, for each indexed document:

- The document's content hash (for change detection — unmodified files are never re-embedded)
- The embedding vector (768D to 1024D depending on the provider)
- A 1,000-character text preview
- Semantic tags (inherited from Layer 1)
- Optional priority weight

This index is never transmitted anywhere. It lives entirely on the user's disk.

### 4.2 The Embedding Provider Cascade

To guarantee that Resonance works for every user — whether they have cloud API keys or not — the system implements a **5-provider sequential cascade**:

| Priority | Provider | Dimension | Requires |
|----------|----------|-----------|----------|
| 1 | Ollama (local) | 768–1024D | Local install |
| 2 | Jina AI | 768D | Free API key |
| 3 | Cohere | 1024D | Free API key |
| 4 | Gemini | 768D | Google API key |
| 5 | OpenAI | 1536D | OpenAI API key |

The system automatically detects which providers are available at runtime and selects the first working provider. The provider used is recorded in the index metadata to prevent dimension mismatches on subsequent searches.

### 4.3 The Retrieval Pipeline

When a user sends a message in MnemoBrain (Mnemosyne's AI chat), the Resonance Engine intercepts the query and performs:

1. **Hashtag extraction** — identifies any `#tags` in the query
2. **Semantic vector generation** — the query text is embedded using the same provider cascade (using `query` mode for asymmetric models like Jina)
3. **Multi-factor scoring** for each indexed document:
   - **Cosine similarity** — vector proximity to the query (primary signal)
   - **Tag boost** — additional weight if hashtags in the query match crystallized tags
   - **Text fallback** — keyword-based scoring for zero-vector or dimension-mismatch situations
   - **Priority weight** — user-assigned document importance
4. **Dimension safety** — if the index was built with a different embedding provider than the current query, the system gracefully falls back to text matching and warns the user
5. **Ranked injection** — the top-N memory fragments are injected into the AI's system prompt with source attribution

The user sees in real time how many sources were used in the response.

### 4.4 Adaptive Rate Control

Cloud providers impose rate limits. Resonance implements **adaptive delay**:
- Local embeddings (Ollama): 50ms between documents
- Cloud embeddings: 1,200ms between documents (respects ~50 req/min quotas)

Indexation also supports **abort-at-next-file** — the user can interrupt a long indexation without data corruption.

---

## 5. Layer 3 — The NexusGraph Control Plane

### 5.1 Making the Invisible Visible

A knowledge vault is only useful if its topology is navigable. NexusGraph is Resonance's visual interface — a real-time, interactive graph where every indexed document is a node, and edges represent thematic proximity derived from shared crystallized tags.

### 5.2 Active Memory Control

The defining capability of NexusGraph is not visualization — it is **governance**. Each node in the graph can be:

- **Enabled** (default) — the document participates in memory retrieval
- **Disabled** — the document is excluded from all future retrieval, persisted across sessions in `resonance.excluded.json`

This allows the user to say, permanently, "Mnemosyne, you are not allowed to use this document as memory." The AI becomes governable at the document level.

This is not a soft preference — exclusions are enforced at the query layer, before any similarity computation. Excluded documents are invisible to the AI.

---

## 6. Multi-Resonance: Project-Scoped Memory with Bridges

### 6.1 The Problem with a Single Memory Space

A knowledge worker operates across multiple contexts — client projects, personal research, strategic planning, creative work. A single undifferentiated memory space creates noise: material from one project bleeds into AI responses for another.

Resonance introduces **Project Resonance** — each project has an isolated `RESONANCE_INDEX.json` that is independent of the global vault index.

### 6.2 Project Isolation and Selective Bridging

When a project is loaded in Mnemosyne, the AI's memory is scoped exclusively to that project's index. Cross-project contamination is architecturally impossible without explicit configuration.

The **Resonance Bridge** mechanism allows the user to declare, on demand, that two projects should share memory during a session. Bridges are:
- **Instantaneous** — no re-indexation required; the bridge merges existing indexes in memory
- **Bi-directional** — each project contributes its crystallized knowledge to the other
- **Session-scoped** — bridges do not persist by default; each session starts clean

This enables workflows like: *"For today's meeting, let me merge my Product Strategy project memory with my Investor Relations project memory."*

---

## 7. Soul Profile Integration

Resonance does not operate in a vacuum. Mnemosyne's **Soul Profiles** — AI personality configurations that define reasoning style, emotional context, and behavioral constraints — influence how retrieved memory fragments are weighted and presented.

A Soul Profile configured for "strategic analysis" will cause Resonance to weight high-priority, recent, and action-oriented fragments more heavily. A profile configured for "creative exploration" relaxes scoring constraints and allows lower-confidence associations to surface.

The Soul layer is the closest analog to the "emotional echoes" described in Mnemosyne's design philosophy — a cognitive coloring of what is remembered and how.

---

## 8. Operational Properties

### 8.1 Local-First, Cloud-Optional

Resonance is designed to operate with **zero cloud dependency**:

- Embedding: Ollama models (`nomic-embed-text`, `mxbai-embed-large`, `bge-m3`, etc.)
- Crystallization: Any Ollama-compatible chat model
- LLM inference: Ollama for full local operation

In this configuration, the entire pipeline — from document ingestion to AI response — occurs on the user's machine. No data leaves the local environment.

### 8.2 Incremental Indexation

Documents are indexed incrementally using content hashing. When a document changes, only the changed document is re-embedded — a single API call rather than a full vault re-scan. Unchanged documents incur zero API cost.

### 8.3 Graceful Degradation

The system never fails hard. If no embedding provider is available, retrieval degrades gracefully to keyword matching. If provider dimensions mismatch (e.g., the vault was indexed with Gemini and retrieved with Ollama), the system warns the user clearly and activates text fallback — returning results rather than errors.

---

## 9. Differentiators vs. Existing RAG Systems

| Capability | Standard RAG | Resonance Engine |
|-----------|-------------|-----------------|
| Indexation | Manual embedding, no enrichment | Semantic crystallization (auto-tagging + summarization) |
| Retrieval | Vector similarity only | Vector + tag boost + text fallback (multi-factor) |
| Memory control | All-or-nothing | Per-document governance via NexusGraph |
| Memory scope | Single flat space | Multi-project isolation with selective bridges |
| Local operation | Rare (most use cloud) | First-class, zero cloud required |
| Provider resilience | Single provider | 5-provider cascade with automatic fallback |
| Rate management | User responsibility | Adaptive delay, backoff, abort-at-next-file |
| Dimension safety | Undefined behavior | Detected, warned, graceful text fallback |
| Soul integration | N/A | Personality-weighted retrieval |
| Graph visualization | N/A | NexusGraph — interactive topology with node control |

---

## 10. Implementation Status

The Resonance Engine is **production-deployed** in Mnemosyne Neural OS v1.0.

| Component | Status | Notes |
|-----------|--------|-------|
| Vector indexation | ✅ Production | 5-provider cascade, incremental, checksum-based |
| Semantic crystallization | ✅ Production | Ollama + Gemini, rate-adaptive |
| NexusGraph visualization | ✅ Production | Real-time, interactive, persistent exclusions |
| Multi-Resonance (project isolation) | ✅ Production | Per-project `RESONANCE_INDEX.json` |
| Resonance Bridges | ✅ Production | On-demand, session-scoped, instant merge |
| Soul Profile integration | ✅ Production | Personality-weighted context injection |
| Local-only mode | ✅ Production | Ollama-only, zero cloud, toggle via UI |
| Strategist context building | ✅ Production | Scoped retrieval for AI planning modules |

---

## 11. Future Directions

- **Temporal weighting** — fragments from recent sessions weighted more heavily to reflect the current focus of the user's work
- **Confidence decay** — crystallized tags degrade in confidence as source documents age or are modified
- **Cross-soul resonance** — different Soul Profiles maintaining independent memory lenses over the same vault
- **Federated resonance** — MnemoSync P2P synchronization of indexes between trusted peers, enabling shared team memory without a central server
- **Nonce-based CSP migration** — removing `unsafe-inline` from the CSP while preserving the dynamic theme system

---

## 12. Conclusion

The Resonance Engine represents a departure from the prevailing RAG paradigm. Where standard retrieval is a one-dimensional lookup, Resonance is a three-layer cognitive system: documents crystallize their own semantic identity, vectors locate proximity across the entire knowledge space, and the user governs — with document-level precision — what the AI is and is not allowed to know.

The result is a memory architecture that is simultaneously more intelligent (it understands what documents mean), more capable (it retrieves by intent, not just similarity), more sovereign (the user controls every node), and more resilient (it runs entirely offline when required).

Resonance is not a feature. It is the cognitive substrate on which Mnemosyne Neural OS is built.

---

## About

**XPACEGEMS LLC** — Independent AI Software Lab  
Miami, FL 33122, USA  

**Tony Trochet** — Founder & Lead Architect  
[LinkedIn](https://www.linkedin.com/in/tony-t-19544650/) · [GitHub @yaka0007](https://github.com/yaka0007)

**Part of:** [Mnemosyne Neural OS](https://github.com/yaka0007/Mnemosyne-Neural-OS)  
**Built through Neural Coding:** human-architected, with Claude (Anthropic), Antigravity (Google DeepMind), and Cursor directed as instruments.

---

*© 2026 XPACEGEMS LLC. All rights reserved.*  
*This whitepaper describes the architecture and design philosophy of the Resonance Engine. No source code is disclosed herein. The Mnemosyne Neural OS platform is proprietary software.*  
*The MnemoForge CLI, a companion scaffolding tool, is separately available under the MIT License.*
