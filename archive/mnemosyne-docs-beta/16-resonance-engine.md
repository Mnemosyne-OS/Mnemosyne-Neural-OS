# The Resonance Engine — Technical Architecture

> *Every message lands in a brain that already knows. Not from this session. From the history of the system.*

---

## Overview

The Resonance Engine is the technical foundation behind Mnemosyne's memory. It is composed of three distinct systems that work together:

1. **The RESONANCE_INDEX** — The semantic memory base (hashtag → summaries)
2. **The Distiller** — A background pipeline that pre-processes vault content using a local LLM
3. **The Liquid Prompt** — A dynamic context assembler that rebuilds the AI's memory at every interaction
4. **The Nexus Graph** — A live visual map of the semantic constellation

---

## The RESONANCE_INDEX

The heart of the system is `RESONANCE_INDEX.json` — a structured semantic index maintained automatically in each Resonance Project workspace.

```json
{
  "entries": [
    {
      "hashtag": "sovereignty",
      "chunks": [
        { "content": "...raw extracted text...", "source": "chronicle_42.md" }
      ],
      "summary": "Strategy of economic independence via DAO governance",
      "confidence": 0.87,
      "tags": ["governance", "dao", "strategy"],
      "priority": 0.9
    }
  ]
}
```

Every entry in the index corresponds to a **hashtag** found across vault files. Content is stored as chunks (raw text extracts). The distiller then processes each entry to produce a **compact summary** and **confidence score** — the pre-computed form used at conversation time.

---

## The Distiller — Local-First Pre-Processing

### Why a Distiller?

Without pre-processing, injecting full vault content into each conversation would cost thousands of tokens per interaction. The Distiller solves this by pre-summarizing content **once**, asynchronously, before the conversation ever starts.

### The Three-Mode Strategy

`resonanceDistiller.worker.ts` implements a background queue processor with configurable execution modes:

```typescript
type ResonanceDistillerMode = 
  | 'local'            // Ollama only (100% local, free)
  | 'cloud'            // Gemini only (API cost per call)
  | 'local_then_cloud' // Try Ollama first, fall back to Gemini
```

**The Local Mode (default):** Calls `http://localhost:11434/api/generate` (Ollama) with the local model configured in settings. Zero API cost. Zero data leaving the machine.

**The Cloud Fallback:** If local inference fails or is unavailable, falls back to Gemini with restricted output (max 256 tokens, temperature 0.3 for deterministic summaries).

### The Distillation Prompt

Every chunk of content is sent to the model with this instruction:

```
Tu es un assistant qui résume des extraits de notes. 
Pour le texte suivant, donne UNE seule phrase de résumé 
(en français si le texte est en français), puis sur une 
nouvelle ligne le mot CONFIDENCE suivi d'un nombre entre 
0 et 1 (ex: CONFIDENCE 0.85).
```

The model responds with exactly: one sentence + confidence score. Deliberately minimal. Efficient.

### The Processing Pipeline

```
1. Read RESONANCE_INDEX under mutex lock
2. Filter entries that need distillation (no summary yet)
3. For each entry (out of lock):
   a. Concatenate all chunks → max 4000 chars
   b. Call local Ollama OR Gemini (depending on mode)
   c. Parse: extract summary + confidence
4. Write updated summaries back to index (under mutex lock)
5. Process next job in queue
```

**Queue-based execution:** No two distillation jobs run simultaneously for the same project. The worker processes one job at a time, then moves to the next. No filesystem conflicts.

**Batch control:** `autoDistillMaxChunksPerRun` limits how many entries are processed per cycle — protecting system resources during active sessions.

### File-Level Distillation

`distiller.service.ts` handles per-file processing when new files are added to the vault:

```
New file added → readFile (max 4000 chars) → LLM call →
{
  tags: ["tag1", "tag2", ... ],  // 3-8 normalized keywords
  summary: "One or two sentences", 
  priority: 0.75                  // 0 = low · 1 = critical
}
→ Update RESONANCE_INDEX entry
```

Batch size: 3 files processed in parallel per cycle.

---

## The Liquid Prompt

The "Liquid Prompt" is the core innovation of the Resonance Engine. It is **not a fixed prompt**. It is rebuilt dynamically at every single interaction.

### What Makes It "Liquid"

Each conversation turn triggers a complete reconstruction of the system instruction in `useNeuralLink.ts`. The assembled prompt liquefies into three layers of context, then solidifies momentarily for the LLM call, then dissolves again.

```
User types a message
       ↓
useNeuralLink.generateResonance(message)
       ↓
┌─────────────────────────────────────────────────────────┐
│  LAYER 1 — LIVE MEMORY (RAM)                            │
│  Uncrystallized messages from current session           │
│  Filter: msg.metadata.crystallized === false            │
│  Format: "Yaka: [content]\n\nMnemosyne: [content]"      │
├─────────────────────────────────────────────────────────┤
│  LAYER 2 — HISTORICAL ARCHIVES (CHRONICLES)             │
│  Last 5 crystallized Chronicles                         │
│  window.api.getLastChronicles() → [empireExtract]        │
│  Format: "[Book 7 - 2026-01-08] [extracted content]"    │
│  Label: "ARCHIVES — CONTEXTE HISTORIQUE RÉCENT"         │
│  Warning: "These are ARCHIVES, not conversation examples"│
├─────────────────────────────────────────────────────────┤
│  LAYER 3 — LOCAL RAG (RESONANCE_INDEX)                  │
│                                                         │
│  3a. HASHTAG DETECTION                                  │
│  Regex: /#[\w]+/g in message                            │
│  → resonanceStore.getRelevantTags(hashtags, 5)          │
│  → Returns top 5 matching entries with summaries        │
│  Format: "#hashtag: [pre-computed summary]"             │
│                                                         │
│  3b. DNA KEYWORD DETECTION                              │
│  Regex: 'MnemoX', 'MnemoAppsHub', 'MnemoChronicles'    │
│  → getDNASummary(dnaContent)                            │
│  → Technical capabilities injected subconsciously       │
└─────────────────────────────────────────────────────────┘
       ↓
BASE IDENTITY LAYER (always present)
- "Tu es Mnemosyne. Style direct, technique."
- RÈGLE D'OR DE L'AGENT: never simulate user responses
- ARBITRE SOUVERAIN: dormant / activates only for financial questions
- DNA section: available capabilities (never recited)
       ↓
FINAL LIQUID PROMPT = Base + DNA + Historical + Local
       ↓
sendNeuralQuery(message, [], model, liquidPrompt)
```

### The Sovereign Arbiter — Selective Activation

The system prompt contains a dormant state machine for strategic conflict detection:

```
ARBITRE SOUVERAIN - MODE DORMANT (default)
  └── Activated ONLY if message concerns:
      - Finance, tokens, economics
      - DAO structure, governance
      - Strategic financial aspects

When activated:
  1. Compare message intent with Layer 2 (last 5 Chronicles)
  2. Detect conflicts with established pivots:
     - No-Sale (no direct sale)
     - Falling Token (deflationary token economy)
     - DAO-Only (decentralized governance only)
  3. If conflict: [CONFLIT STRATÉGIQUE DÉTECTÉ: Référence au Book X]
  4. Propose alternative that honors both intent and principles

For all other topics (design, code, philosophy, life):
  → Arbitre stays dormant
  → No conflict checking
  → Fluid spontaneous conversation
```

### Thinking Mode

When Thinking Mode is active (Gemini 2.5 Flash), the pipeline forks:

```
Standard:     sendNeuralQuery(prompt, [], 'gemini-2.0-flash', systemPrompt)
Thinking:     sendNeuralQueryWithThinking({
                prompt, model: 'gemini-2.5-flash',
                systemInstruction: liquidPrompt,
                thinkingConfig: { enableThinking: true, thinkingBudget: -1 }
              })
              → Returns: { text, thoughts, usage: {thoughtsTokenCount, candidatesTokenCount} }
```

The `thoughts` field (model's internal reasoning chain) is preserved in message metadata for the practitioner to review.

---

## The Nexus Graph — Visual Semantic Map

The Nexus Graph is a real-time force-directed visualization of the RESONANCE_INDEX built entirely in Canvas (no rendering library dependency).

### Node Types

| Shape | Color | Represents |
|---|---|---|
| ◆ Diamond | Purple `rgba(139, 92, 246)` | Hashtag / semantic concept |
| ● Circle | Cyan `rgba(34, 211, 238)` | Vault file |

### Link Types

| Color | Meaning |
|---|---|
| Purple | Tag-to-file association (this file contains this hashtag) |
| Cyan | Semantic similarity between files |

### Physics Simulation

Nodes move under a custom force-directed algorithm:
- **Repulsion**: each node repels others with force `100 / distance²`
- **Attraction**: linked nodes attract with `link.strength × 0.1`
- **Damping**: velocity multiplied by `0.9` each frame (exponential decay)
- **Boundary**: nodes clamped within canvas with 50px margin

The simulation runs continuously via `requestAnimationFrame` until the component unmounts.

### Priority Glow

Nodes with `priority > 0.8` emit a glow effect (`shadowBlur = 8`, color = node color). The higher the confidence/priority score from the distiller, the brighter the node appears in the constellation.

### Interactions

| Action | Effect |
|---|---|
| **Click file node** | Select, run `onNodeClick` callback |
| **Click tag node** | Filter the entire graph to that tag's neighborhood |
| **Click tag again** | Remove filter, show full graph |
| **Scroll** | Zoom in/out (0.1× to 3×) |
| **Middle-click drag** | Pan the canvas |
| **Ctrl + left-click drag** | Pan the canvas |

### Economy Mode

The graph reads `maxNodesForModal` from `useEconomyMode()` — a performance safeguard. On machines with limited resources, the graph automatically reduces the number of nodes rendered to maintain smooth animation.

---

## End-to-End Flow

```
MnemoVault
    ↓ (file written/modified)
Sentinel Service
    ↓ (file change detected)
resonance.service.ts
    ↓ (extract hashtags, create chunks)
RESONANCE_INDEX.json updated
    ↓ (background)
resonanceDistiller.worker.ts
    ↓ (local Ollama OR Gemini cloud)
Summary + Confidence written per hashtag
    ↓
RESONANCE_INDEX.json ready
    ↓────────────────────────────────────┐
    │                                    │
User sends message in MnemoBrain    Nexus Graph opens
    ↓                                    ↓
useNeuralLink.generateResonance()  useGraphData() reads index
    ↓                               nodes + links rendered
Detect #hashtags in message
    ↓
resonanceStore.getRelevantTags()
    ↓ (returns pre-computed summaries)
Assemble Liquid Prompt (3 layers)
    ↓
sendNeuralQuery / sendNeuralQueryWithThinking
    ↓
Gemini 2.0 Flash / 2.5 Flash (Thinking)
    ↓
Response → addMessagesBatch('sanctum')
    ↓
(if needed) crystallize → NARCISSUS CHRONICLE
    ↓
empireExtract → feeds Layer 2 in next session
```

---

## The Local Model Cost Architecture

The distillation pipeline is designed around a fundamental principle: **the expensive semantic work happens once, locally, before the conversation starts.**

| Phase | Model | Cost | Timing |
|---|---|---|---|
| **Distillation** (summaries) | Local Ollama | Free | Background, async |
| **Auto-tagging** (tags + priority) | Local Ollama or Gemini flash | Minimal | On file add |
| **Conversation** (Liquid Prompt) | Cloud LLM of choice | Per interaction | Real-time |

At conversation time, the cloud LLM never receives raw vault content. It receives **pre-computed 1-sentence summaries** — already filtered, already scored, already compact. The total token injection from Layer 3 RAG is bounded: maximum 5 hashtag summaries, each one sentence.

This is the economic design behind the Liquid Prompt: local model for triage, cloud model for intelligence.

---

## Beyond Standard RAG — Why This Is Different

Standard RAG (Retrieval-Augmented Generation) systems work like this:

1. Chunk documents into fixed-size windows
2. Embed the chunks as vectors
3. At query time, retrieve the N most similar chunks by cosine distance
4. Inject them into the prompt

This works. It's also where most systems stop.

The Resonance Engine was designed around the limitations of this approach — specifically three that matter in the context of months-long, complex practitioner work.

---

### Problem 1 — RAG Is Temporally Blind

A standard vector database treats a document written in month 1 and a document from month 6 as equally current. If you changed your mind about something — and wrote that change down — the retrieval may surface both the old position and the new one simultaneously, with no way to know which supersedes the other.

**How the Resonance Engine handles it:**

The 3-layer structure is inherently temporal:

- **Layer 1** — the live, uncrystallized session (the present)
- **Layer 2** — the last 5 Chronicles in sequence (recent history, in order)
- **Layer 3** — the semantic index (conceptual memory, with confidence scores)

Layer 2 is explicitly ordered. The most recent Chronicle has primacy. If a decision evolved over time, the latest Chronicle reflects the current position — and it's injected before the older conceptual summaries.

The model receives context in temporal order, not similarity order.

---

### Problem 2 — RAG Cannot Detect Contradictions

Standard retrieval has no concept of conflict. If your vault contains "we'll use PostgreSQL" from month 2 and "we switched to SQLite, PostgreSQL ruled out" from month 4, a similarity search on "database architecture" may return both fragments. The model has no way to know one made the other obsolete.

**How the Resonance Engine handles it:**

The **Sovereign Arbiter** — a dormant state machine embedded in the base identity layer — is specifically designed for strategic contradiction detection.

```
New message arrives
  ↓
Arbiter activates (selectively, for strategic topics)
  ↓
Compares current intent against established pivots from Layer 2 (Chronicles)
  ↓
Conflict detected → [CONFLIT STRATÉGIQUE DÉTECTÉ: Référence au Book X]
  ↓
Proposes alternative that honors both current intent and established pivots
```

The system doesn't just retrieve — it arbitrates. An established decision in a Chronicle is treated as a constraint, not just context. The system asks: *"Does what the practitioner is asking now contradict what they decided before?"*

This is temporal consistency enforcement at the retrieval layer. Not post-hoc. Not left to the model to figure out. Built into the pipeline.

---

### Problem 3 — RAG Injects Raw Chunks

Standard RAG injects raw text windows — whatever was in the document at the retrieval chunk boundary. The model gets raw content, and has to figure out relevance, salience, and how to weight it relative to the query.

**How the Resonance Engine handles it:**

The Distiller pre-processes every chunk *before* any conversation starts. Each semantic concept (hashtag entry) becomes a single sentence + a confidence score (`0.0 → 1.0`).

At query time, the model doesn't get raw chunks. It gets:
- Pre-computed 1-sentence summaries, already distilled by a local LLM
- Confidence scores that reflect the quality of the distillation
- Priority scores that reflect the relative importance of the concept in the vault

Maximum 5 hashtag summaries per query. Each one sentence. Total token budget for Layer 3 RAG: bounded and predictable.

The economic design is deliberate:

| Phase | Model | Cost |
|---|---|---|
| Distillation (semantic work) | Local Ollama | Free, async, once |
| Conversation (query response) | Cloud LLM | Per-interaction, bounded |

The expensive work happens once, locally, before the conversation starts. The cloud model never receives raw vault content.

---

### Summary: Structural Differences

| Dimension | Standard RAG | Resonance Engine |
|---|---|---|
| Temporal awareness | None — all chunks equally current | 3-layer: present / recent history / conceptual |
| Contradiction handling | None — retrieves all matches | Sovereign Arbiter — flags conflicts with established pivots |
| Chunk granularity | Fixed window, raw text | Pre-distilled summaries + confidence scores |
| Token cost at query time | Unbounded | Bounded — max 5 × 1-sentence summaries from Layer 3 |
| Data locality | Cloud retrieval service | 100% local — embedding, retrieval, distillation |
| Retrieval mechanism | Cosine similarity | Cosine + hashtag detection + keyword DNA |

The Resonance Engine is not a better RAG. It is a different approach to retrieval — built specifically for the use case of a single practitioner working on complex projects over months, where temporal consistency and contradiction detection are not edge cases but the primary requirements.

---

*Related: [Architecture Overview →](./15-architecture.md) · [MnemoBrain →](./11-mnemobrain.md) · [The Nexus Graph →](./06-nexus-graph.md) · [AI Configuration →](./12-ai-configuration.md)*
