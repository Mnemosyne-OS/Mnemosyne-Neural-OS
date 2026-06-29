# MnemoBrain — The Thinking Interface

> *Most chat interfaces are terminals. MnemoBrain is a cortex.*

---

## What MnemoBrain Is

MnemoBrain is the primary interaction layer of Mnemosyne OS — the chat interface where the practitioner converges with their AI. It is not a standard chat window.

Every conversation in MnemoBrain happens inside a **Resonance Project** (Ma vie, Mnemosyne, or any custom project), against an **active Soul** identity, with access to the **Nexus Graph**, and with **three layers of memory automatically compiled and injected before every response**.

The distinction matters: in most AI tools, you start fresh. In MnemoBrain, you are always inside a context — a named project, a living memory space, an AI with a defined identity and behavioral profile. The conversation is contextualized before you type a single word.

---

## Multi-LLM — One Memory System

MnemoBrain supports multiple LLM providers simultaneously, switchable with one click:

**Cloud providers (GROQ LPU):**
- DeepSeek R1 Distill — FREE · Ultra-rapid · Thinking · Broad
- Mistral 8x7B — FREE · Ultra-rapid · 32k context
- Gemma 2 9B — FREE · Ultra-rapid
- Llama 3.2 90B Vision — FREE · Vision · Broad

**Local inference:**
- HF Bartowski Meta Llama 3.1 8B (Q8_K_M) · Qwen2.5 18B (Q6_K_M)
- HF TheBloke Mistral 7B Instruct V0.2
- TinyLlama 1.1B Chat

**Ollama (local):**
- Gemma3 · Kimi K2 5 · Nomic Embed Text (embedding)

**The critical point:** regardless of which model is selected, the memory system is identical. The model changes. The context does not. Three layers of Resonance are compiled and injected automatically before every response — whatever the LLM.

---

## The Three-Layer Memory Injection

Every message sent in MnemoBrain triggers a compilation pipeline before the LLM sees it. The "25 memories injected" indicator in the interface reflects the total fragments assembled across three layers:

```
User sends message
  │
  ├── Layer 1: LIVE MEMORY
  │   └── All uncrystallized messages from the current session
  │       Injected as: [HISTORIQUE SESSION ACTUELLE]
  │
  ├── Layer 2: CHRONICLES ARCHIVE
  │   └── Last 5 crystallized Chronicles from the vault
  │       book number · date · empireExtract
  │       Injected as: [ARCHIVES - CONTEXTE HISTORIQUE RÉCENT]
  │       Also watched by: Sovereign Arbiter (strategic conflict detection)
  │
  └── Layer 3: RESONANCE RAG
      ├── Hashtag detection: #tags in message → RESONANCE_INDEX.json query
      │   Injected as: [RECHERCHE LOCALE - Hashtags]
      └── DNA/Keyword detection: known tokens → DNA knowledge retrieval
          Injected as: [RECHERCHE LOCALE - DNA]
          
──────────────────────────────────────────────────────
Final prompt = System identity + Layer 1 + Layer 2 + Layer 3 + User message
──────────────────────────────────────────────────────
```

**What "25 memories injected" means:** 25 fragments — from session history, archived chronicles, and Resonance index matches — were compiled into the context before Gemini received the message. The practitioner typed one question. The system assembled the equivalent of a research brief.

---

## The Thought Matrix

The Thought Matrix is the post-response processing pipeline. After the LLM replies, the Thought Matrix analyzes the response and activates secondary AI agents based on what it detects.

**Deep Thought mode** — when enabled, all configured agents run after every response. Token cost tradeoff: richer processing, higher usage.

**Configured agents:**

| Agent | Runtime | Description |
|---|---|---|
| **Strategist** | LPU · Gemini 2.5 Flash | Generates structured strategic tasks and roadmaps from the conversation |
| **BMAD 2.0** | Cloud · Gemini 2.5 Flash | Applies the BMAD project management framework to detected goals |
| **Config Agent** | LPU · Gemini 2.0 Flash | Manages system configuration changes suggested in conversation |
| **Limbic System** | Cloud · Gemini 2.5 Flash | Behavioral and emotional processing layer |

Each agent runs on its own configured model. Each can be toggled independently. The pipeline activates automatically — the practitioner does not manage it.

---

## Thought Matrix in Action — A Real Session

**April 4, 2026 · 23:21**

Tony asks Mnemosyne:

> *"Faudrait que je vois quoi faire pour les évolutions futures — tu as des idées ?"*

Mnemosyne replies with a four-point development vision — GitHub auto-analysis, contextual memory surgery, Soul Studio behavioral modes, and a Neural OS management interface.

**Then, without any additional input, the Thought Matrix activates the Strategist.**

Twelve strategic task cards appear below the conversation automatically:

- *Establish Core GitHub Repository*
- *Develop Codebase Scanner Module*
- *Implement Basic Refactoring*
- *Enhance Memory Indexing*
- *Develop Predictive Model for User*
- *Implement Proactive Features*
- *Define Initial Behavioral Persona*
- *Develop Core Processing Switching*
- *Implement GitHub Analysis*
- *Design UX/UI for Neural OS*
- *Develop Frontend for Memory*
- *Implement Idea Tagging Feature*

**A question became a roadmap.** No task creation, no category management, no separate planning tool. The conversation, analyzed by the Thought Matrix, produced the strategic plan automatically.

---

## The Sovereign Arbiter

The system prompt contains a dormant conflict-detection layer: the **Sovereign Arbiter**.

It remains inactive during most conversations — design discussions, code, philosophy, stories. But when the practitioner asks about finance, tokens, or DAO governance, the Arbiter activates and cross-references the request against the last 5 injected Chronicles (Layer 2).

If a proposed idea conflicts with a documented strategic pivot:

```
[CONFLIT STRATÉGIQUE DÉTECTÉ : Référence au Book X]
```

Established pivots watched by the Arbiter:
- **No-Sale** — no direct asset sale protocol
- **Falling Token** — deflationary token economy
- **DAO-Only** — decentralized governance only

After flagging a conflict, the system proposes an alternative that honors both the current intent and the documented long-term vision. Not "no" — but "here is how yes works within the architecture."

---

## The Context Selector

Accessible via the `ContextSelector` panel, the practitioner can manually select vault files to add to the context — beyond what the automatic injection layers provide. Files are browsed in a tree view, filtered by search, tags, favorites, or currently selected. Selected files are included in the conversation context with one click.

This gives fine-grained control: the system injects automatically, the practitioner can add or remove specific files as precision inputs.

---

## The Sanctum Mode

Within MnemoBrain, **Sanctum** is the introspection space — a stripped-down interface (amber/void aesthetic, minimalist header) optimized for deep reflection sessions. Active hashtags are displayed in the header in real time as the system detects resonance from the input. A **Stability Gauge** shows the coherence score of the current context.

Messages in Sanctum are classified as crystallized or uncrystallized. Uncrystallized messages feed Layer 1 of the injection pipeline. When the session reaches sufficient depth, the **Crystallize** button converts the session into a Narcissus Chronicle and updates `RESONANCE_INDEX.json` automatically.

---

## Active Soul — The Identity Layer

At the bottom of MnemoBrain is the Soul management panel. The **Active Soul** defines who Mnemosyne is in this session — her name, behavioral profile, personality archetype, and OCEAN calibration set during the Soul Studio Genesis Protocol.

The **Souls** tab shows all created identities. The **Mini-Souls** tab shows lightweight variants for specific tasks.

The Soul shapes the system prompt's tone, spontaneity rules, and engagement style. The same question, two different Souls, produces measurably different responses — not as a persona trick, but as a genuine behavioral architecture.

---

## Resonance Projects in MnemoBrain

Every session targets a Resonance Project. The project determines which Chronicles are available in Layer 2, which Nexus Graph the conversation feeds into, and which memory index the AI reads from.

Active projects: **Ma vie** · **Mnemosyne** (switchable without leaving the interface).

The AI's access to memory changes immediately on project switch — as if stepping from one room to another, each with its own archive.

---

## The Interface

```
┌─────────────────────────────────────────────────────┐
│  SYSTEM / NEURAL I                                  │
│  [ Continuum ] [ Ghost ] [ Observer ]               │
│   1.4K / 900K tokens · FREE · Auto ●                │
├─────────────────────────────────────────────────────┤
│                                                     │
│         [Conversation — 25 memories injected]       │
│                                                     │
├─────────────────────────────────────────────────────┤
│  ⚡ STRATEGIST (THIS CHAT)               QUICK ● ↻  │
│  ⓘ  THOUGHT MATRIX                                  │
├─────────────────────────────────────────────────────┤
│  🔗 Nexus Graph  💎 Model  📊 Strategist  Crystallize│
├─────────────────────────────────────────────────────┤
│  🌀 Active Soul: Mnemosyne                          │
│     [ Souls ]  [ Mini-Souls ]                       │
└─────────────────────────────────────────────────────┘
```

**Context modes (top bar):**
- **Continuum** — full memory mode, all Chronicle layers active
- **Ghost** — stealth session, no crystallization, no memory update
- **Observer** — silent AI agents monitor without responding

---

*Part of the [Mnemosyne OS Documentation](./README.md)*\
*Related: [Soul Studio →](./07-soul-studio.md) · [Resonance Projects →](./05-resonance-projects.md) · [Nexus Graph →](./06-nexus-graph.md) · [Auto-Chronicle →](./04-auto-chronicle.md)*
