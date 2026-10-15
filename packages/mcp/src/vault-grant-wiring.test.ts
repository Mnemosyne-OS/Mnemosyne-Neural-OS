/**
 * The server announces the grant `vaultGrant` computes, and nothing wider.
 *
 * Why this exists. Until 2.1.3, index.ts added DEV, PERSONAL and SOCIAL to every
 * MNEMO_VAULTS list, so `MNEMO_VAULTS=NOTES` still reached the personal vault
 * while the README and server.json said a vault left out stayed out.
 * `vault-target.test.ts` proves the rule; this proves index.ts uses it, by
 * starting the real server from source and reading what it declares.
 *
 * No app is needed: `initialize` and `tools/list` never open the socket.
 * Each case starts one server through tsx, about a second each.
 *
 * Run: `pnpm --filter @mnemosyne_os/mcp test` (tsx + node:test).
 */

import { test }          from 'node:test';
import assert            from 'node:assert/strict';
import { spawn }         from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path              from 'node:path';

const HERE  = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.join(HERE, 'index.ts');

interface Announced {
  instructions: string;
  /** The `vault` property of mnemosyne_memory_query: what an agent is told it may pass. */
  queryVault:   { description: string; default: string };
}

/** Starts the server with exactly these MNEMO_* vars, then initialize + tools/list. */
function announce(vars: Record<string, string>): Promise<Announced> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('MNEMO_')) delete env[key];
  Object.assign(env, vars);

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', ENTRY], {
      cwd: path.join(HERE, '..'), env, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stderr = '';
    let buf = '';
    let instructions = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error(`no tools/list within 30 s\n${stderr}`)); }, 30_000);
    child.stderr.on('data', (d) => { stderr += String(d); });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`server exited (${code}) before tools/list\n${stderr}`)); });
    child.stdout.on('data', (d) => {
      buf += String(d);
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        const msg = JSON.parse(line) as { id?: number; result?: Record<string, unknown> };
        if (msg.id === 1) {
          instructions = String(msg.result?.['instructions'] ?? '');
          child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
          child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
        }
        if (msg.id === 2) {
          clearTimeout(timer);
          child.removeAllListeners('exit');
          child.kill();
          const tools = (msg.result?.['tools'] ?? []) as { name: string; inputSchema: { properties: Record<string, { description: string; default: string }> } }[];
          const query = tools.find(t => t.name === 'mnemosyne_memory_query');
          if (!query) return reject(new Error('mnemosyne_memory_query is not listed'));
          resolve({ instructions, queryVault: query.inputSchema.properties['vault']! });
        }
      }
    });
    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'vault-grant-wiring', version: '0' } },
    }) + '\n');
  });
}

/** The scope line the covenant prints for this install. */
const scopeLine = (a: Announced): string =>
  a.instructions.split('\n').find(l => l.startsWith('- Vaults this MCP is scoped for')) ?? '';

test('a set list is the whole grant: the reserved names are not added', async () => {
  const a = await announce({ MNEMO_VAULTS: 'NOTES,RESEARCH' });
  assert.equal(a.queryVault.default, 'NOTES', 'with no default named, the first listed vault is the default');
  for (const reserved of ['DEV', 'PERSONAL', 'SOCIAL']) {
    assert.ok(!new RegExp(`\\b${reserved}\\b`).test(a.queryVault.description), `${reserved} is still offered:\n${a.queryVault.description}`);
    assert.ok(!new RegExp(`\\b${reserved}\\b`).test(scopeLine(a)), `${reserved} is still declared:\n${scopeLine(a)}`);
  }
  assert.match(a.queryVault.description, /RESEARCH/);
});

test('a named default joins the list', async () => {
  const a = await announce({ MNEMO_DEFAULT_VAULT: 'AGENT_WORK', MNEMO_VAULTS: 'NOTES' });
  assert.equal(a.queryVault.default, 'AGENT_WORK');
  assert.match(a.queryVault.description, /NOTES/);
  assert.ok(!/\bPERSONAL\b/.test(a.queryVault.description));
});

test('no list keeps the reserved names, as before 2.1.3', async () => {
  const a = await announce({});
  assert.equal(a.queryVault.default, 'DEV');
  assert.match(a.queryVault.description, /PERSONAL/);
  assert.match(a.queryVault.description, /SOCIAL/);
});
