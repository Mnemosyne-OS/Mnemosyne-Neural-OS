/**
 * Writing a workspace out as Markdown + blob files, ready for a watched folder.
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  blobOverCap,
  detectSchema,
  forEachBlob,
  loadDoc,
  readBlobIndex,
  readDocIndex,
  readWorkspace,
} from './read';
import type { ReadOptions, SkippedBlob, SqliteDatabase, WorkspaceContent } from './types';

export interface ExportResult extends WorkspaceContent {
  outDir: string;
  files: { docId: string; path: string }[];
  blobsWritten: number;
  /** Blobs whose bytes were NOT written, each with its size and the reason. */
  skippedBlobs: SkippedBlob[];
  /**
   * Files from an earlier export of this workspace that no rendered doc claims
   * any more — a doc renamed, deleted or moved to the trash — removed from
   * `outDir`. Paths, so the caller can say what went, not only how many.
   */
  removed: string[];
}

export interface ExportOptions extends ReadOptions {
  /** Also write the blob bytes next to the docs. Default true. */
  writeBlobs?: boolean;
}

/** Filesystem-safe stem. Accents are folded, never dropped into an empty name. */
export function slugify(input: string, fallback: string): string {
  const cleaned = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return cleaned || fallback;
}

/**
 * A file name that is readable, unique within a workspace, and reconcilable.
 *
 * The title comes first so the folder reads like the sidebar. The doc id is part
 * of the name on purpose: a watched folder is re-exported over and over, and a
 * rename changes the title half — the id half is what lets the NEXT export find
 * the copy left under the old name and remove it (see `removeOrphans`). Two
 * different docs sharing a title never collide either.
 */
export function fileNameFor(title: string, docId: string): string {
  return `${slugify(title, 'doc')}--${slugify(docId, 'id')}.md`;
}

/** The id half of a name `fileNameFor` produced, or null for a file it did not. */
function docIdSlugOf(fileName: string): string | null {
  // `slugify` collapses every run of non-alphanumerics into ONE dash, so a
  // double dash can only be the separator: neither half ever contains one.
  const match = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*--([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)\.md$/.exec(fileName);
  return match ? match[1] : null;
}

/**
 * Removes, from `outDir` alone, the `*--<id>.md` files this run did not write:
 * a renamed doc's old name, a deleted or trashed doc's file. A file whose id is
 * in `keepIds` stays whatever its name. Never recurses, never touches a file
 * that is not in that shape: the folder is the export's, but a README someone
 * dropped beside the docs is not.
 */
function removeOrphans(
  outDir: string,
  written: ReadonlySet<string>,
  keepIds: ReadonlySet<string>,
): string[] {
  const removed: string[] = [];
  for (const entry of readdirSync(outDir, { withFileTypes: true })) {
    if (!entry.isFile() || written.has(entry.name)) continue;
    const idSlug = docIdSlugOf(entry.name);
    if (idSlug === null || keepIds.has(idSlug)) continue;
    const path = join(outDir, entry.name);
    rmSync(path);
    removed.push(path);
  }
  return removed;
}

/** What the parser writes for a doc link's target, replaced once every doc is rendered. */
const pendingDocLink = (docId: string): string => `affine-doc-pending:${docId}`;
/** Same for the label of a reference that carries no title of its own. */
const pendingDocTitle = (docId: string): string => `affine-doc-pending-title:${docId}`;

/**
 * The folder one workspace is exported into, relative to the destination.
 *
 * 🚨 The peer is part of the name, not decoration. A workspace synced from a
 * server and a local one can carry the SAME id, and a name built from the id
 * alone makes the second export silently overwrite the first. Both callers —
 * the CLI and the app's IPC handler — go through this one function, so the two
 * doors cannot resolve the same workspace to two different directories.
 */
export function workspaceFolderName(ref: { id: string; peer: string; channel?: string }): string {
  // The channel joins the name for the same reason the peer did: a stable install
  // and a canary one can both hold a workspace with this id. The stable channel
  // adds nothing, so its folders keep the plain shape.
  const channel = ref.channel && ref.channel !== 'AFFiNE' ? ref.channel.replace(/^AFFiNE-/, '') : '';
  const parts = ['affine', channel && slugify(channel, 'channel'), slugify(ref.peer, 'peer'), slugify(ref.id, 'id')];
  return parts.filter(Boolean).join('-');
}

function blobFileName(key: string, mime: string): string {
  const ext = (mime.split('/')[1] ?? 'bin').replace('+xml', '').replace(/[^a-z0-9]/gi, '');
  return `${slugify(key, 'blob')}.${ext || 'bin'}`;
}

function frontMatter(fields: Record<string, string | number | boolean>): string {
  const lines = Object.entries(fields).map(([key, value]) =>
    typeof value === 'string' ? `${key}: ${JSON.stringify(value)}` : `${key}: ${value}`,
  );
  return ['---', ...lines, '---', ''].join('\n');
}

/**
 * Read `db` and write one Markdown file per doc into `outDir`.
 *
 * The caller owns `outDir`. Nothing is ever written back into AFFiNE's directory.
 */
export function exportWorkspace(
  db: SqliteDatabase,
  outDir: string,
  options: ExportOptions = {},
): ExportResult {
  // ⛔ The pre-nbstore layout. Its SQL was written from the table names alone and
  // has never been run against a real v1 install; an export produced by it could
  // be wrong or empty and nothing here would notice. A named refusal is worth
  // more to a watched folder than a folder of documents nobody measured.
  const schema = detectSchema(db);
  if (schema === 'v1')
    throw new Error(
      'AFFiNE v1 layout (pre-nbstore) is not exported: its SQL has never been measured against a real install',
    );

  mkdirSync(outDir, { recursive: true });

  // Blob file names are decided BEFORE the docs are rendered, so an image link and
  // the file it points at come from the SAME map. Computing them separately is how
  // an export ends up with links that look right and resolve to nothing. A blob
  // over the cap gets no name here, for the same reason: the writer below will
  // not produce its file, so no link may point at it.
  const blobNames = new Map<string, string>();
  const skippedBlobs: SkippedBlob[] = [];
  for (const blob of readBlobIndex(db, schema)) {
    const over = blobOverCap(blob);
    if (over) skippedBlobs.push(over);
    else blobNames.set(blob.key, blobFileName(blob.key, blob.mime));
  }

  // A link from one document to another becomes a relative link to the file that
  // document was written to, so the export is browsable on its own and in any
  // editor that reads a folder of Markdown. Rendering it as an `affine-doc:` id
  // would make every internal link dead the moment it leaves the app.
  //
  // 🚨 The file takes the doc's FINAL title (page block first, index as the
  // fallback), which is only known once the doc is rendered — and a link can
  // point at a doc rendered later, or at one that never will be (trash, a read
  // failure). So the parser writes a placeholder per target, and the links are
  // resolved AFTER the whole workspace is rendered, from the names actually
  // written. Resolved from the index up front, a doc mid-rename linked to a
  // file that did not exist.
  const linkedIds = new Set<string>();
  const rendered = readWorkspace(db, {
    ...options,
    blobUrl: (key) => {
      const name = blobNames.get(key);
      return name ? `blobs/${name}` : (options.blobUrl?.(key) ?? null);
    },
    docUrl: (docId) => {
      linkedIds.add(docId);
      return pendingDocLink(docId);
    },
    // The label the reader sees. An inline reference carries no title, so
    // without this the link comes out as `[](target.md)` and shows as nothing.
    docTitle: (docId) => {
      linkedIds.add(docId);
      return pendingDocTitle(docId);
    },
  });

  const docNames = new Map<string, string>();
  const docTitles = new Map<string, string>();
  for (const doc of rendered.docs) {
    docNames.set(doc.id, fileNameFor(doc.title, doc.id));
    if (doc.title) docTitles.set(doc.id, doc.title);
  }
  // A target that was not rendered (trash, a read failure) still has the name
  // the index gives it, which beats a bare id as a label. Read only when needed.
  let indexTitles: Map<string, string> | null = null;
  const indexTitleOf = (docId: string): string | undefined => {
    if (!indexTitles) {
      indexTitles = new Map();
      for (const entry of readDocIndex(loadDoc(db, schema, rendered.workspaceId).doc))
        if (entry.title) indexTitles.set(entry.id, entry.title);
    }
    return indexTitles.get(docId);
  };
  for (const docId of linkedIds) {
    // A doc in the trash, one the index does not carry, or one that failed to
    // render has no file to point at. It keeps the caller's answer rather than
    // a link that goes nowhere.
    const target = docNames.get(docId) ?? options.docUrl?.(docId) ?? `affine-doc:${docId}`;
    const label =
      docTitles.get(docId) ?? indexTitleOf(docId) ?? options.docTitle?.(docId) ?? docId;
    const pendingLink = pendingDocLink(docId);
    const pendingTitle = pendingDocTitle(docId);
    for (const doc of rendered.docs)
      doc.markdown = doc.markdown.split(pendingLink).join(target).split(pendingTitle).join(label);
  }

  let blobsWritten = 0;
  if (options.writeBlobs !== false && blobNames.size > 0) {
    const blobDir = join(outDir, 'blobs');
    mkdirSync(blobDir, { recursive: true });
    // Same cap as the names above, so the two lists cannot disagree.
    const skippedWhileWriting = forEachBlob(db, rendered.schema, (blob) => {
      const name = blobNames.get(blob.key) ?? blobFileName(blob.key, blob.mime);
      writeFileSync(join(blobDir, name), blob.data);
      blobsWritten++;
    });
    for (const skip of skippedWhileWriting)
      if (!skippedBlobs.some((s) => s.key === skip.key)) skippedBlobs.push(skip);
  }

  const files: { docId: string; path: string }[] = [];
  for (const doc of rendered.docs) {
    const path = join(outDir, docNames.get(doc.id) ?? fileNameFor(doc.title, doc.id));
    // 🪤 No timestamp here, deliberately. A `read_at` written on every export
    // changes the bytes of every file on every run, so a watched folder would
    // see the whole workspace as modified and re-ingest (and re-embed) all of
    // it each time — churn and cost for documents nobody touched. What changed
    // belongs in the log and the result, not in content that is hashed.
    const body = frontMatter({
      source: 'affine',
      workspace: rendered.workspaceId,
      doc_id: doc.id,
      title: doc.title,
    });
    const heading = doc.title ? `# ${doc.title}\n\n` : '';
    writeFileSync(path, `${body}${heading}${doc.markdown}`, 'utf8');
    files.push({ docId: doc.id, path });
  }

  // 🚨 Written AFTER the new files, never before: a rename would otherwise pass
  // through a moment with no copy at all, and a crash in between would leave the
  // folder empty. A doc that failed to render this time keeps its last good copy
  // — a reader fault is not the person deleting a document. A doc moved to the
  // trash loses its file: AFFiNE no longer shows it, and the export should not.
  // Decided by Tony on 2026-09-08 ("c'est certain"): a trashed doc loses its export.
  const written = new Set(files.map((file) => basename(file.path)));
  const keepIds = new Set(rendered.skipped.map((skip) => slugify(skip.id, 'id')));
  const removed = removeOrphans(outDir, written, keepIds);

  return { ...rendered, outDir, files, blobsWritten, skippedBlobs, removed };
}
