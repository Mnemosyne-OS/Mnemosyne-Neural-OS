# 02 — Pillar 1: Intention Articulation

> *"One of these is a vibe prompt. The other produces a system that survives contact with reality."*

---

## The Most Important Skill in Neural Coding

Of the three pillars, Intention Articulation is the one that determines everything else. You cannot compensate for poor intention articulation with better judgment. You cannot veto what you never evaluated. Everything starts here.

**Intention Articulation is the ability to translate a complex goal into a precise, constraint-aware description that leaves no meaningful ambiguity for the AI to fill in incorrectly.**

---

## The Anatomy of a Good Intention

A well-articulated intention describes four things:

1. **The happy path** — what should happen when everything works
2. **The failure paths** — what should happen when each thing doesn't work
3. **The constraints** — what are the non-negotiable boundaries (security, privacy, cost, performance)
4. **The observable result** — how will you know the implementation is correct?

Most people describe only #1. The gap between a good Neural Coder and a struggling one is usually the depth of their failure path and constraint thinking.

---

## A Worked Example

**Goal:** Build a semantic search engine for the vault.

### Vibe Version
> "Build a semantic search engine that lets me search my notes by meaning, not just keywords."

This will produce something. It will probably work in the demo. It will fail in production.

### Neural Coding Version
> "Build a semantic search engine with these constraints:
>
> **Provider cascade (in priority order):**
> 1. Ollama local — no internet, no key required, no cost. Try all installed models.
> 2. Jina AI (jina-embeddings-v3) — free 1M tokens/month, supports query vs. passage mode
> 3. Cohere (embed-multilingual-v3.0) — multilingual, free 1000 req/month
> 4. Gemini (gemini-embedding-001) — Google API key required
> 5. OpenAI (text-embedding-3-small) — last resort only
>
> **Failure handling:**
> - If all providers fail: throw `RESONANCE_NO_EMBEDDING_PROVIDER` with recovery instructions
> - If Ollama is running but no embedding model is installed: log the solution (`ollama pull nomic-embed-text`), then continue to cloud providers
> - If the user has activated local-only mode: fail immediately at stage 1 without trying cloud
>
> **Dimension mismatch:**
> - The index stores the embedding dimension used. If the current query uses a different provider (different dimension), detect the mismatch before scoring and fall back to text scoring — never compute cosine similarity between incompatible vectors.
>
> **Observable result:** running `search('quantum computing')` returns results sorted by semantic relevance, with a snippet showing why the result matched, and metadata including `_dimMismatch: true` if text fallback was used."

This version produces the Embedding Cascade.

---

## Why Most People Fail at This

### They describe what they want, not what they don't want.

The AI will always produce *something*. If you only describe the success case, the AI has no guidance on failure behavior — and will invent it. What it invents is usually optimistic.

Explicitly describe: "if X fails, do Y, not Z."

### They omit the constraints that feel obvious.

If you care about privacy, say so explicitly. The AI doesn't know you care unless you say. "Never call any external API in local-only mode" is obvious to you, invisible to the AI.

### They think in features, not in states.

Features describe what the system does. States describe what the system *is* at any moment, and what it should do in each state.

Bad: "The system should search notes."
Better: "The system can be in these states: index empty, indexing in progress (abortable), index ready, index outdated. In each state, search should behave as follows..."

### They don't describe the error experience.

What does the user see when something fails? This is a requirement. The AI will not invent a good one for you.

---

## The Constraint Inventory

Before writing a description, walk through this checklist:

| Category | Questions to Answer |
|----------|---------------------|
| **Privacy** | What data can leave the device? What must stay local? |
| **Performance** | What is acceptable latency? What is the ceiling? |
| **Cost** | Are there free-tier limits? Who pays if they're exceeded? |
| **Security** | Who can call this? What inputs must be sanitized? |
| **Failure** | What happens when each dependency fails? |
| **Concurrency** | What if this runs twice at once? |
| **Recovery** | How does the user know something went wrong? What do they do about it? |
| **Observability** | What should be logged? What should be silent? |

You do not need to answer all of these for every feature. But you need to have asked them.

---

## Practice: The Five-Why Method for Constraints

For any requirement, ask "what happens if this fails?" five times. Each answer usually reveals a constraint you hadn't articulated.

> "The search should return results."
> → What if the index is empty? *Tell the user to run indexation.*
> → What if indexation is running? *Return empty with a status message.*
> → What if the embedding provider is down? *Fall back to text search.*
> → What if even that fails? *Return empty with an error message.*
> → What if the user is in offline mode? *Never attempt cloud fallback.*

Five questions. Five behaviors. This is Intention Articulation.

---

## A Note on Length

Good intention descriptions are long. This is not a deficiency. It is the point.

The length of a Neural Coding description is proportional to the precision of the system it will produce. Short descriptions produce approximate systems. Precise descriptions produce precise systems.

Write long. Refine later. Never confuse brevity with clarity.

---

*Next: [Architectural Judgment →](./02-architectural-judgment.md)*  
*Previous: [What Is Neural Coding ←](../01-what-is-neural-coding.md)*
