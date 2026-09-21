/**
 * mnemo-cockpit — an OpenClaw hook that turns Gateway events into a declared
 * agent state for the Mnemosyne cockpit (doc 110, doc 93 §14).
 *
 * WHY THIS EXISTS AS A HOOK AND NOT A CONNECTOR
 * OpenClaw 2 keeps sessions and transcripts in SQLite, so there is no file for
 * Ariadne to observe. But a cockpit card is DECLARED, not observed — and
 * OpenClaw fires real lifecycle events. The line that matters is not
 * files-vs-database, it is OBSERVE vs DECLARE, and only observing was blocked.
 *
 * ⛔ WHAT IS PROVEN, AND WHAT IS NOT (2026-09-06)
 * Proven on this machine, twice: OpenClaw discovers this hook ("Ready", 5
 * events), loads it into the Gateway process, and CALLS it — a real
 * `gateway:startup` event produced
 *   {"type":"gateway","action":"startup","sessionKey":"gateway:startup","state":"idle"}
 * NOT proven: `message:received` / `message:sent`, the two events the tile
 * actually lives on. Sending a message needs a configured channel, gateway
 * credentials AND a model, and no model credential was ever available here.
 * NOT proven either: the publishing call itself — see below.
 *
 * 🚨 THIS DOES NOT PUBLISH YET. It writes the state it WOULD publish to a
 * JSONL file. Wiring it to `mnemosyne_cockpit_update` (MCP 1.8.0) needs the
 * Mnemosyne app running, which was never exercised against this hook. A file
 * that says "waiting" is honest; a card that says it is live when nothing
 * published it would not be.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Where the state is recorded. Declared by the environment, never guessed, and
 * resolved PER CALL: a destination frozen at import time cannot be changed by
 * anything that configures the Gateway after the module loads.
 *
 * 🚨 Null when nothing is declared. The old fallback was `.`, which is the
 * Gateway's current directory — wherever that happens to be — so an
 * unconfigured hook wrote a JSONL into a folder nobody chose. A destination
 * that was not declared is not a destination.
 */
export function outFile() {
  if (process.env.MNEMO_COCKPIT_FILE) return process.env.MNEMO_COCKPIT_FILE;
  if (process.env.OPENCLAW_STATE_DIR)
    return join(process.env.OPENCLAW_STATE_DIR, 'mnemo-cockpit.jsonl');
  return null;
}

/** Said once per process: a line per event would flood the Gateway log. */
let warnedNoDestination = false;

/**
 * The state an event DECLARES.
 *
 * An event we cannot name returns null and writes nothing. Rounding an unknown
 * event up to "working" would make the cockpit show a transition nobody made —
 * the same fabrication the host is supposed to refuse everywhere else.
 */
export function declaredState(type, action) {
  if (type === 'message' && action === 'received') return 'working';
  if (type === 'message' && action === 'sent') return 'waiting';
  if (type === 'gateway' && action === 'shutdown') return 'closed';
  if (type === 'command' && action === 'stop') return 'closed';
  if (type === 'gateway' && action === 'startup') return 'idle';
  return null;
}

export default function handler(event) {
  const state = declaredState(event?.type, event?.action);
  if (state === null) return;

  const row = {
    at: new Date().toISOString(),
    type: event?.type ?? null,
    action: event?.action ?? null,
    // Absent, never invented: a session key we were not handed stays null, and
    // whatever reads this must render that as unknown, not as a session named "".
    sessionKey: typeof event?.sessionKey === 'string' ? event.sessionKey : null,
    state,
  };

  const out = outFile();
  if (out === null) {
    // Nothing declared, nothing written. Said once, so the Gateway log names
    // the reason the cockpit stays silent without repeating it per event.
    if (!warnedNoDestination) {
      warnedNoDestination = true;
      console.error(
        '[mnemo-cockpit] no destination declared (set MNEMO_COCKPIT_FILE or OPENCLAW_STATE_DIR): state is not recorded',
      );
    }
    return;
  }

  try {
    mkdirSync(dirname(out), { recursive: true });
    appendFileSync(out, JSON.stringify(row) + '\n', 'utf8');
    console.log('[mnemo-cockpit] ' + row.type + ':' + row.action + ' -> ' + state);
  } catch (err) {
    // A hook that throws takes the Gateway event with it. Say it and continue:
    // a broken observer must never stop the thing it is observing.
    console.error('[mnemo-cockpit] could not record state: ' + (err && err.message));
  }
}
