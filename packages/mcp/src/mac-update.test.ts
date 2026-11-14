/**
 * mac-update.test.ts — the agent-driven macOS update (doc 228), with every
 * command and the network replaced by fakes, on a temporary HOME and app path.
 * The rules under test: nothing is touched before the dmg's sha512 matches,
 * the key files are copied aside first, the app is asked to quit and never
 * killed, the new app is verified before the swap, the old one goes to the
 * backup folder, and the Keychain prompt is left to the person.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkMacUpdate, compareVersions, handleMacUpdateTool, installMacUpdate, parseLatestMacYml, plistVersion,
  type ExecResult, type MacUpdateDeps,
} from './mac-update.js';

const DMG_BYTES = Buffer.from('a fake dmg, large enough to hash');
const sha = (b: Buffer) => createHash('sha512').update(b).digest('base64');
const yml = (version: string, bytes: Buffer = DMG_BYTES) => [
  `version: ${version}`,
  'files:',
  `  - url: Mnemosyne-OS-Infinity-${version}-mac-arm64.dmg`,
  `    sha512: ${sha(bytes)}`,
  `    size: ${bytes.length}`,
  `path: Mnemosyne-OS-Infinity-${version}-mac-arm64.dmg`,
  `sha512: ${sha(bytes)}`,
  "releaseDate: '2026-11-14T07:01:03.391Z'",
].join('\n');
const plist = (v: string) => `<?xml version="1.0"?><plist><dict><key>CFBundleShortVersionString</key>\n  <string>${v}</string></dict></plist>`;

let root = '';
let calls: Array<{ cmd: string; args: string[] }> = [];
let running = false;
let quitsAfterPolls = 0;
let served: Buffer = DMG_BYTES;
let failVerify = false;
let quitAnswer: ExecResult = { code: 0, stdout: '', stderr: '' };
let newVersion = '2.3.0';

function deps(over: Partial<MacUpdateDeps> = {}): MacUpdateDeps {
  const home = join(root, 'home');
  const appPath = join(root, 'Applications', 'MnemosyneOS.app');
  let clock = 0;
  return {
    platform: 'darwin', arch: 'arm64', home, appPath,
    async exec(cmd, args): Promise<ExecResult> {
      calls.push({ cmd, args });
      if (cmd === 'sw_vers') return { code: 0, stdout: '15.1\n', stderr: '' };
      if (cmd === 'pgrep') {
        if (running && quitsAfterPolls > 0) { quitsAfterPolls -= 1; if (quitsAfterPolls === 0) running = false; }
        return { code: running ? 0 : 1, stdout: '', stderr: '' };
      }
      if (cmd === 'osascript') return quitAnswer;
      if (cmd === 'ditto') {
        // The real dmg holds MnemosyneOS.app (M1, 13/11): any other source fails like ditto does.
        if (!args[0]!.endsWith('/MnemosyneOS.app') && !args[0]!.endsWith('\\MnemosyneOS.app')) {
          return { code: 1, stdout: '', stderr: `ditto: Cannot get the real path for source ${args[0]}` };
        }
        mkdirSync(join(args[1]!, 'Contents'), { recursive: true });
        writeFileSync(join(args[1]!, 'Contents', 'Info.plist'), plist(newVersion));
        return { code: 0, stdout: '', stderr: '' };
      }
      if (cmd === 'codesign') return failVerify ? { code: 1, stdout: '', stderr: 'invalid signature' } : { code: 0, stdout: '', stderr: '' };
      return { code: 0, stdout: '', stderr: '' };
    },
    fetchText: async () => yml('2.3.0'),
    download: async (_url, dest) => { mkdirSync(join(dest, '..'), { recursive: true }); writeFileSync(dest, served); },
    sleep: async () => { clock += 1_000; },
    now: () => 1_794_600_000_000 + clock,
    ...over,
  };
}

const installedPlist = (d: MacUpdateDeps) => plistVersion(readFileSync(join(d.appPath, 'Contents', 'Info.plist'), 'utf8'));
const ran = (cmd: string) => calls.some((c) => c.cmd === cmd);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'mac-update-'));
  const d = deps();
  mkdirSync(join(d.appPath, 'Contents'), { recursive: true });
  writeFileSync(join(d.appPath, 'Contents', 'Info.plist'), plist('2.2.0'));
  mkdirSync(join(d.home, '.mnemosyne'), { recursive: true });
  writeFileSync(join(d.home, '.mnemosyne', 'keys.enc'), 'sealed-keys');
  writeFileSync(join(d.home, '.mnemosyne', 'keys-transfer.json'), JSON.stringify({ type: 'x', seal: 'machine', createdAt: '2026-11-13T10:44:00Z', ct: 'SECRET-CIPHERTEXT' }));
  writeFileSync(join(d.home, '.mnemosyne', 'model-config.json'), '{"mode":"local"}');
  calls = []; running = false; quitsAfterPolls = 0; served = DMG_BYTES; failVerify = false;
  quitAnswer = { code: 0, stdout: '', stderr: '' }; newVersion = '2.3.0';
});
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('the pure readers', () => {
  it('reads electron-builder latest-mac.yml, and refuses one without a hash', () => {
    const r = parseLatestMacYml(yml('2.3.0'));
    assert.equal(r.version, '2.3.0');
    assert.equal(r.file, 'Mnemosyne-OS-Infinity-2.3.0-mac-arm64.dmg');
    assert.equal(r.size, DMG_BYTES.length);
    assert.equal(r.url, 'https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS/releases/latest/download/Mnemosyne-OS-Infinity-2.3.0-mac-arm64.dmg');
    assert.throws(() => parseLatestMacYml('version: 2.3.0\npath: x.dmg\n'), /lists no dmg/);
  });
  // A SIGNED build's manifest (2.2.1, 14/11): the zip comes first and `path:`
  // points at it; the install must still take the dmg entry.
  it('on a signed manifest, takes the dmg entry, not the zip that path: names', () => {
    const zip = Buffer.from('the zip MacUpdater downloads');
    const signed = [
      'version: 2.2.1',
      'files:',
      '  - url: Mnemosyne-OS-Infinity-2.2.1-mac-arm64.zip',
      `    sha512: ${sha(zip)}`,
      `    size: ${zip.length}`,
      '  - url: Mnemosyne-OS-Infinity-2.2.1-mac-arm64.dmg',
      `    sha512: ${sha(DMG_BYTES)}`,
      `    size: ${DMG_BYTES.length}`,
      'path: Mnemosyne-OS-Infinity-2.2.1-mac-arm64.zip',
      `sha512: ${sha(zip)}`,
      "releaseDate: '2026-11-14T12:00:00.000Z'",
    ].join('\n');
    const r = parseLatestMacYml(signed);
    assert.equal(r.file, 'Mnemosyne-OS-Infinity-2.2.1-mac-arm64.dmg');
    assert.equal(r.sha512, sha(DMG_BYTES));
    assert.equal(r.size, DMG_BYTES.length);
  });
  it('reads the installed version and orders versions numerically', () => {
    assert.equal(plistVersion(plist('2.2.0')), '2.2.0');
    assert.equal(compareVersions('2.2.0', '2.10.0'), -1);
    assert.equal(compareVersions('2.3.0', '2.3.0'), 0);
  });
});

describe('mnemosyne_mac_update_check', () => {
  it('says what install will do and leaves the Keychain to the person, writing nothing', async () => {
    const text = await handleMacUpdateTool('mnemosyne_mac_update_check', {}, deps());
    assert.ok(text.includes('Installed: 2.2.0'));
    assert.ok(text.includes('Latest release: 2.3.0'));
    assert.ok(text.includes('automatic copy present (machine-sealed, 2026-11-13T10:44:00Z)'));
    assert.ok(text.includes('Always Allow'));
    assert.ok(text.includes('Never click it for them'));
    assert.ok(!text.includes('SECRET-CIPHERTEXT'));
    assert.equal(existsSync(join(root, 'home', 'Library')), false);
  });
  it('refuses off macOS, off Apple Silicon and under macOS 14', async () => {
    assert.match(String((await checkMacUpdate(deps({ platform: 'win32' }))).refusal), /NOT_MACOS/);
    assert.match(String((await checkMacUpdate(deps({ arch: 'x64' }))).refusal), /NOT_APPLE_SILICON/);
    const old = deps();
    const exec = old.exec;
    old.exec = async (cmd, args) => (cmd === 'sw_vers' ? { code: 0, stdout: '13.6\n', stderr: '' } : exec(cmd, args));
    assert.match(String((await checkMacUpdate(old)).refusal), /MACOS_TOO_OLD/);
  });
});

describe('mnemosyne_mac_update_install', () => {
  it('the whole path: verify, back up, quit, verify the copy, swap, relaunch', async () => {
    running = true; quitsAfterPolls = 3;
    const d = deps();
    const r = await installMacUpdate(d, { version: '2.3.0', confirm: true });
    assert.equal(r.ok, true, r.stoppedAt);
    assert.equal(installedPlist(d), '2.3.0');
    assert.equal(plistVersion(readFileSync(join(r.backupDir!, 'MnemosyneOS.app', 'Contents', 'Info.plist'), 'utf8')), '2.2.0');
    assert.deepEqual(readdirSync(r.backupDir!).sort(), ['MnemosyneOS.app', 'keys-transfer.json', 'keys.enc', 'model-config.json']);
    // The quit goes by bundle id, and the process is found by its real executable.
    const quit = calls.find((c) => c.cmd === 'osascript')!;
    assert.ok(quit.args.join(' ').includes('tell application id "com.mnemosyne-os.infinity" to quit'));
    assert.ok(calls.find((c) => c.cmd === 'pgrep')!.args[1]!.endsWith('MnemosyneOS.app/Contents/MacOS/MnemosyneOS'));
    const order = calls.map((c) => c.cmd).filter((c) => ['osascript', 'hdiutil', 'ditto', 'codesign', 'open'].includes(c));
    assert.deepEqual(order, ['osascript', 'hdiutil', 'ditto', 'hdiutil', 'codesign', 'open']);
    assert.equal(calls.some((c) => c.cmd === 'kill' || c.cmd === 'pkill' || c.args.includes('-9')), false);
  });

  it('a dmg whose sha512 does not match is deleted, and nothing else is touched', async () => {
    served = Buffer.from('X'.repeat(DMG_BYTES.length));
    const d = deps();
    const r = await installMacUpdate(d, { version: '2.3.0', confirm: true });
    assert.match(String(r.stoppedAt), /CHECKSUM_MISMATCH/);
    assert.equal(existsSync(join(root, 'home', '.mnemosyne', 'update-backups')), false);
    assert.equal(ran('osascript') || ran('hdiutil'), false);
    assert.equal(installedPlist(d), '2.2.0');
    assert.deepEqual(readdirSync(join(root, 'home', 'Library', 'Caches', 'mnemosyne-update', '2.3.0')), []);
  });

  it('an app that does not quit is never killed: the install stops before replacing anything', async () => {
    running = true; quitsAfterPolls = 0;
    const d = deps();
    const r = await installMacUpdate(d, { version: '2.3.0', confirm: true });
    assert.match(String(r.stoppedAt), /APP_DID_NOT_QUIT/);
    assert.equal(ran('hdiutil') || ran('ditto'), false);
    assert.equal(installedPlist(d), '2.2.0');
  });

  it('a copy whose signature does not verify is removed and the installed app stays', async () => {
    failVerify = true;
    const d = deps();
    const r = await installMacUpdate(d, { version: '2.3.0', confirm: true });
    assert.match(String(r.stoppedAt), /SIGNATURE_INVALID/);
    assert.equal(existsSync(`${d.appPath}.new`), false);
    assert.equal(installedPlist(d), '2.2.0');
    assert.equal(ran('open'), false);
  });

  it('needs confirm true and the exact published version', async () => {
    assert.match(String((await installMacUpdate(deps(), { version: '2.3.0' })).stoppedAt), /NOT_CONFIRMED/);
    assert.match(String((await installMacUpdate(deps(), { version: '9.9.9', confirm: true })).stoppedAt), /VERSION_MISMATCH/);
    assert.equal(ran('osascript'), false);
  });

  // M1, 13/11: built from the display name, the tool saw no app and would have installed a second one.
  it('no app in /Applications: nothing is downloaded and no second app is created', async () => {
    const d = deps();
    rmSync(d.appPath, { recursive: true, force: true });
    const r = await installMacUpdate(d, { version: '2.3.0', confirm: true });
    assert.match(String(r.stoppedAt), /NOT_INSTALLED/);
    assert.equal(existsSync(d.appPath), false);
    assert.equal(existsSync(join(root, 'home', 'Library')), false);
  });

  it('an app holding a dialog open (osascript -128) is never forced: the install stops and says why', async () => {
    running = true; quitsAfterPolls = 0;
    quitAnswer = { code: 1, stdout: '', stderr: 'execution error: User canceled. (-128)' };
    const d = deps();
    const r = await installMacUpdate(d, { version: '2.3.0', confirm: true });
    assert.match(String(r.stoppedAt), /APP_DIALOG_OPEN/);
    assert.equal(ran('hdiutil') || ran('ditto'), false);
    assert.equal(installedPlist(d), '2.2.0');
  });

  it('a hung quit names Force Quit, the way out of the 2.2.0 hang', async () => {
    running = true; quitsAfterPolls = 0;
    const r = await installMacUpdate(deps(), { version: '2.3.0', confirm: true });
    assert.match(String(r.stoppedAt), /Force Quit it \(Cmd\+Option\+Esc/);
  });

  it('the version said is the one read from the app now in place', async () => {
    newVersion = '2.2.9';
    const r = await installMacUpdate(deps(), { version: '2.3.0', confirm: true });
    assert.equal(r.ok, true, r.stoppedAt);
    assert.ok(r.steps.some((t) => t.startsWith('installed 2.2.9 (the release said 2.3.0)')), r.steps.join(' | '));
  });
});

