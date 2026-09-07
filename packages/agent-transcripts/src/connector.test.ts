/**
 * The interpreter is the whole cartridge: everything else is a view over what
 * it returns. Each test below is a bug that actually happened while building
 * it, kept so it cannot happen twice.
 */
import { describe, it, expect } from 'vitest';
import {
  readSession, readDoc, completeLines, describeConnector, MAX_ARTIFACTS,
  type Connector,
} from './connector';

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

  it('describes a markdown connector by its frontmatter keys', () => {
    const md: Connector = {
      id: 'm', displayName: 'M', version: '1', format: 'markdown', kind: 'document',
      filePattern: '.md', fields: {}, frontmatter: { name: 'name', type: 'metadata.type' },
    };
    expect(describeConnector(md)).toEqual(['name', 'type']);
  });
});
