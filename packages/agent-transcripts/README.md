**@mnemosyne_os/agent-transcripts** — Read what coding agents already write on disk: a declarative connector format, an interpreter that never evaluates it, and the liveness rules that keep "last seen" from becoming "working".

# @mnemosyne_os/agent-transcripts

Coding agents already write a transcript of everything they do, on your disk, in
your home directory. This package reads it. No harness to patch, no wrapper to
run your agent through, no daemon: the file is already there.

MIT. No runtime dependencies.

## Two rules travel with this code

**1. A connector is DATA, never code.** A connector is a JSON document saying how
to interpret a folder — which field carries the timestamp, which tool writes
files, which line is the human speaking. It never says *where* to read, and it
carries no pattern of its own. People exchange connectors; the worst case has to
be a failed parse, never someone else's regex running on your machine.

**2. The narrator cannot be the subject.** Nothing here reports that an agent *is
working*. An agent that crashed stops writing its transcript, and so does one
that is idle — the two are indistinguishable from the outside. What is reported
is when a line was last written, and the reader draws its own conclusion.

## Connectors shipped

| id | reads |
| --- | --- |
| `claude-code` | Claude Code sessions (`.jsonl`) |
| `claude-memory` | Claude Code memory files |
| `antigravity`, `antigravity-notes` | Antigravity sessions and notes |
| `antigravity-ide`, `antigravity-ide-notes` | the IDE variant of both |
| `openclaw` | an OpenClaw 2 trajectory export |

### Data exports, read with `readArchive`

Every major assistant has to hand your conversations back (GDPR art. 20 asks for
a structured, machine-readable format). Almost nobody ships a tool that does
anything with the result, so the zip sits in Downloads. These connectors read it.

| id | reads | run over a real export? |
| --- | --- | --- |
| `gemini-takeout` | Google Takeout > Gemini Apps activity | **yes**, 2 084 entries |
| `chatgpt-export` | ChatGPT > Settings > Data controls > Export | no |
| `claude-ai-export` | Claude.ai > Settings > Privacy > Export | no |

`archiveConnectorIsVerified(conn)` reads that last column off the connector's own
`_verified` note, so an app can tell a measured mapping from a believed one
instead of presenting both as facts.

Three things this reader does that a loop over JSON does not:

- **It follows the live path of a branching export.** OpenAI's `mapping` is a
  tree: every regeneration is a sibling of the answer it replaced. Flattened, one
  conversation puts three contradictory answers into your memory. The reader
  walks `parent` up from `current_node` and reports `abandonedTurns`.
- **Nothing leaves in silence.** Every dropped row carries a reason, and
  `accountedFor(state) === state.recordsSeen` when the reader has accounted for
  everything it was handed.
- **Absent is not zero.** A file the connector does not fit comes back with
  `rootFound: false`, not with "0 conversations".

⚠️ `openclaw` is unlike the others: OpenClaw 2 keeps live sessions in SQLite
only, so `events.jsonl` exists only where a human ran
`openclaw sessions export-trajectory`. Pointing it at a folder with no export is
not a fault to explain away — there is simply nothing there yet.

## Consuming it

This package ships **TypeScript source**, deliberately: both of its in-repo
consumers compile TypeScript already, and a `dist` kept in step between them is
a `dist` that goes stale. Practically, that means a TypeScript-aware build
(vite, tsup, esbuild, tsc) consumes it directly, and plain `node -e "require(…)"`
does not.

```bash
npm install @mnemosyne_os/agent-transcripts
```

```ts
import { readSession, CONNECTORS, collisionReport, LIVE_MINUTES } from '@mnemosyne_os/agent-transcripts';

// You read the bytes. The parser never touches the filesystem.
const state = readSession(CONNECTORS['claude-code'], file, path, text, sizeBytes);
state.artifacts;  // files this session wrote — { path, origin: 'tool' | 'shell' }
state.humanTurns; // what the person actually typed
```

`readSession` and everything beside it are environment-free: they take text and
return a normalised model. Where the text comes from is the caller's business —
a bridge in a sandboxed frame, `node:fs` on a server. The `/node` entry adds the
filesystem half (`discoverSources`, `readSessionsFromDisk`, `readAllSources`,
`workingTreeOf`) for callers that want it.

The connector documents are importable on their own, and are readable by plain
Node:

```js
const claudeCode = require('@mnemosyne_os/agent-transcripts/connectors/claude-code.json');
```

## Why `origin: 'tool' | 'shell'` exists

A tool call is a **record**. A redirection spotted inside a shell command is an
**inference**. They are never merged, and the distinction is not academic.

Measured 2026-08-29 across 211 local Claude Code sessions: **98 of them had
written files only through a shell command.** A reader that counts only
file-writing tool calls reports zero files written for nearly half the corpus —
one session wrote 29 files and showed none. Across 212 transcripts: 4,550 files
recorded by a tool call, 920 more named inside a shell command.

Check it against your own transcripts before believing it.

## Collisions

`collisionReport` answers one question: is another agent live in this git working
tree right now? It resolves each session to its **working tree**, not its
recorded cwd — a session that ran one `cd` reports a subdirectory, and grouping
by that made two halves of the same project look like two projects, which is
precisely when the alert is worth having.

A `.git` *file* means a linked worktree, which is its own root and is never
merged with the main one: two agents in two worktrees is the right answer, not a
collision.

Sessions carrying neither project nor branch are **refused a placement and
returned anyway** — grouping unknowns together manufactures alerts, and dropping
them silently is the other half of the same mistake.

## What this does not do

- It does not watch anything. One read, on demand.
- It does not report agent state, health, or progress. See rule 2.
- It does not talk to an agent, or to any network.
- It reads what a harness already wrote. If a harness records no working
  directory, that column is empty — it is never filled by guessing.

## The `@mnemosyne_os` packages

All of them live under one npm organization:
**[npmjs.com/org/mnemosyne_os](https://www.npmjs.com/org/mnemosyne_os)**

| Package | What it is |
|---|---|
| [`@mnemosyne_os/sdk`](https://www.npmjs.com/package/@mnemosyne_os/sdk) | Build a **Layer 2 app** — a Node or browser process talking to the local WebSocket surface |
| [`@mnemosyne_os/create-app`](https://www.npmjs.com/package/@mnemosyne_os/create-app) | `npm create @mnemosyne_os/app` — scaffolds that Layer 2 app in one command |
| [`@mnemosyne_os/cartridge-sdk`](https://www.npmjs.com/package/@mnemosyne_os/cartridge-sdk) | Build an **in-app cartridge** — a sandboxed iframe widget rendered on the canvas |
| [`@mnemosyne_os/mcp`](https://www.npmjs.com/package/@mnemosyne_os/mcp) | **MCP server** — plug Claude, Cursor or any MCP agent into the vaults |
| [`@mnemosyne_os/design-sdk`](https://www.npmjs.com/package/@mnemosyne_os/design-sdk) | **Skin the OS** with JSON alone, no TypeScript |
| [`@mnemosyne_os/public-contracts`](https://www.npmjs.com/package/@mnemosyne_os/public-contracts) | The shared **types and Zod schemas**. No business logic |
| **`@mnemosyne_os/agent-transcripts`** *(you are here)* | Read what **coding agents already write on disk** — connector format + interpreter |
| [`@mnemosyne_os/affine-reader`](https://www.npmjs.com/package/@mnemosyne_os/affine-reader) | Read a local **AFFiNE workspace** and render its documents to Markdown |
| [`@mnemosyne_os/forge`](https://www.npmjs.com/package/@mnemosyne_os/forge) | **CLI** — scaffold, list chronicles, import / export |
| [`@mnemosyne_os/sync`](https://www.npmjs.com/package/@mnemosyne_os/sync) | The name of the **P2P layer to come**. A placeholder today, not the library |

---

## Part of Mnemosyne OS

Extracted from [Mnemosyne OS](https://mnemosyne-os.io), a local-first memory
system, where it feeds a screen and an MCP server from this one implementation.
It stands alone and has no dependency on the app.

MIT © Tony Trochet
