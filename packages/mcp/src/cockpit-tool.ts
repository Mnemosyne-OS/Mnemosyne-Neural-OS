/**
 * cockpit-tool — `mnemosyne_cockpit_update`: the agent's own status card on the
 * human's canvas (doc 110 §9), and its mailbox on the way.
 *
 * The card is DECLARED: `state` is what the agent says about itself, and the
 * host prints it next to the time since this call. An agent that stops calling
 * is an agent whose card goes quiet on the canvas — which is the truth.
 *
 * The session id comes from the harness (`CLAUDE_CODE_SESSION_ID`, the same
 * variable `mnemosyne_agents` uses to mark "← you"), or from `session` when the
 * harness does not publish one. The working tree is resolved from the process
 * cwd like the collision tool does, so a reply the human leaves on the card
 * lands in THIS session's mailbox and not in a sibling worktree's.
 */
import { workingTreeOf } from '@mnemosyne_os/agent-transcripts/node';

export const COCKPIT_STATES = ['working', 'waiting', 'done', 'blocked', 'closed'] as const;
export type CockpitState = (typeof COCKPIT_STATES)[number];

export interface CockpitMessage { from: string; at: string; subject: string; body: string }

export interface CockpitUpdateResult {
  ok: boolean;
  error?: string;
  pinned?: boolean;
  messages?: CockpitMessage[];
  /** Mail left in the box because the update was refused — see `renderCockpitUpdate`. */
  pendingMail?: number;
  treeIgnored?: boolean;
}

export interface CockpitRpcClient {
  _rpc<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
}

/** The params for `sdk.cockpit.update`, or the reason none can be built. */
export function cockpitParams(
  appId: string,
  args: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): { params: Record<string, unknown> } | { error: string } {
  // 🚨 The harness id comes FIRST. The transcript file, the `← you` marker of
  // `mnemosyne_agents`, the pre-commit hook and the Stop hook all name this
  // session by CLAUDE_CODE_SESSION_ID; an explicit `session` that beat it
  // split one conversation into two cards and two mailboxes, and a reply the
  // human typed on the card reached a session id nobody else ever reads.
  // `session` is the fallback the description promises: for harnesses that
  // publish nothing.
  const fromEnv = (env['CLAUDE_CODE_SESSION_ID'] ?? '').trim();
  const fromArg = typeof args['session'] === 'string' ? args['session'].trim() : '';
  const session = fromEnv || fromArg;
  if (!session) return { error: 'NO_SESSION' };
  const state = args['state'];
  if (!COCKPIT_STATES.includes(state as CockpitState)) return { error: 'BAD_STATE' };
  const out: Record<string, unknown> = { appId, session, state };
  if (typeof args['title'] === 'string' && args['title'].trim()) out['title'] = args['title'].trim();
  if (typeof args['status'] === 'string' && args['status'].trim()) out['status'] = args['status'].trim();
  if (Array.isArray(args['detail'])) out['detail'] = args['detail'].filter((l): l is string => typeof l === 'string');
  if (args['attention'] === true) out['attention'] = true;
  const tree = workingTreeOf(cwd);
  if (tree) out['tree'] = tree;
  return { params: out };
}

function stamp(iso: string): string {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(11, 16) + ' UTC' : iso;
}

/** The mailbox block under an answer, or nothing when the box was empty. */
function renderMail(mail: CockpitMessage[]): string {
  if (mail.length === 0) return '';
  // Two kinds of mail share the box — the human's replies on this card, and
  // other agents' broadcasts to the tree — so the heading names the box, and
  // each line names its sender.
  const lines = mail.map(m => `- (${stamp(m.at)}) from ${m.from}: ${m.body}`).join('\n');
  return `\n\n📬 ${mail.length} message${mail.length > 1 ? 's' : ''} in this session's mailbox (the human's replies on your card, and other agents' notes for this tree) — read ${mail.length > 1 ? 'them' : 'it'} and act on what is addressed to you:\n${lines}`;
}

export function renderCockpitUpdate(result: CockpitUpdateResult, state: string): string {
  if (!result.ok) {
    let why: string;
    switch (result.error) {
      case 'NO_WINDOW':
        why = 'The cockpit lives in the Mnemosyne OS app window and no window is open. Start the app (Infinity Edition) and call again.';
        break;
      case 'TIMEOUT':
        why = 'The app did not answer in time; the card was not updated. Is the canvas open? Try again once the window is up.';
        break;
      default:
        why = `The cockpit refused the update: ${result.error ?? 'unknown error'}.`;
    }
    // 🚨 A refusal is not the end of the answer. The host leaves the mail in
    // the box on this path (a message handed over here and then dropped by an
    // early return was how a human reply got lost), so whatever it DID send is
    // rendered, and a count of what is waiting says there is something to
    // come back for.
    const waiting = (result.pendingMail ?? 0) > 0
      ? `\n📬 ${result.pendingMail} message${result.pendingMail! > 1 ? 's are' : ' is'} waiting in this session's mailbox, left there because the update was refused; call again once the app answers, or read ${result.pendingMail! > 1 ? 'them' : 'it'} at the next commit or Stop hook.`
      : '';
    return `${why}${waiting}${renderMail(result.messages ?? [])}`;
  }
  const where = result.pinned === false
    ? 'The human removed this card from the canvas this session; it stays off until they pin it again (the data still reached the host).'
    : `Card on the canvas: ${state}.`;
  const tree = result.treeIgnored
    ? '\n⚠️ The working directory is not a git working tree, so this card has no mailbox: the human cannot reply to it from the canvas.'
    : '';
  return `${where}${tree}${renderMail(result.messages ?? [])}`;
}

export async function handleCockpitUpdate(
  client: CockpitRpcClient,
  appId: string,
  args: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): Promise<string> {
  const built = cockpitParams(appId, args, env, cwd);
  if ('error' in built) {
    if (built.error === 'NO_SESSION') {
      return 'No session id: the harness did not publish CLAUDE_CODE_SESSION_ID and no "session" was given. Pass "session" (any stable id for this conversation) to name the card.';
    }
    return `"state" must be one of ${COCKPIT_STATES.join(', ')}.`;
  }
  const result = await client._rpc<CockpitUpdateResult>('sdk.cockpit.update', built.params);
  return renderCockpitUpdate(result, String(built.params['state']));
}
