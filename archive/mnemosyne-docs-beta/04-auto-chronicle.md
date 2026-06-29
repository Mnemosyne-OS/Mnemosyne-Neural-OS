# Auto-Chronicle

> *"Automatically crystallizes when context reaches this percentage."*

---

## The Problem It Solves

In any significant conversation with an AI, there is a hidden enemy: **context saturation**.

As the conversation grows, the context window fills. The AI begins to lose access to early decisions, early constraints, early intentions. The quality of its responses degrades. And when the session ends, what was discussed lives only in the raw transcript — uncrystallized, unstructured, buried.

The Auto-Chronicle solves this silently, in the background, without interrupting the flow of work.

---

## How It Works

The system monitors the context load in real time. The indicator is visible at all times in the Chronicle interface: `0% ctx`, `45% ctx`, `80% ctx`.

When the context load reaches the configured threshold:

1. The system detects the saturation point
2. It generates a Chronicle using the last saved style settings
3. It saves the Chronicle to the selected Resonance Project
4. The Nexus Graph is updated — the session is crystallized as a node
5. The conversation continues normally

No interruption. No request. No manual action required.

---

## Configuration

**Trigger threshold (default: 80%)**
The percentage of context window usage that triggers crystallization. Set lower (e.g., 60%) for shorter, more frequent snapshots. Set higher (e.g., 90%) to maximize each session before crystallizing.

**Minimum delay between chronicles (default: 30 min)**
Prevents chronicle spam during extended sessions that stay near the threshold. If the context stays at 85% for two hours, the system crystallizes once every 30 minutes — not continuously.

**Silent mode**
When enabled, the Auto-Chronicle runs without opening the configuration modal. It uses the last saved settings (style, Resonance Project, name template) and crystallizes silently. For practitioners who want full automation.

---

## The Design Principle

Two triggers, two purposes:

| Trigger | Purpose |
|---|---|
| **Manual** | You recognize a meaningful moment and choose to crystallize it |
| **Auto-Chronicle** | The system ensures no significant moment is lost to context saturation |

Neither replaces the other. Together they ensure that Chronicles accumulate both by *choice* and by *necessity* — which is how valuable memory actually grows.

---

## The 0% ctx Indicator

The context usage gauge appears in the Chronicle interface. At 0%, the session is fresh. At 80%, the Auto-Chronicle triggers. This makes the context state visible — something that is normally completely hidden from the user in AI interfaces.

Mnemosyne makes the invisible visible: you know, at any moment, how much of your conversation the AI can still access fully.

---

*Next: [Resonance Projects →](./05-resonance-projects.md)*
