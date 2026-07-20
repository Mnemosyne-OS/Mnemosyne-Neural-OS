# Architecture Overview

> How Mnemosyne Neural OS fits together — the process model, the engines, and the path a
> single memory takes from ingestion to a grounded answer. For the memory engine in depth,
> see [the Resonance Engine whitepaper](RESONANCE_ENGINE_WHITEPAPER.md); for terminology,
> [Concepts & Glossary](CONCEPTS.md).

---

## 1. Why "OS"

Mnemosyne is called an operating system because it does what an OS does: it **manages
resources on behalf of processes that shouldn't have to manage them themselves.** Where
Linux manages CPU, RAM, disk, and network for programs, Mnemosyne manages **memory,
context, compute routing, hardware dispatch, I/O, security, and persistence** for AI
agents. (The full analogy, and its MemGPT lineage, is in the
[README](../README.md#why-call-it-an-os).)

---

## 2. Process model

The flagship app is an Electron application with a strict three-tier boundary. The
renderer never touches the file system, AI providers, or Node directly — everything
crosses through a validated bridge.

```
┌────────────────────────────────────────────────────────────┐
│  RENDERER  (React · TypeScript strict · Vite)              │
│  UI, state, the Neural Map, chat, the Spatial Canvas        │
│  contextIsolation: true · nodeIntegration: false            │
└───────────────────────────┬────────────────────────────────┘
                            │  Context Bridge
                            │  242 Zod-validated IPC channels
                            │  (auto-generated · drift-tested)
┌───────────────────────────▼────────────────────────────────┐
│  MAIN  (Electron / Node)                                   │
│  Services: AI · Vault · Retrieval · Voice · Network · FGAC   │
│  The sealed Cognitive Core lives here, never in the renderer │
└───────────────────────────┬────────────────────────────────┘
                            │  127.0.0.1 only
              ┌─────────────┴─────────────┐
              ▼                           ▼
     SDK WebSocket / IPC            MCP server
     (cartridges & apps)           (external agents)
```

Security posture, at a glance (details in [GOVERNANCE.md](GOVERNANCE.md) and the
[IPC Security Bridge](IPC_SECURITY_BRIDGE.md)):

- `contextIsolation: true`, `nodeIntegration: false` on every window; `sandbox` is on for
  web content and relaxed only for local-AI worker windows, compensated by context
  isolation + Zod-validated IPC.
- Every IPC channel is explicitly declared and Zod-validated, with audit logging.
- A strict Content Security Policy; no telemetry without consent.

---

## 3. The engines

Mnemosyne's memory is not one "AI" black box — it is a set of independent, purpose-built
engines (each is described conceptually in [Concepts](CONCEPTS.md) and in depth in the
[whitepaper](RESONANCE_ENGINE_WHITEPAPER.md)):

| Engine | Job |
|---|---|
| **Embedding** | Turn content into vectors via a provider chain; fail loud, never a null vector |
| **Spine** | Classify each memory by semantic nature + tags, from a taxonomy-as-data |
| **Retrieval** | In-RAM int8 vector cache · ANN ∪ exact-term · dimension-aware · re-rank |
| **Dream State** | Two-speed idle consolidation into ledgers; augment, never replace |
| **Adaptive RAG** | Shape how much context reaches the model (top-k / MMR / low-discrepancy) |
| **Voice** | Independent STT/TTS, large models isolated in a sidecar |

---

## 4. The life of a memory

**On ingestion**

1. A document, conversation, or file enters a **Vault** (chosen by domain).
2. It is split into coherent chunks and becomes one or more **Chronicles**.
3. The **Spine engine** classifies each Chronicle's semantic nature and tags.
4. The **Embedding engine** vectorizes it (retrying across providers, failing loud).
5. It is stored — content and vector — in the Vault's **encrypted-at-rest** store.
   Unchanged content is never re-embedded (content-hash incremental indexation).

**On a question**

6. The query is embedded in the same space it will be compared against.
7. The **Retrieval engine** generates candidates by ANN, **unioned with exact-term**
   matches, refuses cross-space comparisons, and re-ranks.
8. **Dream State** ledgers surface through a reserved tier *appended after* the raw
   results — never evicting them.
9. The **Neural Map / FGAC** governance layer removes anything the human has excluded,
   *before* injection.
10. **Adaptive RAG** selects how much of the surviving context to inject, scaled to the
    model and the thinking mode.
11. The model answers, grounded, with source attribution the user can see.

At no point does a query reach memory the human has turned off, and at no point is raw
memory silently overwritten by a summary.

---

## 5. The open surface

Everything above the **Gateway** is yours to build on; the Cognitive Core below it stays
sealed and is never shipped to third-party code.

- **SDK** (`/packages`, MIT) — connect apps, build skins, scaffold projects, evaluate.
- **MnemoForge CLI** (`/cli`, MIT) — give any agent persistent memory, an identity, and a
  publish pipeline.
- **Cartridges** — mini-apps on the SDK, installable from MnemoHub, source-inspectable.

See the [README](../README.md#build-on-mnemosyne-os) and the
[cartridge boilerplate](../examples/cartridge-boilerplate).

---

## See also

- [Concepts & Glossary](CONCEPTS.md)
- [The Resonance Engine whitepaper](RESONANCE_ENGINE_WHITEPAPER.md)
- [Governance & Sovereignty](GOVERNANCE.md)
- [Design decisions](DESIGN_DECISIONS.md)
- [IPC Security Bridge](IPC_SECURITY_BRIDGE.md)
