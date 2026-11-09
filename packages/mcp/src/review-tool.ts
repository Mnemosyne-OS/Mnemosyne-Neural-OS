/**
 * review-tool — the review door (doc 196 §4): ask the human about a video you
 * made, then wait for THEIR answer to that video, from the Mnemosyne OS panel
 * or from their phone (Telegram text, voice note, buttons).
 *
 * Three tools, one RPC each:
 *  - `mnemosyne_review_open`  → `sdk.review.open`
 *  - `mnemosyne_review_wait`  → `sdk.review.wait`, capped per call (below)
 *  - `mnemosyne_review_get`   → `sdk.review.get`
 *
 * The loop an agent runs: open v1 → wait → read the consigne → re-render →
 * open v2 with `parentId` → wait … until `approved`. An approval is never an
 * order to publish: publishing is the human's gesture in the app.
 *
 * 🪤 One wait never outlives the MCP client's own request timeout. Measured
 * 2026-11-03: Claude Code cuts a tool call at 60 s ("Request timed out"),
 * and the TypeScript SDK's default is 60 s, which other clients inherit. A
 * wait of 240 s therefore never came back. Each call is capped at
 * {@link waitCapSeconds} and a host TIMEOUT comes back as STILL WAITING with
 * the exact call to make next, keeping the SAME `after`, so nothing that lands
 * between two calls is lost.
 *
 * The review keeps who opened it (doc 196 §15.5): the harness session id
 * (`CLAUDE_CODE_SESSION_ID`, the one the cockpit card and its mailbox use) and
 * the working tree of this server's cwd, so the panel can leave mail for THAT
 * session. Taken from the environment only: an argument of the same name is
 * dropped, so an agent cannot address another session's mailbox.
 *
 * Pure formatting around the RPCs, so the rendering is testable without a host.
 *
 * @module review-tool
 */
/** The three client calls (ws-client.ts), so a test can fake them. */
export interface ReviewRpc {
  reviewOpen(p: Record<string, unknown>): Promise<{ id: string; version: number; createdAt: number; reused?: boolean }>;
  reviewWait(p: Record<string, unknown>, timeoutMs: number): Promise<{ state: string; answer: Answer; answers?: Answer[] }>;
  reviewGet(id: unknown): Promise<{ id: string; title: string; state: string; version: number; answers: Answer[] }>;
}

/** One call's ceiling: under the 60 s default request timeout of the MCP SDK. */
export const WAIT_CAP_S = 45;
/** Hard ceiling for the env override: the host refuses past 30 min anyway. */
const WAIT_CAP_OVERRIDE_MAX_S = 1_800;

/**
 * How long one `mnemosyne_review_wait` may block. `MNEMO_REVIEW_WAIT_MAX_S`
 * raises it for a client known to wait longer; a value that is not a positive
 * number is ignored.
 */
export function waitCapSeconds(env: Record<string, string | undefined> = process.env): number {
  const raw = Number(env['MNEMO_REVIEW_WAIT_MAX_S']);
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, WAIT_CAP_OVERRIDE_MAX_S) : WAIT_CAP_S;
}

export const REVIEW_TOOL_NAMES: readonly string[] = ['mnemosyne_review_open', 'mnemosyne_review_wait', 'mnemosyne_review_get'];

export interface Answer {
  at: number; from: string; verdict: string | null; text?: string; atSecond?: number;
  audioPath?: string; transcript?: string;
  /** Notes pinned on exact frames in the app, counted at `fps`. */
  notes?: { atSecond: number; atFrame: number; text: string }[];
  fps?: number;
}

/** One frame note as a line an agent can act on: `- frame 243 (8.100s): "…"`. */
function describeNote(n: { atSecond: number; atFrame: number; text: string }): string {
  return `  - frame ${n.atFrame} (${n.atSecond.toFixed(3)}s): "${n.text}"`;
}

/** One answer in words an agent can act on. */
export function describeAnswer(a: Answer): string {
  const verdict = a.verdict === 'approve' ? 'APPROVED'
    : a.verdict === 'changes' ? 'CHANGES REQUESTED'
      : a.verdict === 'reject' ? 'REJECTED' : 'COMMENT';
  const where = a.from === 'telegram' ? 'from the phone' : 'from the app';
  const at = a.atSecond !== undefined ? ` at ${a.atSecond}s` : '';
  const voice = a.audioPath
    ? (a.text ? ' (voice note, transcribed)' : a.transcript === 'NO_MODEL'
      ? ' (voice note, NOT transcribed: no listening model is installed; ask the human to type it or install one)'
      : ' (voice note, transcription failed)')
    : '';
  // The ✏️ button alone: the human is about to say what. Wait again for it.
  const pending = a.verdict === 'changes' && !a.text && !a.audioPath && !a.notes?.length
    ? ` (no details yet: call mnemosyne_review_wait again with after: ${a.at} for what to change)` : '';
  const head = `${verdict} ${where}${at}${voice}${a.text ? `: "${a.text}"` : ''}${pending} [answer at ${a.at}]`;
  if (!a.notes?.length) return head;
  const fps = a.fps !== undefined ? ` at ${a.fps} fps (frame 0 is the first; frame n starts at n / fps seconds)` : '';
  return `${head}\n  ${a.notes.length} frame note(s)${fps}:\n${a.notes.map(describeNote).join('\n')}`;
}

const REFUSALS: Record<string, string> = {
  OUTSIDE_SEND_FOLDERS: 'Refused: the file is outside ~/.mnemosyne/generations, ~/.mnemosyne/voiceovers and ~/.mnemosyne/outbox. Copy it into ~/.mnemosyne/outbox and open the review on that copy.',
  BAD_TYPE: 'Refused: a review carries a video or an image (.mp4 .mov .webm .png .jpg .webp .gif).',
  NOT_A_FILE: 'Refused: no file at that path.',
  PARENT_UNKNOWN: 'Refused: parentId names no review.',
  UNKNOWN_REVIEW: 'No review has that id.',
  TIMEOUT: 'TIMEOUT: no answer yet. Nothing was decided.',
  BAD_REQUEST: 'Refused: the arguments are not what this tool takes (absolute path, a title up to 120 characters, a review id).',
};

/** The refusal an agent reads for a host error code. */
export function refusalText(err: unknown): string {
  const code = err instanceof Error ? err.message : String(err);
  return REFUSALS[code] ?? `Refused: ${code}`;
}

/**
 * What a wait says when no answer came within one call: keep listening.
 * `listenCommand` is the `mnemosyne-review-wait` command line that sits next
 * to the running server, when there is one.
 */
export function stillWaiting(id: unknown, after: number, seconds: number, listenCommand?: string): string {
  const head = `STILL WAITING: no answer to review ${String(id)} in the last ${seconds} s. Nothing was decided and the review stays open. Call mnemosyne_review_wait again with { id: "${String(id)}", after: ${after} } (the same after, so an answer given between two calls is not missed). Keep calling until an answer arrives.`;
  if (!listenCommand) return head;
  return `${head} If your harness wakes you when a background command ends (Claude Code: run_in_background), you can instead run \`${listenCommand} ${String(id)} --after ${after}\` in the background and end your turn: it exits with the answer.`;
}

/** Every answer of one wait, oldest first, then the `after` for the next call. */
export function describeWait(r: { state: string; answer: Answer; answers?: Answer[] }): string {
  const answers = r.answers?.length ? r.answers : [r.answer];
  // `answers` is never empty; the fallback satisfies noUncheckedIndexedAccess (os-actions compiles this file).
  const last = answers[answers.length - 1] ?? r.answer;
  const body = answers.length === 1
    ? describeAnswer(last)
    : `${answers.length} answers, oldest first:\n${answers.map((a) => `- ${describeAnswer(a)}`).join('\n')}`;
  const approved = r.state === 'approved' ? ' Approved is not "publish": the human publishes from the app.' : '';
  // Frame notes reach the agent as one packet: the panel waits 30 s after the
  // last one (or the human pressed "wake now"). More may follow after a render.
  const watching = last.verdict === null && last.notes?.length
    ? ' These frame notes came as one packet: the human paused after pinning them, or woke you. Act on all of them, then open the retake and keep listening; the human may pin more.'
    : '';
  return `${body}\nReview state: ${r.state}.${approved}${watching} To hear what comes next, wait with after: ${last.at}.`;
}

/** What the server around the tool knows: the clock, its env, the listen command next to it. */
export interface ReviewToolOptions {
  now?: () => number;
  env?: Record<string, string | undefined>;
  listenCommand?: string;
  /**
   * The server's cwd and how to find its git working tree. Handed in by
   * `index.ts` (`workingTreeOf`), so this file stays importable without the
   * workspace package. Without `treeOf` the review keeps the session alone.
   */
  cwd?: string;
  treeOf?: (cwd: string) => string | null;
}

/**
 * Who opened the review, as `sdk.review.open` takes it: `agentSession` and
 * `agentTree`, each only when known. Nothing at all outside a harness that
 * publishes a session id: the review then behaves as before (no wake button).
 */
export function reviewAgentParams(
  env: Record<string, string | undefined>,
  cwd: string,
  treeOf: (cwd: string) => string | null = () => null,
): Record<string, string> {
  const session = (env['CLAUDE_CODE_SESSION_ID'] ?? '').trim();
  if (!session) return {};
  const tree = treeOf(cwd);
  return { agentSession: session, ...(tree ? { agentTree: tree } : {}) };
}

/** Runs one review tool; the answer is always text. */
export async function handleReviewTool(
  client: ReviewRpc, appId: string, name: string, args: Record<string, unknown>, opts: ReviewToolOptions = {},
): Promise<string> {
  const now = opts.now ?? Date.now;
  try {
    if (name === 'mnemosyne_review_open') {
      const { agentSession: _s, agentTree: _t, ...asked } = args;
      const agent = reviewAgentParams(opts.env ?? process.env, opts.cwd ?? process.cwd(), opts.treeOf);
      const r = await client.reviewOpen({ appId, ...asked, ...agent });
      if (r.reused) {
        return `Review ${r.id} already waits on this file (version ${r.version}): reused, nothing new was sent. Answers given since it opened count: call mnemosyne_review_wait { id: "${r.id}", after: ${r.createdAt} }. For a retake, open the new file with parentId: "${r.id}".`;
      }
      return `Review ${r.id} opened (version ${r.version}, createdAt ${r.createdAt}). Now call mnemosyne_review_wait { id: "${r.id}", after: ${r.createdAt} }.`;
    }
    if (name === 'mnemosyne_review_wait') {
      const cap = waitCapSeconds(opts.env);
      const asked = args['timeout_seconds'];
      const t = typeof asked === 'number' && Number.isFinite(asked) && asked > 0 ? Math.min(asked, cap) : cap;
      // Pinned here, not left to the host's "now": the STILL WAITING answer
      // hands this exact value back for the next call.
      const after = typeof args['after'] === 'number' && Number.isFinite(args['after']) ? args['after'] as number : now();
      try {
        const r = await client.reviewWait({ appId, ...args, after, timeout_seconds: t }, (t + 10) * 1000);
        return describeWait(r);
      } catch (err) {
        if (err instanceof Error && err.message === 'TIMEOUT') return stillWaiting(args['id'], after, t, opts.listenCommand);
        throw err;
      }
    }
    if (name === 'mnemosyne_review_get') {
      const r = await client.reviewGet(args['id']);
      const lines = r.answers.length ? r.answers.map((a) => `- ${describeAnswer(a)}`).join('\n') : '- no answer yet';
      return `Review ${r.id} "${r.title}" v${r.version}: ${r.state}\n${lines}`;
    }
    return `Unknown review tool ${name}`;
  } catch (err) {
    return refusalText(err);
  }
}
