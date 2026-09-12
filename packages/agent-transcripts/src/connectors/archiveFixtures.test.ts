/**
 * Every archive connector is run against its own fixture.
 *
 * Same contract the transcript connectors already follow: a declaration, a
 * redacted sample, and what it must produce. The rule is only real if the
 * shipped fixtures are executed, so they are.
 *
 * 🚨 The fixtures are SYNTHETIC. This package publishes to npm, and a fixture
 * cut from a real export would put someone's conversations in a public
 * tarball. The shape is copied from a measured file; the words are invented.
 */
import { describe, it, expect } from 'vitest';
import { readArchive, type ArchiveState } from '../archive';
import { ARCHIVE_CONNECTORS, archiveConnectorIsVerified, type ArchiveConnectorId } from '../index';
import type { Connector } from '../connector';

import chatgptFixture from './chatgpt-export.fixture.json?raw';
import chatgptExpected from './chatgpt-export.expected.json';
import claudeFixture from './claude-ai-export.fixture.json?raw';
import claudeExpected from './claude-ai-export.expected.json';
import geminiFixture from './gemini-takeout.fixture.json?raw';
import geminiExpected from './gemini-takeout.expected.json';

interface Case {
  id: ArchiveConnectorId;
  fixture: string;
  expected: Record<string, unknown>;
}

const CASES: Case[] = [
  { id: 'chatgpt-export', fixture: chatgptFixture, expected: chatgptExpected },
  { id: 'claude-ai-export', fixture: claudeFixture, expected: claudeExpected },
  { id: 'gemini-takeout', fixture: geminiFixture, expected: geminiExpected },
];

/** Reason order is a Map insertion order, which is an implementation detail.
 *  Sorting both sides pins WHAT was skipped, not the order it was noticed. */
const bySlug = (s: ArchiveState['skipped']) => [...s].sort((a, b) => a.reason.localeCompare(b.reason));

describe.each(CASES)('$id against its own fixture', ({ id, fixture, expected }) => {
  const conn = ARCHIVE_CONNECTORS[id];
  const state = readArchive(conn, fixture);

  it('reads the fixture at all', () => {
    expect(state).not.toBeNull();
  });

  for (const [field, want] of Object.entries(expected)) {
    if (field.startsWith('_')) continue;
    it(`produces the declared ${field}`, () => {
      const got = state?.[field as keyof ArchiveState];
      if (field === 'skipped') {
        expect(bySlug(got as ArchiveState['skipped'])).toEqual(bySlug(want as ArchiveState['skipped']));
      } else {
        expect(got).toEqual(want);
      }
    });
  }
});

describe('the archive catalogue', () => {
  const entries = Object.entries(ARCHIVE_CONNECTORS) as [ArchiveConnectorId, Connector][];

  it('ships a fixture case for every connector', () => {
    // A connector with no executed fixture is a connector nobody has run. It
    // would sit in the picker looking exactly like the ones that work.
    expect(CASES.map(c => c.id).sort()).toEqual(entries.map(([k]) => k).sort());
  });

  it.each(entries)('%s declares an archive spec and its id matches its key', (key, conn) => {
    expect(conn.archive).toBeTruthy();
    expect(conn.id).toBe(key);
    expect(conn.format).toBe('json');
  });

  it.each(entries)('%s says whether it has ever been run over a real export', (_key, conn) => {
    // Not a style rule. Two of the three are written against documented shape
    // and have never seen a real file; an app that cannot tell the difference
    // presents a belief as a fact.
    const note = (conn as unknown as { _verified?: unknown })._verified;
    expect(typeof note).toBe('string');
    expect((note as string).length).toBeGreaterThan(40);
    expect(/^(MEASURED|NOT MEASURED)/.test(note as string)).toBe(true);
  });

  it('knows that only the Gemini connector is measured today', () => {
    // This assertion is meant to FAIL the day someone runs another connector
    // over a real export and forgets to say so in its `_verified` note.
    expect(archiveConnectorIsVerified(ARCHIVE_CONNECTORS['gemini-takeout'])).toBe(true);
    expect(archiveConnectorIsVerified(ARCHIVE_CONNECTORS['chatgpt-export'])).toBe(false);
    expect(archiveConnectorIsVerified(ARCHIVE_CONNECTORS['claude-ai-export'])).toBe(false);
  });

  it.each(entries)('%s carries no executable pattern', (_key, conn) => {
    // Rule 1, asserted rather than trusted: a connector is data. Nothing in it
    // may look like a regex or a function, because people exchange these.
    const json = JSON.stringify(conn);
    expect(json).not.toMatch(/"\s*\(\s*\)\s*=>/);
    expect(json).not.toMatch(/function\s*\(/);
    for (const p of conn.archive?.humanPrefixes ?? []) {
      expect(p).not.toMatch(/[\\^$*+?()[\]{}|]/);
    }
  });
});
