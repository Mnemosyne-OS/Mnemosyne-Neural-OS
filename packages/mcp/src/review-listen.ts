/**
 * review-listen — listen to one review for as long as it takes, outside an MCP
 * call (doc 196 §15). The body of the `mnemosyne-review-wait` command.
 *
 * Why a command and not only the tool: an MCP tool call is cut by the client
 * (60 s: the SDK default, measured in Claude Code), and no MCP message can
 * start a turn of an agent that is idle. A command that blocks until the human
 * answers, then prints the answer and exits, works in every harness that runs
 * a shell. Claude Code re-invokes the agent when a background command exits,
 * which is the one real wake-up of an idle session this door has.
 *
 * Pure loop over the same RPC as the tool, so it is testable without a host.
 *
 * @module review-listen
 */
import { describeWait, refusalText, stillWaiting, type ReviewRpc } from './review-tool.js';

/** One host wait per loop turn: the host caps a single wait at 30 min. */
const HOST_SLICE_S = 600;
/** How long the command listens without `--for`: 30 min. */
export const DEFAULT_LISTEN_S = 1_800;
/** The longest `--for` it accepts: a day. */
export const MAX_LISTEN_S = 24 * 3_600;

/** `<id> [--after <ms>] [--for <seconds>]`, read. */
export interface ListenArgs { id: string; after?: number; seconds?: number }
/** The exit code (0 answer, 1 refused, 2 time ran out) and the text to print. */
export interface ListenResult { code: 0 | 1 | 2; text: string }

/** Reads `<id> [--after <ms>] [--for <seconds>]`; null when it is not that. */
export function parseListenArgs(argv: readonly string[]): ListenArgs | null {
  const [id, ...rest] = argv;
  if (!id || id.startsWith('-')) return null;
  const out: ListenArgs = { id };
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    const value = Number(rest[i + 1]);
    if (!Number.isFinite(value)) return null;
    if (flag === '--after') out.after = value;
    else if (flag === '--for' && value > 0) out.seconds = Math.min(value, MAX_LISTEN_S);
    else return null;
  }
  return out;
}

/**
 * Waits on review `id` until an answer arrives (exit 0), the time runs out
 * (exit 2, with the call to make next) or the host refuses (exit 1). The
 * `after` is pinned once, so an answer between two host slices is not lost.
 */
export async function listenToReview(
  client: ReviewRpc, appId: string, args: ListenArgs, now: () => number = Date.now,
): Promise<ListenResult> {
  const after = args.after ?? now();
  const seconds = args.seconds ?? DEFAULT_LISTEN_S;
  const deadline = now() + seconds * 1000;
  for (;;) {
    const left = Math.ceil((deadline - now()) / 1000);
    if (left <= 0) return { code: 2, text: stillWaiting(args.id, after, seconds) };
    const slice = Math.min(left, HOST_SLICE_S);
    try {
      const r = await client.reviewWait({ appId, id: args.id, after, timeout_seconds: slice }, (slice + 10) * 1000);
      return { code: 0, text: describeWait(r) };
    } catch (err) {
      if (err instanceof Error && err.message === 'TIMEOUT') continue;
      return { code: 1, text: refusalText(err) };
    }
  }
}
