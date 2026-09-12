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
  SkippedBlob,
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

/**
 * The largest blob the reader will pull into memory, in bytes.
 *
 * Blobs are read on the Electron MAIN process, and a workspace can hold a video
 * dropped into a page. One such row is a hundred MB held in the process that
 * owns every window. Anything over the cap is NAMED in the result, never
 * fetched — the index already carries the size, so the decision costs nothing.
 */
export const BLOB_CAP_BYTES = 25 * 1024 * 1024;

/**
 * Why `ref` will not be fetched, or null when it fits under `maxBytes`.
 *
 * One rule for the two places that need it: the writer that skips the bytes and
 * the exporter that decides whether a link may point at the file. Decided twice,
 * a link would point at a file the writer never produced.
 */
export function blobOverCap(ref: BlobRef, maxBytes: number = BLOB_CAP_BYTES): SkippedBlob | null {
  // An unknown size is not a size over the cap. It is fetched: the alternative
  // is dropping an image on a guess, which the reader would then report as a
  // blob that was too large when nobody measured it.
  if (ref.size === null || ref.size <= maxBytes) return null;
  return {
    key: ref.key,
    size: ref.size,
    reason: `blob is ${ref.size} bytes, over the ${maxBytes} byte cap`,
  };
}

/**
 * Visits blob bytes one row at a time, so a large workspace never lands in
 * memory at once. Each blob is fetched by key from the index, and a blob over
 * the cap is skipped WITHOUT touching its bytes; the skipped ones are returned.
 */
export function forEachBlob(
  db: SqliteDatabase,
  schema: AffineSchema,
  visit: (blob: { key: string; mime: string; data: Uint8Array }) => void,
  options: { maxBytes?: number } = {},
): SkippedBlob[] {
  const maxBytes = options.maxBytes ?? BLOB_CAP_BYTES;
  const skipped: SkippedBlob[] = [];
  const byKey = db.prepare(
    schema === 'v2'
      ? 'SELECT data FROM blobs WHERE key = ? AND deleted_at IS NULL'
      : 'SELECT data FROM blobs WHERE key = ?',
  );
  for (const ref of readBlobIndex(db, schema)) {
    const over = blobOverCap(ref, maxBytes);
    if (over) {
      skipped.push(over);
      continue;
    }
    const row = byKey.get(ref.key);
    // Listed a moment ago and gone now: the copy is a snapshot, so this can only
    // be a row the index and the fetch disagree on. Named, not silently absent.
    if (!row) {
      skipped.push({ key: ref.key, size: ref.size, reason: 'blob row not found by key' });
      continue;
    }
    visit({ key: ref.key, mime: ref.mime, data: toBytes(row.data, `blob ${ref.key}`) });
  }
  return skipped;
}

/** Every doc of one workspace, rendered. Docs that fail are NAMED, never dropped. */
export function readWorkspace(db: SqliteDatabase, options: ReadOptions = {}): WorkspaceContent {
  const schema = detectSchema(db);
  const workspaceId = readWorkspaceId(db, schema);
  // 🚨 A missing space_id used to become the doc id '' — an empty root doc, and
  // a workspace that reads as "no documents" while it holds plenty. That answer
  // is indistinguishable from a genuinely empty workspace, so it is refused.
  if (schema === 'v2' && workspaceId === null)
    throw new Error('AFFiNE database has no space_id in `meta`: cannot find the root document');
  const rootId = schema === 'v2' ? workspaceId : null;
  const rootLoad = loadDoc(db, schema, rootId);
  // Same fabrication from the other side: meta names a root doc that no
  // snapshot and no update carry (a cloud workspace never synced down). Zero
  // rows replayed is not an empty index, it is a document that is not here.
  if (!rootLoad.hadSnapshot && rootLoad.updatesReplayed === 0)
    throw new Error(`root document ${rootId ?? '(v1 root)'} is not in this database`);
  const root = rootLoad.doc;
  // v1 has no meta and no workspace id to report; '' is that absence, not a name.
  const spaceId = workspaceId ?? '';

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
        workspaceId: spaceId,
        doc: loaded.doc,
        buildBlobUrl: (key) => options.blobUrl?.(key) ?? `affine-blob:${key}`,
        buildDocUrl: (docId) => options.docUrl?.(docId) ?? `affine-doc:${docId}`,
        renderDocTitle: options.docTitle,
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

  return { workspaceId: spaceId, schema, docs, skipped, blobs: readBlobIndex(db, schema), trashed };
}

/**
 * The bytes of a root document that holds NO page — `meta.pages` empty —
 * encoded as one update. What a host needs to stand in a workspace with no
 * content (a test double, a workspace created empty) without depending on
 * yjs itself: the reader refuses a root that is absent by name, and the only
 * honest way to say "present and empty" is a real encoded document.
 */
export function emptyRootDocUpdate(): Uint8Array {
  const doc = new Y.Doc();
  doc.getMap('meta').set('pages', new Y.Array());
  return Y.encodeStateAsUpdate(doc);
}
