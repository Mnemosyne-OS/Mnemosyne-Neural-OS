// ─────────────────────────────────────────────────────────────────────────────
// Tests — lib/chronicle-parser.ts
// Uses Node.js built-in test runner (node:test) — zero extra deps
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseChronicle, getChronicleType } from '../lib/chronicle-parser.js';

let tmpDir: string;

before(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemo-test-')); });
after(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

function write(filename: string, content: string) {
  fs.writeFileSync(path.join(tmpDir, filename), content, 'utf8');
}

describe('parseChronicle — filename', () => {
  it('extracts date from CHRONICLE-YYYY-MM-DD prefix', () => {
    const f = 'CHRONICLE-2026-04-05-my-session.md';
    write(f, '');
    assert.equal(parseChronicle(f, tmpDir).date, '2026-04-05');
  });
  it('converts slug to title when no frontmatter', () => {
    const f = 'CHRONICLE-2026-04-05-my-cool-session.md';
    write(f, '');
    assert.equal(parseChronicle(f, tmpDir).title, 'My cool session');
  });
});

describe('parseChronicle — frontmatter', () => {
  it('reads title from frontmatter', () => {
    const f = 'CHRONICLE-2026-04-05-fm.md';
    write(f, '---\ntitle: "My Real Title"\ntype: decision\ndate: 2026-04-05\n---\n\nContent.');
    const r = parseChronicle(f, tmpDir);
    assert.equal(r.title, 'My Real Title');
    assert.equal(r.type, 'decision');
  });
  it('reads type from frontmatter', () => {
    const f = 'CHRONICLE-2026-04-05-fm2.md';
    write(f, '---\ntype: reflection\n---\n');
    assert.equal(parseChronicle(f, tmpDir).type, 'reflection');
  });
});

describe('parseChronicle — markdown headers', () => {
  it('reads title from h1', () => {
    const f = 'CHRONICLE-2026-04-05-h1.md';
    write(f, '# My H1 Title\n\n**Type**: session\n\nSome content here.');
    assert.equal(parseChronicle(f, tmpDir).title, 'My H1 Title');
  });
  it('reads type from **Type**: line', () => {
    const f = 'CHRONICLE-2026-04-05-type.md';
    write(f, '# Title\n\n**Type**: sweep\n\nContent.');
    assert.equal(parseChronicle(f, tmpDir).type, 'sweep');
  });
  it('generates excerpt from first meaningful line', () => {
    const f = 'CHRONICLE-2026-04-05-excerpt.md';
    write(f, '# Title\n\n**Type**: session\n\nThis is a meaningful excerpt that is long enough.');
    assert.ok(parseChronicle(f, tmpDir).excerpt.length > 10);
  });
});

describe('parseChronicle — defaults', () => {
  it('defaults type to session', () => {
    const f = 'CHRONICLE-2026-04-05-def.md';
    write(f, '# A title\n\nNo type specified.');
    assert.equal(parseChronicle(f, tmpDir).type, 'session');
  });
  it('handles missing file gracefully', () => {
    const r = parseChronicle('CHRONICLE-2026-01-01-missing.md', tmpDir);
    assert.equal(r.type, 'session');
    assert.equal(r.date, '2026-01-01');
  });
});

describe('getChronicleType', () => {
  it('extracts type from **Type**: line', () => {
    const f = 'CHRONICLE-2026-04-05-gct.md';
    write(f, '# T\n\n**Type**: decision\n\nBody.');
    assert.equal(getChronicleType(f, tmpDir), 'decision');
  });
  it('extracts type from frontmatter', () => {
    const f = 'CHRONICLE-2026-04-05-gct2.md';
    write(f, '---\ntype: narcissus\n---\n# T\n');
    assert.equal(getChronicleType(f, tmpDir), 'narcissus');
  });
  it('defaults to session on missing file', () => {
    assert.equal(getChronicleType('CHRONICLE-2026-04-05-nope.md', tmpDir), 'session');
  });
});
