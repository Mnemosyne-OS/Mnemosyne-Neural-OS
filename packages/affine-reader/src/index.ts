/**
 * @mnemosyne_os/affine-reader — read a local AFFiNE workspace, without AFFiNE.
 *
 * Reads the SQLite database AFFiNE keeps on disk, replays its Yjs history and
 * renders each document to Markdown using AFFiNE's own MIT parser (vendored, see
 * NOTICE.md). No BlockSuite at runtime, no native module, no server.
 *
 * ⛔ READ ONLY, in every direction. Two processes writing one CRDT corrupt it.
 */

export { affineDataDir, affineDataDirs, findWorkspaces } from './locate';
export { SIDECAR_SUFFIXES, stageDatabase } from './stage';
export type { StagedDatabase } from './stage';
export {
  detectSchema,
  forEachBlob,
  loadDoc,
  readBlobIndex,
  readDocIndex,
  readWorkspace,
  readWorkspaceId,
} from './read';
export { exportWorkspace, fileNameFor, slugify, workspaceFolderName } from './exportMarkdown';
export type { ExportOptions, ExportResult } from './exportMarkdown';
export { hasNodeSqlite, openNodeSqlite } from './nodeSqlite';
export type {
  AffineDoc,
  AffineSchema,
  BlobRef,
  ReadOptions,
  SkippedDoc,
  SqliteDatabase,
  SqliteOpener,
  SqliteStatement,
  WorkspaceContent,
  WorkspaceRef,
} from './types';
