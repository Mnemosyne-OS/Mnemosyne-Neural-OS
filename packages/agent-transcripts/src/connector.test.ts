/**
 * The interpreter is the whole cartridge: everything else is a view over what
 * it returns. Each test below is a bug that actually happened while building
 * it, kept so it cannot happen twice.
 */
import { describe, it, expect } from 'vitest';
import {
  readSession, readDoc, completeLines, describeConnector, MAX_ARTIFACTS,
  totalCounts, dayKey, asCount, asString,
  type Connector,
} from './connector';
import claudeCode from './connectors/claude-code.json';

const JSONL: Connector = {
  id: 'test', displayName: 'Test', version: '1.0.0',
  format: 'jsonl', kind: 'session', filePattern: '.jsonl',
  fields: {
    timestamp: 'timestamp', model: 'message.model', projectPath: 'cwd',
    branch: 'gitBranch', sessionId: 'sessionId', isSidechain: 'isSidechain',
  },
  action: { path: 'message.content[]', where: { type: 'tool_use' }, take: 'name' },
  title: { where: { type: 'custom-title' }, take: 'customTitle' },
  artifact: {
    path: 'message.content[]', where: { type: 'tool_use' },
    tools: ['Edit', 'Write'], take: 'input.file_path',
  },
  shellWrite: {
    path: 'message.content[]', where: { type: 'tool_use' },
    tools: ['Bash'], take: 'input.command',
  },
  humanTurn: {
    where: { type: 'user' },
    notWhen: { path: 'message.content[]', has: 'tool_result' },
    text: 'message.content',
  },
};

const line = (o: unknown) => JSON.stringify(o) + '\n';
const at = (s: string) => `2026-08-28T05:00:${s}Z`;

const user = (text: string, ts: string) => line({
  type: 'user', timestamp: at(ts), sessionId: 'S1', cwd: 'C:/w/proj',
  gitBranch: 'main', isSidechain: false, message: { content: text },
});
const toolResult = (ts: string) => line({
  type: 'user', timestamp: at(ts), sessionId: 'S1',
  message: { content: [{ type: 'tool_result', content: 'output' }] },
});
const assistant = (tool: string, file: string | null, ts: string) => line({
  type: 'assistant', timestamp: at(ts), sessionId: 'S1', cwd: 'C:/w/proj',
  gitBranch: 'main',
  message: {
    model: 'claude-opus-5',
    content: [{ type: 'tool_use', name: tool, ...(file ? { input: { file_path: file } } : {}) }],
  },
});

/** An assistant line running a shell command, which is how two thirds of the
 *  files on this machine were actually written. */
const shell = (command: string, ts: string) => line({
  type: 'assistant', timestamp: at(ts), sessionId: 'S1', cwd: 'C:/w/proj',
  gitBranch: 'main',
  message: {
    model: 'claude-opus-5',
    content: [{ type: 'tool_use', name: 'Bash', input: { command } }],
  },
});

const read = (text: string) => readSession(JSONL, 'f.jsonl', 'C:/x/f.jsonl', text, text.length);

describe('completeLines', () => {
  it('drops a half-written last line, because the file is appended to as we read', () => {
    const text = line({ a: 1 }) + '{"b":2';
    expect(completeLines(text)).toHaveLength(1);
  });

  it('keeps the last line when the file ends on a newline', () => {
    expect(completeLines(line({ a: 1 }) + line({ b: 2 }))).toHaveLength(2);
  });

  it('splits CRLF, which cost 132 of 249 notes their metadata', () => {
    expect(completeLines('{"a":1}\r\n{"b":2}\r\n')).toHaveLength(2);
  });
});

describe('readSession', () => {
  it('returns null when nothing carries a timestamp', () => {
    expect(read(line({ type: 'noise' }))).toBeNull();
  });

  it('survives a corrupt line instead of losing the session', () => {
    const st = read('not json at all\n' + user('hello', '01'));
    expect(st?.humanTurns).toHaveLength(1);
  });

  it('takes "now" from the newest line and the start from the oldest', () => {
    const st = read(user('a', '01') + assistant('Bash', null, '09'));
    expect(st?.lastEventAt).toBe(at('09'));
    expect(st?.firstEventAt).toBe(at('01'));
  });

  it('reports the most recent title, so a rename shows', () => {
    const st = read(
      line({ type: 'custom-title', customTitle: 'old' })
      + user('a', '01')
      + line({ type: 'custom-title', customTitle: 'new' }),
    );
    expect(st?.title).toBe('new');
  });

  it('leaves the title null rather than inventing one', () => {
    expect(read(user('a', '01'))?.title).toBeNull();
  });

  it('separates the human from the machine: a tool_result is not a turn', () => {
    const st = read(user('real question', '01') + toolResult('02'));
    expect(st?.humanTurns.map(t => t.text)).toEqual(['real question']);
  });

  it('returns human turns in chronological order, not walk order', () => {
    const st = read(user('first', '01') + user('second', '02') + user('third', '03'));
    expect(st?.humanTurns.map(t => t.text)).toEqual(['first', 'second', 'third']);
  });

  it('collects artifacts from the declared tools only, newest first, deduplicated', () => {
    const st = read(
      user('go', '01')
      + assistant('Write', 'C:/a.ts', '02')
      + assistant('Read', 'C:/never.ts', '03')
      + assistant('Edit', 'C:/a.ts', '04')
      + assistant('Edit', 'C:/b.ts', '05'),
    );
    expect(st?.artifacts.map(a => a.path)).toEqual(['C:/b.ts', 'C:/a.ts']);
    expect(st?.artifacts.every(a => a.origin === 'tool')).toBe(true);
  });

  // 98 of 211 real sessions wrote at least one file this way and no other,
  // and one of them wrote 29 files while showing zero.
  it('collects the files a shell command wrote, marked as an inference', () => {
    const st = read(user('go', '01') + shell("cat > C:/w/draft.md <<'EOF'\nx\nEOF", '02'));
    expect(st?.artifacts).toEqual([
      { path: 'C:/w/draft.md', origin: 'shell', at: at('02') },
    ]);
  });

  // Both kinds of evidence for one file. The record must win: a tool call was
  // written down by the harness, a redirection was read out of a string.
  it('keeps the record when a file has both kinds of evidence', () => {
    const st = read(
      user('go', '01')
      + shell('echo x > C:/a.ts', '02')
      + assistant('Write', 'C:/a.ts', '03'),
    );
    expect(st?.artifacts).toEqual([{ path: 'C:/a.ts', origin: 'tool', at: at('03') }]);
  });

  it('reads a shell tool it was not told about as no evidence at all', () => {
    const st = read(user('go', '01') + assistant('Read', 'C:/never.ts', '02'));
    expect(st?.artifacts).toEqual([]);
  });

  // Saying nothing here is what made 42 of 211 sessions present 40 files as if
  // that were the whole list.
  it('says so when the file list stopped at the ceiling', () => {
    let text = user('go', '01');
    for (let i = 0; i < MAX_ARTIFACTS + 5; i++) {
      text += assistant('Write', `C:/f${i}.ts`, '02');
    }
    const st = read(text);
    expect(st?.artifacts).toHaveLength(MAX_ARTIFACTS);
    expect(st?.artifactsCapped).toBe(true);
  });

  it('does not claim a cap it did not hit', () => {
    expect(read(user('go', '01') + assistant('Write', 'C:/a.ts', '02'))?.artifactsCapped).toBe(false);
  });

  it('does not crash on a connector that omits a field it does not have', () => {
    const minimal: Connector = {
      id: 'm', displayName: 'M', version: '1', format: 'jsonl', kind: 'session',
      filePattern: '.jsonl', fields: { timestamp: 'timestamp' },
    };
    const st = readSession(minimal, 'f', 'C:/f', line({ timestamp: at('01') }), 10);
    expect(st?.lastEventAt).toBe(at('01'));
    expect(st?.sessionId).toBeNull();
  });

  it('never turns an absent field into the string "null"', () => {
    const st = read(line({ type: 'user', timestamp: at('01'), message: { content: 'x' } }));
    expect(st?.branch).toBeNull();
    expect(st?.model).toBeNull();
  });
});

describe('what identifies a session', () => {
  // Claude Code names each transcript after its session id, so the FILE NAME
  // happened to be unique. Antigravity names every one of them
  // `transcript.jsonl` — 1 distinct name for 78 sessions — so using `file` as
  // an identity collapsed every row onto the first one: same React key, same
  // lookup, same title everywhere.
  const read2 = (path: string) =>
    readSession(JSONL, path.split('/').pop()!, path, user('hi', '01'), 10);

  it('keeps the path it was given, which is unique by construction', () => {
    expect(read2('C:/brain/a/transcript.jsonl')?.path).toBe('C:/brain/a/transcript.jsonl');
  });

  it('two sessions can share a file name and must still differ', () => {
    const a = read2('C:/brain/a/transcript.jsonl');
    const b = read2('C:/brain/b/transcript.jsonl');
    expect(a?.file).toBe(b?.file);          // the trap: the names ARE equal
    expect(a?.path).not.toBe(b?.path);      // the identity that must be used
  });
});

describe('readSession with a buried transcript', () => {
  const BURIED: Connector = {
    ...JSONL,
    fields: { timestamp: 'timestamp' },
    tree: { subPath: '.system_generated/logs', idFrom: 'dir' },
  };

  it('takes the session id from the directory when no line carries one', () => {
    const path = 'C:/brain/9cf83196/.system_generated/logs/transcript.jsonl';
    const st = readSession(BURIED, 'transcript.jsonl', path, line({ timestamp: at('01') }), 10);
    expect(st?.sessionId).toBe('9cf83196');
  });

  it('counts from the END of the path, so where the picker pointed is irrelevant', () => {
    const deep = 'D:/somewhere/else/entirely/brain/abc123/.system_generated/logs/t.jsonl';
    const st = readSession(BURIED, 't.jsonl', deep, line({ timestamp: at('01') }), 10);
    expect(st?.sessionId).toBe('abc123');
  });

  it('handles a Windows path with backslashes', () => {
    const win = 'C:\\brain\\winsess\\.system_generated\\logs\\t.jsonl';
    const st = readSession(BURIED, 't.jsonl', win, line({ timestamp: at('01') }), 10);
    expect(st?.sessionId).toBe('winsess');
  });
});

describe('humanTurn.between', () => {
  const WRAPPED: Connector = {
    ...JSONL,
    humanTurn: {
      where: { type: 'user' },
      text: 'message.content',
      between: { start: '<REQ>', end: '</REQ>' },
    },
  };
  const wrapped = (body: string) => line({
    type: 'user', timestamp: at('01'), message: { content: body },
  });
  const turn = (body: string) =>
    readSession(WRAPPED, 'f', 'C:/f', wrapped(body), 10)?.humanTurns[0]?.text;

  it('keeps only what sits between the markers', () => {
    expect(turn('<REQ>the question</REQ>\nlocal time: 05:00')).toBe('the question');
  });

  it('returns the raw text when the closing marker is missing, never a fragment', () => {
    expect(turn('<REQ>unterminated')).toBe('<REQ>unterminated');
  });

  it('returns the raw text when neither marker is present', () => {
    expect(turn('plain message')).toBe('plain message');
  });
});

describe('readDoc', () => {
  const MD: Connector = {
    id: 'md', displayName: 'MD', version: '1', format: 'markdown', kind: 'document',
    filePattern: '.md', fields: {},
    frontmatter: { name: 'name', description: 'description', type: 'metadata.type' },
  };
  const doc = (text: string, side?: string) =>
    readDoc(MD, 'note.md', 'C:/note.md', text, text.length, 1, side);

  it('reads frontmatter written with CRLF', () => {
    const d = doc('---\r\nname: n\r\ndescription: d\r\nmetadata:\r\n  type: project\r\n---\r\nbody');
    expect([d.name, d.description, d.type]).toEqual(['n', 'd', 'project']);
  });

  it('reads the same frontmatter written with LF', () => {
    const d = doc('---\nname: n\ndescription: d\nmetadata:\n  type: project\n---\nbody');
    expect([d.name, d.description, d.type]).toEqual(['n', 'd', 'project']);
  });

  it('falls back to the file name and leaves the rest absent', () => {
    const d = doc('no frontmatter here');
    expect(d.name).toBe('note');
    expect(d.description).toBeNull();
    expect(d.type).toBeNull();
  });

  it('keeps the body without the frontmatter block', () => {
    expect(doc('---\nname: n\n---\nthe body').body.trim()).toBe('the body');
  });

  it('collects wiki links once each, in order', () => {
    const d = doc('see [[a]] then [[b]] then [[a]] again');
    expect(d.links).toEqual(['a', 'b']);
  });

  // A note can come from someone else's machine (replicated vaults), so a body
  // built to make the link scan quadratic must not hang the reader.
  // 🪤 The hostile shape has NO closing pair anywhere: with one, the old class
  // matched the whole body in a single link and returned instantly (measured
  // 0 ms), which is how the first version of this test failed to catch it.
  // Without one, the old class re-scanned to the end from every position:
  // 13 s at 100k pairs, 213 s at 400k.
  it('reads a body of open brackets with no closing pair in linear time', () => {
    const hostile = '[['.repeat(100_000) + ' [[real';
    const t0 = performance.now();
    const d = doc(hostile);
    expect(performance.now() - t0).toBeLessThan(1_000);
    expect(d.links).toEqual([]);
  });

  describe('sidecar', () => {
    const SIDE: Connector = {
      ...MD, frontmatter: undefined,
      sidecar: { suffix: '.metadata.json', fields: { description: 'summary' } },
    };
    const withSide = (side: string | null) =>
      readDoc(SIDE, 'task.md', 'C:/task.md', 'body', 4, 1, side);

    it('takes the description from the neighbouring file', () => {
      expect(withSide('{"summary":"what this does"}').description).toBe('what this does');
    });

    it('still lists the document when the sidecar is malformed', () => {
      const d = withSide('{ not json');
      expect(d.name).toBe('task');
      expect(d.description).toBeNull();
    });

    it('still lists the document when there is no sidecar at all', () => {
      expect(withSide(null).name).toBe('task');
    });
  });
});

describe('describeConnector', () => {
  it('derives the consent list from the connector, not from prose', () => {
    const fields = describeConnector(JSONL);
    expect(fields).toContain('timestamp');
    expect(fields).toContain('files written');
  });

  it('names the token counters, because that is its own kind of read', () => {
    // Consent to "which files it edited" is not consent to a record of how
    // much you spend and when you work.
    const withUsage: Connector = {
      ...JSONL,
      usage: { fields: { output: 'message.usage.output_tokens' } },
    };
    expect(describeConnector(withUsage)).toContain('tokens used, per call');
    expect(describeConnector(JSONL)).not.toContain('tokens used, per call');
  });

  it('describes a markdown connector by its frontmatter keys', () => {
    const md: Connector = {
      id: 'm', displayName: 'M', version: '1', format: 'markdown', kind: 'document',
      filePattern: '.md', fields: {}, frontmatter: { name: 'name', type: 'metadata.type' },
    };
    expect(describeConnector(md)).toEqual(['name', 'type']);
  });
});

/**
 * Tokens. Every test here is a number that would otherwise be wrong rather
 * than missing, which is the worst kind: a wrong count looks exactly like a
 * right one.
 */
describe('usage', () => {
  const WITH_USAGE: Connector = {
    ...JSONL,
    usage: {
      where: { type: 'assistant' },
      callId: 'requestId',
      fields: {
        input: 'message.usage.input_tokens',
        cacheWrite: 'message.usage.cache_creation_input_tokens',
        cacheRead: 'message.usage.cache_read_input_tokens',
        output: 'message.usage.output_tokens',
        thinking: 'message.usage.output_tokens_details.thinking_tokens',
      },
    },
  };

  /** A local-time instant, so the expected day key is the same in every
   *  timezone the suite might run in. */
  const localAt = (y: number, m: number, d: number, h = 12) =>
    new Date(y, m - 1, d, h).toISOString();

  const call = (opts: {
    req?: string; at: string; input?: number; cacheWrite?: number;
    cacheRead?: number; output?: number; thinking?: number; usage?: boolean;
  }) => line({
    type: 'assistant', timestamp: opts.at, sessionId: 'S1', cwd: 'C:/w/proj',
    ...(opts.req ? { requestId: opts.req } : {}),
    message: {
      model: 'claude-opus-5',
      content: [{ type: 'text', text: 'hi' }],
      ...(opts.usage === false ? {} : {
        usage: {
          input_tokens: opts.input ?? 0,
          cache_creation_input_tokens: opts.cacheWrite ?? 0,
          cache_read_input_tokens: opts.cacheRead ?? 0,
          output_tokens: opts.output ?? 0,
          output_tokens_details: { thinking_tokens: opts.thinking ?? 0 },
        },
      }),
    },
  });

  const readU = (text: string) =>
    readSession(WITH_USAGE, 'f.jsonl', 'C:/x/f.jsonl', text, text.length);

  it('is null, never an empty map, when the harness records no usage', () => {
    // The connector under test everywhere else declares none. Null says "this
    // harness does not report"; {} would say "measured, and it was nothing".
    expect(read(user('hi', '01'))?.tokens).toBeNull();
  });

  it('counts one call once, however many lines that reply was written on', () => {
    const day = localAt(2026, 9, 16);
    const st = readU(
      call({ req: 'req_A', at: day, input: 10, output: 5 })
      + call({ req: 'req_A', at: day, input: 10, output: 5 })
      + call({ req: 'req_A', at: day, input: 10, output: 5 }),
    );
    // MEASURED on 870 real transcripts: 49.5% of usage lines are copies like
    // these, so without this the whole feature reports roughly double.
    expect(totalCounts(st?.tokens)).toEqual({
      input: 10, cacheWrite: 0, cacheRead: 0, output: 5, thinking: 0, calls: 1,
    });
  });

  it('counts two different calls twice', () => {
    const day = localAt(2026, 9, 16);
    const st = readU(
      call({ req: 'req_A', at: day, input: 10, output: 5 })
      + call({ req: 'req_B', at: day, input: 7, output: 3 }),
    );
    expect(totalCounts(st?.tokens)?.calls).toBe(2);
    expect(totalCounts(st?.tokens)?.input).toBe(17);
  });

  it('counts every line when the harness writes no call id', () => {
    // A harness that writes one line per call omits `callId`, and collapsing
    // its lines on a shared absent id would hide real calls.
    const day = localAt(2026, 9, 16);
    const st = readU(call({ at: day, output: 5 }) + call({ at: day, output: 3 }));
    expect(totalCounts(st?.tokens)?.calls).toBe(2);
  });

  it('splits a session that ran past midnight across both days', () => {
    // A session total would put a whole night on one square of the graph.
    const st = readU(
      call({ req: 'a', at: localAt(2026, 9, 15, 23), output: 4 })
      + call({ req: 'b', at: localAt(2026, 9, 16, 1), output: 6 }),
    );
    expect(Object.keys(st?.tokens ?? {}).sort()).toEqual(['2026-09-15', '2026-09-16']);
    expect(st?.tokens?.['2026-09-16'].output).toBe(6);
  });

  it('keeps the four counters apart', () => {
    const st = readU(call({
      req: 'a', at: localAt(2026, 9, 16),
      input: 2, cacheWrite: 1088, cacheRead: 728752, output: 528, thinking: 406,
    }));
    // Real numbers off this machine. Folded into one they say nothing: the
    // cache read is the same context re-read, and it is 1 380x the output.
    expect(totalCounts(st?.tokens)).toEqual({
      input: 2, cacheWrite: 1088, cacheRead: 728752, output: 528, thinking: 406, calls: 1,
    });
  });

  it('does not count an assistant line that carries no usage as a call', () => {
    const st = readU(call({ req: 'a', at: localAt(2026, 9, 16), usage: false }));
    expect(st?.tokens).toEqual({});
  });

  it('does not let a usage-less line consume the id of the call that has one', () => {
    // The harness writes the text block and the tool block of one reply as
    // separate lines, and a line can carry the id without the counters. If the
    // empty one claimed the id, the real call would be dropped whole.
    //
    // 🪤 The empty line goes LAST, because readSession walks the file
    // BACKWARDS: written first it is read second, by which point the real call
    // has already been counted and the test proves nothing. A mutation check
    // caught exactly that — the first version of this test passed with the
    // guard removed.
    const day = localAt(2026, 9, 16);
    const st = readU(
      call({ req: 'req_A', at: day, output: 9 })
      + call({ req: 'req_A', at: day, usage: false }),
    );
    expect(totalCounts(st?.tokens)?.output).toBe(9);
    expect(totalCounts(st?.tokens)?.calls).toBe(1);
  });

  it('holds in the other order too, where the empty line is read second', () => {
    const day = localAt(2026, 9, 16);
    const st = readU(
      call({ req: 'req_A', at: day, usage: false })
      + call({ req: 'req_A', at: day, output: 9 }),
    );
    expect(totalCounts(st?.tokens)?.output).toBe(9);
    expect(totalCounts(st?.tokens)?.calls).toBe(1);
  });

  it('drops a call it cannot place in time rather than filing it under today', () => {
    const st = readU(
      call({ req: 'a', at: 'not a date', output: 5 })
      + call({ req: 'b', at: localAt(2026, 9, 16), output: 3 }),
    );
    expect(Object.keys(st?.tokens ?? {})).toEqual(['2026-09-16']);
    expect(totalCounts(st?.tokens)?.output).toBe(3);
  });

  it('treats a counter the harness did not write as absent, never as zero', () => {
    const st = readU(line({
      type: 'assistant', timestamp: localAt(2026, 9, 16), sessionId: 'S1',
      requestId: 'a',
      message: { model: 'm', content: [], usage: { output_tokens: 5 } },
    }));
    expect(totalCounts(st?.tokens)?.output).toBe(5);
    expect(totalCounts(st?.tokens)?.calls).toBe(1);
  });
});

describe('dayKey', () => {
  it('uses the local day, so a night session does not land on tomorrow', () => {
    expect(dayKey(new Date(2026, 8, 16, 23, 30).toISOString())).toBe('2026-09-16');
  });

  it('returns null for what is not a date', () => {
    expect(dayKey('yesterday')).toBeNull();
    expect(dayKey(null)).toBeNull();
    expect(dayKey('')).toBeNull();
  });
});

describe('asCount', () => {
  it('refuses what is not a count, so nothing becomes a measured zero', () => {
    expect(asCount(0)).toBe(0);
    expect(asCount(12)).toBe(12);
    expect(asCount(null)).toBeNull();
    expect(asCount(undefined)).toBeNull();
    expect(asCount('12')).toBeNull();
    expect(asCount(NaN)).toBeNull();
    expect(asCount(-1)).toBeNull();
  });
});

describe('a session whose last line is a queued message (doc 93 verification pass, 05/10)', () => {
  // The real shape of Claude Code's transcript: a `queue-operation` line has a
  // timestamp and a session id, and NO cwd and NO branch.
  const shipped = claudeCode as unknown as Connector;
  const real = [
    JSON.stringify({ type: 'user', timestamp: '2026-10-05T01:00:00.000Z', sessionId: 's1', cwd: '/repo', gitBranch: 'main', isSidechain: false, message: { role: 'user', content: 'hi' } }),
    JSON.stringify({ type: 'queue-operation', operation: 'enqueue', timestamp: '2026-10-05T01:00:05.000Z', sessionId: 's1' }),
    JSON.stringify({ type: 'queue-operation', operation: 'dequeue', timestamp: '2026-10-05T01:00:06.000Z', sessionId: 's1' }),
  ].join('\n') + '\n';

  it('keeps its project and branch (it read « neither project nor branch » and its collision vanished)', () => {
    const st = readSession(shipped, 's1.jsonl', '/home/x/.claude/projects/p/s1.jsonl', real, real.length);
    expect(st?.projectPath).toBe('/repo');
    expect(st?.branch).toBe('main');
    expect(st?.sessionId).toBe('s1');
    expect(st?.lastEventAt).toBe('2026-10-05T01:00:06.000Z');
  });
});


// A harness writes `"gitBranch": null` outside a repository. Coerced, that is
// the text "null" in the branch column, which reads as a real branch name.
describe('an absent field stays absent', () => {
  it('never turns null into the text "null"', () => {
    expect(asString(null)).toBeNull();
    expect(asString('')).toBeNull();
    expect(asString(42)).toBeNull();
    expect(asString('main')).toBe('main');
  });

  it('reads a null branch as unknown, not as a branch called "null"', () => {
    const line = JSON.stringify({
      type: 'user', timestamp: '2026-10-05T10:00:00.000Z', sessionId: 's1',
      cwd: '/repo', gitBranch: null, message: { role: 'user', content: 'hi' },
    }) + '\n';
    const st = readSession(claudeCode as Connector, 's1.jsonl', '/x/s1.jsonl', line, line.length);
    expect(st?.branch).toBeNull();
  });
});
