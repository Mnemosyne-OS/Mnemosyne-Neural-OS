# @mnemosyne_os/affine-reader

Read a local [AFFiNE](https://github.com/toeverything/AFFiNE) workspace and render its
documents to Markdown — without running AFFiNE, without BlockSuite, without a server.

**Read-only, in every direction.** Two processes writing one CRDT corrupt it, so this
package copies the database before it reads and never writes back.

## Install

```bash
npm install @mnemosyne_os/affine-reader
```

Runtime dependency: `yjs`. That is the whole list.

## Use

```ts
import {
  affineDataDir,
  exportWorkspace,
  findWorkspaces,
  openNodeSqlite,
  stageDatabase,
} from '@mnemosyne_os/affine-reader';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

for (const ref of findWorkspaces()) {
  const staged = stageDatabase(ref.dbPath, mkdtempSync(join(tmpdir(), 'affine-')));
  const db = openNodeSqlite(staged.path);
  try {
    const result = exportWorkspace(db, `./out/${ref.id}`);
    console.log(result.files, result.skipped);
  } finally {
    db.close();
    staged.dispose();
  }
}
```

`findWorkspaces()` returning `[]` and `affineDataDir()` returning `null` are **different
answers** — nothing to read versus AFFiNE not installed. Both are reported.

### Bring your own SQLite

`openNodeSqlite` uses Node's built-in `node:sqlite`, which runs without a flag from
**Node 22.13** and **23.4** onward. It exists from 22.5 behind `--experimental-sqlite`.
Electron 31 ships Node 20 and has none, so a host passes its own adapter:

```ts
import Database from 'better-sqlite3';
import { readWorkspace } from '@mnemosyne_os/affine-reader';

const raw = new Database(stagedPath);
readWorkspace({ prepare: (sql) => raw.prepare(sql), close: () => raw.close() });
```

## What it reads

| | |
|---|---|
| Location | `<app-data>/AFFiNE*/<workspaces\|userspaces>/<peer>/<id>/storage.db` |
| Channels | every one you have installed. AFFiNE's build names the folder `AFFiNE` for a stable release and `AFFiNE-canary`, `AFFiNE-beta`, `AFFiNE-internal` otherwise, and most of their releases are canary |
| Schema | nbstore `v2` (`snapshots` + `updates` + `blobs`), and the legacy `v1` shape |
| Content | Yjs history replayed into a document, rendered by AFFiNE's own MIT parser |

Headings, lists, checkboxes, bold/italic, links, code, tables, database views, LaTeX and
images all survive the trip. Images come out as blob files with links that point at them.

## Two things that will bite you

**The content may live in the `-wal`, not in `storage.db`.** Measured on one running
0.27.4 install: at 14:28 `storage.db` was 4 KB next to a 1.8 MB `-wal`; at 14:46, same
app still running, the journal had been checkpointed away and `storage.db` was 1.14 MB
with no sidecar at all. A reader that copies only `storage.db` sees an **empty
workspace** in the first state and cannot tell. `stageDatabase()` copies the sidecars
when they exist and reports which ones it took.

**A snapshot alone is stale.** A document typed one minute earlier decoded to **2
characters** from its snapshot row and **323** once its 16 `updates` rows were replayed.
Long-settled documents give the same answer either way — so a test written on those
passes while the reader loses everything the user just wrote. Every load here replays
the updates.

## Licence

MIT. Includes MIT-licensed source vendored from AFFiNE — see [NOTICE.md](./NOTICE.md).
BlockSuite (MPL-2.0) is **not** included and is not required at runtime.
