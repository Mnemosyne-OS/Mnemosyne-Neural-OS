/**
 * cockpit-hook-plan.test.ts — what each harness event says about the session,
 * and the two outputs the mail can take.
 *
 * Lived in `scripts/cockpitHook.test.ts` until 2026-09-26, where only
 * `pnpm test:scripts` ran it — the CI runs the packages' own `test`, so the
 * hook's rules were outside it (verifier pass on doc 110).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  planFor, firstLine, titleFrom, statsFrom, detailFrom, customTitleFrom, renderMail, blockOutput, MAX_CARD_DOCUMENTS, RESUME_UPDATE,
  HOOK_APP_ID,
} from './cockpitHook';

test('stats are measured off the transcript and its folder, and never invented', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemo-hook-stats-'));
  try {
    const f = path.join(dir, 'sess.jsonl');
    const line = (ts: string, extra: Record<string, unknown>) => JSON.stringify({
      sessionId: 'sess', timestamp: ts, cwd: dir, ...extra,
    });
    fs.writeFileSync(f, [
      line('2026-09-06T00:00:00.000Z', { type: 'user', message: { role: 'user', content: 'start' } }),
      line('2026-09-06T01:30:00.000Z', { type: 'assistant', message: { role: 'assistant', content: [
        { type: 'tool_use', name: 'Write', input: { file_path: path.join(dir, 'a.ts') } },
      ] } }),
    ].join('\n') + '\n');
    // No session folder yet: subagents are a measured zero, not an unknown.
    const s0 = statsFrom(f);
    assert.equal(s0?.startedAt, '2026-09-06T00:00:00.000Z');
    assert.equal(s0?.lastAt, '2026-09-06T01:30:00.000Z');
    assert.equal(s0?.files, 1);
    assert.equal(s0?.subagents, 0);
    assert.equal(s0?.transcript, f);
    // Two subagent transcripts beside it, and a human-given title.
    fs.mkdirSync(path.join(dir, 'sess', 'subagents'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'sess', 'subagents', 'agent-a.jsonl'), '');
    fs.writeFileSync(path.join(dir, 'sess', 'subagents', 'agent-b.jsonl'), '');
    // A sidecar beside them is NOT a subagent: only transcripts count.
    fs.writeFileSync(path.join(dir, 'sess', 'subagents', 'agent-a.meta.json'), '{}');
    fs.writeFileSync(path.join(dir, 'sess', 'custom-title.json'), JSON.stringify({ customTitle: 'WIDGET CLAUDE ASSIST' }));
    assert.equal(statsFrom(f)?.subagents, 2);
    assert.equal(customTitleFrom(f), 'WIDGET CLAUDE ASSIST');
    assert.equal(titleFrom(f), 'WIDGET CLAUDE ASSIST');
    // An unreadable transcript still names the file and the subagents, and no file count.
    const s1 = statsFrom(path.join(dir, 'missing.jsonl'), () => {});
    assert.equal(s1?.files, undefined);
    assert.equal(s1?.transcript, path.join(dir, 'missing.jsonl'));
    assert.equal(statsFrom(undefined), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('each event maps to the state the harness can vouch for', () => {
  assert.deepEqual(planFor({ hook_event_name: 'SessionStart', source: 'startup' }), { state: 'working', status: 'session startup', mail: 'context', mailScope: 'all' });
  assert.deepEqual(planFor({ hook_event_name: 'UserPromptSubmit', prompt: '  fix the\n build ' }), { state: 'working', status: 'fix the build', mail: 'context', mailScope: 'all' });
  // A stop is refused only for mail addressed to THIS session: a broadcast for
  // the tree never holds a session that was done (seen live on 2026-09-06).
  assert.deepEqual(planFor({ hook_event_name: 'Stop', last_assistant_message: 'Done.' }), { state: 'done', status: 'Done.', mail: 'block', mailScope: 'addressed' });
  assert.deepEqual(planFor({ hook_event_name: 'SessionEnd', reason: 'logout' }), { state: 'closed', mail: null, mailScope: 'addressed' });
  // 🚨 The event the cockpit exists for and could not hear until 2026-09-11:
  // the harness saying it needs the human. `waiting` is what pulses the card
  // and flashes the taskbar, and nothing could declare it from a session.
  // 🚨 The question travels as `ask`, NOT as a status: the status row shares
  // its width with "seen N ago" on a 232px card and is clipped with no
  // tooltip. WAITING FOR YOU without what for is half a signal, and the half
  // it keeps is the one nobody can act on.
  assert.deepEqual(
    planFor({ hook_event_name: 'Notification', message: 'Claude needs your permission to use Bash' }),
    { state: 'waiting', ask: 'Claude needs your permission to use Bash', mail: null, mailScope: 'addressed' },
  );
  // 🎭 No message, no invented sentence: the STATE is the news.
  assert.deepEqual(
    planFor({ hook_event_name: 'Notification' }),
    { state: 'waiting', ask: undefined, mail: null, mailScope: 'addressed' },
  );
  // A question is read, not glanced at, so it is capped longer than a status.
  const long = 'x'.repeat(400);
  const asked = planFor({ hook_event_name: 'Notification', message: long })?.ask ?? '';
  assert.ok(asked.length > 120 && asked.length <= 240, `ask capped at ${asked.length}`);
  assert.ok(asked.endsWith('…'), 'a cut says it was cut');
  // ⛔ A notification never blocks a stop and never hands mail: it is an
  // interruption, not a hand-over.
  assert.equal(planFor({ hook_event_name: 'Notification' })?.mail, null);
  assert.equal(planFor({ hook_event_name: 'PreToolUse' }), null);
  assert.equal(planFor({}), null);
});

test('the follow-up of a blocked Stop takes NO mail: its answer is never read', () => {
  // 🚨 With no scope the host reads `all` and hands the tree's broadcasts to
  // an answer the hook throws away — marked delivered, shown to nobody.
  assert.equal(RESUME_UPDATE.mailScope, 'none');
  assert.equal(RESUME_UPDATE.state, 'working');
  assert.ok(RESUME_UPDATE.status.length > 0);
});

test('the hook registers under the id the app knows it by', () => {
  // The renderer's agent door reads `HARNESS_HOOK_SOURCE` (cockpitModel.ts)
  // to tell the harness's « done » (the turn ended) from an agent's own: the
  // two constants must agree, and neither package can import the other.
  assert.equal(HOOK_APP_ID, 'agent-cockpit');
});

test('a status is one capped line, and an empty one is absent rather than blank', () => {
  assert.equal(firstLine('x'.repeat(300))!.length, 120);
  assert.ok(firstLine('x'.repeat(300))!.endsWith('…'));
  assert.equal(firstLine('   '), undefined);
  assert.equal(firstLine(42), undefined);
});

test('the title comes from the transcript, never from the hook, and a fresh session has none', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemo-hook-'));
  try {
    const f = path.join(dir, 's.jsonl');
    fs.writeFileSync(f, [
      JSON.stringify({ type: 'user', sessionId: 's', timestamp: '2026-09-06T00:00:00.000Z', cwd: dir, message: { role: 'user', content: 'épingle-toi sur le cockpit' } }),
    ].join('\n') + '\n');
    // No title line yet: the first human turn stands in, capped.
    assert.equal(titleFrom(f), 'épingle-toi sur le cockpit');
    assert.equal(titleFrom(path.join(dir, 'missing.jsonl'), () => {}), null);
    assert.equal(titleFrom(undefined), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('mail as context and mail as a refused stop carry the same lines', () => {
  const mail = [{ from: 'the human, from the cockpit', at: '2026-09-06T01:00:00.000Z', body: 'Use the other branch.' }];
  const ctx = renderMail(mail);
  assert.match(ctx, /1 message in this session's mailbox/);
  // Never "from the human" as a heading: agent broadcasts ride the same box.
  assert.doesNotMatch(ctx, /messages? from the human/);
  assert.match(ctx, /act on what is addressed to you/);
  assert.match(ctx, /- from the human, from the cockpit: Use the other branch\./);
  const out = JSON.parse(blockOutput(mail)) as { decision: string; reason: string; hookSpecificOutput: { hookEventName: string; decision: string; reason: string } };
  assert.equal(out.decision, 'block');
  assert.equal(out.hookSpecificOutput.hookEventName, 'Stop');
  assert.equal(out.hookSpecificOutput.decision, 'block');
  assert.equal(out.reason, ctx);
  assert.equal(out.hookSpecificOutput.reason, ctx);
});

test('the card carries where it runs and which model, or nothing at all', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemo-hook-detail-'));
  try {
    const f = path.join(dir, 'sess.jsonl');
    const project = path.join(dir, '_MNEMOSYNE OS');
    fs.writeFileSync(f, JSON.stringify({
      sessionId: 'sess', timestamp: '2026-09-06T00:00:00.000Z', cwd: project, gitBranch: 'main',
      type: 'assistant', message: { role: 'assistant', model: 'claude-opus-5', content: 'hi' },
    }) + '\n');

    // Ariadne's card used to be the only one showing these; now that the
    // session's own card wins the collapse, it has to carry them itself.
    assert.deepEqual(detailFrom(f), ['_MNEMOSYNE OS · main', 'claude-opus-5']);

    // 🎭 Nothing readable means no line — never "unknown branch", never an
    // empty separator standing where a name should be.
    const bare = path.join(dir, 'bare.jsonl');
    fs.writeFileSync(bare, JSON.stringify({
      sessionId: 'bare', timestamp: '2026-09-06T00:00:00.000Z',
      type: 'user', message: { role: 'user', content: 'x' },
    }) + '\n');
    assert.deepEqual(detailFrom(bare), []);
    assert.deepEqual(detailFrom(path.join(dir, 'missing.jsonl'), () => {}), []);
    assert.deepEqual(detailFrom(undefined), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the transcript is read once per run, and again when it changes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemo-hook-cache-'));
  try {
    const f = path.join(dir, 'sess.jsonl');
    const write = (branch: string) => fs.writeFileSync(f, JSON.stringify({
      sessionId: 'sess', timestamp: '2026-09-06T00:00:00.000Z',
      cwd: path.join(dir, 'proj'), gitBranch: branch,
      type: 'assistant', message: { role: 'assistant', model: 'm', content: 'hi' },
    }) + '\n');

    write('main');
    // Three callers, one file: title, stats and detail all want the same parse.
    // A hook fires on every prompt and every end of turn, and a live transcript
    // here is megabytes.
    assert.deepEqual(detailFrom(f), ['proj · main', 'm']);
    assert.equal(statsFrom(f)?.files, 0);

    // 🚨 …but a cache that never looked again would answer with the old branch
    // for the rest of the process. The key carries size and mtime.
    write('feat/a-much-longer-branch-name');
    assert.deepEqual(detailFrom(f), ['proj · feat/a-much-longer-branch-name', 'm']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the markdown a session wrote rides on the card, capped and never empty', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemo-hook-docs-'));
  try {
    const f = path.join(dir, 'sess.jsonl');
    const wrote = (p: string) => ({
      type: 'assistant', message: { role: 'assistant', content: [
        { type: 'tool_use', name: 'Write', input: { file_path: path.join(dir, p) } },
      ] },
    });
    /**
     * 🚨 A recorded write and a file on disk are two different facts, and the
     * card is only allowed to offer the second one: it puts a BUTTON on each
     * document, so a path it cannot verify would open a reader onto nothing.
     * This helper now produces both, which is what the real thing does.
     */
    const wroteForReal = (p: string) => { fs.writeFileSync(path.join(dir, p), '#\n'); return wrote(p); };
    const line = (ts: string, extra: Record<string, unknown>) => JSON.stringify({
      sessionId: 'sess', timestamp: ts, cwd: dir, ...extra,
    });

    // A session that wrote code and no document: ABSENT, not an empty list.
    fs.writeFileSync(f, [
      line('2026-09-09T00:00:00.000Z', { type: 'user', message: { role: 'user', content: 'go' } }),
      line('2026-09-09T00:01:00.000Z', wrote('index.ts')),
    ].join('\n') + '\n');
    assert.equal(statsFrom(f)?.documents, undefined,
      'an empty array would draw a heading over nothing on the card');

    // Now with documents among the code.
    fs.writeFileSync(f, [
      line('2026-09-09T00:00:00.000Z', { type: 'user', message: { role: 'user', content: 'go' } }),
      line('2026-09-09T00:01:00.000Z', wroteForReal('index.ts')),
      line('2026-09-09T00:02:00.000Z', wroteForReal('plan.md')),
      line('2026-09-09T00:03:00.000Z', wroteForReal('notes.markdown')),
      line('2026-09-09T00:04:00.000Z', wroteForReal('README.MD')),
      line('2026-09-09T00:05:00.000Z', wroteForReal('report.pdf')),
    ].join('\n') + '\n');
    const s = statsFrom(f);
    assert.equal(s?.files, 5, 'the COUNT still counts every file, not only the documents');
    assert.deepEqual(
      (s?.documents ?? []).map(p => path.basename(p)),
      // 🪤 NEWEST FIRST: that is the order the connector hands them back, and
      // assuming the opposite kept the six OLDEST documents on the card.
      ['README.MD', 'notes.markdown', 'plan.md'],
      'markdown only, any case — a pdf on the card would become an OS launch',
    );

    // The cap keeps the NEWEST, which is the HEAD of what the connector gives.
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((n, i) =>
      line(`2026-09-09T01:0${i}:00.000Z`, wroteForReal(`${n}.md`)));
    fs.writeFileSync(f, [
      line('2026-09-09T00:00:00.000Z', { type: 'user', message: { role: 'user', content: 'go' } }),
      ...many,
    ].join('\n') + '\n');
    const capped = statsFrom(f);
    assert.equal(capped?.documents?.length, MAX_CARD_DOCUMENTS);
    assert.deepEqual(
      (capped?.documents ?? []).map(p => path.basename(p)),
      ['h.md', 'g.md', 'f.md', 'e.md', 'd.md', 'c.md'],
    );

    /**
     * 🚨 A path recorded RELATIVE comes back absolute. A transcript stores the
     * path as the tool was CALLED with it, so `Write("plan.md")` is recorded
     * bare — and the card's reader opens by absolute path, so a bare name put
     * a button on the card that opened onto nothing. Measured on a real
     * session before the fix: two documents, one of them relative.
     */
    const prev = process.cwd();
    try {
      process.chdir(dir);
      fs.writeFileSync(path.join(dir, 'relative.md'), '#\n');
      fs.writeFileSync(f, [
        line('2026-09-09T02:00:00.000Z', { type: 'user', message: { role: 'user', content: 'go' } }),
        line('2026-09-09T02:01:00.000Z', {
          type: 'assistant', message: { role: 'assistant', content: [
            { type: 'tool_use', name: 'Write', input: { file_path: 'relative.md' } },
          ] },
        }),
      ].join('\n') + '\n');
      const rel = statsFrom(f);
      assert.deepEqual(rel?.documents, [path.resolve(dir, 'relative.md')],
        'a relative path is resolved against the hook cwd, not handed on bare');
    } finally {
      process.chdir(prev);
    }

    /**
     * ⛔ And a document the session wrote but that is NOT on disk any more is
     * dropped rather than offered. Resolving a relative path is a GUESS (doc 93
     * §11: the harness records the cwd, not the project root); existence is
     * what turns it into a fact. A button that opens an error is worse than a
     * button that is not there — the field said exactly that about the folder
     * button on this same card.
     */
    fs.writeFileSync(f, [
      line('2026-09-09T03:00:00.000Z', { type: 'user', message: { role: 'user', content: 'go' } }),
      line('2026-09-09T03:01:00.000Z', wrote('vanished.md')),
    ].join('\n') + '\n');
    assert.equal(statsFrom(f)?.documents, undefined,
      'a document that is no longer on disk is not offered');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
