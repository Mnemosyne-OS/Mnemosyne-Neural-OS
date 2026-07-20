# Design Decisions

> The *why* behind Mnemosyne's architecture — the choices that were deliberate, and the
> reasoning (and trade-offs) behind each. Lightweight ADR-style entries; each is a decision
> we'd defend, not a default we drifted into.

---

### D1 — Open core, sealed engine

**Decision.** The developer surface (SDK, CLI, contracts, examples) is MIT and open. The
Cognitive Core — the memory engines behind the benchmark numbers — is proprietary and never
shipped to third-party code.

**Why.** Everything you need to *build* is open; what stays sealed is the part that took
years of full-time R&D. Keeping it proprietary is what lets an independent lab sustain the
project and fund the open ecosystem around it, instead of handing a hard-won engine to
anyone who would re-skin it. The boundary is the **Gateway**: apps speak a stable public
contract, the core stays behind it.

**Trade-off.** You cannot read the engine's source. In exchange you get a stable surface
that won't break under you, and a benchmark you can [recompute yourself](../README.md#proven-on-longmemeval-m--not-just-a-pitch).

---

### D2 — Local-first, cloud-optional

**Decision.** The default is that everything — ingestion, embedding, retrieval, and (with a
local model) inference — runs on the user's machine. Cloud is opt-in and per-request.

**Why.** Memory is the most personal data an AI touches. Sovereignty can't be a policy
promise; it has to be the *default behavior*. Local-first also means no vendor lock-in and
real offline operation.

**Trade-off.** Local models are weaker than frontier cloud models — which is exactly why
the [gearbox (D7)](#d7--adaptive-rag-scale-context-to-the-model) exists.

---

### D3 — Fail loud, never a null vector

**Decision.** If no embedding provider can vectorize a chunk, the system surfaces the
failure. It never stores an un-embeddable memory with a null/zero vector.

**Why.** A memory with no usable vector is an **invisible memory** — it's in the vault but
can never be retrieved, and the user never knows. A silent gap in memory is worse than a
visible error. Failing loud keeps the vault honest.

---

### D4 — Augment, never replace (consolidation)

**Decision.** Dream State's consolidated ledgers are *appended alongside* raw memory, never
substituted for it. On the read path, consolidated output surfaces through a reserved tier
appended *after* the raw results — it never evicts a raw session.

**Why.** We measured it: replacing raw memory with summaries was a net loss. Summaries win
on *aggregation* ("how many across the year"); raw wins on *exact fact*. Keeping both, and
letting each answer what it's good at, beat either alone. It's also a governance property —
a consolidation the human can inspect and revoke, never a silent deletion.

---

### D5 — ANN unioned with exact-term matching

**Decision.** Candidate retrieval is approximate-nearest-neighbor vector search **unioned
with** an exact-term match set — not vector search alone.

**Why.** Pure vector search is fuzzy by design; it will miss a rare identifier, codename, or
proper noun that doesn't sit near the query in embedding space. Unioning in exact-term
matches guarantees those are never lost, while the vector side still captures meaning. You
get *what it means* and *the exact string you named*.

---

### D6 — Dimension-aware routing (model-switch safety)

**Decision.** A query is only ever compared against vectors from its own embedding space.
Mismatched spaces are refused, not silently compared.

**Why.** Comparing vectors from two different embedding models produces garbage that *looks
like* a score. If a user switches embedding models, naive systems quietly corrupt every
retrieval. Refusing the cross-space comparison turns a silent corruption into an honest,
handled case (with a text fallback) — retrieval you can trust after a model change.

---

### D7 — Adaptive RAG: scale context to the model

**Decision.** Context selection is not a fixed top-N. A "gearbox" scales how much context is
injected — and how it's selected (top-k / MMR / low-discrepancy) — to both the model tier
and the thinking mode.

**Why.** More context is not better context. A weak local model *drowns* in a flood of
diffuse sources ("lost in the middle"); a frontier model can use a rich, diverse set. One
setting can't serve both. The gearbox gives a small model few, tightly-filtered sources and
a large model a broad set — the right amount for what each can actually synthesize.

---

### D8 — Taxonomy as data, not code

**Decision.** The Spine taxonomy (semantic natures, sub-spines, tags) lives as **data**. Its
weights, colors, and consolidation buckets all derive from that one source of truth.

**Why.** Classification schemes evolve. If every new category needs a code change and a
release, the taxonomy ossifies. As data, it can grow with how people actually use their
memory — no deploy required.

---

### D9 — The topology *is* the meaning (Neural Map)

**Decision.** In the Neural Map, node positions come from the mathematics of a chosen
topology (Enneper surface, Klein bottle, Lorenz attractor, Clifford torus…), not from a
generic force-directed layout.

**Why.** A force-directed blob says nothing — it's the same shapeless cloud for every vault.
Winding memory onto a real mathematical surface makes structure *legible*: the equation is
the shape, and the shape carries meaning you can read. Memory made visible has to be worth
looking at.

---

### D10 — Ownership, not a subscription (Engramm)

**Decision.** The right to run Mnemosyne is an **Engramm** recorded on-chain (Base) and
bound to your wallet — not an account with a monthly bill, and not tied to a machine or an
email.

**Why.** You should *own* your copy and carry it to any device, and anyone should be able to
verify it — without a company account that can be breached, revoked, or lost. The chain is
plumbing for verifiable ownership; it's **gasless and crypto-free** for the user, so there's
no token to manage and no fee to pay just to hold or check your license.

---

### D11 — The human governs

**Decision.** Every consequential act over memory — deletion, cross-domain mixing, exposure,
permission changes — is the human's to make. The system perceives, situates, and reveals;
it proposes, it never performs silently.

**Why.** An AI that can quietly forget, merge, or share your memory is not sovereign — it's a
liability wearing a helpful face. Putting the human at every irreversible edge is what makes
the memory *yours*. See [GOVERNANCE.md](GOVERNANCE.md).

---

## See also

- [Concepts & Glossary](CONCEPTS.md) · [Architecture](ARCHITECTURE.md) · [Governance](GOVERNANCE.md)
- [The Resonance Engine whitepaper](RESONANCE_ENGINE_WHITEPAPER.md)
