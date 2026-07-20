# 04 — AI Collaboration

> *"The AI is not your employee, your oracle, or your pair programmer. It is something new. Treat it accordingly."*

---

## The Working Relationship

Neural Coding requires a specific kind of relationship with AI — different from how most people interact with AI assistants.

Most people use AI reactively: they have a problem, they ask a question, they get an answer, they move on. This works for isolated tasks.

Neural Coding uses AI sustainedly: you are building a complex system over months, and the AI's output in any given session must be consistent with decisions made in sessions you had weeks ago.

This requires treating the AI collaboration as a **working relationship with memory management responsibilities on your side**.

---

## Session Structure

A well-structured Neural Coding session has four phases:

### Phase 1: Context Establishment (5-10 minutes)

Before you describe a problem or ask for code, establish the context the AI needs to respond well.

**Minimum context brief:**
```
Current system state: [what exists, what's working, what's broken]
Relevant established patterns: [patterns the AI must follow]
Non-negotiable constraints: [security, privacy, performance boundaries]
Today's goal: [single, clear objective]
```

This brief doesn't need to be long. It needs to be complete for the session's purpose.

### Phase 2: Intention Articulation (10-30 minutes)

Describe the problem with full constraint coverage. See [Pillar 1](./02-the-three-pillars/01-intention-articulation.md).

Do not rush this phase. The time you spend here determines the quality of what the AI produces.

### Phase 3: Proposal Evaluation (ongoing)

For each AI proposal: evaluate, veto if necessary, refine, repeat.

The evaluation loop is not a sign of failure. It is the process. Expect 2-4 iterations on any non-trivial feature.

### Phase 4: Verification & Close (15-30 minutes)

Before ending a session:
- Verify the output against the stated requirements
- Document any patterns that emerged that should be preserved
- Note any adjacent issues discovered (for future sessions)
- Update your context document if system state changed

A session that ends without verification is a session that created technical debt.

---

## Conversation Techniques

### The Constraint Layering Technique

When describing a complex problem, start with the core requirement, then layer constraints progressively:

> "I need a function that generates embeddings.
>
> Constraint layer 1 — Providers: First try Ollama local. If unavailable, try Jina, Cohere, Gemini, OpenAI in that order.
>
> Constraint layer 2 — Failure: If all providers fail, throw a named error with recovery instructions.
>
> Constraint layer 3 — Privacy: If local-only mode is active, never attempt cloud providers.
>
> Constraint layer 4 — Observability: Track and expose which provider was used last."

This is easier for both you and the AI than describing everything at once.

### The Tradeoff Question

When the AI proposes an approach and you're uncertain whether it's the right one:

> "What are the main tradeoffs between this approach and [alternative]? What would make you choose one over the other?"

This extracts the AI's design reasoning, which you can evaluate against your system constraints.

### The Failure Probe

When evaluating a proposal, always test the failure paths explicitly:

> "Walk me through what happens if [dependency] is unavailable when this runs."  
> "What does the user experience when this fails?"  
> "What is logged when this throws?"

If the answers are unsatisfying, that's a Veto.

### The Simplification Request

When complexity appears unexpectedly:

> "This is more complex than I expected. Can you show me the simplest version of this that still meets the stated requirements? Then we can discuss whether additional complexity is justified."

### The Pattern Check

When accepting a new piece of code:

> "Does this approach follow the same pattern as [related component]? If not, what's different and why?"

---

## What the AI Is Good At

Understanding these strengths lets you leverage them.

**Implementation detail.** Given a clear specification, AI is very fast at producing correct, well-structured code for well-understood problems.

**Boilerplate and scaffolding.** Repetitive patterns, configuration files, test structures, type declarations — AI handles these reliably.

**Translating constraints into code.** When you provide specific constraints (validation rules, error handling requirements, security boundaries), AI is good at encoding them precisely.

**Explaining tradeoffs.** When asked about design decisions, AI can articulate tradeoffs between approaches clearly and usefully.

**Debugging with a clear description.** If you can describe the observed behavior and the expected behavior, AI is often effective at identifying the gap.

---

## What the AI Is Not Good At

Understanding these weaknesses lets you compensate for them.

**Remembering previous sessions.** By default, AI has no memory across conversations. You must re-establish context every session.

**Knowing your system.** The AI knows the request in front of it, not the full system it lives in. Architectural Judgment is your responsibility.

**Knowing what you didn't say.** Constraints you didn't articulate will not appear in the output. Novel failure modes you didn't describe will not be handled.

**Staying consistent across a long project.** Pattern drift is a natural consequence of AI collaboration. It requires active management.

**Knowing when to stop.** AI will produce something. Whether it's the right something is your judgment call, not the AI's.

---

## Managing Multiple AI Collaborators

Neural Coding at scale sometimes involves multiple AI systems — different models for different types of work.

If you work with more than one AI system (e.g., one for planning, one for implementation, one for review), maintain a shared context document that you provide to each. The context document is the contract between you and all of your AI collaborators.

Do not assume that agreements made in one AI conversation will be known to another.

---

## The Session Journal

Experienced Neural Coders maintain a session journal — a brief log of what was built, what was decided, and what was deferred.

Minimum journal entry:
```
Date: [date]
Goal: [what was attempted]
Outcome: [what was completed]
Patterns established: [any new patterns the AI used that should be preserved]
Deferred: [issues found but not addressed this session]
```

This takes five minutes. It prevents context amnesia and provides a project history you can reference in future sessions.

---

*Previous: [Anti-Patterns ←](./03-anti-patterns.md)*  
*Next: [Neural Coding — Live Sessions →](./12-neural-coding-live.md)*


---

## Principle 5 — Proactive Complexity Governance

*Added 2026-04-04, from live Neural Coding session.*

### The anti-pattern it fixes

An AI agent executes instructions one at a time. Features are added. The codebase grows. The human eventually notices the complexity and asks for a refactor.

In this model, **the human governs and the AI executes.** That is not Neural Coding.

### The principle

> The AI must proactively signal when a unit of code is approaching unsustainable complexity — before the human notices, and before continuing.

This applies to:
- Functions exceeding ~100 lines
- Files exceeding ~400 lines without clear modular separation
- Logic blocks mixing concerns (prompts + business logic + I/O in the same place)

### The protocol

When the threshold is approaching, the AI pauses and says:

`
⚠ [functionName] is approaching [N] lines.
I propose extracting [concern] into lib/[module].ts before continuing.
Shall I restructure first, or continue adding to the current file?
`

The human can say "continue" or "restructure first." Either answer is valid. What is not valid is the AI continuing silently.

### Why this matters

A LLM that executes is a tool.  
A LLM that governs the codebase alongside the human is a **collaborator**.

The difference is whether the AI has internalized the *telos* of the work — not just "make the feature work" but "make the codebase sustainable for the next 10 features."

This principle is the direct application of Neural Coding to software architecture: **the AI as co-steward of quality, not just co-author of features.**

### In practice (real example)

During MnemoForge CLI development, chronicle init grew to 202 lines in a single callback. The refactor — once requested — took 15 minutes and produced 3 clean modules. Had the AI proposed it at line 100, it would have taken 5 minutes and never accumulated. The human would never have needed to notice.

**The goal is for the human to never have to say "faudrais pas refactoriser ça?".**

---

## Principle 6 — The Funnel & the Parallel Mind

*Added 2026-04-04, from live Neural Coding session.*

### The observation

Neural Coding does not proceed linearly. It works like a funnel:

`
Global vision
     │
     ▼  (narrowing)
Feature target
     │
     ▼
Edge case / bug / detail
     │
     ▼
Fix + verify + commit
     │
     ▼  (loop upward)
Next feature
`

Each iteration starts broad and ends precise. Then loops back to the broader view.

### The parallel cognition model

While the agent executes at the bottom of the funnel, the human operates at the top.

| Human | Agent |
|---|---|
| Thinks about architecture | Implements the current task |
| Plans how systems connect | Documents and enforces code rules |
| Evolves the global vision | Ensures the detail is correct |
| Decides what matters next | Asks when a decision is needed |

Neither blocks the other. This is what makes Neural Coding a form of **parallel intelligence**, not sequential instruction-following.

### The agent's responsibility in this model

The agent must:
1. **Never wait** to be asked to document — document as it goes
2. **Surface decisions** that require human input, immediately
3. **Stay in its lane** (execution, documentation, governance) while the human thinks strategy
4. **Hold the long-term rules** — not just execute the current sprint

### Living rules (evolutionary, not static)

Rules in Neural Coding are not fixed. They evolve with the project. But they must be:
- **Well-thought before writing** (not documented as an afterthought)
- **Versioned** (the chronicle logs when and why a rule changed)
- **Applied immediately** (not "we should do this later")

The agent is the keeper of the rules. The human validates them.

### What this session produced

- Principle 5: Proactive Complexity Governance (added this session)
- Principle 6: The Funnel & Parallel Mind (this entry)
- CLI: 759 → 513 lines (funnel at work: vision → refactor → verify)
- Architecture: cli.ts → lib/init-flow.ts + lib/providers.ts
- Rule: grep 'pattern' dist/ before declaring a fix complete
