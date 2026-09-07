# @mnemosyne_os/public-contracts

Public types, Zod schemas, and interfaces for **Mnemosyne OS** — the official
integration surface. **No business logic.** The cognitive logic stays in the
sealed Core Engine; this package only describes the shapes that cross the
boundary.

## Install

```bash
npm i @mnemosyne_os/public-contracts
```

`zod` is the only runtime dependency.

## Usage

```ts
import {
  SpineType,
  VaultType,
  type Chronicle,
  type QueryResult,
} from '@mnemosyne_os/public-contracts';

// Runtime validation helpers (Zod) live under the /schemas entry point:
import {
  IngestRequestSchema,
  parseIngestRequest,
  safeParseQueryRequest,
} from '@mnemosyne_os/public-contracts/schemas';

const req = parseIngestRequest({
  content: 'Shipped the sealed-core dynamic-import fix.',
  vault: VaultType.DEV,
  requestedSpines: [SpineType.BUGFIX],
}); // throws ZodError if the payload is invalid
```

## What's exported

| Kind | Names |
|------|-------|
| Enums | `SpineType`, `VaultType` |
| Interfaces | `Chronicle`, `QueryResult`, `IngestRequest`, `QueryRequest`, `SealedCoreManifest`, `GatewayResponse`, `GatewayErrorCode` |
| Zod schemas | `SpineTypeSchema`, `VaultTypeSchema`, `IngestRequestSchema`, `QueryRequestSchema`, `ChronicleSchema`, `QueryResultSchema`, `GatewayResponseSchema`, `IngestResponseSchema`, `QueryResponseSchema` |
| Helpers | `parseIngestRequest`, `parseQueryRequest`, `safeParseIngestRequest`, `safeParseQueryRequest` |

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
| **`@mnemosyne_os/public-contracts`** *(you are here)* | The shared **types and Zod schemas**. No business logic |
| [`@mnemosyne_os/agent-transcripts`](https://www.npmjs.com/package/@mnemosyne_os/agent-transcripts) | Read what **coding agents already write on disk** — connector format + interpreter |
| [`@mnemosyne_os/affine-reader`](https://www.npmjs.com/package/@mnemosyne_os/affine-reader) | Read a local **AFFiNE workspace** and render its documents to Markdown |
| [`@mnemosyne_os/forge`](https://www.npmjs.com/package/@mnemosyne_os/forge) | **CLI** — scaffold, list chronicles, import / export |
| [`@mnemosyne_os/sync`](https://www.npmjs.com/package/@mnemosyne_os/sync) | The name of the **P2P layer to come**. A placeholder today, not the library |

---

## License

[MIT](./LICENSE) © Tony Trochet — Mnemosyne OS
