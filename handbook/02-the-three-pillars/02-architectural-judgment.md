# 02 — Pillar 2: Architectural Judgment

> *"The AI sees the tree you're asking about. You see the forest it lives in."*

---

## Definition

**Architectural Judgment is the ability to evaluate whether an AI proposal is correct for your entire system — not just for the immediate problem it was asked to solve.**

This is the skill that separates a Neural Coder from someone who accepts whatever the AI produces.

---

## The Local vs. Global Problem

AI systems are very good at solving the problem you ask about. They are much less reliable at accounting for problems you didn't ask about — especially when those problems involve other parts of your system that weren't in the conversation.

This is the core tension Neural Coders must manage:

- The AI optimizes *locally* (for the request in front of it)
- You must evaluate *globally* (for the whole system)

A proposal can be:
- ✅ Correct for the immediate problem
- ✅ Well-implemented technically
- ❌ Wrong for your system

The AI won't tell you about the third column. It doesn't know your system the way you do.

---

## What Architectural Judgment Actually Looks Like

When the AI produces a proposal, Architectural Judgment means asking:

**"Does this solve the problem I described?"**  
Check. Does the output match the spec?

**"Does this create a problem I didn't describe?"**  
This is the harder question. It requires holding your whole system in your head.

**"How does this interact with X, Y, Z?"**  
Replace X, Y, Z with the other parts of your system that touch this component.

**"What happens to this when [edge case]?"**  
Not just the happy path. The edge cases that are most likely in your specific context.

**"Is this the right place to solve this problem?"**  
Sometimes the AI solves a symptom, not the cause. Sometimes it puts logic in the wrong layer.

---

## A Worked Example

**Context:** Building an IPC security layer for an Electron application.

**AI proposal:** Add a try/catch around each IPC handler to prevent crashes.

**Vibe coder response:** Looks good. Ship it.

**Neural Coder response:**

> "Adding try/catch prevents crashes. But:
> 1. If I have 30+ handlers and each has its own try/catch, error handling behavior will be inconsistent across the app.
> 2. There's no centralized visibility into which handlers are failing, or why.
> 3. If a handler fails silently, the renderer doesn't know what happened and can't show the user a meaningful error.
>
> I need something different. I need a centralized registry that:
> - Wraps every handler in a consistent error boundary
> - Returns a typed error response (not null, not an exception) when something fails
> - Logs failures to a central log file
> - Makes the handler list observable (so I can see all handlers in one place)"

This reasoning produced the [IPC Registry pattern](../../doc/architecture/IPC_SECURITY_BRIDGE.md) — a centralized registry with per-module fault isolation. It's architecturally distinct from "add try/catch everywhere" even though both prevent crashes.

The difference is Architectural Judgment.

---

## Building Your Mental Model

To exercise Architectural Judgment, you need a mental model of your system. This is the most important non-technical asset you will maintain throughout a Neural Coding project.

Your mental model should include:

**The layers of your system**  
What are the main components? How do they communicate? Who calls whom?

**The trust boundaries**  
Where does untrusted input enter? Where does sensitive data live? What can access what?

**The failure dependencies**  
If X fails, who else breaks? Which components have single points of failure?

**The data flows**  
Where does data originate? Where does it go? What transforms it along the way?

You don't need a diagram (though diagrams help). You need to be able to close your eyes and answer questions about any part of the system.

---

## The Judgment Maturity Scale

Neural Coding Architectural Judgment matures over time:

**Level 1 — Reactive**  
You catch problems after they ship. You recognize when something is wrong but couldn't have predicted it up front.

**Level 2 — Evaluative**  
You evaluate proposals before accepting them. You ask "what does this break?" before approving.

**Level 3 — Generative**  
You arrive in a conversation with the AI already knowing what architectural properties the solution needs. You evaluate proposals against a pre-existing standard.

**Level 4 — Anticipatory**  
You describe the problem in a way that already constrains the solution space to architecturally valid options. The AI rarely produces wrong proposals because your intent description eliminated them.

Level 4 is the goal. It is reached by practicing Level 2 until it becomes unconscious.

---

## When You Don't Know Enough to Judge

Neural Coding doesn't require technical omniscience. There will be proposals where you don't know whether they're architecturally right.

The correct response is not to accept them. It is to ask.

**"Is there a simpler way to achieve the same result?"**  
Architectural problems often reveal themselves through complexity.

**"What are the tradeoffs of this approach vs. alternatives?"**  
Ask the AI to explain the design space, not just implement one option.

**"What breaks if this fails?"**  
Probe the failure behavior you didn't ask about.

**"How would this change if we added [likely future requirement]?"**  
Test the extensibility before you're invested.

Your judgment is not about knowing implementation details. It's about asking the right questions.

---

*Next: [The Veto →](./03-the-veto.md)*  
*Previous: [Intention Articulation ←](./01-intention-articulation.md)*
