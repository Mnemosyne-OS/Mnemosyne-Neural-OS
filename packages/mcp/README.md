**@mnemosyne_os/mcp**: MCP server for Mnemosyne OS. Gives AI agents access to vault memory, resonances, git context, and to what the other coding agents on this machine are doing.

<div align="center">

<img src="https://raw.githubusercontent.com/Mnemosyne-OS/Mnemosyne-Neural-OS/main/assets/banner-mnemosyne-os.png" width="100%" alt="Mnemosyne OS. Your memory. Your machine. Your rules." />

**Product** [mnemosyne-os.io](https://mnemosyne-os.io) · **Company, press and labs** [mnemosyne-os.com](https://mnemosyne-os.com) · **Documentation** [docs.mnemosyne-os.io](https://docs.mnemosyne-os.io)

</div>

# @mnemosyne_os/mcp

> **Give Claude, Cursor, Hermes Agent, Copilot, and any MCP-compatible agent access to your local Mnemosyne OS memory vault.**
> Code, decisions, architecture notes, git history, semantically queryable. The vaults stay on your machine, and this server opens exactly one socket: `127.0.0.1:7799`.

[![npm version](https://img.shields.io/npm/v/@mnemosyne_os/mcp)](https://www.npmjs.com/package/@mnemosyne_os/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js ≥18](https://img.shields.io/badge/node-%3E%3D18-green)](https://nodejs.org)
[![Mnemosyne OS MCP server – quality and maintenance score on Glama](https://glama.ai/mcp/servers/Mnemosyne-OS/Mnemosyne-Neural-OS/badges/score.svg)](https://glama.ai/mcp/servers/Mnemosyne-OS/Mnemosyne-Neural-OS)

---

> 🍳 **In a hurry?** [**RECIPES.md**](./RECIPES.md) gives your coding agent a persistent memory in one copy-paste block, for Claude Code, Cursor, Claude Desktop and the TypeScript SDK.

## What this is

`@mnemosyne_os/mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) server that
turns your local [Mnemosyne OS](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS) install into a
queryable memory layer for any AI agent that speaks MCP.

Once configured, your agent can:

- **Query** code, architecture, decisions and git history with real semantic
  ranking (Vertex, e5-base or nomic).
- **Persist** new decisions, sessions or insights, so future agents can recover
  them.
- **Resume** a project exactly where you left off, through Resonance positions.
- **Filter** results by spineType: `ARCHITECTURE`, `GIT`, `SOURCE_CODE`,
  `BUGFIX` and the rest.

**The MCP itself opens exactly one socket: `127.0.0.1:7799`.** It sends nothing anywhere else and keeps no state. Your `claude.ai` conversation sees only the chronicles you allow. What Mnemosyne OS does behind that socket follows the route you configured.
`mnemosyne_memory_ask` runs whichever model you picked, local or cloud.

---

## Requirements

**Node.js ≥ 18** is the only hard requirement.

The **memory** tools additionally need **[Mnemosyne OS Infinity Edition](https://mnemosyne-os.io/download)** running. It owns your vaults and exposes the WebSocket gateway on
`ws://127.0.0.1:7799`. It is a desktop application, and it is where your content lives.

The three **agent-awareness** tools need neither: `mnemosyne_agent_list`,
`mnemosyne_agent_collisions` and `mnemosyne_agent_files`. They read transcript
files your coding-agent harness already writes to disk, so they answer with the
app closed, with no vault, and without spending a token. They read **every**
harness they find, so a Claude Code session can see an Antigravity session
running in the same repository.

> **The MCP is a thin bridge.** It does not store anything itself. All data lives in Mnemosyne OS Infinity (`%APPDATA%\@mnemosyne-workspace\infinity-edition\vaults\*.db` on Windows, `~/Library/Application Support/...` on macOS).

## Getting your code, commits and docs in

Three different routes, and only one of them ingests anything. Knowing which is
which saves you looking for a feature that is not where you expect it.

**Your files: source, architecture notes, decision records.** You declare a
folder, the app watches it, and what lands there is ingested into the vault you
chose. Nothing is uploaded and nothing is scanned that you did not name. This is
the step people miss: installing the app gives you empty vaults, and declaring
the folder is what fills them.
See [Getting started](https://docs.mnemosyne-os.io/category/getting-started) and
[DocWatch](https://docs.mnemosyne-os.io/engines/docwatch). The full walkthrough,
including why there is an application behind this server at all, is
[Get your repository into memory](https://docs.mnemosyne-os.io/developers/your-code-in-memory).

**Your commits.** `mnemosyne_git_log` reads the repository the app is
configured to read, at the moment you call it. Nothing is ingested and nothing
is stored, so history is never stale and never doubled.

**What your agents did.** `mnemosyne_agent_list`, `mnemosyne_agent_collisions`
and `mnemosyne_agent_files` read the transcript files your harness already
writes. No app, no vault, no token. Those three work the minute this server is
installed, which is why they are the ones to try first.

⚠️ Without the app running, everything else refuses and says so. The refusal
names what it checked: whether `~/.mnemosyne` exists tells it whether the app
has ever run on this machine, and it says "install it" and "start it" as two
different sentences, because they are two different problems.

---

## Install, in 30 seconds

### Claude Desktop, one click

Download **[Mnemosyne-OS-MCP-2.1.0.mcpb](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS/releases/download/v1.5.1-infinity/Mnemosyne-OS-MCP-2.1.0.mcpb)**
(4.1 MB), then open Claude Desktop → **Settings → Extensions** and drop the
file into that panel. That is the whole install. The 25 tools appear straight away, and the same
panel offers the three optional settings: default vault, other vaults, and the
port the desktop application listens on.

The bundle rides on the application's current release,
[`v1.5.1-infinity`](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS/releases/tag/v1.5.1-infinity),
because this package has no release of its own. Its own version is the npm one,
2.1.0, and that is what the file is named after. Earlier bundles stay attached
to `v1.4.5-infinity`, so a link someone saved keeps working.

Two things worth knowing before you do it:

- Claude Desktop shows a red **"unverified developer"** notice first. Every
  unsigned bundle does. This one is built from the repository linked at the top
  of this file, by `packages/mcp/scripts/build-mcpb.mjs`.
- **Double-clicking the file does nothing** if your Claude Desktop came from the
  Microsoft Store: a Store app does not register the `.mcpb` extension with
  Windows. Drop it into the Extensions panel instead.

### Claude Desktop, config file

If you would rather not install an extension, or you are on a build that has no
Extensions panel:

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

[Hermes Agent](https://github.com/NousResearch/hermes-agent) from Nous Research ships with MCP support, so there is no extra install step.
Add to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  mnemosyne:
    command: "npx"
    args: ["-y", "@mnemosyne_os/mcp"]
    env:
      MNEMO_DEFAULT_VAULT: "DEV"
      MNEMO_VAULTS: "DEV,NOTES"
```

Restart Hermes. Your agent now has a sovereign long-term memory it can query
semantically, and everything stays on your machine, which is exactly the deal
Hermes promises you.

**Recommended for autonomous agents:** grant read scopes narrowly, to the
vaults the task needs and no others. Point `MNEMO_DEFAULT_VAULT` at a vault
dedicated to agent work rather than at your personal notes.

The [`mnemosyne-memory` skill](./skills/mnemosyne-memory/SKILL.md) is a
portable [agentskills.io](https://agentskills.io)-standard skill that teaches
any agent the governance rules: discover vaults first, respect protection
levels, ingest with provenance, read before you write.

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

Mnemosyne OS ships local, offline text-to-speech engines that can clone a voice from a short reference clip. With one env var, your agent gets three extra tools that turn a written script into a **WAV file
on disk**. They are made for voice-overs: TikTok, YouTube, podcast, narration.

```json
"env": {
  "MNEMO_VOICE": "1"
}
```

| Tool | What it does |
|---|---|
| **`mnemosyne_voice_list`** | List the local engines, installed or not, and the reference voices available for cloning. Call it first. |
| **`mnemosyne_voice_speak`** | Render a script to a WAV. Long scripts are split at sentence boundaries and re-assembled into one file, with nothing truncated. It returns a job: the tool waits, then hands back a job id if the render is still going. |
| **`mnemosyne_voice_status`** | Poll or cancel a render. It returns the file path once the render is done. |

**Off by default, on purpose.** Turning it on makes Mnemosyne OS ask *you* to
authorize `voice:speak`. That permission is never auto-granted, not even to
first-party apps like this one, because its subject is your identity rather than
your data. You approve it once, in a dialog that says what it means.

Two limits. The agent never creates or records a voice; you do that in the app,
under Settings → Voice. A clone name that does not exist is **refused** rather
than quietly replaced, because a voice-over in the wrong voice sounds perfect
and is worthless.

**Requirements:** the Mnemosyne OS app must be running, since the engines are
Python sidecars inside it and the headless daemon cannot speak. A local voice
must be installed, and local neural TTS is a licensed feature.

---

## Verify it works

Open a new conversation with your agent and ask, for example:

> *Use mnemosyne_memory_query to search my vault for "authentication flow", spine_type_filter ARCHITECTURE only.*

You should see a structured response with 5–10 chronicles, each tagged with its spineType, score, source, and a content snippet. If the agent says it cannot connect, see [Troubleshooting](#troubleshooting).

---

## The 25 tools your agent gets

Twenty-two are in the table below. The three that read the other agents on this
machine have their own section further down. Setting `MNEMO_VOICE=1` adds the
three voice tools documented further up, and `MNEMO_FORGET=1` adds the erasure
tool, for 29 in all.

Six of them read or write the To-do backlog and the calendar. All six carry the
same requirement:

Works with the app closed on a dev install (the headless daemon reads the file); an npm install has no daemon and needs the app running.

| Tool | What it does |
|---|---|
| **`mnemosyne_about`** | Re-read the briefing the agent was handed on connect: the governance tenet, the vault protection model, the spine model, and the rules for an agent working on someone else's memory. Call it if your client did not surface the server instructions. |
| **`mnemosyne_memory_query`** | Semantic search. It returns raw chronicles, ranked by vector similarity fused with a local BM25 channel and weighted by spineType. Supports `spine_type_filter`, `max_content_chars` and `limit` (50 max). |
| **`mnemosyne_memory_ask`** | Ask a question, get a synthesized prose answer grounded in the vault, plus its source chronicles. Use it for why, who and how questions that span many memories. It runs the full RAG pipeline, which also makes it the better retriever, and it is slower than `query`. |
| **`mnemosyne_vault_list`** | List the vaults Mnemosyne OS exposes, with each one's token, name and chronicle count. Call it to discover valid `vault` targets. |
| **`mnemosyne_memory_forget`** | Erase one chronicle for good, by the id `mnemosyne_memory_query` returned. Absent unless you set `MNEMO_FORGET=1`, and the app wants the `FORGET` intent on top of that. You arm erasure by hand, because writing a new chronicle cannot undo it. |
| **`mnemosyne_memory_ingest`** | Persist a memory. Pick a `spine_type`: ARCHITECTURE, DECISION, BUGFIX, FEATURE, NOTE, SESSION, RESONANCE or CUSTOM. |
| **`mnemosyne_todo_add`** | Put tasks into the user's **To-do backlog**, in order and optionally under named steps. Name the `list`, or pass `create_list: true`. An unknown name is refused with the lists that exist. With a window open the write goes through the widget's own store; on macOS with the window closed the app writes the file directly. Scope `todo:write`. |
| **`mnemosyne_cockpit_update`** | Your own **status card** on the user's canvas: `state` working, waiting, done, blocked or closed, a `title`, one `status` line, up to 4 `detail` lines. You declare the state, and the app prints it next to the time since your last call, so call at real milestones. "waiting" and "blocked" make the card pulse and the taskbar flash. The answer carries the messages the user left on your card. Send `desktop` once, with the name of a board the user gives you, and this session’s cards go there for the rest of the conversation; leave it out and they go to whichever board answers for this project. Needs the app window open. Scope `cockpit:write`. |
| **`mnemosyne_pheme_watch`** | Add a subreddit, a Hacker News query or a topic to the user's **Pheme radar**, or take one off. The lists are theirs. An operation that would empty one is refused, each one reports its own outcome, and the user gets a receipt in Pheme naming the agent and what changed. It posts nowhere. Needs the app running, though Pheme itself can be closed. Scope `pheme:profile`. |
| **`mnemosyne_pheme_radar`** | Read what the **Pheme radar** last found: fresh threads in the watched subreddits and Hacker News queries, with a topic score and, after the user's Mnemosyne OS pass, a tier. The answer leads with **when** the scan ran, because it is only as fresh as the last scan the user ran. "No radar yet" is said in words rather than returned as an empty list. Draft the reply; the user posts it. Needs the app running. Scope `pheme:read`. |
| **`mnemosyne_agenda_add`** | Put appointments or deadlines into the user's **calendar**. `start` and the optional `end` are ISO 8601, and a time with no offset is read as the user's own machine local time. Supports `all_day`, `recurrence` (daily, weekly, monthly, yearly) and `alarm_minutes_before`. To change or remove one, see `mnemosyne_agenda_update` and `mnemosyne_agenda_remove`. Scope `agenda:write`. |
| **`mnemosyne_todo_list`** | Read the backlog back: the lists, and every task with the **id** you need to change it. Call it before `mnemosyne_todo_update`, which names tasks by id. A phrase like "delete the task about the invoice" reads perfectly and can still match the wrong task. Filters by `list`, `include_done` and `limit`. The archive is counted rather than listed. Scope `todo:read`. |
| **`mnemosyne_todo_update`** | **Change tasks**: `edit`, `complete`, `move`, `remove`. Every operation names an id from `mnemosyne_todo_list`. `remove` **archives** by default and stays recoverable; `permanent: true` deletes outright and has to be asked for. The batch applies in order as one save, and each operation reports its own outcome, so a stale id does not sink the ones around it. Scope `todo:write`. |
| **`mnemosyne_todo_categories`** | **Manage the lists themselves**: `list.create`, `list.edit` to rename or recolour, `list.remove`. A list that still holds tasks is never removed, and you are told how many are in the way. Move them first: the app will not pick a destination on someone else's behalf. The three original lists can be renamed, never removed. Scope `todo:write`. |
| **`mnemosyne_agenda_list`** | **Read the calendar back**: appointments in a time window, each with the **id** the two tools below require. A repeating event appears once, with its cadence and its next occurrence. An event with nothing left to happen says so rather than showing its original start as a future date. Scope `agenda:read`. |
| **`mnemosyne_agenda_update`** | **Change an appointment**: move it, rename it, add or drop a reminder, start or stop it repeating. A field left out is left alone, and `null` clears it. An unreadable date **refuses** the change rather than leaving the old one silently in place, and an unknown cadence is refused rather than quietly made a one-off. Scope `agenda:write`. |
| **`mnemosyne_agenda_remove`** | **Remove appointments, by id only.** The calendar has **no archive**: unlike a To-do task, a removed appointment is gone, so the answer names each one by title and start time for the user to check. A repeating appointment goes as a whole series, since the calendar cannot cancel one occurrence. Scope `agenda:write`. |
| **`mnemosyne_resonance_list`** | List the resonances recorded in the default vault. A resonance is a workspace that tracks one ongoing project. |
| **`mnemosyne_position_get`** | Read where one resonance was left: its phase, and the note written when the work stopped. |
| **`mnemosyne_position_update`** | Record where you left off. It is stored as a `DECISION` chronicle. |
| **`mnemosyne_git_log`** | Recent commits from the git repository Mnemosyne OS is configured to read (requires `monorepo:read` scope). |
| **`mnemosyne_spine_assignments`** | How the memories were actually classified: chronicle-to-spine assignments for a vault, newest first, with whole-vault counts per spine and, on request, the taxonomy tree. It is also where the taxon ids come from, so read it instead of guessing a `spine_type_filter`. |
| **`mnemosyne_dream_bridges`** | The links the Dream State engine found on its own while the machine sat idle, each with its score and an excerpt of both sides, sometimes across two vaults. An empty list is the normal answer and means it has produced none yet, never that the query failed. |

### Seeing the other agents on this machine

These three read the transcripts coding-agent harnesses already write to disk.
**No app, no vault, no tokens.** That is what makes "check before you commit"
cheap enough to actually do.

| Tool | What it does |
|---|---|
| **`mnemosyne_agent_collisions`** | **Are two agent sessions live on the same project and branch right now?** Call it before `git add -A`, before a commit and before a rebase. One working tree shares one git index, so a commit from one session picks up whatever the other has staged. |
| **`mnemosyne_agent_list`** | The sessions on this machine: conversation name, project, branch, model, last tool, file count, and when a line was last written. |
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

**One line you do want, though: `← you`.** A stdio MCP server is launched with the
`env` its config declares, so the caller's own session id does not arrive on its
own. Without it the report cannot mark which line is yours, and it counts one
session too many, which is the exact miscount these tools exist to prevent.
Pass it through:

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

**Four limits these tools hold to.** A tool that overstates its evidence is
worse than no tool.

- **They never say an agent is "working".** A crashed agent and an idle one fall
  equally silent. They report when a line was last *seen*, and you conclude.
- **They never return content.** No message text, no file contents, no tool
  output. A transcript holds everything that passed in front of an agent for a
  month. What crosses is metadata.
- **A clean answer is not proof the machine is quiet.** It covers the folders it
  names, and it says which known harnesses were not present. A session whose
  transcripts live elsewhere does not appear at all.
- **A session it cannot place is reported rather than dropped.** Some harnesses
  record no working directory at all, Antigravity among them, and 91 of 288
  sessions measured on one machine carry neither a project nor a branch.
  Grouping those together would announce collisions that nothing supports, so
  they are listed separately with the reason.

A file is marked `recorded` when the harness logged a file-writing tool call, and `from a command` when a redirection was read out of a shell command that may never have completed. Those are different kinds of fact and are never merged.

### Keep the status card honest, without the model remembering

`mnemosyne_cockpit_update` puts your session on the user's canvas, but only
when the model decides to call it. A session that forgets leaves a card saying
"working" long after it stopped, and a message the human typed on that card
waits for a call that may never come.

The package ships a **Claude Code hook** that closes both gaps. Install the
package so the binary is on your path, then wire it in your own settings. The
package never touches them.

```bash
npm install -g @mnemosyne_os/mcp
```

```jsonc
// .claude/settings.json, or ~/.claude/settings.json for every project
{
  "hooks": {
    "SessionStart":     [{ "hooks": [{ "type": "command", "command": "mnemosyne-cockpit-hook" }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "mnemosyne-cockpit-hook" }] }],
    "Notification":     [{ "hooks": [{ "type": "command", "command": "mnemosyne-cockpit-hook" }] }],
    "Stop":             [{ "hooks": [{ "type": "command", "command": "mnemosyne-cockpit-hook" }] }],
    "SessionEnd":       [{ "hooks": [{ "type": "command", "command": "mnemosyne-cockpit-hook" }] }]
  }
}
```

The event name arrives on stdin, so one command serves all five. What each does:

| Event | The card | Your mail |
|---|---|---|
| `SessionStart` | appears, **working** | delivered as context |
| `UserPromptSubmit` | **working**, status is your prompt's first line | delivered as context |
| `Notification` | **waiting**, and the question the harness is putting to you | — |
| `Stop` | **done**, status is the answer's first line | if mail is waiting, the stop is **refused** and the mail is the reason, so the session reads it instead of ending |
| `SessionEnd` | goes away | — |

Nothing clears **waiting** on its own, because answering a question is not a
prompt. The card holds it until the turn ends or you type something. The host
says how long it has been unconfirmed rather than quietly moving on.

**Do not reach for `npx` here**, even though the server line above uses it.
`npx --package=@mnemosyne_os/mcp mnemosyne-cockpit-hook` does work, and it cost
2.1 to 3.7 seconds a run on the machine where the installed binary cost 0.4 to
0.7. `UserPromptSubmit` fires on every message you send, so that difference is
the whole feature.

**It cannot cost you a session.** Every failure path writes one line to stderr
and exits 0. Measured on Windows through the installed binary: 0.40 to 0.58 s
with Mnemosyne OS running, 0.47 to 0.66 s with it closed. Most of that is Node
starting and the shim npm writes on Windows, since a closed local port refuses
at once. A refused stop cannot loop either: the mail is marked delivered when it
is handed over, so the next stop finds none and ends normally.

**Claude Code only.** The event names and the refusal format are Claude Code's
hook contract. Cursor and Antigravity have their own and will not fire this one.
The three agent-awareness tools above work with every harness; this hook does
not.

### `mnemosyne_memory_query`, full parameter reference

```ts
{
  query:              string;        // required; be specific, longer is fine
  limit?:             number;        // default 10, capped at 50 server-side
  vault?:             string;        // default: $MNEMO_DEFAULT_VAULT
  spine_type_filter?: string[];      // e.g. ["ARCHITECTURE"], ["GIT","BUGFIX"]
  max_content_chars?: number;        // default 600; trims each result snippet
}
```

The MCP automatically opts into the semantic ranking branch (Vertex 768D / e5-base) and applies an exact-term boost for identifier-like tokens in your query (codenames, hyphenated tokens, version numbers). The result is a list of chronicles ranked by true semantic relevance, not recency.

---

## The cognitive loop, a recommended pattern

```
At session start
  agent → mnemosyne_position_get("my-project")
        ← phase, last position, what was being worked on

During the session
  agent → mnemosyne_memory_query("auth refactor decisions",
                          spine_type_filter=["ARCHITECTURE","DECISION"])
        ← top 10 chronicles, ranked by relevance

When making a decision worth keeping
  agent → mnemosyne_memory_ingest(
            content="Chose JWT over session cookies because we need stateless
                     workers; trade-off: token revocation needs a denylist.",
            spine_type="DECISION")

At session end
  agent → mnemosyne_position_update("my-project",
                                     position="JWT migration shipped, next:
                                               denylist via Redis",
                                     phase="Phase 12")

Next session
  agent → mnemosyne_position_get("my-project")
        ← Resumes from Phase 12 with full context
```

---

## Troubleshooting

### "Cannot connect to ws://127.0.0.1:7799"

Mnemosyne OS Infinity is not running. Launch it. The MCP retries on every tool call, so once Infinity is up, the next query will succeed.

### Agent gets `SCOPE_DENIED` on a vault

The vault is not in `MNEMO_VAULTS`. Edit your MCP client config, add the name (uppercased), restart the client.

### Which vaults can my agent see?

Ask the agent to run **`mnemosyne_vault_list`**. It lists every vault
Mnemosyne OS exposes, with its id, name and chronicle count, and it flags the
ones outside your `MNEMO_VAULTS` config. Those return `SCOPE_DENIED` until you
add them.

### Tool result is too large for my context window

Use `max_content_chars` to shrink each snippet. The default is 600. Drop it to
200 for browsing, or raise it to 4000 to read a full file. You can also filter
with `spine_type_filter` to drop noisy types.

### My new chronicles do not appear

DocWatch ingests on file save with a small delay. Check the spine: if you wrote a markdown with `spine: IDEATIONAL` frontmatter, it lands as IDEATIONAL. Query with `spine_type_filter=["IDEATIONAL"]` to
surface it.

---

## Privacy Policy

This server is a bridge, not a service. It has no backend of its own, no account and no
hosted endpoint: it opens a WebSocket to `127.0.0.1:7799` on your own machine and relays to
the Mnemosyne OS desktop application running there.

**What it collects.** Nothing. No telemetry, no usage tracking, no analytics, no crash
reporting. It holds no identifier for you and never asks for one.

**What it stores.** Nothing of its own, since it is stateless between calls. Your chronicles live
in vaults on your disk, written and managed by the desktop application. The agent-awareness
tools read your coding agents' transcript files locally and return **metadata only** (paths,
counts, timestamps), never the text of a message or the contents of a file, and they open no
network connection at all.

**Who else sees it.** Two parties, both of them your choice, and nobody beyond them:

- **Your MCP client.** Whatever a tool returns goes to the AI client you
  connected, Claude or Cursor or another, and travels wherever that client
  sends it. That is what the server is for. It also means a chronicle you let
  an agent read leaves your machine when your client is a cloud model. Narrow
  `MNEMO_VAULTS` to the domains a given agent should reach. A vault left out is
  refused, including vaults that exist on the machine.
- **The desktop application**, for whatever you configured there yourself: a
  cloud model, a cloud embedder. Those calls are the application's, made with
  your own keys. This server neither makes them nor sees them.

The server itself shares with no one, sells nothing and rents nothing.

**How long it is kept.** By this server, not at all. In the application, for as long as you
keep it: memory is deleted where it is made, in the app and by you. Note that
`mnemosyne_memory_ingest` writes a **permanent** chronicle. It is the one call
here the agent cannot undo afterwards.

**Contact.** Privacy questions go to **dev@mnemosyne-os.com**, XPACEGEMS LLC, 2932 NW 72 Ave,
Miami, FL 33122, USA. Full policy: <https://mnemosyne-os.io/confidentialite>. Bugs and
security reports: <https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS/issues>.

---

## The `@mnemosyne_os` packages

All of them live under one npm organization:
**[npmjs.com/org/mnemosyne_os](https://www.npmjs.com/org/mnemosyne_os)**

| Package | What it is |
|---|---|
| [`@mnemosyne_os/sdk`](https://www.npmjs.com/package/@mnemosyne_os/sdk) | Build a **Layer 2 app**: a Node or browser process talking to the local WebSocket surface |
| [`@mnemosyne_os/create-app`](https://www.npmjs.com/package/@mnemosyne_os/create-app) | `npm create @mnemosyne_os/app` scaffolds that Layer 2 app in one command |
| [`@mnemosyne_os/cartridge-sdk`](https://www.npmjs.com/package/@mnemosyne_os/cartridge-sdk) | Build an **in-app cartridge**: a sandboxed iframe widget rendered on the canvas |
| **`@mnemosyne_os/mcp`** *(you are here)* | **MCP server**: plug Claude, Cursor or any MCP agent into the vaults |
| [`@mnemosyne_os/design-sdk`](https://www.npmjs.com/package/@mnemosyne_os/design-sdk) | **Skin the OS** with JSON alone, no TypeScript |
| [`@mnemosyne_os/public-contracts`](https://www.npmjs.com/package/@mnemosyne_os/public-contracts) | The shared **types and Zod schemas**. No business logic |
| [`@mnemosyne_os/agent-transcripts`](https://www.npmjs.com/package/@mnemosyne_os/agent-transcripts) | Read what **coding agents already write on disk**: the connector format and the interpreter |
| [`@mnemosyne_os/affine-reader`](https://www.npmjs.com/package/@mnemosyne_os/affine-reader) | Read a local **AFFiNE workspace** and render its documents to Markdown |
| [`@mnemosyne_os/forge`](https://www.npmjs.com/package/@mnemosyne_os/forge) | **CLI**: scaffold, list chronicles, import and export |
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

MIT © [Tony Trochet / XPACEGEMS LLC](https://mnemosyne-os.com)

---

## The OS your code talks to

<img src="https://raw.githubusercontent.com/Mnemosyne-OS/Mnemosyne-Neural-OS/main/assets/infinite-canvas.jpg" width="100%" alt="Mnemosyne OS Infinity Edition: the infinite canvas, the image gallery, MnemoHub and the living memory" />

*Mnemosyne OS Infinity Edition · [download](https://mnemosyne-os.io/download) · [mnemosyne-os.io](https://mnemosyne-os.io) · [mnemosyne-os.com](https://mnemosyne-os.com)*
