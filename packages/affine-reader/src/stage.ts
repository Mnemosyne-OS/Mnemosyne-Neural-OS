/**
 * Taking a safe copy of a LIVE AFFiNE database before reading it.
 *
 * 🚨 The content is in the -wal, not in storage.db. Measured on a real 0.27.4
 * install 2026-09-06: `storage.db` 4 KB, `storage.db-wal` 1.8 MB. A reader that
 * copies storage.db alone opens an EMPTY workspace and has no way to notice —
 * it does not error, it just returns nothing.
 *
 * ⛔ Nothing here ever writes into AFFiNE's directory. Opening the live file
 * read-write could checkpoint or corrupt a database another process owns.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The journal files that must travel with storage.db. Copied in this order, and
 * BEFORE the .db itself — see `stageDatabase` for why the main file goes last.
 */
export const SIDECAR_SUFFIXES = ['-wal', '-shm'] as const;

export interface StagedDatabase {
  /** Path of the copy — this is what to open. */
  path: string;
  /** Which sidecars were actually present and copied. */
  sidecars: string[];
  /** Removes the copy. Safe to call twice. */
  dispose(): void;
}

/**
 * Copy `dbPath` and its journal sidecars into `stagingDir`.
 *
 * `stagingDir` must be a directory this process owns — it is REMOVED by dispose().
 */
export function stageDatabase(dbPath: string, stagingDir: string): StagedDatabase {
  if (!existsSync(dbPath)) throw new Error(`AFFiNE database not found: ${dbPath}`);

  // ⛔ A floor under the delete. dispose() removes this directory recursively, so
  // it must be one we created and own. Handed an existing folder with anything in
  // it, this would be a public API that erases whatever it was pointed at.
  if (existsSync(stagingDir) && readdirSync(stagingDir).length > 0)
    throw new Error(`Staging directory is not empty, refusing to use it: ${stagingDir}`);
  mkdirSync(stagingDir, { recursive: true });

  const target = join(stagingDir, 'storage.db');

  // 🚨 The journal is copied FIRST and the main file LAST. AFFiNE is live while
  // this runs, and a checkpoint can land between the two copies. Main file
  // first: the checkpoint moves the frames into storage.db AFTER our copy was
  // taken and resets the -wal BEFORE we copy it — the staged pair has the old
  // main file and a journal without those frames, so committed content is
  // simply gone, and nothing errors. Journal first: the worst case is a journal
  // whose frames the main file already holds, which replaying re-applies.
  const sidecars: string[] = [];
  for (const suffix of SIDECAR_SUFFIXES) {
    if (existsSync(dbPath + suffix)) {
      copyFileSync(dbPath + suffix, target + suffix);
      sidecars.push(suffix);
    }
  }
  copyFileSync(dbPath, target);

  let disposed = false;
  return {
    path: target,
    sidecars,
    dispose() {
      if (disposed) return;
      disposed = true;
      rmSync(stagingDir, { recursive: true, force: true });
    },
  };
}
