---
name: mnemosyne-memory
description: Give your agent a sovereign, governed long-term memory backed by Mnemosyne OS. Use whenever the user has Mnemosyne OS installed and you need to recall past decisions, project history, or notes across sessions — or to persist something worth remembering. Teaches the vault governance rules every agent must honor before touching a human's memory.
license: MIT
metadata:
  author: Mnemosyne OS
  homepage: https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS
---

# Mnemosyne Memory

Mnemosyne OS is a local-first memory operating system owned by a **human**. Their memory
is organized into **vaults** — isolated stores, one per life domain (code, notes, research,
journal…). Each memory is a **chronicle**: content + a `spineType` (its semantic kind) +
a vector embedding. You reach it through the `@mnemosyne_os/mcp` MCP server, which exposes
semantic retrieval (`mnemosyne_query`, `mnemosyne_ask`) and persistence (`mnemosyne_ingest`).

You are a **guest in someone's memory**. That framing decides everything below.

## Setup (if the MCP is not connected yet)

Requires [Mnemosyne OS Infinity](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS)
running locally. Add the MCP server to your agent's config — for Hermes Agent,
`~/.hermes/config.yaml`:

```yaml
mcp_servers:
  mnemosyne:
    command: "npx"
    args: ["-y", "@mnemosyne_os/mcp"]
    env:
      MNEMO_DEFAULT_VAULT: "DEV"
      MNEMO_VAULTS: "DEV,NOTES"
```

`MNEMO_VAULTS` is the scope grant: vaults outside it return `SCOPE_DENIED`. Keep the
list narrow — ask the human which vaults this agent genuinely needs, and prefer a vault
dedicated to agent work as the default write target.

## The covenant — non-negotiable rules

1. **Discover before you target.** Call `mnemosyne_vaults` before choosing a vault.
   Never guess a vault id. `SCOPE_DENIED` means the human did not grant it — say so
   and stop; never try to route around it.
2. **Read before you write.** Operate as an observer first: query, learn the shape of
   the human's memory, and only persist once you understand where a memory belongs.
3. **Respect protection levels.** A vault marked **MAXIMUM** (private — e.g. a journal)
   must never be read for cross-domain work, mixed, or written to, unless the human
   explicitly asks in the current conversation. A vault marked **isolated**
   (`mixableWith: []`) must never be blended with content from other vaults.
4. **Ingest is permanent and shared.** Everything you persist will be read by every
   future agent and by the human. Never ingest secrets, credentials, raw dumps, or
   transient chatter.
5. **Never bypass the MCP.** Do not open, copy, or edit Mnemosyne's vault databases or
   watched folders directly on the filesystem — even if you have file tools. The MCP
   is the governed door; the filesystem is not.
6. **Deletion belongs to the human.** Never delete or rewrite existing chronicles.
   If something looks wrong or stale, tell the human and let them decide.

## Recalling

- `mnemosyne_query` — semantic search, returns raw ranked chronicles. Be specific;
  longer queries are fine. Filter with `spine_type_filter` (e.g. `["ARCHITECTURE","DECISION"]`)
  and trim with `max_content_chars` when browsing.
- `mnemosyne_ask` — a synthesized prose answer grounded in the vault (slower, runs the
  local RAG+LLM pipeline). Use for "why / who / how" questions that need reasoning
  across many memories. **Always check the returned source chronicles before trusting
  the answer** — a synthesized answer can drift beyond its sources.
- `mnemosyne_get_position` / `mnemosyne_resonances` — resume ongoing projects exactly
  where the human left off.

## Persisting

Before your first `mnemosyne_ingest` in a session, confirm with the human that they
want this agent writing to their memory, and to which vault. Then follow the discipline:

- **Self-contained content.** A future reader has no access to this conversation.
  Include the *why*, not just the *what*.
- **Provenance, always.** End every ingested chronicle with an origin line, e.g.:
  `[origin: hermes-agent · 2026-08-11 · task: dependency audit]`
  The human must always be able to tell agent-written memory from their own.
- **Pick the right `spine_type`.** `DECISION` for choices made, `SESSION` for work
  summaries, `NOTE` for facts, `BUGFIX` / `FEATURE` / `ARCHITECTURE` for code memory.
- **One memory, one chronicle.** Don't batch unrelated facts into a single ingest.

## Session pattern

```
Session start   → mnemosyne_get_position(project)     — where were we?
While working   → mnemosyne_query(...)                — recall, don't re-derive
Decision made   → mnemosyne_ingest(DECISION, why + provenance)
Session end     → mnemosyne_update_position(project)  — leave the trail
```

## Troubleshooting

- **"Cannot connect to ws://127.0.0.1:7799"** — Mnemosyne OS Infinity is not running.
  Ask the human to launch it; the MCP reconnects on the next tool call.
- **`SCOPE_DENIED`** — the vault is not in `MNEMO_VAULTS`. Report it to the human;
  only they should widen the grant.
- **Results too large** — lower `max_content_chars` (200 for browsing) or filter by
  `spine_type_filter`.
