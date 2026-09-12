/**
 * The agent-awareness tools answer about OTHER PEOPLE'S sessions, from files
 * that hold a month of everything an agent saw. Two properties are load-bearing
 * and are what these tests defend:
 *
 *   1. an answer never claims more than it read
 *   2. an answer never carries content
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { handleAgentTool, lastSeen, sessionsRoots } from './agents.js';

const NOW = Date.parse('2026-08-29T12:00:00.000Z');
const minutesAgo = (n: number) => new Date(NOW - n * 60_000).toISOString();

/**
 * Where a fixture session pretends to have been working.
 *
 * 🪤 THIS WAS `C:/repo`, AND IT MADE THE WHOLE FILE WINDOWS-ONLY. A recorded
 * cwd is resolved to its WORKING TREE, and on Linux `resolve('C:/repo')` is a
 * relative path: it lands inside this package, the walk up finds Mnemosyne's
 * own `.git`, and every fixture session comes back rooted at the real
 * repository. Two sessions given two DIFFERENT fake projects then shared one
 * path, so the project filter matched both and the suite went red on CI while
 * passing on the machine it was written on (2026-08-30).
 *
 * A real temp folder is absolute on both platforms and sits outside any
 * repository, so the walk finds nothing and the recorded path is kept — which
 * is what these tests are actually about.
 */
const PROJECTS = mkdtempSync(join(tmpdir(), 'ariadne-proj-'));
const project = (name = 'repo'): string => join(PROJECTS, name);

/** One Claude Code transcript line. */
function line(o: Record<string, unknown>): string {
  return JSON.stringify(o) + '\n';
}

function transcript(opts: {
  title: string; project: string; branch: string; at: string;
  writes?: string[]; command?: string; secret?: string;
}): string {
  let out = line({
    type: 'user', timestamp: opts.at, cwd: opts.project, gitBranch: opts.branch,
    sessionId: opts.title, isSidechain: false,
    message: { content: opts.secret ?? 'a human turn' },
  });
  // 🪤 A real custom-title line carries NEITHER a timestamp NOR a cwd — checked
  // against this machine's transcripts. Giving it one in a fixture makes the
  // reader latch "now" on a line with no project, and every session comes back
  // as `project unknown`. The fixture was wrong; the reader was not.
  out += line({ type: 'custom-title', customTitle: opts.title });
  for (const w of opts.writes ?? []) {
    out += line({
      type: 'assistant', timestamp: opts.at, cwd: opts.project, gitBranch: opts.branch,
      sessionId: opts.title,
      message: { role: 'assistant', model: 'claude-opus-5', content: [{ type: 'tool_use', name: 'Write', input: { file_path: w } }] },
    });
  }
  if (opts.command) {
    out += line({
      type: 'assistant', timestamp: opts.at, cwd: opts.project, gitBranch: opts.branch,
      sessionId: opts.title,
      message: { role: 'assistant', model: 'claude-opus-5', content: [{ type: 'tool_use', name: 'Bash', input: { command: opts.command } }] },
    });
  }
  return out;
}

/** A folder shaped like `~/.claude/projects`. */
function fixture(files: Record<string, string>): { root: string; env: NodeJS.ProcessEnv; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'ariadne-mcp-'));
  const proj = join(root, 'a-project');
  mkdirSync(proj, { recursive: true });
  for (const [name, body] of Object.entries(files)) writeFileSync(join(proj, name), body, 'utf-8');
  return {
    root,
    // 🪤 MNEMO_AGENT_SOURCES is not decoration here. Discovery probes every
    // shipped harness by default, so without pinning it a test on this machine
    // would ALSO read the developer's real `~/.claude/projects` and
    // `~/.gemini/...` — and pass or fail depending on whose laptop it ran on.
    env: { MNEMO_AGENT_SESSIONS: root, MNEMO_AGENT_SOURCES: 'claude-code' } as NodeJS.ProcessEnv,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

describe('sessionsRoots', () => {
  const norm = (p: string) => p.replace(/\\/g, '/');

  it('prefers the folder the human declared in their own MCP config', () => {
    // 🪤 Absolute on THIS platform. A declared folder is resolved, so a literal
    // `C:/x/y` came back as `<cwd>/C:/x/y` on Linux and this test could only
    // ever pass on Windows.
    const declared = join(PROJECTS, 'declared-sessions');
    const roots = sessionsRoots({ MNEMO_AGENT_SESSIONS: declared } as NodeJS.ProcessEnv).map(norm);
    assert.ok(roots.includes(norm(resolve(declared))), roots.join(', '));
  });

  // The point of the multi-source pass: a Claude Code session must be able to
  // see an Antigravity one in the same repository. Behind an environment
  // variable nobody would set, that capability does not exist.
  it('looks for every shipped harness by default, not only its own', () => {
    const roots = sessionsRoots({} as NodeJS.ProcessEnv).map(norm);
    assert.ok(roots.some(r => /\.claude\/projects$/.test(r)), roots.join(', '));
    assert.ok(roots.some(r => /antigravity/.test(r)), roots.join(', '));
  });
});

describe('lastSeen', () => {
  it('is elapsed time, never a status', () => {
    assert.equal(lastSeen(minutesAgo(3), NOW), '3 min ago');
    assert.equal(lastSeen(minutesAgo(150), NOW), '3 h ago');
  });

  // An absent timestamp is not "just now". Saying so would make a transcript
  // with no clock look like the freshest thing on the machine.
  it('says an absent timestamp is absent', () => {
    assert.match(lastSeen(null, NOW), /never/);
  });
});

describe('mnemosyne_agent_collisions', () => {
  it('names the two sessions sharing a branch, and what it costs', async () => {
    const f = fixture({
      'one.jsonl': transcript({ title: 'one', project: project(), branch: 'main', at: minutesAgo(1), writes: ['C:/repo/a.ts'] }),
      'two.jsonl': transcript({ title: 'two', project: project(), branch: 'main', at: minutesAgo(2) }),
    });
    try {
      const out = await handleAgentTool('mnemosyne_agent_collisions', {}, f.env, NOW);
      assert.match(out, /1 branch\(es\)/);
      assert.match(out, /picks up whatever the other has staged/);
      assert.match(out, /one/);
      assert.match(out, /two/);
    } finally { f.cleanup(); }
  });

  // "No collision" would overstate it. The tool read ONE folder, and a session
  // whose transcripts live elsewhere never appeared.
  it('never claims the machine is quiet, only that nothing was readable', async () => {
    const f = fixture({
      'one.jsonl': transcript({ title: 'one', project: project(), branch: 'main', at: minutesAgo(1) }),
    });
    try {
      const out = await handleAgentTool('mnemosyne_agent_collisions', {}, f.env, NOW);
      assert.match(out, /in what is readable here/);
      assert.match(out, /not proof nobody else is working/);
    } finally { f.cleanup(); }
  });

  it('ignores a session that has gone quiet', async () => {
    const f = fixture({
      'one.jsonl': transcript({ title: 'one', project: project(), branch: 'main', at: minutesAgo(1) }),
      'old.jsonl': transcript({ title: 'old', project: project(), branch: 'main', at: minutesAgo(300) }),
    });
    try {
      const out = await handleAgentTool('mnemosyne_agent_collisions', {}, f.env, NOW);
      assert.match(out, /in what is readable here/);
    } finally { f.cleanup(); }
  });
});

describe('mnemosyne_agents', () => {
  it('lists sessions as metadata, and never as a status', async () => {
    const f = fixture({
      'one.jsonl': transcript({ title: 'refactor the walker', project: project(), branch: 'feat', at: minutesAgo(4) }),
    });
    try {
      const out = await handleAgentTool('mnemosyne_agents', {}, f.env, NOW);
      assert.match(out, /refactor the walker/);
      assert.match(out, /branch feat/);
      assert.match(out, /last seen 4 min ago/);
      // Only the session LINES: the footer uses the word "working" on purpose,
      // to deny it.
      const rows = out.split('\n').filter(l => l.startsWith('- '));
      assert.ok(rows.length > 0);
      for (const row of rows) assert.doesNotMatch(row, /working|running|active|idle|busy/i);
    } finally { f.cleanup(); }
  });

  // The load-bearing privacy property. A transcript holds everything that
  // passed in front of an agent, and this output goes to a DIFFERENT agent.
  it('never carries what the human typed', async () => {
    const secret = 'sk-live-DO-NOT-LEAK-4815162342';
    const f = fixture({
      'one.jsonl': transcript({ title: 'one', project: project(), branch: 'main', at: minutesAgo(1), secret }),
    });
    try {
      for (const tool of ['mnemosyne_agents', 'mnemosyne_agent_collisions', 'mnemosyne_agent_files']) {
        const out = await handleAgentTool(tool, {}, f.env, NOW);
        assert.ok(!out.includes(secret), `${tool} leaked the human turn`);
      }
    } finally { f.cleanup(); }
  });

  it('scopes to one project when asked', async () => {
    const f = fixture({
      'a.jsonl': transcript({ title: 'in-here', project: project('repo-a'), branch: 'main', at: minutesAgo(1) }),
      'b.jsonl': transcript({ title: 'elsewhere', project: project('repo-b'), branch: 'main', at: minutesAgo(1) }),
    });
    try {
      const out = await handleAgentTool('mnemosyne_agents', { project: 'repo-a' }, f.env, NOW);
      assert.match(out, /in-here/);
      assert.doesNotMatch(out, /elsewhere/);
    } finally { f.cleanup(); }
  });

  // A mistyped path must not read as an idle machine. Sources are pinned so
  // this tests the missing folder rather than the developer's real one.
  it('says the folder is missing rather than answering "no sessions"', async () => {
    const env = {
      MNEMO_AGENT_SESSIONS: join(tmpdir(), 'nope-nothing-here'),
      MNEMO_AGENT_SOURCES: 'claude-code',
    } as NodeJS.ProcessEnv;
    const out = await handleAgentTool('mnemosyne_agents', {}, env, NOW);
    assert.match(out, /No agent transcript folder found/);
    assert.match(out, /Nothing was read/);
    assert.doesNotMatch(out, /No .* agent session found/);
  });
});

describe('mnemosyne_agent_files', () => {
  it('lists paths with how each one is known', async () => {
    const f = fixture({
      'one.jsonl': transcript({
        title: 'one', project: project(), branch: 'main', at: minutesAgo(1),
        writes: ['C:/repo/src/App.tsx'],
        command: 'cat > C:/repo/notes/draft.md <<EOF',
      }),
    });
    try {
      const out = await handleAgentTool('mnemosyne_agent_files', {}, f.env, NOW);
      assert.match(out, /src\/App\.tsx · recorded/);
      assert.match(out, /notes\/draft\.md · from a command/);
      assert.match(out, /never returns file contents/);
    } finally { f.cleanup(); }
  });

  it('filters on a path fragment, folder names included', async () => {
    const f = fixture({
      'one.jsonl': transcript({
        title: 'one', project: project(), branch: 'main', at: minutesAgo(1),
        writes: ['C:/repo/src/App.tsx', 'C:/repo/docs/plan.md'],
      }),
    });
    try {
      const out = await handleAgentTool('mnemosyne_agent_files', { contains: 'docs' }, f.env, NOW);
      assert.match(out, /plan\.md/);
      assert.doesNotMatch(out, /App\.tsx/);
    } finally { f.cleanup(); }
  });
});

describe('every answer', () => {
  it('says which folder it read and how much of it', async () => {
    const f = fixture({
      'one.jsonl': transcript({ title: 'one', project: project(), branch: 'main', at: minutesAgo(1), writes: ['C:/repo/a.ts'] }),
    });
    try {
      for (const tool of ['mnemosyne_agents', 'mnemosyne_agent_collisions', 'mnemosyne_agent_files']) {
        const out = await handleAgentTool(tool, {}, f.env, NOW);
        assert.match(out, /Read claude-code from /, tool);
        assert.match(out, /transcript\(s\) found/, tool);
        assert.match(out, /does NOT mean the agent is working/, tool);
      }
    } finally { f.cleanup(); }
  });
});

/**
 * The capability that was actually asked for: a Claude Code session seeing an
 * Antigravity session in the same repository. Neither harness can see the
 * other any other way.
 */
describe('across harnesses', () => {
  function twoHarnesses(): { env: NodeJS.ProcessEnv; cleanup: () => void } {
    const root = mkdtempSync(join(tmpdir(), 'two-harness-'));

    // Claude Code shape: a flat folder of .jsonl per project.
    const cc = join(root, 'cc', 'a-project');
    mkdirSync(cc, { recursive: true });
    writeFileSync(join(cc, 'one.jsonl'), transcript({
      title: 'claude session', project: project(), branch: 'main', at: minutesAgo(1),
    }), 'utf-8');

    // Antigravity shape: transcript.jsonl buried three levels down, and it
    // records NEITHER cwd NOR branch — which is the whole reason the collision
    // grouping has to refuse to place it.
    const ag = join(root, 'ag', 'session-id-1111', '.system_generated', 'logs');
    mkdirSync(ag, { recursive: true });
    writeFileSync(join(ag, 'transcript.jsonl'),
      // 🪤 `created_at`, not `timestamp`. Antigravity's own field name, checked
      // against its shipped fixture. A session whose timestamp field is not the
      // one the connector declares is dropped entirely, so this test would have
      // proved nothing while looking like it passed something.
      JSON.stringify({
        step_index: 0, type: 'USER_INPUT', created_at: minutesAgo(2),
        content: '<USER_REQUEST>hello</USER_REQUEST>',
      }) + '\n', 'utf-8');

    return {
      env: {
        MNEMO_AGENT_SESSIONS: join(root, 'cc'),
        MNEMO_AGENT_SESSIONS_ANTIGRAVITY: join(root, 'ag'),
        MNEMO_AGENT_SOURCES: 'claude-code,antigravity',
      } as NodeJS.ProcessEnv,
      cleanup: () => rmSync(root, { recursive: true, force: true }),
    };
  }

  it('lists sessions from both harnesses, each named', async () => {
    const f = twoHarnesses();
    try {
      const out = await handleAgentTool('mnemosyne_agents', {}, f.env, NOW);
      assert.match(out, /across 2 harness\(es\)/);
      assert.match(out, /Claude Code/);
      assert.match(out, /Antigravity/);
    } finally { f.cleanup(); }
  });

  it('names every folder it opened, one line per harness', async () => {
    const f = twoHarnesses();
    try {
      const out = await handleAgentTool('mnemosyne_agents', {}, f.env, NOW);
      assert.match(out, /Read claude-code from /);
      assert.match(out, /Read antigravity from /);
    } finally { f.cleanup(); }
  });

  // 🚨 The defect the real machine surfaced: 91 of 288 sessions here record
  // neither project nor branch. Bucketed on [null, null] any two live ones
  // would be announced as sharing a working tree, which nothing supports.
  it('refuses to place a session whose harness records no project, and SAYS so', async () => {
    const f = twoHarnesses();
    try {
      const out = await handleAgentTool('mnemosyne_agent_collisions', {}, f.env, NOW);
      assert.doesNotMatch(out, /branch\(es\) with more than one/);
      assert.match(out, /could not be placed/);
      assert.match(out, /neither a project nor a branch/);
    } finally { f.cleanup(); }
  });

  it('says which harness is absent rather than pretending it looked', async () => {
    const f = twoHarnesses();
    try {
      const out = await handleAgentTool('mnemosyne_agents', {}, f.env, NOW);
      assert.match(out, /Not present on this machine: antigravity-ide/);
    } finally { f.cleanup(); }
  });
});

/**
 * The asking agent is in the list it is reading. Saying "2 sessions share your
 * tree" when one of them is the reader overstates the hazard by one.
 */
describe('knowing which session is asking', () => {
  function twoInOneTree() {
    const f = fixture({
      'me.jsonl': transcript({ title: 'the asker', project: project(), branch: 'main', at: minutesAgo(1) }),
      'other.jsonl': transcript({ title: 'someone else', project: project(), branch: 'main', at: minutesAgo(2) }),
    });
    // The transcript's sessionId is what the harness publishes in the env.
    return f;
  }

  it('counts the OTHERS and marks the reader', async () => {
    const f = twoInOneTree();
    try {
      const env = { ...f.env, CLAUDE_CODE_SESSION_ID: 'the asker' } as NodeJS.ProcessEnv;
      const out = await handleAgentTool('mnemosyne_agent_collisions', {}, env, NOW);
      assert.match(out, /2 sessions, 1 of them not you/);
      assert.match(out, /the asker.*← you/);
      assert.doesNotMatch(out, /someone else.*← you/);
    } finally { f.cleanup(); }
  });

  // 🚨 ABSENT is not "none of these is you". Treating an unknown id that way
  // would add a phantom session to every warning.
  it('stays neutral when it does not know who is asking', async () => {
    const f = twoInOneTree();
    try {
      const out = await handleAgentTool('mnemosyne_agent_collisions', {}, f.env, NOW);
      assert.match(out, /— 2 sessions/);
      assert.doesNotMatch(out, /not you/);
      assert.doesNotMatch(out, /← you/);
    } finally { f.cleanup(); }
  });

  it('stays neutral when the id matches nothing it read', async () => {
    const f = twoInOneTree();
    try {
      const env = { ...f.env, CLAUDE_CODE_SESSION_ID: 'a-session-from-another-repo' } as NodeJS.ProcessEnv;
      const out = await handleAgentTool('mnemosyne_agent_collisions', {}, env, NOW);
      assert.doesNotMatch(out, /not you/);
    } finally { f.cleanup(); }
  });

  // 🚨 Neutral about the COUNT, never about the REASON. Measured on a real
  // machine 2026-09-07: three sessions on one branch, no marker, and the caller
  // had to work out which line was its own from the title — while the count read
  // one too high, which is the very miscount this tool exists to prevent.
  it('SAYS the variable never arrived, so the config gap is findable', async () => {
    const f = twoInOneTree();
    try {
      const out = await handleAgentTool('mnemosyne_agent_collisions', {}, f.env, NOW);
      assert.match(out, /Which line is you could not be determined/);
      assert.match(out, /did not reach this server/);
      assert.match(out, /count is one too high/);
      // The count itself stays honest — an unknown id never becomes a subtraction.
      assert.match(out, /— 2 sessions/);
      assert.doesNotMatch(out, /not you/);
    } finally { f.cleanup(); }
  });

  // The other cause, and the one a config fix can produce: an MCP `env` block
  // whose `${CLAUDE_CODE_SESSION_ID}` was never expanded arrives as a literal.
  it('SAYS when the id it carries matches nothing, and quotes it', async () => {
    const f = twoInOneTree();
    try {
      const env = { ...f.env, CLAUDE_CODE_SESSION_ID: '${CLAUDE_CODE_SESSION_ID}' } as NodeJS.ProcessEnv;
      const out = await handleAgentTool('mnemosyne_agent_collisions', {}, env, NOW);
      assert.match(out, /Which line is you could not be determined/);
      assert.match(out, /matches no transcript read here/);
      assert.match(out, /\$\{CLAUDE_CODE_SESSION_ID\}/);
      assert.doesNotMatch(out, /did not reach this server/);
    } finally { f.cleanup(); }
  });

  it('says NOTHING about it once the reader is identified', async () => {
    const f = twoInOneTree();
    try {
      const env = { ...f.env, CLAUDE_CODE_SESSION_ID: 'the asker' } as NodeJS.ProcessEnv;
      const out = await handleAgentTool('mnemosyne_agent_collisions', {}, env, NOW);
      assert.doesNotMatch(out, /could not be determined/);
    } finally { f.cleanup(); }
  });

  // 🪤 The reader was READ, just not in any colliding group: alone on its own
  // tree while two other sessions share another. The warning said its id
  // "matches no transcript read here" and that the count was one too high —
  // about a count that never included it.
  it('says NOTHING about it when the reader was read but collides with nobody', async () => {
    const f = fixture({
      'a.jsonl': transcript({ title: 'someone', project: project('shared'), branch: 'main', at: minutesAgo(1) }),
      'b.jsonl': transcript({ title: 'someone else', project: project('shared'), branch: 'main', at: minutesAgo(2) }),
      'me.jsonl': transcript({ title: 'the asker', project: project('alone'), branch: 'main', at: minutesAgo(1) }),
    });
    try {
      const env = { ...f.env, CLAUDE_CODE_SESSION_ID: 'the asker' } as NodeJS.ProcessEnv;
      const out = await handleAgentTool('mnemosyne_agent_collisions', {}, env, NOW);
      assert.match(out, /— 2 sessions/);
      assert.doesNotMatch(out, /could not be determined/);
      assert.doesNotMatch(out, /count is one too high/);
      assert.doesNotMatch(out, /not you/);
    } finally { f.cleanup(); }
  });
});
