#!/usr/bin/env node
/**
 * cockpit-hook — the Claude Code hook that keeps this session's cockpit card
 * honest without the model having to remember to (doc 110 §9).
 *
 * Wired in `.claude/settings.local.json` on four events, all through this one
 * entry (the event name arrives on stdin):
 *
 *   SessionStart       → "working"  (the card appears)
 *   UserPromptSubmit   → "working"  (status = the prompt's first line) + the
 *                                    mail waiting for this session, as context
 *   Stop               → "done"     (status = the answer's first line); if the
 *                                    human left mail on the card, the stop is
 *                                    BLOCKED and the mail is the reason — the
 *                                    session picks it up instead of ending
 *   SessionEnd         → "closed"   (the card goes away)
 *
 * The decisions live in `cockpitHook.ts` (pure, tested). This file adds the
 * socket and the process.
 *
 * ⛔ A hook must never cost the session anything: every failure path (app
 * closed, port taken, malformed input) writes one line to stderr and exits 0.
 * Connecting is capped at 1.5 s, so a closed app costs one blink per prompt.
 *
 * Ships as `dist/cockpit-hook.js` (the `mnemosyne-cockpit-hook` bin) and runs
 * under tsx in this repo through the relay at `scripts/cockpit-hook.ts`.
 */
import { MnemoWsClient } from './ws-client';
import { workingTreeOf } from '../../agent-transcripts/src/node';
import {
  HOOK_APP_ID, planFor, titleFrom, statsFrom, detailFrom, renderMail, blockOutput, type HookInput, type HookMail,
} from './cockpitHook';

const CONNECT_TIMEOUT_MS = 1_500;

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

const warn = (line: string) => process.stderr.write(line + '\n');

async function main(): Promise<void> {
  let input: HookInput;
  try {
    input = JSON.parse(await readStdin()) as HookInput;
  } catch (err) {
    warn(`[cockpit-hook] no readable input: ${String(err)}`);
    return;
  }
  const plan = planFor(input);
  const session = (input.session_id ?? '').trim();
  if (!plan || !session) return;

  const client = new MnemoWsClient({
    id: HOOK_APP_ID,
    name: 'Claude Code cockpit hook',
    version: '1.0.0',
    mnemosyne_sdk: '^1.4.0',
    author: 'Mnemosyne Labs',
    description: 'Reports a Claude Code session to the cockpit and relays the mail left on its card',
    scopes: ['cockpit:write'],
    // The registrar refuses an empty vault list (INVALID_MANIFEST) even for an
    // app that reads no vault. 'DEV' is the host built-in every manifest may
    // name; no vault scope is declared, so nothing can be read through it.
    vaults: ['DEV'],
    intents: ['COCKPIT_WRITE'],
  } as unknown as ConstructorParameters<typeof MnemoWsClient>[0], 7799, CONNECT_TIMEOUT_MS);

  try {
    await client.connect();
  } catch (err) {
    // The app is closed: the card simply does not move. One line, exit 0.
    warn(`[cockpit-hook] Mnemosyne OS not reachable (${String(err).slice(0, 80)})`);
    return;
  }

  try {
    const tree = input.cwd ? workingTreeOf(input.cwd) : null;
    const base = { appId: HOOK_APP_ID, session, ...(tree ? { tree } : {}) };
    const title = plan.state === 'closed' ? null : titleFrom(input.transcript_path, warn);
    const stats = plan.state === 'closed' ? null : statsFrom(input.transcript_path, warn);
    // The question first, then where the session is. `detailFrom` reports the
    // project and the model — facts you glance at; the ask is the one line
    // here that has to be read, so it leads.
    const detail = plan.state === 'closed'
      ? []
      : [...(plan.ask ? [plan.ask] : []), ...detailFrom(input.transcript_path, warn)];
    const res = await client._rpc<{ ok: boolean; error?: string; messages?: HookMail[] }>('sdk.cockpit.update', {
      ...base,
      state: plan.state,
      mailScope: plan.mailScope,
      ...(title ? { title } : {}),
      ...(plan.status ? { status: plan.status } : {}),
      ...(stats ? { stats } : {}),
      ...(detail.length ? { detail } : {}),
    });
    if (!res.ok) {
      warn(`[cockpit-hook] card not updated: ${res.error ?? 'unknown'}`);
      return;
    }
    const mail = res.messages ?? [];
    if (mail.length === 0 || !plan.mail) return;
    if (plan.mail === 'block') {
      // The session is not over: say so on the card, then hand the mail over
      // as the reason the stop is refused. The mail is already marked
      // delivered, so a second Stop finds nothing and ends normally.
      await client._rpc('sdk.cockpit.update', { ...base, state: 'working', status: 'reading the message left on the card' });
      process.stdout.write(blockOutput(mail) + '\n');
    } else {
      process.stdout.write(renderMail(mail) + '\n');
    }
  } catch (err) {
    warn(`[cockpit-hook] ${String(err).slice(0, 200)}`);
  } finally {
    client.close();
  }
}

void main().finally(() => setTimeout(() => process.exit(0), 20));
