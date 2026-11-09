/**
 * review-tool.test.ts — the RPC each review tool sends, the cap one wait gets
 * (under the client's own timeout), and the sentences the agent reads back
 * (no answer is STILL WAITING with the call to make next, an approval is not
 * a publish, an untranscribed voice note says why).
 */
import { test } from 'node:test';
import assert   from 'node:assert/strict';
import { describeAnswer, handleReviewTool, reviewAgentParams, REVIEW_TOOL_NAMES, WAIT_CAP_S, waitCapSeconds, type ReviewRpc } from './review-tool.js';

type Call = [string, Record<string, unknown> | unknown, number | undefined];
function fake(answer: unknown, fail?: string): ReviewRpc & { calls: Call[] } {
  const calls: Call[] = [];
  const hit = async <T>(method: string, params: unknown, timeoutMs?: number): Promise<T> => {
    calls.push([method, params, timeoutMs]);
    if (fail) throw new Error(fail);
    return answer as T;
  };
  return {
    calls,
    reviewOpen: (p) => hit('open', p),
    reviewWait: (p, t) => hit('wait', p, t),
    reviewGet: (id) => hit('get', id),
  };
}

test('three tools, one client call each, the caller id always sent', async () => {
  assert.deepEqual(REVIEW_TOOL_NAMES, ['mnemosyne_review_open', 'mnemosyne_review_wait', 'mnemosyne_review_get']);
  const c = fake({ id: 'rv_1', version: 2, createdAt: 50 });
  const out = await handleReviewTool(c, 'mnemosyne-mcp', 'mnemosyne_review_open', { path: '/x.mp4', title: 't' }, { env: {} });
  assert.equal(c.calls[0]?.[0], 'open');
  assert.deepEqual(c.calls[0]?.[1], { appId: 'mnemosyne-mcp', path: '/x.mp4', title: 't' });
  assert.match(out, /rv_1/);
  assert.match(out, /after: 50/);
});

test('the film project reaches the app as given (doc 200 §9)', async () => {
  const c = fake({ id: 'rv_1', version: 1, createdAt: 50 });
  await handleReviewTool(c, 'mnemosyne-mcp', 'mnemosyne_review_open', { path: '/x.mp4', title: 't', project: 'stop-aux-gadgets' }, { env: {} });
  assert.deepEqual(c.calls[0]?.[1], { appId: 'mnemosyne-mcp', path: '/x.mp4', title: 't', project: 'stop-aux-gadgets' });
});

test('one wait never outlives the client: capped at 45 s per call, the env can raise it', async () => {
  const c = fake({ state: 'changes', answer: { at: 9, from: 'telegram', verdict: 'changes', text: 'coupe à 8 s', atSecond: 8 } });
  const out = await handleReviewTool(c, 'a', 'mnemosyne_review_wait', { id: 'rv_1', timeout_seconds: 900 }, { env: {} });
  assert.equal(c.calls[0]?.[0], 'wait');
  assert.equal((c.calls[0]?.[1] as Record<string, unknown>)['timeout_seconds'], WAIT_CAP_S);
  assert.equal(c.calls[0]?.[2], (WAIT_CAP_S + 10) * 1000);
  assert.ok((c.calls[0]?.[2] as number) < 60_000, 'under the MCP SDK default request timeout');
  assert.match(out, /CHANGES REQUESTED from the phone at 8s: "coupe à 8 s"/);
  const d = fake({ state: 'waiting', answer: { at: 9, from: 'desktop', verdict: null, text: 'hm' } });
  await handleReviewTool(d, 'a', 'mnemosyne_review_wait', { id: 'rv_1' }, { env: { MNEMO_REVIEW_WAIT_MAX_S: '100' } });
  assert.equal((d.calls[0]?.[1] as Record<string, unknown>)['timeout_seconds'], 100);
  assert.equal(waitCapSeconds({ MNEMO_REVIEW_WAIT_MAX_S: 'nope' }), WAIT_CAP_S);
  assert.equal(waitCapSeconds({ MNEMO_REVIEW_WAIT_MAX_S: '99999' }), 1_800);
});

test('no answer in one call is STILL WAITING, with the SAME after to call again with', async () => {
  const c = fake(null, 'TIMEOUT');
  const out = await handleReviewTool(c, 'a', 'mnemosyne_review_wait', { id: 'rv_1' }, { env: {}, now: () => 777 });
  // The after is pinned by the tool, so the next call cannot open a gap.
  assert.equal((c.calls[0]?.[1] as Record<string, unknown>)['after'], 777);
  assert.match(out, /^STILL WAITING: .*Nothing was decided/);
  assert.match(out, /mnemosyne_review_wait again with \{ id: "rv_1", after: 777 \}/);
  assert.doesNotMatch(out, /in the background/);
  const given = await handleReviewTool(fake(null, 'TIMEOUT'), 'a', 'mnemosyne_review_wait', { id: 'rv_1', after: 50 }, { env: {}, now: () => 777, listenCommand: 'node "/d/review-wait.js"' });
  assert.match(given, /after: 50 \}/);
  assert.match(given, /run `node "\/d\/review-wait\.js" rv_1 --after 50` in the background/);
});

test('every answer since after is told, oldest first, with the after for the next listen', async () => {
  const out = await handleReviewTool(fake({
    state: 'changes',
    answer: { at: 10, from: 'desktop', verdict: null, fps: 30, notes: [{ atSecond: 23.8, atFrame: 713, text: 'deux clins' }] },
    answers: [
      { at: 10, from: 'desktop', verdict: null, fps: 30, notes: [{ atSecond: 23.8, atFrame: 713, text: 'deux clins' }] },
      { at: 12, from: 'desktop', verdict: 'changes', text: 'les yeux restent fermés' },
    ],
  }), 'a', 'mnemosyne_review_wait', { id: 'rv_1', after: 1 }, { env: {} });
  assert.match(out, /^2 answers, oldest first:/);
  assert.match(out, /- COMMENT from the app \[answer at 10\]\n {2}1 frame note\(s\)/);
  assert.match(out, /frame 713 \(23\.800s\): "deux clins"/);
  assert.match(out, /- CHANGES REQUESTED from the app: "les yeux restent fermés"/);
  assert.match(out, /wait with after: 12\.$/);
});

test('an approval is not a publish', async () => {
  const ok = await handleReviewTool(fake({ state: 'approved', answer: { at: 1, from: 'desktop', verdict: 'approve' } }), 'a', 'mnemosyne_review_wait', { id: 'rv_1' }, { env: {} });
  assert.match(ok, /APPROVED from the app/);
  assert.match(ok, /not "publish"/);
});

test('the fence refusal tells the agent where to copy the file', async () => {
  const out = await handleReviewTool(fake(null, 'OUTSIDE_SEND_FOLDERS'), 'a', 'mnemosyne_review_open', { path: '/x.mp4', title: 't' });
  assert.match(out, /Copy it into ~\/\.mnemosyne\/outbox/);
});

test('a voice note without a transcript says why', () => {
  assert.match(describeAnswer({ at: 1, from: 'telegram', verdict: null, audioPath: '/r/v.ogg', transcript: 'NO_MODEL' }), /NOT transcribed: no listening model/);
  assert.match(describeAnswer({ at: 1, from: 'telegram', verdict: 'changes', audioPath: '/r/v.ogg', text: 'plus court' }), /voice note, transcribed\): "plus court"/);
});

test('get lists every answer, and says when there is none', async () => {
  const out = await handleReviewTool(fake({ id: 'rv_1', title: 'T', state: 'waiting', version: 1, answers: [] }), 'a', 'mnemosyne_review_get', { id: 'rv_1' });
  assert.match(out, /Review rv_1 "T" v1: waiting\n- no answer yet/);
});

test('the change button alone tells the agent to wait for the consigne', () => {
  assert.match(describeAnswer({ at: 42, from: 'telegram', verdict: 'changes' }), /no details yet: call mnemosyne_review_wait again with after: 42/);
  assert.doesNotMatch(describeAnswer({ at: 42, from: 'telegram', verdict: 'changes', text: 'plus court' }), /no details yet/);
});

test('frame notes reach the agent with their exact frame, and are the consigne', () => {
  const out = describeAnswer({
    at: 42, from: 'desktop', verdict: 'changes', fps: 30,
    notes: [{ atSecond: 1.5, atFrame: 45, text: 'texte trop tôt' }, { atSecond: 8.1, atFrame: 243, text: 'les yeux' }],
  });
  assert.match(out, /2 frame note\(s\) at 30 fps/);
  assert.match(out, /- frame 45 \(1\.500s\): "texte trop tôt"/);
  assert.match(out, /- frame 243 \(8\.100s\): "les yeux"/);
  assert.doesNotMatch(out, /no details yet/);
});

test('a file asked again is the review already waiting: the agent is told to wait on it', async () => {
  const out = await handleReviewTool(fake({ id: 'rv_1', version: 1, createdAt: 50, reused: true }), 'a', 'mnemosyne_review_open', { path: '/x.mp4', title: 't' });
  assert.match(out, /already waits on this file/);
  assert.match(out, /mnemosyne_review_wait \{ id: "rv_1", after: 50 \}/);
});

test('the review keeps the session that opened it, from the harness env only', async () => {
  const treeOf = (cwd: string) => (cwd === '/repo/wt' ? '/repo/wt' : null);
  const c = fake({ id: 'rv_1', version: 1, createdAt: 50 });
  await handleReviewTool(c, 'mnemosyne-mcp', 'mnemosyne_review_open',
    { path: '/x.mp4', title: 't', agentSession: 'someone-else', agentTree: '/elsewhere' },
    { env: { CLAUDE_CODE_SESSION_ID: ' sess-1 ' }, cwd: '/repo/wt', treeOf });
  assert.deepEqual(c.calls[0]?.[1], { appId: 'mnemosyne-mcp', path: '/x.mp4', title: 't', agentSession: 'sess-1', agentTree: '/repo/wt' });

  // No harness session: nothing sent, an argument of the same name is dropped.
  const bare = fake({ id: 'rv_2', version: 1, createdAt: 50 });
  await handleReviewTool(bare, 'mnemosyne-mcp', 'mnemosyne_review_open',
    { path: '/x.mp4', title: 't', agentSession: 'forged' }, { env: {}, cwd: '/repo/wt', treeOf });
  assert.deepEqual(bare.calls[0]?.[1], { appId: 'mnemosyne-mcp', path: '/x.mp4', title: 't' });

  // A session outside a git tree: the session alone.
  assert.deepEqual(reviewAgentParams({ CLAUDE_CODE_SESSION_ID: 's' }, '/tmp', treeOf), { agentSession: 's' });
});

test('a packet of frame notes says to act on all of them; a verdict does not', async () => {
  const note = { at: 10, from: 'desktop', verdict: null, fps: 30, notes: [{ atSecond: 1, atFrame: 30, text: 'x' }] };
  const lone = await handleReviewTool(fake({ state: 'waiting', answer: note }), 'a', 'mnemosyne_review_wait', { id: 'rv_1', after: 1 }, { env: {} });
  assert.match(lone, /came as one packet.*Act on all of them/);
  const done = await handleReviewTool(fake({ state: 'changes', answer: { ...note, verdict: 'changes' } }), 'a', 'mnemosyne_review_wait', { id: 'rv_1', after: 1 }, { env: {} });
  assert.doesNotMatch(done, /one packet/);
});
