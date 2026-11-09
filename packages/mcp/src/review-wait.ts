#!/usr/bin/env node
/**
 * review-wait — `mnemosyne-review-wait <id> [--after <ms>] [--for <seconds>]`
 * (doc 196 §15): blocks until the human answers review `<id>`, prints the
 * answer, exits.
 *
 *   exit 0  an answer arrived (printed, with the `after` for the next listen)
 *   exit 2  no answer within `--for` (default 30 min): the command to run next
 *   exit 1  refused, or Mnemosyne OS not reachable
 *
 * Run it in the background where the harness wakes the agent when a command
 * ends (Claude Code: `run_in_background`), or in the foreground anywhere else.
 * The loop lives in `review-listen.ts` (pure, tested); this file adds the
 * socket and the process.
 *
 * Ships as `dist/review-wait.js` (the `mnemosyne-review-wait` bin); in this
 * repo: `npx tsx packages/mcp/src/review-wait.ts <id>`.
 */
import { MnemoWsClient } from './ws-client';
import { listenToReview, parseListenArgs } from './review-listen';

/** Its own id, first-party on the host (`FIRST_PARTY_APP_IDS`): no consent dialog. */
const REVIEW_WAIT_APP_ID = 'mnemosyne-review-wait';
const CONNECT_TIMEOUT_MS = 5_000;

async function main(): Promise<number> {
  const args = parseListenArgs(process.argv.slice(2));
  if (!args) {
    process.stderr.write('usage: mnemosyne-review-wait <review id> [--after <epoch ms>] [--for <seconds>]\n');
    return 1;
  }
  const client = new MnemoWsClient({
    id: REVIEW_WAIT_APP_ID,
    name: 'Mnemosyne OS review listener',
    version: '1.0.0',
    mnemosyne_sdk: '^1.4.0',
    author: 'Mnemosyne Labs',
    description: 'Waits in a terminal for the human\'s answer to one review, for agents whose tool calls time out',
    scopes: ['review:ask'],
    // The registrar refuses an empty vault list (see cockpit-hook.ts): 'DEV'
    // is the built-in every manifest may name, and no vault scope is declared.
    vaults: ['DEV'],
    intents: ['REVIEW_ASK'],
  } as unknown as ConstructorParameters<typeof MnemoWsClient>[0], 7799, CONNECT_TIMEOUT_MS);
  try {
    await client.connect();
  } catch (err) {
    process.stderr.write(`Mnemosyne OS not reachable (${String(err).slice(0, 120)}). Start the app, then run this again.\n`);
    return 1;
  }
  try {
    const res = await listenToReview(client, REVIEW_WAIT_APP_ID, args);
    process.stdout.write(res.text + '\n');
    return res.code;
  } finally {
    client.close();
  }
}

void main().then(
  (code) => { process.exitCode = code; },
  (err) => { process.stderr.write(`[review-wait] ${String(err).slice(0, 200)}\n`); process.exitCode = 1; },
).finally(() => setTimeout(() => process.exit(), 20));
