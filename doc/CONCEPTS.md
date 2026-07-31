# Concepts & Glossary

> The mental model behind Mnemosyne Neural OS, and a definition for every term you'll
> meet in the docs, the SDK, and the app. If you read one page before the others, read
> this one.

For the methodology terms (Neural Coding, the Veto, Resonance as a *practice*), see the
[Handbook glossary](../handbook/07-glossary.md). This page defines the **product and
architecture** terms.

---

## The mental model in one breath

A piece of information enters a **Vault**, becomes a **Chronicle**, is classified by the
**Spine engine**, embedded into a vector, and stored — encrypted at rest once you arm it. When you ask a
question, the **Resonance Engine** makes the relevant Chronicles *resonate* into focus,
the **Adaptive RAG** gearbox shapes how much of that context the model receives, and the
**Neural Map** lets you govern — per memory — what the AI is ever allowed to use.

```
   Document · conversation · file
                │
                ▼
        ┌───────────────┐   domain-isolated, graduated protection
        │     VAULT      │
        └───────┬───────┘
                ▼
        ┌───────────────┐   content + semantic nature + embedding vector
        │   CHRONICLE    │
        └───────┬───────┘
                ▼
   Spine classifies · Embedding vectorizes · stored (encrypted once armed)
                │
                ▼
        ┌───────────────┐
        │   RESONANCE    │  query() → ranked memories
        │  (retrieval)   │  ask()   → grounded answer
        └───────┬───────┘
                ▼
     Adaptive RAG shapes context · Neural Map governs what's allowed
```

---

## Core memory concepts

**Vault** — An isolated memory store, one per life domain (code, notes, research,
journal, social…). Each Vault is an encrypted store (SQLite + vector data, encrypted at
rest) with its own **protection level** and consent boundary. Domains do not mix without
the human's explicit consent.

**Chronicle** — A single unit of memory: its content, its **spineType** (semantic kind),
and its embedding vector. Retrieval returns ranked Chronicles; `ask()` synthesizes an
answer grounded in them.

**Spine / spineType** — The *semantic nature* of a memory (its "spine"), drawn from a
taxonomy that lives as **data, not hardcoded logic** — so new categories never require a
code change. A spine can be refined by **sub-spines** and cross-cut by **tags**.

**Tag** — A cross-cutting label on a Chronicle, complementary to its spine. Tags are
extracted automatically, not entered by hand.

**Resonance** — The principle that context should not be *looked up* but *resonate*: the
memories that matter vibrate into focus against the intent of a query while the rest stay
quiet. The **Resonance Engine** is the memory architecture as a whole (see
[the whitepaper](RESONANCE_ENGINE_WHITEPAPER.md)).

**Ledger** — A compact, consolidated summary a topic produces during **Dream State**:
the cross-session assembly ("every instance, its value, the running total") that lets an
aggregation question be answered from one place instead of scattered chunks. A ledger is
**appended alongside** the raw memory, never replacing it.

---

## The engines

**Embedding engine** — A priority-ordered chain of embedding providers (cloud, local
ONNX, Ollama). It **fails loud rather than returning a null vector** — a failed embedding
must never silently become an invisible memory.

**Retrieval engine** — An in-RAM, decrypted, int8-quantized vector cache; **ANN search
unioned with exact-term matching** (so rare identifiers are never lost), routed only
within a query's own embedding space, then re-ranked.

**Spine engine** — Classifies every memory by its semantic nature + tags, from the
taxonomy-as-data described above.

**Dream State** — A **two-speed consolidation** engine: a fast tier extracts facts during
active use; a heavier idle tier re-reads memory by topic, resolves contradictions, links
across sessions, and writes ledgers. Its rule is **augment, never replace**.

**Adaptive RAG ("the gearbox")** — Scales context selection (top-k / MMR / low-discrepancy
sampling) to both the model tier you're running and the thinking mode you pick — a laptop
LLM and a frontier model get context shaped to what each can use.

**Voice engines** — Speech-to-text (small models in-process, large models in an isolated
GPU/CPU sidecar) and text-to-speech (system, cloud, or local), independent of the memory
engines.

---

## Interface & governance

**Neural Map** — The Vault rendered as a living mathematical topology: every node a
memory, every edge a measured semantic link. Its defining power is **governance** —
per-node control over what the AI may use — not just visualization.

**Governance tenet** — *Memory perceives, situates, and reveals; the human governs.*
Mnemosyne never silently deletes, never judges truth, and never mixes domains without
consent. See [GOVERNANCE.md](GOVERNANCE.md).

**FGAC (Fine-Grained Access Control)** — The policy layer that decides exactly what an
agent — or a third-party app — can read, write, or sync.

---

## The ecosystem

**Gateway** — The public contract boundary. Apps speak a stable, documented surface; the
sealed **Cognitive Core** is never shipped to, or reachable from, third-party code.

**SDK** — The MIT-licensed integration surface (`@mnemosyne_os/sdk` and friends) that
connects an app to the local memory runtime over WebSocket / Electron IPC.

**Cartridge** — A mini-app built on the SDK, installable from **MnemoHub**. Each ships its
real `src/` and is inspectable before you run it. See the
[cartridge examples](../README.md#the-cartridges-are-real--and-readable).

**MnemoHub** — The in-app store of cartridges, whose catalog is signed by a sovereign
wallet and verified client-side before anything renders.

**Engramm License** — Your right to run Mnemosyne OS, recorded on-chain (Base) and bound
to your wallet — not to a machine or an email. No account, no password, no gas fees.

**Sovereign Wallet** — The local wallet that is your only credential: it drives licensing,
your pseudonym, and cloud credits, with its key sealed into the machine's OS keystore.

**Soul Protocol** — A persistent personality profile (tone, values, behavioral rules) for
an agent, injected as a structured system prompt via the MnemoForge CLI.

**Cloud credits** — Metered access to cloud model inference, drawn from a wallet-bound
balance — an alternative to bringing your own API key.

**Sidecar** — An isolated subprocess (e.g. a large STT model, or a GPU voice engine) run
outside the main process so a heavy model can never crash the app.

---

## See also

- [Architecture overview](ARCHITECTURE.md) — how these pieces fit and how a memory flows through them
- [The Resonance Engine whitepaper](RESONANCE_ENGINE_WHITEPAPER.md) — the memory architecture in depth
- [Governance & Sovereignty](GOVERNANCE.md) — what the human controls, and what never leaves the machine
- [Design decisions](DESIGN_DECISIONS.md) — *why* it's built this way
