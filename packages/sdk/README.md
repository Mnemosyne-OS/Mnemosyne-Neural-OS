# @mnemosyne_os/sdk

> **Official SDK for building Layer 2 apps on [Mnemosyne OS](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS)**  
> Connect your app to a local sovereign AI memory runtime — no cloud dependency.

[![npm version](https://img.shields.io/npm/v/@mnemosyne_os/sdk)](https://www.npmjs.com/package/@mnemosyne_os/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js ≥18](https://img.shields.io/badge/node-%3E%3D18-green)](https://nodejs.org)

---

## What is Mnemosyne OS?

Mnemosyne OS is a sovereign, local-first AI memory runtime built on Electron.  
It runs on your machine, stores everything locally (SQLite + vector embeddings),  
and exposes a WebSocket API for Layer 2 apps to tap into its cognitive engine.

**No cloud. No telemetry. Your data stays on your machine.**

---

## Ecosystem

| Package | Version | Role |
|---------|---------|------|
| [`@mnemosyne_os/mcp`](https://www.npmjs.com/package/@mnemosyne_os/mcp) | latest | MCP server — plug Claude / Cursor / any MCP agent into your vault |
| [`@mnemosyne_os/forge`](https://www.npmjs.com/package/@mnemosyne_os/forge) | `1.4.7` | CLI — scaffold, chronicles, MCP server |
| [`@mnemosyne_os/sync`](https://www.npmjs.com/package/@mnemosyne_os/sync) | `0.0.1` | P2P — multi-agent synchronization |
| **`@mnemosyne_os/sdk`** | **`1.3.0`** | **SDK — build Layer 2 apps** |

---

## Requirements

- **Mnemosyne OS Dev Edition** running on your machine (SDK WS Server on port 7799)
- Node.js ≥ 18 (for `MnemoClient`) OR any modern browser / Electron renderer (for `MnemoClientBrowser`)

---

## Install

```bash
npm install @mnemosyne_os/sdk
```

---

## Two Clients — Pick the Right One

| Client | Environment | Transport |
|--------|------------|-----------|
| `MnemoClientBrowser` | React, Vite, Next.js, Electron renderer | Native `WebSocket` API |
| `MnemoClient` | Node.js, Electron main process | `ws` package + IPC |

> **In most Layer 2 apps (Vite/React/Electron renderer), use `MnemoClientBrowser`.**

---

## Quick Start — Browser / React / Vite

### 1. Create your `app.manifest.json`

```json
{
  "id": "my-layer2-app",
  "name": "My Layer 2 App",
  "version": "1.0.0",
  "mnemosyne_sdk": "^1.2.0",
  "scopes": ["vault:read:DEV", "vault:write:DEV"],
  "vaults": ["DEV"],
  "intents": ["INGEST", "QUERY"]
}
```

### 2. Connect in your React app

```typescript
import { MnemoClientBrowser } from '@mnemosyne_os/sdk';
import type { AppManifest, Chronicle } from '@mnemosyne_os/sdk';

const MANIFEST: AppManifest = {
  id: 'my-layer2-app', name: 'My Layer 2 App', version: '1.0.0',
  mnemosyne_sdk: '^1.1.0',
  scopes: ['vault:read:DEV', 'vault:write:DEV'],
  vaults: ['DEV'],
  intents: ['INGEST', 'QUERY'],
};

// Connect and register
const client = await MnemoClientBrowser.connect();
await client.register(MANIFEST);

// Ingest content
await client.ingest('My note to remember', 'NOTE', 'DEV');

// Semantic query
const chronicles: Chronicle[] = await client.query('my search', 'DEV', 10);

// Real-time push events from the OS
client.onPush((event) => {
  if (event.type === 'chronicle:new') {
    console.log('New chronicle from:', event.sourceApp);
  }
});

// Graceful close
client.close();
```

---

## Quick Start — Node.js External App

```typescript
import { MnemoClient } from '@mnemosyne_os/sdk';

const client = await MnemoClient.connect({
  appId: 'my-layer2-app',
  manifest: './app.manifest.json',
  // transport: 'auto' → WebSocket if external, IPC if embedded in Mnemosyne OS
});

await client.ingest({ content: 'My content', spineType: 'NOTE', vault: 'DEV' });
const result = await client.query('my search', { limit: 5 });
console.log(result.chronicles);

await client.disconnect();
```

---

## Semantic Ranking (v1.2+)

By default `query()` returns the **N most recent chronicles** — fast (~5 ms) and good for "what changed lately" panes.
For agent-style relevance, opt into the **semantic branch**:

```typescript
const result = await client.query('JWT auth refactor decisions', {
  vault:    'DEV',
  limit:    10,
  semantic: true,                          // ← opt-in true semantic ranking
  scope:    'SOURCE_CODE',                 // ← cognitive scope (boosts ARCHITECTURE / GIT / API)
  spineTypeFilter: ['ARCHITECTURE', 'GIT'] // ← optional whitelist
});

console.log(result.chronicles);
// result._semantic = { used: true, vectorDim: 768, vaultSize: 5912 }
//   ↑ confirms the semantic branch ran (vs. silent fallback to recent)
```

| `QueryOptions` field | Default | What it does |
|---|---|---|
| `semantic` | `false` | Embeds the query and ranks by cosine × spineType weight. Without it: recent N. |
| `scope` | `'SOURCE_CODE'` | Cognitive scope that drives the type-weight table (ARCHITECTURE ×1.40, GIT ×1.35, etc.). |
| `spineTypeFilter` | `undefined` | Server-side SQL `IN` clause — restricts results to listed types. |
| `threshold` | `0.0` | Minimum cosine score (0–1) before type-weighting. |

The runtime applies an **exact-term boost** for identifier-like tokens in your query (uppercased words ≥4 chars, hyphenated codes, version numbers). Matching chronicles get `cosine × (1 + matchCount × 0.5)`, surfacing docs that contain rare identifiers verbatim — which dense embeddings alone tend to miss.

The optional `_semantic` field on `QueryResult` is your debug breadcrumb: it tells you whether the semantic branch ran, what dimension the query vector had, how many chronicles were in the target vault, and the error message if it silently fell back to "recent" (e.g. embedding provider not registered).

---

## Full API — `MnemoClientBrowser`

### Connection

```typescript
const client = await MnemoClientBrowser.connect(
  '127.0.0.1', // host (default)
  7799,        // port (default)
  15_000,      // timeout ms (default)
);

await client.register(manifest); // → RegisterResult (token stored internally)
client.close();
```

### Vault

```typescript
// Ingest
await client.ingest(content, spineType, vault?, metadata?);

// Query
const chronicles = await client.query(text, vault?, limit?);
```

### Resonances (cognitive workspaces)

```typescript
// List active resonances from the vault
const resonances = await client.resonancesList();

// Update current position (persisted as DECISION chronicle)
await client.updatePosition('resonance-id', 'Phase 52 — polish complete', 'Phase 52');
```

### Monorepo

```typescript
// Git log (requires scope: 'monorepo:read', intent: 'GIT_LOG')
const commits = await client.gitLog(20, '30 days ago');

// Read a .md file from the OS repo
const content = await client.readFile('docs/ARCHITECTURE.md');
```

### Agents

```typescript
// List connected Layer 2 apps (requires scope: 'agents:read', intent: 'LIST_AGENTS')
const agents = await client.agentsList();
```

### Events

```typescript
// OS push events (chronicle:new, etc.)
client.onPush((event) => { /* ... */ });

// Disconnection
client.onDisconnect(() => { /* reconnect logic */ });
```

---

## Scopes & Zero-Trust

Every app declares its permissions in `app.manifest.json`.  
**The OS refuses any operation not declared in the manifest** — Zero-Trust by design.

```typescript
type MnemoScope =
  | 'vault:read:DEV'      | 'vault:write:DEV'
  | 'vault:read:SOCIAL'   | 'vault:write:SOCIAL'
  | 'vault:read:PERSONAL' | 'vault:write:PERSONAL'
  | 'vault:read:FINANCE'  | 'vault:write:FINANCE'
  | 'vault:read:RESEARCH' | 'vault:write:RESEARCH'
  | 'vault:read:CUSTOM'   | 'vault:write:CUSTOM'   // wildcard for any user-created vault
  | 'share:request'       | 'share:grant'
  | 'monorepo:read'        // git log + readFile
  | 'agents:read'          // list connected agents
  | 'neural:graph:read'    // NeuralGraph access
  | 'bridge:read'          // Perpetual Memory Bridges (getBridgeHistory / computeResonance)
  | 'nft:validate'         // reserved for MnemoStore NFT gating (roadmap — see NFT Licence below)
  | 'llm:query';           // Direct LLM queries (premium)
```

---

## Available RPC Methods

```typescript
import { MNEMOSYNE_METHODS } from '@mnemosyne_os/sdk';

MNEMOSYNE_METHODS.REGISTER         // 'sdk.register'
MNEMOSYNE_METHODS.INGEST           // 'sdk.ingest'
MNEMOSYNE_METHODS.QUERY            // 'sdk.query'
MNEMOSYNE_METHODS.ASK              // 'sdk.ask'
MNEMOSYNE_METHODS.RESONANCES_LIST  // 'sdk.resonances.list'
MNEMOSYNE_METHODS.UPDATE_POSITION  // 'sdk.resonance.updatePosition'
MNEMOSYNE_METHODS.GIT_LOG          // 'sdk.git.log'
MNEMOSYNE_METHODS.READ_FILE        // 'sdk.readFile'
MNEMOSYNE_METHODS.LIST_AGENTS      // 'sdk.agents.list'
MNEMOSYNE_METHODS.SHARE            // 'sdk.share'
MNEMOSYNE_METHODS.NFT_VALIDATE     // 'sdk.nft.validate'
MNEMOSYNE_METHODS.GRAPH_QUERY      // 'sdk.graph.query'
MNEMOSYNE_METHODS.CORRELATE        // 'sdk.correlate'
MNEMOSYNE_METHODS.FORGET           // 'sdk.forget'
```

---

## SpineTypes

```typescript
type SpineType =
  | 'GIT' | 'ARCHITECTURE' | 'DECISION' | 'DEBUG' | 'FEATURE'
  | 'REDDIT_POST' | 'LINKEDIN_POST' | 'SOCIAL_NODE'
  | 'DOCUMENT' | 'NOTE' | 'CUSTOM'
  | 'RESONANCE'        // cognitive workspace node
  | 'SESSION'          // session context / resume snapshot
  | 'POSITION_UPDATE'  // current phase/position marker
  | 'API' | 'DOC' | 'ERROR';
```

---

## Events (Push)

The OS pushes real-time events to all connected clients. Handle them with `onPush`:

| Event `type` | Payload | Trigger |
|---|---|---|
| `chronicle:new` | `{ vault, spineType, sourceApp, ts }` | Any client calls `ingest()` |

More event types coming in future releases (agent:connected, tamper-alert, nft-revoked…).

---

## NFT Licence (MnemoStore) — roadmap

> **Not yet available.** The `nft:validate` scope and the `NFTLicenseParams` /
> `NFTValidation` types are reserved for on-chain licence gating, but no client
> method (`validateNFTLicense`) is implemented and the OS does not yet answer
> `sdk.nft.validate`. Declaring the scope is harmless; do not build against it
> until this section documents a live API.

When shipped, apps distributed on MnemoStore will be able to gate access with an
NFT licence by declaring `"scopes": ["nft:validate"]` and calling a validation
method that resolves on-chain (cached to avoid RPC spam).

---

## Changelog

### 1.3.0 — Ask Mnemosyne

- **NEW** `ask(question, vault?)` on both `MnemoClientBrowser` and `MnemoClient`,
  and `MNEMOSYNE_METHODS.ASK` (`sdk.ask`). Runs the full RAG+LLM pipeline and
  returns a synthesized prose answer plus its source chronicles (`AskResult`),
  vs `query()` which returns raw chronicles. Same `vault:read:*` scope + `QUERY`
  intent as `query` — no manifest change needed. Slower (runs the LLM).
- No breaking changes.

### 1.2.1 — Bridge API + republish

- **NEW** `bridge:read` scope, plus `getBridgeHistory()` and `computeResonance()`
  on `MnemoClientBrowser` (Perpetual Memory Bridges, Phase 58–59). `computeResonance`
  embeds the input text and ranks by cosine vs. stored bridge vectors, falling back
  to a keyword heuristic when the embedding model is offline.
- Republish of the 1.2.0 line; no breaking changes.

> **On the "v2.0" label:** earlier drafts branded the Bridge API as "v2.0.0 /
> Phase 59" and floated an `mnemoapp.json` manifest with an `api_version` field.
> **That was never shipped.** The manifest is still `app.manifest.json` with
> `mnemosyne_sdk`, `vaults`, and `intents` (the source of truth is the Zod
> validator in `src/manifest.ts`). `getBridgeSessions()` was likewise never
> implemented. There is no `2.0.0` on npm — the current version line is `1.3.x`.

### v1.2.0 — 2026-06-07 — Semantic Bridge

- **NEW** `QueryOptions.semantic?: boolean` — opt-in true semantic ranking (server embeds query, ranks by cosine × spineType weight).
- **NEW** `QueryOptions.scope?: string` — cognitive scope for the type-weight table (default `'SOURCE_CODE'`, boosts ARCHITECTURE / GIT / API).
- **NEW** `QueryOptions.spineTypeFilter?: string[]` — server-side `IN` filter to restrict results to specific spineTypes.
- **NEW** `QueryResult._semantic?: QuerySemanticDebug` — breadcrumb that tells you whether the semantic branch ran, the vector dim used, and the vault size (or the fallback reason).
- **NEW** Exported `QuerySemanticDebug` type.
- **FIX** Bundle no longer crashes under pure Node ESM. v1.1.0 inlined `ws` and produced a tsup `__require2('events')` shim that threw `Dynamic require of "events" is not supported` at module load — making `npm install @mnemosyne_os/sdk` followed by `import` from any plain Node script crash on startup. `ws` is now an `optionalDependency`, marked external in the build, so the SDK loads cleanly in any ESM context (MCP servers, CLIs, Node services).
- **COMPAT** Fully backward-compatible: existing `query(text, options)` calls without the new fields behave exactly as in 1.1.0.

### Phase 58–59 (Bridge API — folded into 1.2.1, no separate release)

- `bridge:read` scope unlocks `computeResonance` and `getBridgeHistory` on
  `MnemoClientBrowser`.
- `computeResonance` uses true vector embedding (embed input → cosine vs. stored
  bridge spine vectors), falling back to a keyword heuristic when the embedding
  model is offline.

### v1.1.0 — 2026-04-27
- **NEW** `MnemoClientBrowser` — zero-dependency browser client (native WebSocket API)
- **NEW** `sdk.resonances.list` — fetch real Resonance objects from the vault
- **NEW** `sdk.resonance.updatePosition` — persist session position as DECISION chronicle
- **NEW** `sdk.readFile` — read `.md` files from the OS repo (monorepo:read scope)
- **NEW** Push events — `onPush()` handler for real-time OS→client notifications
- **TYPES** Added `GitCommit`, `AgentInfo`, `RESONANCE`/`SESSION`/`POSITION_UPDATE` SpineTypes
- **TYPES** Added `monorepo:read`, `agents:read` scopes; `GIT_LOG`, `LIST_AGENTS` intents
- **FIX** `Chronicle.content` is now optional (some vault records only store vectors)

### v1.0.0 — 2026-04-24
- Initial release: `MnemoClient`, `sdk.ingest`, `sdk.query`, `sdk.git.log`, `sdk.agents.list`, JWT Zero-Trust

---

## Contributing & Core Access

This SDK is open source (MIT). The Mnemosyne OS core runtime is proprietary.

- **Layer 2 apps**: build freely using this SDK — no core access needed.
- **Core Contributors**: contact `tony@xpacegems.com` for NDA + scoped repo access.

---

## License

MIT © [Tony Trochet / XPACEGEMS LLC](https://xpacegems.com)
