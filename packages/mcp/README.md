**@mnemosyne_os/mcp** — MCP server for Mnemosyne OS — gives AI agents access to vault memory, resonances, git context, and to what the OTHER coding agents on this machine are doing.

<div align="center">

<img src="https://raw.githubusercontent.com/Mnemosyne-OS/Mnemosyne-Neural-OS/main/assets/banner-mnemosyne-os.png" width="100%" alt="Mnemosyne OS — Your memory. Your machine. Your rules." />

🌐 [**mnemosyne-os.io**](https://mnemosyne-os.io) — the product, for builders · [**mnemosyne-os.com**](https://mnemosyne-os.com) — the company, press & labs · [**docs.mnemosyne-os.io**](https://docs.mnemosyne-os.io) — the documentation

</div>

# @mnemosyne_os/mcp

> **Give Claude, Cursor, Hermes Agent, Copilot, and any MCP-compatible agent access to your local Mnemosyne OS memory vault.**
> Code, decisions, architecture notes, git history — semantically queryable, 100% sovereign, zero cloud.

[![npm version](https://img.shields.io/npm/v/@mnemosyne_os/mcp)](https://www.npmjs.com/package/@mnemosyne_os/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js ≥18](https://img.shields.io/badge/node-%3E%3D18-green)](https://nodejs.org)

---

> 🍳 **In a hurry?** [**RECIPES.md**](./RECIPES.md) gives your coding agent a persistent memory in one copy-paste block — Claude Code, Cursor, Claude Desktop, and the TypeScript SDK.

## What this is

`@mnemosyne_os/mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) server that
turns your local [Mnemosyne OS](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS) install into a
queryable memory layer for any AI agent that speaks MCP.

Once configured, your agent can:

- 🧠 **Query** code, architecture, decisions, and git history with true semantic ranking (Vertex / e5-base / nomic).
- 💾 **Persist** new decisions, sessions, or insights so future agents can recover them.
- 🎯 **Resume** projects exactly where you left off via Resonance positions.
- 📡 **Filter** results by spineType (`ARCHITECTURE`, `GIT`, `SOURCE_CODE`, `BUGFIX`, …).

**The MCP itself opens exactly one socket: `127.0.0.1:7799`.** It sends nothing anywhere else and keeps no state. Your `claude.ai` conversation sees only the chronicles you allow. What Mnemosyne OS does behind that socket follows the route you configured — `mnemosyne_ask` runs whichever model you picked, local or cloud.

---

## Requirements

**Node.js ≥ 18** is the only hard requirement.

The **memory** tools additionally need **[Mnemosyne OS Infinity Edition](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS)** running — it owns your vaults and exposes the WebSocket gateway on `ws://127.0.0.1:7799`. Get it from the project repo's releases page.

The three **agent-awareness** tools (`mnemosyne_agents`, `mnemosyne_agent_collisions`, `mnemosyne_agent_files`) need neither. They read transcript files your coding-agent harness already writes to disk, so they answer with the app closed, with no vault, and without spending a token. They read **every** harness they find, so a Claude Code session can see an Antigravity session running in the same repository.

> **The MCP is a thin bridge.** It does not store anything itself. All data lives in Mnemosyne OS Infinity (`%APPDATA%\@mnemosyne-workspace\infinity-edition\vaults\*.db` on Windows, `~/Library/Application Support/...` on macOS).

---

## Install — 30 seconds

### Claude Desktop

Open Claude Desktop → **Settings → Developer → Edit config** (or edit `claude_desktop_config.json` directly):

- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

Add:

```json
{
  "mcpServers": {
    "mnemosyne": {
      "command": "npx",
      "args": ["-y", "@mnemosyne_os/mcp"],
      "env": {
        "MNEMO_DEFAULT_VAULT": "DEV",
        "MNEMO_VAULTS": "DEV,PERSONAL,SOCIAL"
      }
    }
  }
}
```

**Fully quit and relaunch Claude Desktop** (close from the tray icon, not just the window). The `mnemosyne` server should show up under **Settings → Developer → Local MCP Servers** with the **running** badge.

### Claude Code

Add to `.mcp.json` at the root of your project:

```json
{
  "mcpServers": {
    "mnemosyne": {
      "command": "npx",
      "args": ["-y", "@mnemosyne_os/mcp"],
      "env": {
        "MNEMO_DEFAULT_VAULT": "DEV",
        "MNEMO_VAULTS": "DEV,PERSONAL,SOCIAL"
      }
    }
  }
}
```

Reload the Claude Code session.

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "mnemosyne": {
      "command": "npx",
      "args": ["-y", "@mnemosyne_os/mcp"],
      "env": {
        "MNEMO_DEFAULT_VAULT": "DEV",
        "MNEMO_VAULTS": "DEV,PERSONAL,SOCIAL"
      }
    }
  }
}
```

### Hermes Agent

[Hermes Agent](https://github.com/NousResearch/hermes-agent) (Nous Research) ships with MCP support — no extra install step. Add to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  mnemosyne:
    command: "npx"
    args: ["-y", "@mnemosyne_os/mcp"]
    env:
      MNEMO_DEFAULT_VAULT: "DEV"
      MNEMO_VAULTS: "DEV,NOTES"
```

Restart Hermes. Your agent now has a sovereign long-term memory it can query semantically — and everything stays on your machine, which is exactly the deal Hermes promises you.

**Recommended for autonomous agents:** grant read scopes narrowly (only the vaults the task needs), and point `MNEMO_DEFAULT_VAULT` at a vault dedicated to agent work rather than your personal notes. See the [`mnemosyne-memory` skill](./skills/mnemosyne-memory/SKILL.md) — a portable [agentskills.io](https://agentskills.io)-standard skill that teaches any agent the governance rules (discover vaults first, respect protection levels, ingest with provenance, read before you write).

### Any other MCP client

```bash
npx -y @mnemosyne_os/mcp
```

The MCP speaks standard JSON-RPC over stdio.

---

## Configure your vaults

Mnemosyne OS Infinity exposes **one vault per tracked folder** (the folder name uppercased), plus three reserved names: `DEV`, `PERSONAL`, `SOCIAL`. Tell the MCP which ones you want your agent to reach via two env vars:

| Env var | Purpose | Default |
|---|---|---|
| `MNEMO_DEFAULT_VAULT` | Vault used when the agent does not specify one. | `DEV` |
| `MNEMO_VAULTS` | Comma-separated list of vaults the MCP declares scopes for. | `DEV,PERSONAL,SOCIAL` |

### Examples

**A developer whose Infinity tracks `~/Documents/INFINITY/code-projects/`:**

```json
"env": {
  "MNEMO_DEFAULT_VAULT": "CODE_PROJECTS",
  "MNEMO_VAULTS": "CODE_PROJECTS,NOTES,RESEARCH"
}
```

**A researcher who keeps everything in `~/Documents/INFINITY/papers/`:**

```json
"env": {
  "MNEMO_DEFAULT_VAULT": "PAPERS",
  "MNEMO_VAULTS": "PAPERS,REFS,IDEAS"
}
```

> If your agent queries a vault that is not in `MNEMO_VAULTS`, the server returns `SCOPE_DENIED`. Add the vault name to the list and restart your MCP client.

---

## Optional: let your agent render a voice

Mnemosyne OS ships local, offline text-to-speech engines that can clone a voice from a short reference clip. With one env var, your agent gets three extra tools that turn a written script into a **WAV file on disk** — made for voice-overs (TikTok, YouTube, podcast, narration).

```json
"env": {
  "MNEMO_VOICE": "1"
}
```

| Tool | What it does |
|---|---|
| **`mnemosyne_voices`** | List the local engines (installed or not) and the reference voices available for cloning. Call it first. |
| **`mnemosyne_speak`** | Render a script to a WAV. Long scripts are split at sentence boundaries and re-assembled into one file — nothing is truncated. Returns a job; the tool waits, then hands back a job id if the render is still going. |
| **`mnemosyne_speak_status`** | Poll or cancel a render; returns the file path when it is done. |

**Off by default, and on purpose.** Turning it on makes Mnemosyne ask *you* to authorize `voice:speak` — a permission that is never auto-granted, not even to first-party apps like this one, because its subject is your identity rather than your data. You approve it once, in a dialog that says what it means.

What it will not do: it never creates or records a voice (you do that in the app, Settings → Voice), and a clone name that does not exist is **refused**, never quietly replaced with another voice — a voice-over in the wrong voice sounds perfect and is worthless.

**Requirements:** the Mnemosyne OS app must be running (the engines are Python sidecars inside it — the headless daemon cannot speak), a local voice must be installed, and local neural TTS is a licensed feature.

---

## Verify it works

Open a new conversation with your agent and ask, for example:

> *Use mnemosyne_query to search my vault for "authentication flow", spine_type_filter ARCHITECTURE only.*

You should see a structured response with 5–10 chronicles, each tagged with its spineType, score, source, and a content snippet. If the agent says it cannot connect, see [Troubleshooting](#troubleshooting).

---

## The 25 tools your agent gets

Twenty-two below, plus the three that read the other agents on this machine. Setting
`MNEMO_VOICE=1` adds the three voice tools documented further up, for 28 in all.

| Tool | What it does |
|---|---|
| **`mnemosyne_about`** | Re-read the briefing you were handed on connect: the governance tenet, the vault protection model (NORMAL / MAXIMUM, `mixableWith`, isolated sandbox vaults), the spine model, and what an agent working on someone's memory must and must not do. Call it if your client did not surface the server instructions, or any time you want them again. |
| **`mnemosyne_query`** | Semantic search — returns raw chronicles ranked by cosine × spineType weight (SOURCE_CODE scope by default). Supports `spine_type_filter`, `max_content_chars`, `limit` (≤ 50). |
| **`mnemosyne_ask`** | **Ask Mnemosyne a question, get a synthesized prose answer** grounded in the vault (RAG+LLM), plus its source chronicles. Use for "why / who / how" questions that need reasoning across many memories. Slower than `query` (runs the LLM). |
| **`mnemosyne_vaults`** | List the vaults Mnemosyne OS exposes (id, name, chronicle count) — call it to discover valid `vault` targets. |
| **`mnemosyne_ingest`** | Persist a memory — pick a `spine_type` (ARCHITECTURE / DECISION / BUGFIX / FEATURE / NOTE / SESSION / RESONANCE / CUSTOM). |
| **`mnemosyne_todo_add`** | Put tasks into the human's **To-do backlog** (the widget on their canvas), in order, optionally under named steps — "make tasks out of everything we said we would do". Name the `list` or pass `create_list: true`; an unknown name is refused with the lists that exist, never filed under a default. With a window the write goes through the widget's own store; on macOS with the window closed the host writes the file directly. Works with the app closed on a dev install (the headless daemon reads the file); an npm install has no daemon and needs the app running. Scope `todo:write`. |
| **`mnemosyne_cockpit_update`** | Your own **status card** on the human's canvas (the cockpit): `state` working / waiting / done / blocked / closed, a `title`, one `status` line, up to 4 `detail` lines. Declared, never inferred — the host prints your state next to the time since your last call, so call at real milestones. "waiting" and "blocked" make the card pulse and the taskbar flash. The answer carries the messages the human left on your card (its mailbox) — read and act on them. Needs the app window open (the card lives on the canvas). Scope `cockpit:write`. |
| **`mnemosyne_pheme_watch`** | Put a subreddit, a Hacker News query or a topic on the human's **Pheme radar** (their reputation cartridge), or take one off. The lists are theirs: an op that would empty one is refused, each op reports its own outcome, and the human sees a receipt in Pheme naming the agent and what changed. Nothing here posts anywhere. Needs the app running; Pheme itself may be closed. Scope `pheme:profile`. |
| **`mnemosyne_pheme_radar`** | Read what the **Pheme radar** last found: fresh threads in the watched subreddits and HN queries, with a topic score and, after the human's Mnemosyne pass, a tier. The answer leads with **when** the scan ran — it is as fresh as the last scan the human ran, never fresher, and "no radar yet" is said as such, never as an empty list. Draft the reply; the human posts it. Needs the app running. Scope `pheme:read`. |
| **`mnemosyne_agenda_add`** | Put appointments or deadlines into the human's **calendar** (the Agenda widget on their canvas) — "add this to my calendar", a deadline, a meeting. `start` (and optional `end`) are ISO 8601; no timezone offset is read as the human's own machine local time. Supports `all_day`, `recurrence` (daily/weekly/monthly/yearly), and `alarm_minutes_before` for a reminder. Works with the app closed on a dev install (the headless daemon reads the file); an npm install has no daemon and needs the app running. To CHANGE or REMOVE one, see `mnemosyne_agenda_update` and `mnemosyne_agenda_remove` below. Scope `agenda:write`. |
| **`mnemosyne_todo_list`** | **Read the backlog back** — the lists, and every task with the **id** you need to change it. Call it before `mnemosyne_todo_update`: that tool names tasks by id and never by text, because "delete the task about the invoice" is how the wrong task goes, in a sentence that reads perfectly either way. Filters by `list`, `include_done`, `limit`; the archive is counted, never listed. Works with the app closed on a dev install (the headless daemon reads the file); an npm install has no daemon and needs the app running. Scope `todo:read`. |
| **`mnemosyne_todo_update`** | **Change tasks**: `edit`, `complete`, `move`, `remove`. Every op names an id from `mnemosyne_todo_list`. `remove` **archives** by default (recoverable); `permanent: true` deletes outright and must be asked for. The batch applies in order as one save, and each op reports its own outcome, so a stale id does not sink the ones around it. Works with the app closed on a dev install (the headless daemon reads the file); an npm install has no daemon and needs the app running. Scope `todo:write`. |
| **`mnemosyne_todo_lists`** | **Manage the lists themselves**: `list.create`, `list.edit` (rename / recolour), `list.remove`. A list that still holds tasks is never removed — you are told how many are in the way, because picking a destination on someone's behalf is how a tidy-up becomes a loss. The three original lists can be renamed but not removed. Works with the app closed on a dev install (the headless daemon reads the file); an npm install has no daemon and needs the app running. Scope `todo:write`. |
| **`mnemosyne_agenda_list`** | **Read the calendar back** — appointments in a time window, each with the **id** the two tools below require. A repeating event appears once, with its cadence and its next occurrence. An event with nothing left to happen says so rather than showing its original start as a future date. Works with the app closed on a dev install (the headless daemon reads the file); an npm install has no daemon and needs the app running. Scope `agenda:read`. |
| **`mnemosyne_agenda_update`** | **Change an appointment**: move it, rename it, add or drop a reminder, start or stop it repeating. A field left out is left alone; `null` clears it. An unreadable date **refuses** the change rather than leaving the old one silently in place, and an unknown cadence is refused rather than quietly made a one-off. Works with the app closed on a dev install (the headless daemon reads the file); an npm install has no daemon and needs the app running. Scope `agenda:write`. |
| **`mnemosyne_agenda_remove`** | **Remove appointments, by id only** — never by title, never by date range. ⚠️ The calendar has **no archive**: unlike a To-do task, a removed appointment is gone, so the answer names each one by title and start time for the human to check. A repeating appointment goes as the whole series; the calendar cannot cancel one occurrence. Works with the app closed on a dev install (the headless daemon reads the file); an npm install has no daemon and needs the app running. Scope `agenda:write`. |
| **`mnemosyne_resonances`** | List active Resonances (cognitive workspaces / ongoing projects). |
| **`mnemosyne_get_position`** | Get the last saved position of a Resonance — phase, what was done. |
| **`mnemosyne_update_position`** | Save current position — persisted as a `DECISION` chronicle. |
| **`mnemosyne_git_log`** | Recent commits from the active monorepo (requires `monorepo:read` scope). |
| **`mnemosyne_spine_assignments`** | How the memories were actually classified: chronicle-to-spine assignments for a vault, newest first, with whole-vault counts per spine and, on request, the taxonomy tree. It is also where the taxon ids come from, so read it instead of guessing a `spine_type_filter`. |
| **`mnemosyne_dream_bridges`** | The links the Dream State engine found on its own while the machine sat idle, each with its score and an excerpt of both sides, sometimes across two vaults. An empty list is the normal answer and means it has produced none yet, never that the query failed. |

### Seeing the other agents on this machine

These three read the transcripts coding-agent harnesses already write to disk. **No app, no vault, no tokens** — which is what makes "check before you commit" cheap enough to actually do.

| Tool | What it does |
|---|---|
| **`mnemosyne_agent_collisions`** | **Are two agent sessions live on the same project and branch right now?** Call it before `git add -A`, before a commit and before a rebase: the git index is shared by every process in one working tree, so a commit from one session picks up whatever the other has staged. |
| **`mnemosyne_agents`** | The sessions on this machine — conversation name, project, branch, model, last tool, file count, and when a line was last written. |
| **`mnemosyne_agent_files`** | Which files other sessions recently wrote, newest first, with the session each came from. Paths and timestamps only. |

**No configuration needed.** Every shipped connector whose folder exists on this machine is read, and each answer names the folders it actually opened. Override only if your agent writes somewhere unusual:

```jsonc
"env": {
  // Per harness. Absent means "where that agent writes by default".
  "MNEMO_AGENT_SESSIONS": "C:/Users/you/.claude/projects",
  "MNEMO_AGENT_SESSIONS_ANTIGRAVITY": "…",
  "MNEMO_AGENT_SESSIONS_ANTIGRAVITY_IDE": "…",
  // Restrict to a subset. Absent means all of them.
  "MNEMO_AGENT_SOURCES": "claude-code,antigravity"
}
```

**One line you do want, though — `← you`.** A stdio MCP server is launched with the
`env` its config declares, so the caller's own session id does not arrive on its
own. Without it the report cannot mark which line is yours, and it counts one
session too many — the exact miscount these tools exist to prevent. Pass it
through:

```jsonc
"env": {
  "CLAUDE_CODE_SESSION_ID": "${CLAUDE_CODE_SESSION_ID}"
}
```

If you skip it, or if the variable is not set where Claude Code runs (it then
arrives as the literal `${CLAUDE_CODE_SESSION_ID}`), the answer says so in one
sentence and tells you which of the two happened. It never guesses: an id it
cannot place stays neutral rather than becoming "none of these is you", because
that would add a phantom session to every warning.

**Three things these tools will not do**, because a tool that overstates its evidence is worse than no tool:

- **They never say an agent is "working".** A crashed agent and an idle one fall equally silent. They report when a line was last *seen*; you conclude.
- **They never return content** — no message text, no file contents, no tool output. A transcript holds everything that passed in front of an agent for a month. What crosses is metadata.
- **A clean answer is not proof the machine is quiet.** It covers the folders it names, and it says which known harnesses were not present. A session whose transcripts live elsewhere does not appear at all.
- **A session it cannot place is reported, not dropped.** Some harnesses record no working directory at all (Antigravity is one), and 91 of 288 sessions measured on one machine carry neither a project nor a branch. Grouping those together would announce collisions that nothing supports, so they are listed separately with the reason.

A file is marked `recorded` when the harness logged a file-writing tool call, and `from a command` when a redirection was read out of a shell command that may never have completed. Those are different kinds of fact and are never merged.

### `mnemosyne_query` — full parameter reference

```ts
{
  query:              string;        // required — be specific, longer is fine
  limit?:             number;        // default 10, capped at 50 server-side
  vault?:             string;        // default: $MNEMO_DEFAULT_VAULT
  spine_type_filter?: string[];      // e.g. ["ARCHITECTURE"], ["GIT","BUGFIX"]
  max_content_chars?: number;        // default 600 — trims each result snippet
}
```

The MCP automatically opts into the semantic ranking branch (Vertex 768D / e5-base) and applies an exact-term boost for identifier-like tokens in your query (codenames, hyphenated tokens, version numbers). The result is a list of chronicles ranked by true semantic relevance, not recency.

---

## The cognitive loop — recommended pattern

```
At session start
  agent → mnemosyne_get_position("my-project")
        ← phase, last position, what was being worked on

During the session
  agent → mnemosyne_query("auth refactor decisions",
                          spine_type_filter=["ARCHITECTURE","DECISION"])
        ← top 10 chronicles, ranked by relevance

When making a decision worth keeping
  agent → mnemosyne_ingest(
            content="Chose JWT over session cookies because we need stateless
                     workers; trade-off: token revocation needs a denylist.",
            spine_type="DECISION")

At session end
  agent → mnemosyne_update_position("my-project",
                                     position="JWT migration shipped — next:
                                               denylist via Redis",
                                     phase="Phase 12")

Next session
  agent → mnemosyne_get_position("my-project")
        ← Resumes from Phase 12 with full context
```

---

## Troubleshooting

### "Cannot connect to ws://127.0.0.1:7799"

Mnemosyne OS Infinity is not running. Launch it. The MCP retries on every tool call, so once Infinity is up, the next query will succeed.

### Agent gets `SCOPE_DENIED` on a vault

The vault is not in `MNEMO_VAULTS`. Edit your MCP client config, add the name (uppercased), restart the client.

### Which vaults can my agent see?

Ask the agent to run **`mnemosyne_vaults`** — it lists every vault Mnemosyne OS exposes (id, name, chronicle count) and flags which ones are outside your `MNEMO_VAULTS` config (those return `SCOPE_DENIED` until you add them).

### Tool result is too large for my context window

Use `max_content_chars` to shrink each snippet (default 600, you can drop to 200 for browsing, raise to 4000 to read a full file). Or filter with `spine_type_filter` to drop noisy types.

### My new chronicles do not appear

DocWatch ingests on file save with a small delay. Check the spine: if you wrote a markdown with `spine: IDEATIONAL` frontmatter, it lands as IDEATIONAL — query with `spine_type_filter=["IDEATIONAL"]` to surface it.

---

## Privacy

- The MCP **never** talks to any cloud directly. It only opens a WebSocket to `127.0.0.1:7799` on your machine.
- Embedding (when enabled) is done by Mnemosyne OS Infinity using **your** Vertex AI / local model — never the MCP's.
- No telemetry. No usage tracking. The MCP itself is a 16 KB stateless bridge.
- Your AI agent (Claude / Cursor / Copilot) sees only the chronicles you allow via tool calls — never your raw vault file or vector store.
- The agent-awareness tools read transcript files locally and return **metadata only**. They never open a network connection at all.

---

## Ecosystem

| Package | What it is |
|---|---|
| **`@mnemosyne_os/mcp`** *(you are here)* | MCP server — gives AI agents vault access |
| [`@mnemosyne_os/sdk`](https://www.npmjs.com/package/@mnemosyne_os/sdk) | TypeScript SDK — build Layer 2 apps directly on the WebSocket API |
| [`@mnemosyne_os/forge`](https://www.npmjs.com/package/@mnemosyne_os/forge) | CLI — scaffold, list chronicles, import / export |

---

## The `@mnemosyne_os` packages

All of them live under one npm organization:
**[npmjs.com/org/mnemosyne_os](https://www.npmjs.com/org/mnemosyne_os)**

| Package | What it is |
|---|---|
| [`@mnemosyne_os/sdk`](https://www.npmjs.com/package/@mnemosyne_os/sdk) | Build a **Layer 2 app** — a Node or browser process talking to the local WebSocket surface |
| [`@mnemosyne_os/create-app`](https://www.npmjs.com/package/@mnemosyne_os/create-app) | `npm create @mnemosyne_os/app` — scaffolds that Layer 2 app in one command |
| [`@mnemosyne_os/cartridge-sdk`](https://www.npmjs.com/package/@mnemosyne_os/cartridge-sdk) | Build an **in-app cartridge** — a sandboxed iframe widget rendered on the canvas |
| **`@mnemosyne_os/mcp`** *(you are here)* | **MCP server** — plug Claude, Cursor or any MCP agent into the vaults |
| [`@mnemosyne_os/design-sdk`](https://www.npmjs.com/package/@mnemosyne_os/design-sdk) | **Skin the OS** with JSON alone, no TypeScript |
| [`@mnemosyne_os/public-contracts`](https://www.npmjs.com/package/@mnemosyne_os/public-contracts) | The shared **types and Zod schemas**. No business logic |
| [`@mnemosyne_os/agent-transcripts`](https://www.npmjs.com/package/@mnemosyne_os/agent-transcripts) | Read what **coding agents already write on disk** — connector format + interpreter |
| [`@mnemosyne_os/affine-reader`](https://www.npmjs.com/package/@mnemosyne_os/affine-reader) | Read a local **AFFiNE workspace** and render its documents to Markdown |
| [`@mnemosyne_os/forge`](https://www.npmjs.com/package/@mnemosyne_os/forge) | **CLI** — scaffold, list chronicles, import / export |
| [`@mnemosyne_os/sync`](https://www.npmjs.com/package/@mnemosyne_os/sync) | The name of the **P2P layer to come**. A placeholder today, not the library |

---

## Where Mnemosyne OS lives

Published by XPACEGEMS LLC. Its official addresses:

- Product site: <https://mnemosyne-os.io>
- Organizations: <https://mnemosyne-os.com>
- Documentation: <https://docs.mnemosyne-os.io>
- Source: <https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS>
- Packages: <https://www.npmjs.com/org/mnemosyne_os>
- MCP registry: `io.github.Mnemosyne-OS/mcp` on <https://registry.modelcontextprotocol.io>

---

## License

MIT © [Tony Trochet / XPACEGEMS LLC](https://xpacegems.com)

---

## The OS your code talks to

<img src="https://raw.githubusercontent.com/Mnemosyne-OS/Mnemosyne-Neural-OS/main/assets/infinite-canvas.jpg" width="100%" alt="Mnemosyne OS — Infinity Edition: the infinite canvas, the image gallery, MnemoHub and the living memory" />

*Mnemosyne OS — Infinity Edition · [download](https://mnemosyne-os.io/download) · [mnemosyne-os.io](https://mnemosyne-os.io) · [mnemosyne-os.com](https://mnemosyne-os.com)*
