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

## License

[MIT](./LICENSE) © Tony Trochet — Mnemosyne OS
