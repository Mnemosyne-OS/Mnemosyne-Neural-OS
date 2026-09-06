# Third-party code vendored in this package

## AFFiNE — `src/vendor/affine/`

Copyright (c) 2022-present TOEVERYTHING PTE. LTD. and its affiliates.
Licensed under the **MIT License**, whose full text ships beside this file as
[`LICENSE-AFFiNE`](./LICENSE-AFFiNE). The MIT License asks that the copyright
notice **and the permission notice** travel with the code, so both are included
verbatim rather than merely referenced.

| | |
|---|---|
| Upstream | https://github.com/toeverything/AFFiNE |
| Path | `packages/common/reader/src/doc-parser/` |
| Fetched | 2026-09-06, from the repository's default branch |
| Last upstream commit touching that path | `0c7b20dc18759dc63adbd93df491eba556baa6fe` (2026-08-10) |

AFFiNE's repository is under a **mixed** licence: `packages/backend` and
`packages/common/native` carry a separate one, and everything else — including
`packages/common/reader` — is MIT. The vendored files come only from the MIT part.

The upstream package (`@affine/reader`) is marked `private: true` and is not
published to npm, which is why the source is vendored rather than depended upon.

### What was changed

Two lines, both **type-only** and therefore erased at compilation, so runtime
behaviour is byte-for-byte the upstream one:

| File | Before | After |
|---|---|---|
| `parser.ts` | `import type { ColumnDataType } from '@blocksuite/affine/model'` | `from './blocksuite-types'` |
| `types.ts` | `import { type CellDataType } from '@blocksuite/affine/model'` | `from './blocksuite-types'` |

`src/vendor/affine/blocksuite-types.ts` is ours, not AFFiNE's. It declares the two
shapes locally so this package does not need `@blocksuite/affine` (MPL-2.0) on its
resolution path merely to typecheck. Every changed line is marked
`// MODIFIED (Mnemosyne OS)` in place.

Nothing else was edited. `delta-to-md/` is byte-identical to upstream.

## Not vendored

**BlockSuite** (MPL-2.0) is not included, not linked, and not required at runtime.
Rendering a document needs only `yjs` (MIT) and the files above.
