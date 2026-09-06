/**
 * Finding AFFiNE workspaces on disk.
 *
 * Layout, from AFFiNE's own comment in
 * `packages/frontend/apps/electron/src/helper/dialog/dialog.ts`, verified against a
 * real 0.27.4 install on Windows 2026-09-06:
 *
 *   <app-data>/AFFiNE/<workspaces|userspaces>/<peer>/<workspace-id>/storage.db   (v2)
 *   <app-data>/AFFiNE/<workspaces|userspaces>/<workspace-id>/storage.db          (v1, legacy)
 *
 * ⚠️ The v1 branch is written from their source, NOT measured — no v1 install was
 * available. `layout` says which one a ref came from so a caller can tell them apart.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { WorkspaceRef } from './types';

const SPACE_DIRS = ['workspaces', 'userspaces'] as const;

/** Where Electron puts application data for this platform. */
function appDataRoot(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string | null {
  const home = env.HOME ?? env.USERPROFILE ?? '';
  const base =
    platform === 'win32'
      ? env.APPDATA
      : platform === 'darwin'
        ? home && join(home, 'Library', 'Application Support')
        : (env.XDG_CONFIG_HOME ?? (home && join(home, '.config')));
  return base || null;
}

/**
 * Every AFFiNE data directory on this machine, one per release channel.
 *
 * 🚨 There is more than one, and missing that is how this tool tells someone who
 * clearly has AFFiNE installed that they do not. Their build script sets
 * `productName = stableBuild ? 'AFFiNE' : 'AFFiNE-<buildType>'`, so a canary,
 * beta or internal build keeps its workspaces in `AFFiNE-canary` and friends.
 * Most of AFFiNE's own releases are canary, so that is not an edge case.
 */
export function affineDataDirs(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const base = appDataRoot(env, platform);
  if (!base) return [];
  return safeReaddir(base)
    .filter((name) => name === 'AFFiNE' || name.startsWith('AFFiNE-'))
    .map((name) => join(base, name))
    .filter(isDir)
    .sort((a, b) => a.length - b.length); // stable channel first, it is the shortest
}

/**
 * The stable channel's data directory, or the first channel found, or null when
 * AFFiNE was never installed here. Kept for callers that want one path to show.
 */
export function affineDataDir(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string | null {
  return affineDataDirs(env, platform)[0] ?? null;
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    // A racing uninstall, or a permission we do not have. Not a directory we can
    // walk, which is all the caller needs — and the failure is not swallowed for
    // any decision: an unreadable entry simply yields no workspace.
    return false;
  }
}

/**
 * Every workspace reachable on this machine. Never throws for a missing AFFiNE —
 * an empty list means "nothing found", and `affineDataDir()` says whether AFFiNE
 * is installed at all. The two are different answers and callers need both.
 */
export function findWorkspaces(opts: { dataDir?: string | null } = {}): WorkspaceRef[] {
  // Every channel by default (AFFiNE, AFFiNE-canary, AFFiNE-beta …); one directory
  // when a caller names it, which is what the tests do.
  const dataDirs =
    opts.dataDir === undefined ? affineDataDirs() : opts.dataDir ? [opts.dataDir] : [];

  const found: WorkspaceRef[] = [];
  for (const dataDir of dataDirs) {
    if (!isDir(dataDir)) continue;
    const channel = basename(dataDir);

    for (const kindDir of SPACE_DIRS) {
      const kind = kindDir === 'workspaces' ? 'workspace' : 'userspace';
      const root = join(dataDir, kindDir);
      if (!isDir(root)) continue;

      for (const entry of safeReaddir(root)) {
        const entryPath = join(root, entry);
        if (!isDir(entryPath)) continue;

        // v1 put storage.db directly under the workspace id; v2 inserted a <peer> level.
        const v1Db = join(entryPath, 'storage.db');
        if (existsSync(v1Db)) {
          found.push({ id: entry, peer: 'local', kind, dbPath: v1Db, layout: 'v1', channel });
          continue;
        }
        for (const workspaceId of safeReaddir(entryPath)) {
          const dbPath = join(entryPath, workspaceId, 'storage.db');
          if (existsSync(dbPath))
            found.push({ id: workspaceId, peer: entry, kind, dbPath, layout: 'v2', channel });
        }
      }
    }
  }
  return found;
}

function safeReaddir(path: string): string[] {
  try {
    return readdirSync(path);
  } catch (error) {
    // ⚠️ An unreadable directory is NOT an empty one, and the caller cannot tell
    // the two apart from a list. It is at least said out loud rather than
    // skipped in silence (rule 7) — a permission error here surfaces to whoever
    // reads the log as "we could not look", not as "there is nothing there".
    console.warn(
      `[affine-reader] could not read ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return [];
  }
}
