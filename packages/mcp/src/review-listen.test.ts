/**
 * review-listen.test.ts — the `mnemosyne-review-wait` loop: it keeps the same
 * `after` across host slices, exits 0 with the answer, 2 with the call to make
 * next when time runs out, 1 on a refusal.
 */
import { test } from 'node:test';
import assert   from 'node:assert/strict';
import { listenToReview, parseListenArgs } from './review-listen.js';
import type { ReviewRpc } from './review-tool.js';

type Step = { throws: string } | { returns: unknown };

/** A host that answers each wait with the next step; the clock moves by each slice asked. */
function host(steps: Step[]) {
  const calls: Record<string, unknown>[] = [];
  let clock = 1_000;
  const client: ReviewRpc = {
    reviewOpen: async () => { throw new Error('unused'); },
    reviewGet: async () => { throw new Error('unused'); },
    reviewWait: async (p) => {
      calls.push(p);
      clock += (p['timeout_seconds'] as number) * 1000;
      const s = steps.shift();
      if (!s) throw new Error('TIMEOUT');
      if ('throws' in s) throw new Error(s.throws);
      return s.returns as never;
    },
  };
  return { client, calls, now: () => clock };
}

test('reads <id> --after --for, refuses anything else', () => {
  assert.deepEqual(parseListenArgs(['rv_1']), { id: 'rv_1' });
  assert.deepEqual(parseListenArgs(['rv_1', '--after', '50', '--for', '120']), { id: 'rv_1', after: 50, seconds: 120 });
  assert.equal(parseListenArgs([]), null);
  assert.equal(parseListenArgs(['--after', '5']), null);
  assert.equal(parseListenArgs(['rv_1', '--after', 'x']), null);
  assert.equal(parseListenArgs(['rv_1', '--for', '0']), null);
  assert.equal(parseListenArgs(['rv_1', '--nope', '1']), null);
});

test('host timeouts are slices: it keeps listening with the SAME after, then exits 0 on the answer', async () => {
  const h = host([
    { throws: 'TIMEOUT' },
    { throws: 'TIMEOUT' },
    { returns: { state: 'changes', answer: { at: 5_000, from: 'desktop', verdict: 'changes', text: 'les yeux' } } },
  ]);
  const res = await listenToReview(h.client, 'mnemosyne-review-wait', { id: 'rv_1', after: 40 }, h.now);
  assert.equal(res.code, 0);
  assert.match(res.text, /CHANGES REQUESTED from the app: "les yeux"/);
  assert.match(res.text, /wait with after: 5000\./);
  assert.equal(h.calls.length, 3);
  assert.deepEqual(h.calls.map((c) => c['after']), [40, 40, 40]);
  assert.ok(h.calls.every((c) => c['appId'] === 'mnemosyne-review-wait'));
});

test('no answer before --for runs out: exit 2 with the call to make next', async () => {
  const h = host([]);
  const res = await listenToReview(h.client, 'a', { id: 'rv_1', seconds: 900 }, h.now);
  assert.equal(res.code, 2);
  assert.match(res.text, /^STILL WAITING: .*after: 1000 \}/);
  // 900 s in slices of at most 600 s, never past the deadline.
  assert.deepEqual(h.calls.map((c) => c['timeout_seconds']), [600, 300]);
});

test('a refusal ends the listen with exit 1 and the refusal in words', async () => {
  const h = host([{ throws: 'UNKNOWN_REVIEW' }]);
  const res = await listenToReview(h.client, 'a', { id: 'rv_1' }, h.now);
  assert.deepEqual(res, { code: 1, text: 'No review has that id.' });
});
