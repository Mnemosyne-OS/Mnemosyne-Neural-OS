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

## What this is

`@mnemosyne_os/mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) server that
turns your local [Mnemosyne OS](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS) install into a
queryable memory layer for any AI agent that speaks MCP.

Once configured, your agent can:

- 🧠 **Query** code, architecture, decisions, and git history with true semantic ranking (Vertex / e5-base / nomic).
- 💾 **Persist** new decisions, sessions, or insights so future agents can recover them.
- 🎯 **Resume** projects exactly where you left off via Resonance positions.
- 📡 **Filter** results by spineType (`ARCHITECTURE`, `GIT`, `SOURCE_CODE`, `BUGFIX`, …).

**Everything stays on your machine.** No telemetry. No cloud. Your `claude.ai` conversation never sees your code — only the chronicles you allow.

---

## Requirements

Two things must be running locally:

1. **[Mnemosyne OS Infinity Edition](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS)** — the runtime that owns your vaults and exposes the WebSocket gateway on `ws://127.0.0.1:7799`. Get it from the project repo's releases page.
2. **Node.js ≥ 18** — to run the MCP itself.

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

## The 8 tools your agent gets

| Tool | What it does |
|---|---|
| **`mnemosyne_query`** | Semantic search — returns raw chronicles ranked by cosine × spineType weight (SOURCE_CODE scope by default). Supports `spine_type_filter`, `max_content_chars`, `limit` (≤ 50). |
| **`mnemosyne_ask`** | **Ask Mnemosyne a question, get a synthesized prose answer** grounded in the vault (RAG+LLM), plus its source chronicles. Use for "why / who / how" questions that need reasoning across many memories. Slower than `query` (runs the LLM). |
| **`mnemosyne_vaults`** | List the vaults Mnemosyne OS exposes (id, name, chronicle count) — call it to discover valid `vault` targets. |
| **`mnemosyne_ingest`** | Persist a memory — pick a `spine_type` (ARCHITECTURE / DECISION / BUGFIX / FEATURE / NOTE / SESSION / RESONANCE / CUSTOM). |
| **`mnemosyne_resonances`** | List active Resonances (cognitive workspaces / ongoing projects). |
| **`mnemosyne_get_position`** | Get the last saved position of a Resonance — phase, what was done. |
| **`mnemosyne_update_position`** | Save current position — persisted as a `DECISION` chronicle. |
| **`mnemosyne_git_log`** | Recent commits from the active monorepo (requires `monorepo:read` scope). |

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

---

## Ecosystem

| Package | What it is |
|---|---|
| **`@mnemosyne_os/mcp`** *(you are here)* | MCP server — gives AI agents vault access |
| [`@mnemosyne_os/sdk`](https://www.npmjs.com/package/@mnemosyne_os/sdk) | TypeScript SDK — build Layer 2 apps directly on the WebSocket API |
| [`@mnemosyne_os/forge`](https://www.npmjs.com/package/@mnemosyne_os/forge) | CLI — scaffold, list chronicles, import / export |

---

## Where Mnemosyne OS lives

Published by XPACEGEMS LLC. Its official addresses:

- Product site: <https://mnemosyne-os.io>
- Organizations: <https://mnemosyne-os.com>
- Documentation: <https://docs.mnemosyne-os.io>
- Source: <https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS>
- Packages: the npm scope `@mnemosyne_os`

---

## License

MIT © [Tony Trochet / XPACEGEMS LLC](https://xpacegems.com)

---

## The OS your code talks to

<img src="https://raw.githubusercontent.com/Mnemosyne-OS/Mnemosyne-Neural-OS/main/assets/infinite-canvas.jpg" width="100%" alt="Mnemosyne OS — Infinity Edition: the infinite canvas, the image gallery, MnemoHub and the living memory" />

*Mnemosyne OS — Infinity Edition v1.4.0 · The Infinite Vision — [download](https://mnemosyne-os.io/download) · [mnemosyne-os.io](https://mnemosyne-os.io) · [mnemosyne-os.com](https://mnemosyne-os.com)*
