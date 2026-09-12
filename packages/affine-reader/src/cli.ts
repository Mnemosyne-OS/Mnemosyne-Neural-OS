#!/usr/bin/env node
/**
 * affine-export — write every local AFFiNE workspace out as Markdown.
 *
 *   npx @mnemosyne_os/affine-reader ./out
 *
 * Read-only: the database is copied (with its journal, where the content may
 * actually live) before a byte is read, and nothing is ever written back into
 * AFFiNE's directory.
 *
 * ⚠️ Needs `node:sqlite` without a flag, which means Node >= 22.13 (or >= 23.4).
 * The module landed in 22.5 behind `--experimental-sqlite` and was unflagged in
 * 22.13.0 / 23.4.0, so "22.5" as the boundary is wrong and produces a message
 * that contradicts itself on 22.11: "needs >= 22.5, this is v22.11".
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportWorkspace, workspaceFolderName } from './exportMarkdown';
import { affineDataDir, findWorkspaces } from './locate';
import { hasNodeSqlite, openNodeSqlite } from './nodeSqlite';
import { stageDatabase } from './stage';

export function runCli(argv: string[] = process.argv.slice(2)): number {
  const outDir = argv[0];
  if (!outDir || outDir === '--help' || outDir === '-h') {
    console.log('usage: affine-export <outDir>');
    console.log('  Writes one Markdown file per AFFiNE document, plus its images.');
    return outDir ? 0 : 2;
  }

  if (!hasNodeSqlite()) {
    // Says what is missing and what to do, rather than a version rule the running
    // version can appear to satisfy.
    console.error(`node:sqlite is not available in this runtime (${process.version}).`);
    console.error('Use Node 22.13+ or 23.4+, where it needs no flag.');
    console.error('On Node 22.5 to 22.12 it exists behind --experimental-sqlite.');
    return 1;
  }

  const dataDir = affineDataDir();
  const workspaces = findWorkspaces();
  if (workspaces.length === 0) {
    // 🎭 Two different answers, and the person needs to know which one they got.
    console.error(
      dataDir
        ? `AFFiNE is installed (${dataDir}) but holds no workspace.`
        : 'AFFiNE does not appear to be installed for this user.',
    );
    return 1;
  }

  let failures = 0;
  for (const ref of workspaces) {
    // 🚨 One workspace that cannot even be opened (a table missing, a root doc
    // that is not there, the v1 layout the exporter refuses) must not take the
    // others with it. Before the catch below, a throw ahead of the doc loop
    // aborted EVERY workspace and the tool died with a stack trace — the
    // per-doc `skipped` list only covers failures inside the loop.
    // The temp dir exists before `stageDatabase` can refuse, so the refusal path
    // must remove it too — otherwise every failed attempt leaves an empty
    // `affine-read-*` behind in temp.
    const stagingDir = mkdtempSync(join(tmpdir(), 'affine-read-'));
    let staged: ReturnType<typeof stageDatabase> | null = null;
    try {
      staged = stageDatabase(ref.dbPath, stagingDir);
      const db = openNodeSqlite(staged.path);
      try {
        const result = exportWorkspace(db, join(outDir, workspaceFolderName(ref)));
        console.log(
          `\n${ref.kind} ${ref.id} — peer ${ref.peer}, schema ${result.schema}, ` +
            `journal ${staged.sidecars.join('+') || 'none'}`,
        );
        for (const doc of result.docs)
          console.log(
            `  ${String(doc.markdown.length).padStart(7)} chars  ` +
              `${doc.hadSnapshot ? 'snapshot' : 'no snapshot'}+${doc.updatesReplayed}  ` +
              `${doc.title || '(untitled)'}`,
          );
        // Never hidden: a document left out and a document that does not exist
        // look identical in a count.
        for (const skip of result.skipped) {
          failures++;
          console.log(`  SKIPPED ${skip.id} — ${skip.reason}`);
        }
        // A blob left out is named like a doc left out: an image that is not in
        // the folder and one that never existed look the same on disk.
        for (const skip of result.skippedBlobs)
          console.log(`  SKIPPED blob ${skip.key} — ${skip.reason}`);
        for (const path of result.removed) console.log(`  REMOVED ${path}`);
        console.log(
          `  → ${result.files.length} file(s), ${result.blobsWritten} image(s)` +
            (result.trashed ? `, ${result.trashed} left in AFFiNE's trash` : ''),
        );
      } finally {
        db.close();
      }
    } catch (error) {
      failures++;
      console.log(
        `\nSKIPPED workspace ${ref.id} (${ref.layout}) — ` +
          (error instanceof Error ? error.message : String(error)),
      );
    } finally {
      if (staged) staged.dispose();
      else rmSync(stagingDir, { recursive: true, force: true });
    }
  }
  return failures > 0 ? 1 : 0;
}

// `require.main === module` rather than a bare call: importing this file from a
// test must not run the tool against the developer's own AFFiNE install.
if (require.main === module) process.exit(runCli());
