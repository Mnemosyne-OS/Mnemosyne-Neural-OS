/**
 * Every connector that ships a fixture is run against it.
 *
 * CONNECTORS.md asks contributors for three files — the declaration, a redacted
 * sample, and what it must produce — so that "repair this connector" is a
 * closed task. That rule is only real if the shipped fixtures are actually
 * executed; otherwise the doc describes a ritual nobody performs.
 */
import { describe, it, expect } from 'vitest';
import { readSession, type Connector, type SessionState } from '../connector';

import claudeCode from './claude-code.json';
import claudeCodeFixture from './claude-code.fixture.jsonl?raw';
import claudeCodeExpected from './claude-code.expected.json';

import antigravity from './antigravity.json';
import antigravityFixture from './antigravity.fixture.jsonl?raw';
import antigravityExpected from './antigravity.expected.json';

import openclaw from './openclaw.json';
import openclawFixture from './openclaw.fixture.jsonl?raw';
import openclawExpected from './openclaw.expected.json';

interface Case {
  name: string;
  connector: Connector;
  fixture: string;
  expected: Record<string, unknown>;
  /** The path the fixture stands in for — some connectors read the session id
   *  out of it, so a bare file name would not exercise them. */
  path: string;
}

const CASES: Case[] = [
  {
    name: 'claude-code',
    connector: claudeCode as Connector,
    fixture: claudeCodeFixture,
    expected: claudeCodeExpected,
    path: 'C:/home/.claude/projects/demo/claude-code.fixture.jsonl',
  },
  {
    name: 'antigravity',
    connector: antigravity as Connector,
    fixture: antigravityFixture,
    expected: antigravityExpected,
    path: 'C:/home/.gemini/antigravity/brain/11111111-2222/.system_generated/logs/transcript.jsonl',
  },
  {
    name: 'openclaw',
    connector: openclaw as Connector,
    fixture: openclawFixture,
    expected: openclawExpected,
    // The export bundle a human produced with `openclaw sessions
    // export-trajectory`, one directory per export.
    path: 'C:/work/demo/.openclaw/trajectory-exports/openclaw-trajectory-11111111-2026-09-06T23-01-10/events.jsonl',
  },
];

describe.each(CASES)('$name against its own fixture', ({ connector, fixture, expected, path }) => {
  const state = readSession(connector, path.split('/').pop()!, path, fixture, fixture.length);

  it('reads the fixture at all', () => {
    expect(state).not.toBeNull();
  });

  for (const [field, want] of Object.entries(expected)) {
    // Keys starting with _ are the file's own commentary, not assertions.
    if (field.startsWith('_')) continue;
    it(`produces the declared ${field}`, () => {
      expect(state?.[field as keyof SessionState]).toEqual(want);
    });
  }
});
