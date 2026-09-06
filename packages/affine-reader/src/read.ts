/**
 * Turning an AFFiNE workspace database into documents.
 *
 * The pipeline, measured end to end against AFFiNE 0.27.4 on 2026-09-06:
 *   storage.db (+ -wal) -> snapshot + updates -> Y.Doc -> AFFiNE's own parser -> Markdown
 *
 * 🚨 A snapshot ALONE is stale. A doc typed one minute earlier decoded to 2
 * characters from its snapshot and 323 once its 16 `updates` rows were replayed.
 * The onboarding docs, whose snapshots are current, give the SAME answer either
 * way — so a test written on them passes while the reader loses everything the
 * person just wrote. Every load here replays the updates.
 */

import * as Y from 'yjs';
import { parsePageDoc } from './vendor/affine/parser';
import type { ParserContext } from './vendor/affine/types';
import type {
  AffineDoc,
  AffineSchema,
  BlobRef,
  ReadOptions,
  SkippedDoc,
  SqliteDatabase,
  WorkspaceContent,
} from './types';

/** Reads the schema the file actually has rather than trusting a directory shape. */
export function detectSchema(db: SqliteDatabase): AffineSchema {
  const tables = new Set(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => String(row.name)),
  );
  if (!tables.has('updates'))
    throw new Error('Not an AFFiNE workspace database: no `updates` table');
  return tables.has('snapshots') ? 'v2' : 'v1';
}

/** The workspace id, which is ALSO the id of the root doc holding the doc index. */
export function readWorkspaceId(db: SqliteDatabase, schema: AffineSchema): string | null {
  if (schema === 'v2') {
    const row = db.prepare('SELECT space_id FROM meta').get();
    return row && typeof row.space_id === 'string' ? row.space_id : null;
  }
  // v1 has no `meta`. The root doc is the one whose updates carry no doc_id.
  return null;
}

function toBytes(value: unknown, what: string): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new Error(`${what}: expected a BLOB, got ${typeof value}`);
}

interface LoadResult {
  doc: Y.Doc;
  hadSnapshot: boolean;
  updatesReplayed: number;
}

/** Snapshot first, then every update in order. Both halves, always. */
export function loadDoc(
  db: SqliteDatabase,
  schema: AffineSchema,
  docId: string | null,
): LoadResult {
  const doc = new Y.Doc();
  let hadSnapshot = false;

  if (schema === 'v2' && docId !== null) {
    const snap = db.prepare('SELECT data FROM snapshots WHERE doc_id = ?').get(docId);
    if (snap) {
      Y.applyUpdate(doc, toBytes(snap.data, `snapshot of ${docId}`));
      hadSnapshot = true;
    }
  }

  const rows =
    schema === 'v2'
      ? db.prepare('SELECT data FROM updates WHERE doc_id = ? ORDER BY created_at').all(docId)
      : docId === null
        ? db.prepare('SELECT data FROM updates WHERE doc_id IS NULL ORDER BY id').all()
        : db
            .prepare('SELECT data FROM updates WHERE doc_id = ? ORDER BY id')
            .all(docId);

  for (const row of rows) Y.applyUpdate(doc, toBytes(row.data, `update of ${docId ?? 'root'}`));
  return { doc, hadSnapshot, updatesReplayed: rows.length };
}

/**
 * The doc index, straight out of the root doc's `meta.pages`.
 * (This is AFFiNE's `readAllDocsFromRootDoc`, which is pure yjs.)
 */
export function readDocIndex(
  rootDoc: Y.Doc,
): { id: string; title: string; trash: boolean }[] {
  const pages = rootDoc.getMap('meta').get('pages');
  if (!(pages instanceof Y.Array)) return [];
  const out: { id: string; title: string; trash: boolean }[] = [];
  for (const page of pages) {
    if (!(page instanceof Y.Map)) continue;
    const id = page.get('id');
    if (typeof id !== 'string') continue;
    const title = page.get('title');
    out.push({
      id,
      title: typeof title === 'string' ? title : '',
      trash: page.get('trash') === true,
    });
  }
  return out;
}

/** Blob metadata only — the bytes are streamed separately, a workspace can hold GBs. */
export function readBlobIndex(db: SqliteDatabase, schema: AffineSchema): BlobRef[] {
  const rows =
    schema === 'v2'
      ? db.prepare('SELECT key, mime, size FROM blobs WHERE deleted_at IS NULL').all()
      : db.prepare('SELECT key, length(data) AS size FROM blobs').all();
  return rows.map((row) => ({
    key: String(row.key),
    // v1 stored no mime. An unknown type is unknown — never guessed into image/png.
    mime: typeof row.mime === 'string' && row.mime ? row.mime : 'application/octet-stream',
    size: typeof row.size === 'number' ? row.size : null,
  }));
}

/** Streams blob bytes one row at a time so a large workspace never lands in memory at once. */
export function forEachBlob(
  db: SqliteDatabase,
  schema: AffineSchema,
  visit: (blob: { key: string; mime: string; data: Uint8Array }) => void,
): void {
  const rows =
    schema === 'v2'
      ? db.prepare('SELECT key, mime, data FROM blobs WHERE deleted_at IS NULL').all()
      : db.prepare('SELECT key, data FROM blobs').all();
  for (const row of rows) {
    visit({
      key: String(row.key),
      mime: typeof row.mime === 'string' && row.mime ? row.mime : 'application/octet-stream',
      data: toBytes(row.data, `blob ${String(row.key)}`),
    });
  }
}

/** Every doc of one workspace, rendered. Docs that fail are NAMED, never dropped. */
export function readWorkspace(db: SqliteDatabase, options: ReadOptions = {}): WorkspaceContent {
  const schema = detectSchema(db);
  const workspaceId = readWorkspaceId(db, schema) ?? '';
  const root = loadDoc(db, schema, schema === 'v2' ? workspaceId : null).doc;

  const index = readDocIndex(root);
  const docs: AffineDoc[] = [];
  const skipped: SkippedDoc[] = [];
  let trashed = 0;

  for (const entry of index) {
    if (entry.trash) {
      trashed++;
      if (!options.includeTrash) continue;
    }
    try {
      const loaded = loadDoc(db, schema, entry.id);
      const ctx: ParserContext = {
        workspaceId,
        doc: loaded.doc,
        buildBlobUrl: (key) => options.blobUrl?.(key) ?? `affine-blob:${key}`,
        buildDocUrl: (docId) => options.docUrl?.(docId) ?? `affine-doc:${docId}`,
      };
      const parsed = parsePageDoc(ctx);
      docs.push({
        id: entry.id,
        // The index title is what AFFiNE shows in its sidebar; the parsed one comes
        // from the page block. They can differ mid-edit — prefer the page block and
        // fall back, rather than rendering a doc with no name at all.
        title: parsed.title || entry.title,
        markdown: parsed.md,
        updatesReplayed: loaded.updatesReplayed,
        hadSnapshot: loaded.hadSnapshot,
      });
    } catch (error) {
      skipped.push({
        id: entry.id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { workspaceId, schema, docs, skipped, blobs: readBlobIndex(db, schema), trashed };
}
