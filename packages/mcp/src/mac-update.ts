/**
 * mac-update.ts — an IDE agent updates Mnemosyne OS on a Mac (doc 228).
 *
 * The mac build is ad-hoc signed and not notarized, so the app cannot update
 * itself: it opens the release page. Five gestures follow, one of which nobody
 * guesses (quit before replacing). These two tools give an agent a SAFE recipe
 * instead of letting it improvise curl, hdiutil and rm -rf on /Applications.
 *
 * Answered by the MCP process itself, before any connect: the update quits and
 * replaces the very app the actions server runs from.
 *
 * 🚨 What the agent never does, by construction:
 *  - answer the Keychain prompt (a macOS security dialog, the person's click);
 *  - read, decrypt or send a key (doc 155 §4): `keys-transfer.json` is read
 *    for its plaintext header only (seal, date), never opened;
 *  - delete anything: the previous app and the key files go to a backup folder;
 *  - kill a process: if the app does not quit, the install stops and says so;
 *  - touch quarantine or Gatekeeper: a file the tool downloads carries none.
 *
 * @module mac-update
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, copyFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';

/** Where releases are published (electron-builder.config.cjs `publish`). */
export const RELEASE_REPO = 'Mnemosyne-OS/Mnemosyne-Neural-OS';
/** The manifest of the latest release, resolved by GitHub's redirect. */
export const LATEST_MAC_YML_URL = `https://github.com/${RELEASE_REPO}/releases/latest/download/latest-mac.yml`;
/**
 * The bundle on disk is named after `executableName`, not `productName`
 * (electron-builder.config.cjs: 'MnemosyneOS' / 'Mnemosyne OS'). Measured on the
 * M1 on 13/11: /Applications/MnemosyneOS.app, CFBundleExecutable "MnemosyneOS",
 * and the dmg holds MnemosyneOS.app. Built from the display name, the tool
 * found no app, matched no process and would have installed a SECOND app.
 */
export const BUNDLE_NAME = 'MnemosyneOS';
export const EXECUTABLE_NAME = 'MnemosyneOS';
/** appId in electron-builder.config.cjs: the quit goes by id, never by a name LaunchServices must resolve. */
export const BUNDLE_ID = 'com.mnemosyne-os.infinity';
export const DEFAULT_APP_PATH = `/Applications/${BUNDLE_NAME}.app`;
/** minimumSystemVersion in electron-builder.config.cjs (the Metal prebuilts). */
export const MIN_MACOS_MAJOR = 14;
/** How long the install waits for the app to finish its own shutdown. */
export const QUIT_WAIT_MS = 60_000;
/** The key files copied aside before anything else is touched. */
export const BACKED_UP_FILES = ['keys.enc', 'keys-transfer.json', 'model-config.json'] as const;

export const KEYCHAIN_STEP =
  'macOS will now ask for access to « @mnemosyne-workspace/infinity-edition Safe Storage ». '
  + 'That dialog is for the PERSON: tell them to click « Always Allow » (« Toujours autoriser »). '
  + 'Never click it for them. If they click Deny, the app lends their keys from its machine copy for '
  + 'that session and asks again at the next launch (doc 227).';

/** What a command answered. */
export interface ExecResult { code: number; stdout: string; stderr: string }

/** Everything the tools touch outside pure code, injectable for the tests. */
export interface MacUpdateDeps {
  platform: NodeJS.Platform;
  arch: string;
  home: string;
  appPath: string;
  exec(cmd: string, args: string[], timeoutMs?: number): Promise<ExecResult>;
  fetchText(url: string): Promise<string>;
  download(url: string, dest: string): Promise<void>;
  sleep(ms: number): Promise<void>;
  now(): number;
}

/** The release a `latest-mac.yml` describes. */
export interface MacRelease { version: string; file: string; sha512: string; size: number; url: string }

/**
 * Reads the parts of `latest-mac.yml` the install needs. The file is
 * electron-builder's own, a fixed shape: a small reader beats a YAML
 * dependency in a package every agent installs.
 * @throws Error when a field is missing: an install never guesses a hash.
 */
export function parseLatestMacYml(text: string): MacRelease {
  const version = /^version:\s*['"]?([^'"\s]+)/m.exec(text)?.[1];
  // Every entry of `files:`, in order. The top-level `path:` is NOT the dmg on a
  // signed build: electron-builder points it at the zip, what MacUpdater
  // downloads (measured on the 2.2.1 manifest, 14/11). The install mounts a dmg,
  // so the dmg entry is taken from `files:`, never from `path:`.
  const entries = [...text.matchAll(/-\s*url:\s*['"]?([^'"\s]+)['"]?\s*\n\s*sha512:\s*['"]?([A-Za-z0-9+/=]+)['"]?\s*\n\s*size:\s*(\d+)/g)]
    .map((m) => ({ file: m[1]!, sha512: m[2]!, size: Number(m[3]) }));
  const dmg = entries.find((e) => e.file.endsWith('.dmg'));
  if (!version) throw new Error('latest-mac.yml has no version');
  if (!dmg) throw new Error(`latest-mac.yml lists no dmg (files: ${entries.map((e) => e.file).join(', ') || 'none'})`);
  if (!Number.isFinite(dmg.size) || dmg.size <= 0) throw new Error('latest-mac.yml gives the dmg no size');
  // The same `latest` redirect as the manifest: the dmg and the hash it is
  // checked against always come from one release, whatever its tag is named.
  return { version, file: dmg.file, sha512: dmg.sha512, size: dmg.size, url: `https://github.com/${RELEASE_REPO}/releases/latest/download/${dmg.file}` };
}

/** `CFBundleShortVersionString` of an Info.plist (XML form), or null. */
export function plistVersion(xml: string): string | null {
  return /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/.exec(xml)?.[1]?.trim() ?? null;
}

/** Compares dotted versions (`2.2.0` < `2.10.1`); a pre-release suffix is ignored. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.split('-')[0]!.split('.').map((n) => Number(n) || 0);
  const pa = parts(a); const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** The sha512 of a file, base64, as electron-builder writes it. */
export async function sha512OfFile(path: string): Promise<string> {
  const hash = createHash('sha512');
  await pipeline(createReadStream(path), hash);
  return hash.digest('base64');
}

/** The plaintext header of the automatic key copy: its seal and date, never its content. */
export function keyCopyHeader(path: string): { seal: string; createdAt: string | null } | null {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    return {
      seal: typeof parsed['seal'] === 'string' ? parsed['seal'] : 'passphrase',
      createdAt: typeof parsed['createdAt'] === 'string' ? parsed['createdAt'] : null,
    };
  } catch (err) {
    console.error('[mac-update] could not read the key copy header:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Whether the app is running, by its executable path (never by a loose name match). */
async function appRunning(d: MacUpdateDeps): Promise<boolean> {
  const r = await d.exec('pgrep', ['-f', `${d.appPath}/Contents/MacOS/${EXECUTABLE_NAME}`], 5_000);
  return r.code === 0;
}

async function macosMajor(d: MacUpdateDeps): Promise<number | null> {
  const r = await d.exec('sw_vers', ['-productVersion'], 5_000);
  const major = Number(r.stdout.trim().split('.')[0]);
  return r.code === 0 && Number.isFinite(major) ? major : null;
}

function installedVersion(d: MacUpdateDeps): string | null {
  const plist = join(d.appPath, 'Contents', 'Info.plist');
  if (!existsSync(plist)) return null;
  try {
    return plistVersion(readFileSync(plist, 'utf8'));
  } catch (err) {
    console.error('[mac-update] Info.plist unreadable:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** What `check` found, also used by `install` to refuse early. */
export interface MacUpdateCheck {
  supported: boolean;
  refusal: string | null;
  installed: string | null;
  latest: MacRelease | null;
  updateAvailable: boolean;
  running: boolean;
  keys: { store: boolean; copy: { seal: string; createdAt: string | null } | null };
}

/** Reads the machine and the release; writes nothing. */
export async function checkMacUpdate(d: MacUpdateDeps): Promise<MacUpdateCheck> {
  const base: MacUpdateCheck = {
    supported: false, refusal: null, installed: null, latest: null, updateAvailable: false, running: false,
    keys: { store: false, copy: null },
  };
  if (d.platform !== 'darwin') return { ...base, refusal: 'NOT_MACOS: this action updates the macOS app only' };
  if (d.arch !== 'arm64') return { ...base, refusal: 'NOT_APPLE_SILICON: the mac build is arm64 only' };
  const major = await macosMajor(d);
  if (major !== null && major < MIN_MACOS_MAJOR) {
    return { ...base, refusal: `MACOS_TOO_OLD: macOS ${major}, the app needs ${MIN_MACOS_MAJOR} or later` };
  }
  const mnemo = join(d.home, '.mnemosyne');
  const copyPath = join(mnemo, 'keys-transfer.json');
  const keys = { store: existsSync(join(mnemo, 'keys.enc')), copy: existsSync(copyPath) ? keyCopyHeader(copyPath) : null };
  const installed = installedVersion(d);
  const running = await appRunning(d);
  let latest: MacRelease;
  try {
    latest = parseLatestMacYml(await d.fetchText(LATEST_MAC_YML_URL));
  } catch (err) {
    return { ...base, installed, running, keys, refusal: `RELEASE_UNREADABLE: ${err instanceof Error ? err.message : String(err)}` };
  }
  return {
    supported: true, refusal: null, installed, latest, running, keys,
    updateAvailable: installed === null || compareVersions(installed, latest.version) < 0,
  };
}

/** The check, said for an agent. */
export function renderCheck(c: MacUpdateCheck): string {
  if (c.refusal && !c.latest) return `Cannot update: ${c.refusal}`;
  const lines = [
    `Installed: ${c.installed ?? 'not found in /Applications (install it by hand from the dmg the first time)'}`,
    `Latest release: ${c.latest!.version} (${c.latest!.file}, ${(c.latest!.size / 1e6).toFixed(0)} MB)`,
    `App running: ${c.running ? 'yes (the install asks it to quit first)' : 'no'}`,
    `Keys: keys.enc ${c.keys.store ? 'present' : 'absent'}; automatic copy ${c.keys.copy ? `present (${c.keys.copy.seal}-sealed, ${c.keys.copy.createdAt ?? 'undated'})` : 'absent'}`,
  ];
  if (c.installed === null) {
    lines.push('', 'Nothing to update: the app is not in /Applications.');
    return lines.join('\n');
  }
  if (!c.updateAvailable) {
    lines.push('', 'Already up to date: nothing to install.');
    return lines.join('\n');
  }
  lines.push(
    '',
    `To install, call mnemosyne_mac_update_install with version "${c.latest!.version}" and confirm true. It will:`,
    '1. download the dmg and check its size and sha512 against latest-mac.yml;',
    '2. copy keys.enc, keys-transfer.json and model-config.json to ~/.mnemosyne/update-backups/<time>/;',
    '3. ask the app to quit and wait for its own shutdown (it never kills it);',
    '4. copy the new app beside the old one, verify its signature, then swap them (the old app goes to the backup folder);',
    '5. relaunch the app.',
    '',
    'Then the person has one step: ' + KEYCHAIN_STEP,
  );
  if (!c.keys.copy && c.keys.store) {
    lines.push('', 'Note: there is no automatic key copy yet. If the person clicks Deny, their keys stay locked until a launch they allow.');
  }
  return lines.join('\n');
}

/** What the install did, step by step, or where it stopped. */
export interface MacUpdateInstall { ok: boolean; steps: string[]; stoppedAt?: string; backupDir?: string }

/**
 * Installs the latest release. Stops at the first refusal and says which:
 * nothing after a failed step runs, and nothing before it is undone, because
 * nothing before it destroyed anything.
 */
export async function installMacUpdate(d: MacUpdateDeps, args: { version?: unknown; confirm?: unknown }): Promise<MacUpdateInstall> {
  const steps: string[] = [];
  const stop = (why: string, backupDir?: string): MacUpdateInstall => ({ ok: false, steps, stoppedAt: why, backupDir });
  if (args.confirm !== true) return stop('NOT_CONFIRMED: pass confirm true after reading mnemosyne_mac_update_check');
  const c = await checkMacUpdate(d);
  if (!c.supported || !c.latest) return stop(c.refusal ?? 'UNSUPPORTED');
  if (typeof args.version !== 'string' || args.version !== c.latest.version) {
    return stop(`VERSION_MISMATCH: the latest release is ${c.latest.version}; pass exactly that version`);
  }
  // Replacing means there is something to replace: never a second app beside an unseen one.
  if (c.installed === null) return stop(`NOT_INSTALLED: no app at ${d.appPath}; install it by hand from the dmg the first time`);
  if (!c.updateAvailable) return stop(`UP_TO_DATE: ${c.installed} is already installed`);
  const rel = c.latest;

  // 1. Download and verify, before anything on the machine is touched.
  const cacheDir = join(d.home, 'Library', 'Caches', 'mnemosyne-update', rel.version);
  const dmg = join(cacheDir, rel.file);
  mkdirSync(cacheDir, { recursive: true });
  try {
    await d.download(rel.url, dmg);
  } catch (err) {
    rmSync(dmg, { force: true });
    return stop(`DOWNLOAD_FAILED: ${err instanceof Error ? err.message : String(err)}`);
  }
  const size = statSync(dmg).size;
  const sha = await sha512OfFile(dmg);
  if (size !== rel.size || sha !== rel.sha512) {
    rmSync(dmg, { force: true });
    return stop(`CHECKSUM_MISMATCH: expected ${rel.size} bytes and the published sha512, got ${size} bytes; the file was deleted, nothing else was touched`);
  }
  steps.push(`downloaded ${rel.file} and verified its size and sha512`);

  // 2. Back up the key files.
  const stamp = new Date(d.now()).toISOString().replace(/[:.]/g, '-');
  const backupDir = join(d.home, '.mnemosyne', 'update-backups', stamp);
  mkdirSync(backupDir, { recursive: true });
  for (const name of BACKED_UP_FILES) {
    const src = join(d.home, '.mnemosyne', name);
    if (existsSync(src)) copyFileSync(src, join(backupDir, name));
  }
  steps.push(`copied the key files to ${backupDir}`);

  // 3. Quit, through the app's own shutdown. Never a kill.
  if (await appRunning(d)) {
    // By bundle id: a name goes through LaunchServices and can open a « Where is … ? » chooser.
    // -128 « User canceled » means a dialog in the app is open (the update prompt): said below.
    const asked = await d.exec('osascript', ['-e', `tell application id "${BUNDLE_ID}" to quit`], 15_000);
    if (asked.code !== 0 && /-128/.test(asked.stderr)) {
      return stop('APP_DIALOG_OPEN: the app refused to quit because one of its dialogs is open (often the update prompt). Ask the person to close it, then call install again; nothing was replaced', backupDir);
    }
    const deadline = d.now() + QUIT_WAIT_MS;
    while (await appRunning(d)) {
      if (d.now() >= deadline) {
        return stop(`APP_DID_NOT_QUIT: still running after ${QUIT_WAIT_MS / 1000} s. Version 2.2.0 and older can hang while quitting (fixed after 2.2.0): ask the person to Force Quit it (Cmd+Option+Esc, choose Mnemosyne OS), then call install again. Nothing was replaced`, backupDir);
      }
      await d.sleep(1_000);
    }
    steps.push('the app quit through its own shutdown');
  }

  // 4. Copy the new app beside the old one and verify it before any swap.
  const mount = join(cacheDir, 'mnt');
  mkdirSync(mount, { recursive: true });
  const attach = await d.exec('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mount, dmg], 120_000);
  if (attach.code !== 0) return stop(`MOUNT_FAILED: ${attach.stderr.trim() || attach.code}`, backupDir);
  const fresh = `${d.appPath}.new`;
  try {
    rmSync(fresh, { recursive: true, force: true });
    const copy = await d.exec('ditto', [join(mount, `${BUNDLE_NAME}.app`), fresh], 300_000);
    if (copy.code !== 0) return stop(`COPY_FAILED: ${copy.stderr.trim() || copy.code}; the installed app is untouched`, backupDir);
  } finally {
    const detach = await d.exec('hdiutil', ['detach', mount], 60_000);
    if (detach.code !== 0) console.error('[mac-update] hdiutil detach failed:', detach.stderr.trim());
  }
  const verify = await d.exec('codesign', ['--verify', '--deep', '--strict', fresh], 120_000);
  if (verify.code !== 0) {
    rmSync(fresh, { recursive: true, force: true });
    return stop(`SIGNATURE_INVALID: ${verify.stderr.trim() || verify.code}; the copy was removed, the installed app is untouched`, backupDir);
  }
  steps.push('copied the new app beside the old one and verified its signature');

  // 5. Swap: the old app goes to the backup folder, never to nothing.
  try {
    if (existsSync(d.appPath)) renameSync(d.appPath, join(backupDir, `${BUNDLE_NAME}.app`));
    renameSync(fresh, d.appPath);
  } catch (err) {
    return stop(`SWAP_FAILED: ${err instanceof Error ? err.message : String(err)}; the previous app is in ${backupDir}`, backupDir);
  }
  // Said from the app now in place, not from the manifest: what is installed is what the person runs.
  const nowInstalled = installedVersion(d);
  steps.push(`installed ${nowInstalled ?? 'an app whose version could not be read'}${nowInstalled && nowInstalled !== rel.version ? ` (the release said ${rel.version})` : ''}; the previous app is in ${backupDir}`);

  // 6. Relaunch.
  const open = await d.exec('open', ['-a', d.appPath], 30_000);
  steps.push(open.code === 0 ? 'relaunched the app' : `could not relaunch (${open.stderr.trim() || open.code}): the person opens it from Applications`);
  return { ok: true, steps, backupDir };
}

/** The install, said for an agent. */
export function renderInstall(r: MacUpdateInstall): string {
  const done = r.steps.map((s) => `✓ ${s}`).join('\n');
  if (!r.ok) return [done, `Stopped: ${r.stoppedAt}`].filter(Boolean).join('\n');
  return [done, '', 'One step left, for the person: ' + KEYCHAIN_STEP].join('\n');
}

// ── Real dependencies ──────────────────────────────────────────────────────────

function run(cmd: string, args: string[], timeoutMs = 30_000): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1) : 0;
      resolve({ code, stdout: String(stdout ?? ''), stderr: String(stderr ?? (err ? err.message : '')) });
    });
  });
}

const FETCH_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 30 * 60_000;

/** The deps of a real Mac. */
export function realMacUpdateDeps(): MacUpdateDeps {
  return {
    platform: process.platform,
    arch: process.arch,
    home: homedir(),
    appPath: DEFAULT_APP_PATH,
    exec: run,
    async fetchText(url) {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res.text();
    },
    async download(url, dest) {
      mkdirSync(dirname(dest), { recursive: true });
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
      await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), createWriteStream(dest));
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
  };
}

/** The two tool names, answered before any connect. */
export const MAC_UPDATE_TOOLS = new Set(['mnemosyne_mac_update_check', 'mnemosyne_mac_update_install']);

/** Answers one of the two tools, as text. Never throws: a failure is an answer. */
export async function handleMacUpdateTool(name: string, args: Record<string, unknown>, d: MacUpdateDeps = realMacUpdateDeps()): Promise<string> {
  try {
    if (name === 'mnemosyne_mac_update_check') return renderCheck(await checkMacUpdate(d));
    if (name === 'mnemosyne_mac_update_install') return renderInstall(await installMacUpdate(d, args));
    return `Unknown tool ${name}`;
  } catch (err) {
    console.error('[mac-update] failed:', err);
    return `The update failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}
