/**
 * A read-only SQLite adapter backed by Node's built-in `node:sqlite`.
 *
 * ⚠️ `node:sqlite` landed in Node 22.5 behind `--experimental-sqlite` and was
 * unflagged in 22.13.0 / 23.4.0, so the usable floor is 22.13. Electron 31 ships
 * Node 20 and has none of it, which is why the app passes an adapter over its own
 * better-sqlite3. This exists for scripts and tests, and it says what is missing
 * instead of failing with an opaque module error.
 */

import { createRequire } from 'node:module';
import type { SqliteDatabase, SqliteOpener } from './types';

interface NodeSqliteModule {
  DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => {
    prepare(sql: string): {
      all(...params: unknown[]): Record<string, unknown>[];
      get(...params: unknown[]): Record<string, unknown> | undefined;
    };
    close(): void;
  };
}

/** True when this runtime can provide `node:sqlite`. */
export function hasNodeSqlite(): boolean {
  try {
    createRequire(__filename)('node:sqlite');
    return true;
  } catch {
    // Not an error to report: on Node 20 / Electron this is simply the answer,
    // and the caller is expected to bring its own adapter.
    return false;
  }
}

/**
 * Opens a STAGED COPY. Never point this at a live AFFiNE file.
 *
 * 🪤 Deliberately NOT opened with `readOnly: true`: recovering a WAL needs to touch
 * the -shm, and a read-only handle on a database with a journal fails instead of
 * reading it. Safety here comes from `stageDatabase()` — the file is our own copy —
 * not from a flag that would break the very case the copy exists for.
 */
export const openNodeSqlite: SqliteOpener = (path: string): SqliteDatabase => {
  let mod: NodeSqliteModule;
  try {
    mod = createRequire(__filename)('node:sqlite') as NodeSqliteModule;
  } catch (error) {
    throw new Error(
      'node:sqlite is unavailable in this runtime (unflagged from Node 22.13 and 23.4; ' +
        'Electron 31 ships Node 20). Pass your own SqliteOpener instead. Cause: ' +
        (error instanceof Error ? error.message : String(error)),
    );
  }
  const db = new mod.DatabaseSync(path);
  return {
    prepare: (sql: string) => db.prepare(sql),
    close: () => db.close(),
  };
};
