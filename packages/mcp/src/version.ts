/**
 * The one place this package states its own version.
 *
 * Why it exists. Until 1.6.3 the version was typed by hand in two places
 * (`MCP_MANIFEST.version` and the `Server` constructor) and had said `1.2.0`
 * since long before 1.6.2 shipped. That string is what an MCP client displays
 * and what a user copies into a bug report, so every report arrived naming a
 * version nobody was running, and the number could not be used to tell two
 * builds apart. A version is a fact about the artifact: it is read from the
 * artifact, never retyped beside it.
 *
 * How it reads. `package.json` sits one level above both `src/` (dev, tsx) and
 * `dist/` (published, node), so the same relative path works in both. npm always
 * includes `package.json` in a tarball whatever `files` says, so the published
 * layout is covered. The path is COMPUTED rather than written as a literal
 * `require('../package.json')`, because esbuild would resolve a literal at build
 * time and inline the version of whatever tree was built, which is the same
 * hazard in a new disguise.
 *
 * If the file cannot be read we return `'unknown'` rather than a number nobody
 * measured: an honest blank beats a plausible lie about which build is running.
 */

import { readFileSync }  from 'node:fs';
import { fileURLToPath } from 'node:url';
import path              from 'node:path';

function readVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const raw  = readFileSync(path.join(here, '..', 'package.json'), 'utf8');
    const v    = (JSON.parse(raw) as { version?: unknown }).version;
    return typeof v === 'string' && v ? v : 'unknown';
  } catch {
    // Deliberately quiet: stdout is the MCP JSON-RPC channel and a stray line
    // there corrupts the protocol. 'unknown' already carries the news.
    return 'unknown';
  }
}

/** This package's version, as published. `'unknown'` when it could not be read. */
/**
 * The version tsup stamps into the bundle (`define`, see tsup.config.ts and
 * tsup.app.config.ts), read from this package's package.json when the bundle
 * is built. It is what the APP copy needs: electron-builder puts that bundle at
 * `resources/mnemosyne-mcp/index.mjs`, where `../package.json` is nothing, and
 * the server announced "unknown" (measured 2026-11-04). The stamp is taken
 * from the tree being built and nothing else, so it is a fact about the
 * artifact, not a retyped literal. Undeclared under tsx, where the read wins.
 */
declare const __MNEMO_PKG_VERSION__: string | undefined;

function stampedVersion(): string | null {
  return typeof __MNEMO_PKG_VERSION__ === 'string' && __MNEMO_PKG_VERSION__ ? __MNEMO_PKG_VERSION__ : null;
}

export const PKG_VERSION = stampedVersion() ?? readVersion();
