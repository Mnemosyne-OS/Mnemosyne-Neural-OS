/**
 * Writing a workspace out as Markdown + blob files, ready for a watched folder.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  detectSchema,
  forEachBlob,
  loadDoc,
  readBlobIndex,
  readDocIndex,
  readWorkspace,
  readWorkspaceId,
} from './read';
import type { ReadOptions, SqliteDatabase, WorkspaceContent } from './types';

export interface ExportResult extends WorkspaceContent {
  outDir: string;
  files: { docId: string; path: string }[];
  blobsWritten: number;
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
 * A file name that is stable across runs and unique within a workspace.
 *
 * The doc id is part of the name on purpose: a watched folder is re-exported over
 * and over, and keying the file on the TITLE would leave an orphan copy behind
 * every time someone renames a doc — the folder would slowly fill with duplicates
 * of the same document under its old names.
 */
export function fileNameFor(title: string, docId: string): string {
  return `${slugify(title, 'doc')}--${slugify(docId, 'id')}.md`;
}

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
  mkdirSync(outDir, { recursive: true });

  // Blob file names are decided BEFORE the docs are rendered, so an image link and
  // the file it points at come from the SAME map. Computing them separately is how
  // an export ends up with links that look right and resolve to nothing.
  const schema = detectSchema(db);
  const blobNames = new Map<string, string>();
  for (const blob of readBlobIndex(db, schema))
    blobNames.set(blob.key, blobFileName(blob.key, blob.mime));

  // A link from one document to another becomes a relative link to the file that
  // document was written to, so the export is browsable on its own and in any
  // editor that reads a folder of Markdown. Rendering it as an `affine-doc:` id
  // would make every internal link dead the moment it leaves the app.
  //
  // The index has to be read BEFORE the documents are rendered, because a link
  // can point at a document that has not been written yet.
  const workspaceId = readWorkspaceId(db, schema) ?? '';
  const docNames = new Map<string, string>();
  const docTitles = new Map<string, string>();
  for (const entry of readDocIndex(loadDoc(db, schema, schema === 'v2' ? workspaceId : null).doc)) {
    docNames.set(entry.id, fileNameFor(entry.title, entry.id));
    if (entry.title) docTitles.set(entry.id, entry.title);
  }

  const rendered = readWorkspace(db, {
    ...options,
    blobUrl: (key) => {
      const name = blobNames.get(key);
      return name ? `blobs/${name}` : (options.blobUrl?.(key) ?? null);
    },
    // A doc in the trash, or one the index does not carry, has no file to point
    // at. It keeps the caller's answer rather than a link that goes nowhere.
    docUrl: (docId) => docNames.get(docId) ?? options.docUrl?.(docId) ?? `affine-doc:${docId}`,
    // The label the reader sees. An inline reference carries no title, so
    // without this the link comes out as `[](target.md)` and shows as nothing.
    docTitle: (docId) => docTitles.get(docId) ?? options.docTitle?.(docId) ?? docId,
  });

  let blobsWritten = 0;
  if (options.writeBlobs !== false && rendered.blobs.length > 0) {
    const blobDir = join(outDir, 'blobs');
    mkdirSync(blobDir, { recursive: true });
    forEachBlob(db, rendered.schema, (blob) => {
      const name = blobNames.get(blob.key) ?? blobFileName(blob.key, blob.mime);
      writeFileSync(join(blobDir, name), blob.data);
      blobsWritten++;
    });
  }

  const files: { docId: string; path: string }[] = [];
  for (const doc of rendered.docs) {
    const path = join(outDir, fileNameFor(doc.title, doc.id));
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

  return { ...rendered, outDir, files, blobsWritten };
}
