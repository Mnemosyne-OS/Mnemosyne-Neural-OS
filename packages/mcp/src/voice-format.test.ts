/**
 * What the agent is told about a voice render.
 *
 * These strings are the whole interface between a render and the model driving
 * it, so the failures they must prevent are behavioural: an agent that reads
 * "done" on an unfinished job starts over (doubling a wait on an engine that
 * speaks one thing at a time), and an agent that reads a bare UNKNOWN_CLONE
 * retries with a name it invented — producing a flawless voice-over in the
 * wrong person's voice.
 *
 * Run: `pnpm --filter @mnemosyne_os/mcp test` (tsx + node:test).
 */

import { test } from 'node:test';
import assert    from 'node:assert/strict';
import { voiceError, renderReport, type VoiceJobLike } from './format.js';

const job = (over: Partial<VoiceJobLike>): VoiceJobLike => ({
  id: 'job-1', state: 'rendering', engine: 'chatterbox', clone: 'default',
  cloneWarning: null, segments: 10, segmentsDone: 3, path: null, seconds: null,
  error: null, etaSeconds: 42, realtimeFactor: 1.3,
  ...over,
});

test('a render still running is never reported as a finished one', () => {
  const out = renderReport(job({}), 60);
  assert.match(out, /Still rendering/);
  assert.match(out, /3\/10 segments/);
  assert.match(out, /job-1/);
  // The instruction that stops the doubling.
  assert.match(out, /do NOT start the render over/i);
  assert.doesNotMatch(out, /ready/i);
});

test('the eta is spoken in minutes, and only when there is one', () => {
  assert.match(renderReport(job({ etaSeconds: 200 }), 10), /3m 20s left/);
  const noEta = renderReport(job({ etaSeconds: null }), 10);
  assert.doesNotMatch(noEta, /left/);
});

test('a finished render leads with the path, because that is the deliverable', () => {
  const out = renderReport(job({ state: 'done', segmentsDone: 10, path: 'C:/v/short-12.wav', seconds: 44.5 }), 0);
  assert.match(out, /Voice-over ready/);
  assert.match(out, /short-12\.wav/);
  assert.match(out, /44\.5s/);
});

test('an unreadable length says unknown rather than zero', () => {
  // A length we could not measure is not a zero-second file.
  const out = renderReport(job({ state: 'done', path: 'a.wav', seconds: null }), 0);
  assert.match(out, /Length:\*\* unknown/);
  assert.doesNotMatch(out, /Length:\*\* 0s/);
});

test('a clone warning survives all the way to the agent', () => {
  const out = renderReport(job({ state: 'done', path: 'a.wav', seconds: 3, cloneWarning: 'REFERENCE_TOO_SHORT' }), 0);
  assert.match(out, /REFERENCE_TOO_SHORT/);
  assert.match(out, /Listen before publishing/);
});

test('a failed render says where it stopped and that no file exists', () => {
  const out = renderReport(job({ state: 'failed', error: 'sidecar died', segmentsDone: 4 }), 0);
  assert.match(out, /Render failed/);
  assert.match(out, /segment 5 of 10/);
  assert.match(out, /No file was written/);
});

test('a cancelled render is its own state, not a failure', () => {
  const out = renderReport(job({ state: 'cancelled', segmentsDone: 2 }), 0);
  assert.match(out, /cancelled after 2\/10/);
  assert.doesNotMatch(out, /failed/i);
});

test('UNKNOWN_CLONE tells the agent to ASK, not to guess again', () => {
  const out = voiceError('UNKNOWN_CLONE:narrateur — available: default');
  assert.match(out, /Do NOT retry with another name/);
  assert.match(out, /mnemosyne_voices/);
  // The reason, spelled out — a wrong-voice render is not a visible failure.
  assert.match(out, /sounds perfectly fine and is worthless/);
});

test('each host code gets the one next move that is actually right', () => {
  assert.match(voiceError('CLONE_NOT_SUPPORTED:piper'), /xtts.*chatterbox.*zonos/);
  assert.match(voiceError('ENGINE_NOT_INSTALLED:xtts'), /Settings . Voice/);
  assert.match(voiceError('SCOPE_DENIED: "voice:speak"'), /MNEMO_VOICE=1/);
  assert.match(voiceError('LICENSE_REQUIRED'), /Nothing to retry/);
  assert.match(voiceError('SCRIPT_TOO_LONG: 30000 characters'), /scenes/);
});

test('an unrecognized code is passed through rather than dressed up', () => {
  assert.equal(voiceError('WEIRD_NEW_THING'), 'WEIRD_NEW_THING');
  assert.equal(voiceError(undefined), 'unknown error');
});
