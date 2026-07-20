// ─────────────────────────────────────────────────────────────────────────────
// Tests — lib/resonance.ts
// Resonance Bridge Protocol — pulse, inbox, send, agents
//
// Uses Node.js built-in test runner (node:test) — zero extra deps
// All tests run in an isolated tmpDir; no real MnemoSync data is touched.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  resolveMnemoSyncDir,
  readPulse,
  writePulse,
  listAgents,
  sendMessage,
  readInbox,
  markInboxRead,
} from '../lib/resonance.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test fixture helpers
// ─────────────────────────────────────────────────────────────────────────────

let tmpDir: string;
let dataDir: string;

before(() => {
  // Create an isolated MnemoSync data dir inside tmpDir
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resonance-test-'));
  // Structure: tmpDir/apps/mnemosync/data/  (matches resolveMnemoSyncDir walk)
  dataDir = path.join(tmpDir, 'apps', 'mnemosync', 'data');
  fs.mkdirSync(path.join(dataDir, 'messages'), { recursive: true });
  // Override env so resolveMnemoSyncDir returns our tmpDir
  process.env.MNEMOSYNC_PATH = dataDir;
});

after(() => {
  delete process.env.MNEMOSYNC_PATH;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveMnemoSyncDir
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveMnemoSyncDir', () => {
  it('returns MNEMOSYNC_PATH when env is set', () => {
    assert.equal(resolveMnemoSyncDir(), dataDir);
  });

  it('throws when no data dir found and no env set', () => {
    const saved = process.env.MNEMOSYNC_PATH;
    delete process.env.MNEMOSYNC_PATH;
    assert.throws(
      () => resolveMnemoSyncDir('/nonexistent-path-xyz'),
      /MnemoSync data directory not found/
    );
    process.env.MNEMOSYNC_PATH = saved;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// writePulse / readPulse
// ─────────────────────────────────────────────────────────────────────────────

describe('writePulse — creates a pulse file', () => {
  it('writes a new pulse and returns the full PulseData', () => {
    const pulse = writePulse({
      agent_id: 'test-agent',
      status: 'active',
      zone: 'packages/cli',
      intent: 'Running tests',
    });
    assert.equal(pulse.agent_id, 'test-agent');
    assert.equal(pulse.status, 'active');
    assert.equal(pulse.zone, 'packages/cli');
    assert.equal(pulse.protocol_version, '0.1');
  });

  it('persists the pulse to disk', () => {
    const filePath = path.join(dataDir, 'test-agent.pulse.json');
    assert.ok(fs.existsSync(filePath), 'pulse file should exist on disk');
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.equal(raw.agent_id, 'test-agent');
  });

  it('updates only specified fields (merge behaviour)', () => {
    writePulse({ agent_id: 'test-agent', status: 'active', intent: 'First intent' });
    const updated = writePulse({ agent_id: 'test-agent', zone: 'new-zone' });
    // zone updated, intent should be preserved from prior write
    assert.equal(updated.zone, 'new-zone');
    assert.equal(updated.intent, 'First intent');
  });

  it('sets timestamp to approximately now', () => {
    const before = Date.now();
    const pulse = writePulse({ agent_id: 'ts-agent' });
    const after = Date.now();
    const ts = new Date(pulse.timestamp).getTime();
    assert.ok(ts >= before && ts <= after, 'timestamp should be within test window');
  });

  it('persists and reads category field', () => {
    const pulse = writePulse({ agent_id: 'cat-agent', category: 'code' });
    assert.equal(pulse.category, 'code');
    const read = readPulse('cat-agent');
    assert.equal(read?.category, 'code');
  });

  it('category field is optional — no category = undefined', () => {
    const pulse = writePulse({ agent_id: 'nocat-agent' });
    assert.equal(pulse.category, undefined);
  });
});

describe('readPulse', () => {
  it('reads a pulse written by writePulse', () => {
    writePulse({ agent_id: 'readable-agent', status: 'idle', zone: 'doc/' });
    const pulse = readPulse('readable-agent');
    assert.ok(pulse !== null);
    assert.equal(pulse!.agent_id, 'readable-agent');
    assert.equal(pulse!.status, 'idle');
  });

  it('returns null for unknown agent', () => {
    const result = readPulse('ghost-agent-xyz');
    assert.equal(result, null);
  });

  it('returns null on malformed JSON gracefully', () => {
    const filePath = path.join(dataDir, 'bad-agent.pulse.json');
    fs.writeFileSync(filePath, '{ this is not valid json }', 'utf8');
    assert.equal(readPulse('bad-agent'), null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// listAgents
// ─────────────────────────────────────────────────────────────────────────────

describe('listAgents', () => {
  it('returns all agent IDs with a pulse file', () => {
    // 'test-agent' and 'readable-agent' were created above
    const agents = listAgents();
    assert.ok(agents.includes('test-agent'), 'should include test-agent');
    assert.ok(agents.includes('readable-agent'), 'should include readable-agent');
  });

  it('does not include .read marker files or non-pulse files', () => {
    fs.writeFileSync(path.join(dataDir, 'not-a-pulse.txt'), 'hello', 'utf8');
    fs.writeFileSync(path.join(dataDir, 'messages', 'a-to-b.read'), 'read', 'utf8');
    const agents = listAgents();
    assert.ok(!agents.includes('not-a-pulse'), 'txt file should not appear');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sendMessage / readInbox
// ─────────────────────────────────────────────────────────────────────────────

describe('sendMessage', () => {
  it('writes a message file in messages/ directory', () => {
    sendMessage('alpha', 'beta', 'Hello from alpha', 'task', 'high', 'src/core/');
    const filePath = path.join(dataDir, 'messages', 'alpha-to-beta.md');
    assert.ok(fs.existsSync(filePath), 'message file should exist');
  });

  it('message file contains the correct body', () => {
    sendMessage('alpha', 'beta', 'Check this out', 'review', 'medium');
    const raw = fs.readFileSync(path.join(dataDir, 'messages', 'alpha-to-beta.md'), 'utf8');
    assert.ok(raw.includes('Check this out'), 'body should be in the file');
  });

  it('includes markdown header with priority and type', () => {
    sendMessage('alpha', 'beta', 'Critical task', 'task', 'critical');
    const raw = fs.readFileSync(path.join(dataDir, 'messages', 'alpha-to-beta.md'), 'utf8');
    assert.ok(raw.includes('critical'), 'priority should be in header');
    assert.ok(raw.includes('task'), 'type should be in header');
  });

  it('removes stale .read marker on resend (new message = unread)', () => {
    // Mark as read first
    const readMarker = path.join(dataDir, 'messages', 'alpha-to-beta.read');
    fs.writeFileSync(readMarker, new Date().toISOString(), 'utf8');
    assert.ok(fs.existsSync(readMarker), 'read marker should exist');

    // Resend clears it
    sendMessage('alpha', 'beta', 'New message', 'info', 'low');
    assert.ok(!fs.existsSync(readMarker), 'read marker should be removed after resend');
  });

  it('returns an InboxMessage with read=false', () => {
    const msg = sendMessage('sender-x', 'recipient-y', 'Test body', 'info', 'low');
    assert.equal(msg.from, 'sender-x');
    assert.equal(msg.to, 'recipient-y');
    assert.equal(msg.body, 'Test body');
    assert.equal(msg.read, false);
  });
});

describe('readInbox', () => {
  before(() => {
    // Set up clean agents for inbox tests
    sendMessage('carol', 'dave', 'Message 1 from carol', 'task', 'medium', 'src/');
    sendMessage('eve', 'dave', 'Message 2 from eve', 'review', 'high');
  });

  it('returns all messages addressed to the agent', () => {
    const messages = readInbox('dave');
    assert.ok(messages.length >= 2, 'should have at least 2 messages');
    assert.ok(messages.every(m => m.to === 'dave'), 'all messages should be addressed to dave');
  });

  it('marks messages as unread initially', () => {
    const messages = readInbox('dave');
    const unread = messages.filter(m => !m.read);
    assert.ok(unread.length >= 2, 'should have unread messages');
  });

  it('parses from correctly from filename', () => {
    const messages = readInbox('dave');
    const froms = messages.map(m => m.from);
    assert.ok(froms.includes('carol'), 'should include carol as sender');
    assert.ok(froms.includes('eve'), 'should include eve as sender');
  });

  it('returns empty array for agent with no messages', () => {
    const messages = readInbox('no-messages-agent-xyz');
    assert.equal(messages.length, 0);
  });

  it('parses zone from message header', () => {
    const messages = readInbox('dave');
    const fromCarol = messages.find(m => m.from === 'carol');
    assert.ok(fromCarol, 'should find message from carol');
    assert.equal(fromCarol!.zone, 'src/');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// markInboxRead
// ─────────────────────────────────────────────────────────────────────────────

describe('markInboxRead', () => {
  before(() => {
    sendMessage('frank', 'grace', 'Unread message', 'info', 'low');
  });

  it('marks all messages as read after calling markInboxRead', () => {
    const before = readInbox('grace');
    assert.ok(before.some(m => !m.read), 'should have unread messages before');

    markInboxRead('grace');

    const after = readInbox('grace');
    assert.ok(after.every(m => m.read), 'all messages should be read after');
  });

  it('creates .read marker file on disk', () => {
    sendMessage('henry', 'ivan', 'Another message', 'info', 'low');
    markInboxRead('ivan', 'henry');
    const markerPath = path.join(dataDir, 'messages', 'henry-to-ivan.read');
    assert.ok(fs.existsSync(markerPath), '.read marker should exist on disk');
  });

  it('is idempotent — calling twice does not throw', () => {
    sendMessage('jake', 'karen', 'Test idempotent', 'info', 'low');
    assert.doesNotThrow(() => {
      markInboxRead('karen');
      markInboxRead('karen');
    });
  });
});
