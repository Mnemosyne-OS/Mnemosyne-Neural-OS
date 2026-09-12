/**
 * Public types for @mnemosyne_os/affine-reader.
 *
 * The package brings NO SQLite driver of its own. Electron 31 ships Node 20, which
 * has no `node:sqlite`, while a plain CLI on Node >= 22.5 does — so the driver is
 * injected and the package stays honest in both. `openNodeSqlite()` is provided for
 * the CLI case; the Electron host passes its own better-sqlite3 adapter.
 */

export interface SqliteStatement {
  all(...params: unknown[]): Record<string, unknown>[];
  get(...params: unknown[]): Record<string, unknown> | undefined;
}

export interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  close(): void;
}

/** MUST open the file READ-ONLY. Two writers on one CRDT corrupt it. */
export type SqliteOpener = (path: string) => SqliteDatabase;

/** Which on-disk layout a workspace uses. `v1` is the pre-nbstore shape. */
export type AffineSchema = 'v1' | 'v2';

export interface WorkspaceRef {
  /** Workspace id as AFFiNE names the directory. */
  id: string;
  /**
   * `local` for a workspace that never left the machine; otherwise the escaped
   * server name — a synced workspace keeps the SAME schema, only the folder differs.
   */
  peer: string;
  kind: 'workspace' | 'userspace';
  /** Absolute path to `storage.db`. */
  dbPath: string;
  layout: AffineSchema;
  /**
   * Which AFFiNE build this workspace belongs to: `AFFiNE` for a stable install,
   * `AFFiNE-canary`, `AFFiNE-beta`, `AFFiNE-internal` for the other channels.
   * Someone can have several installed at once, each with its own workspaces.
   */
  channel: string;
}

export interface AffineDoc {
  id: string;
  /** Title as the ROOT doc records it. May be empty — that is a real AFFiNE state. */
  title: string;
  markdown: string;
  /** How many `updates` rows were replayed on top of the snapshot. */
  updatesReplayed: number;
  /** False when the doc has no snapshot row yet — normal for a freshly created doc. */
  hadSnapshot: boolean;
}

export interface SkippedDoc {
  id: string;
  /** Why this doc is not in `docs`. Never dropped silently. */
  reason: string;
}

export interface BlobRef {
  key: string;
  mime: string;
  /** Size AFFiNE recorded. `null` when the column held something unreadable. */
  size: number | null;
}

export interface SkippedBlob {
  key: string;
  /** Size AFFiNE recorded; `null` when it was unreadable and the skip had another cause. */
  size: number | null;
  /** Why the bytes were not read. Never dropped silently. */
  reason: string;
}

export interface WorkspaceContent {
  workspaceId: string;
  schema: AffineSchema;
  docs: AffineDoc[];
  /** Docs found in the index but not rendered, each with its reason. */
  skipped: SkippedDoc[];
  blobs: BlobRef[];
  /** Docs in the trash are counted, never rendered. */
  trashed: number;
}

export interface ReadOptions {
  /** Include docs AFFiNE has moved to the trash. Default false. */
  includeTrash?: boolean;
  /** How an image block's blob key becomes a link. Return null for "cannot point at it". */
  blobUrl?: (key: string) => string | null;
  /** How a link to another AFFiNE doc is rendered. */
  docUrl?: (docId: string) => string;
  /**
   * The visible label for a link to another doc.
   *
   * An inline reference carries no title of its own, so without this the parser
   * writes `[](target.md)`: a link with an empty label, which most Markdown
   * readers render as nothing at all.
   */
  docTitle?: (docId: string) => string;
}
