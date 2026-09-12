/**
 * Pure formatting / classification helpers for the MCP server.
 *
 * Extracted from index.ts so they can be unit-tested without a live WS backend.
 * The resonance helpers here fix the bug where `mnemosyne_resonances` returned a
 * ~189KB code blob: a loose `content.includes('[RESONANCE:')` match treated any
 * source file or commit mentioning the literal token as a resonance, and a
 * greedy `/Name:\s*(.+)/` capture then swallowed the whole file as its "name".
 */

import type { MnemoChronicle } from './ws-client.js';

/**
 * Unwrap the SemanticChunker envelope `{ raw, spineType, ... }` and return only
 * the `.raw` text. Falls back to the original string if it is not JSON-shaped.
 */
export function unwrapContent(s: string): string {
  try {
    const env = JSON.parse(s);
    if (env && typeof env === 'object') {
      if (typeof (env as { raw?: unknown }).raw === 'string') return (env as { raw: string }).raw;
      return JSON.stringify(env);
    }
  } catch { /* not JSON, keep as-is */ }
  return s;
}

// A real position chronicle written by mnemosyne_update_position STARTS with this
// marker. Anchoring at the body start is what rejects source files / commits that
// merely mention "[RESONANCE:" somewhere in the middle.
const RESONANCE_MARKER = /^\s*\[RESUME_SESSION\]\s*\[RESONANCE:/i;

/**
 * Identify a resonance STRUCTURALLY, never by a loose substring match:
 *   - spineType === 'RESONANCE'  (created via the cockpit or explicit ingest), or
 *   - a position chronicle whose (unwrapped) body STARTS with the
 *     "[RESUME_SESSION] [RESONANCE:<id>]" marker.
 */
export function isResonanceChronicle(spineType: string, body: string): boolean {
  return String(spineType).toUpperCase() === 'RESONANCE' || RESONANCE_MARKER.test(body);
}

/** Keep only the chronicles that are genuinely resonances. */
export function selectResonances(chronicles: MnemoChronicle[]): MnemoChronicle[] {
  return chronicles.filter(c => isResonanceChronicle(c.spineType, unwrapContent(c.content ?? '')));
}

const cap = (s: string, n: number): string =>
  s.length > n ? s.slice(0, n).trimEnd() + '…' : s;

const firstLine = (s: string): string => (s.split(/\r?\n/)[0] ?? '').trim();

export interface ResonanceView {
  id:          string;
  phase:       string;
  agoMin:      number;
  chronicleId: string;
}

/**
 * Compact, display-safe view of a resonance chronicle. Every field is capped and
 * first-line-bounded so a malformed chronicle can never blow up the output again.
 */
export function toResonanceView(c: MnemoChronicle, now: number = Date.now()): ResonanceView {
  const body    = unwrapContent(c.content ?? '');
  const idMatch = body.match(/\[RESONANCE:([^\]]+)\]/i);
  const id      = cap((idMatch?.[1] ?? String(c.id)).trim(), 60);
  // update_position writes "<phase> — <iso>" on the line right after the marker.
  const phaseM  = body.match(/\[RESONANCE:[^\]]+\]\s*\r?\n\s*([^\n\r]+?)\s+—\s+\d{4}-\d{2}-\d{2}/);
  const phase   = phaseM?.[1] ? cap(phaseM[1].trim(), 60) : cap(firstLine(body) || String(c.spineType), 60);
  const ts      = new Date(c.timestamp).getTime();
  const agoMin  = Number.isFinite(ts) ? Math.max(0, Math.round((now - ts) / 60000)) : 0;
  return { id, phase, agoMin, chronicleId: String(c.id) };
}

/** Render the full resonance listing body (without the surrounding headers). */
export function formatResonances(chronicles: MnemoChronicle[], now: number = Date.now()): string {
  return selectResonances(chronicles).map(c => {
    const v = toResonanceView(c, now);
    return `- **${v.id}** · ${v.phase} · updated ${v.agoMin}min ago \`#${v.chronicleId}\``;
  }).join('\n');
}

// ── Voice rendering ───────────────────────────────────────────────────────────

/**
 * Turn a host-side voice error into something an agent can act on.
 *
 * The engine's codes are precise and unreadable; each one has exactly one right
 * next move, and spelling it out is what stops an agent from retrying the same
 * call with a different guess — which, for UNKNOWN_CLONE, would mean shipping a
 * voice-over in the wrong person's voice.
 */
export function voiceError(code: string | undefined): string {
  const raw = code ?? 'unknown error';
  if (raw.startsWith('UNKNOWN_CLONE')) {
    return `${raw}\n\nThe voice you named does not exist. Call mnemosyne_voices for the real list and ask the user which one they meant.`
      + ` Do NOT retry with another name: a voice-over in the wrong voice sounds perfectly fine and is worthless.`;
  }
  if (raw.startsWith('CLONE_NOT_SUPPORTED')) {
    return `${raw}\n\nThat engine has fixed voices. Use "xtts", "chatterbox" or "zonos" to clone, or drop the clone argument.`;
  }
  if (raw.startsWith('ENGINE_NOT_INSTALLED') || raw.startsWith('NO_CLONING_ENGINE') || raw.startsWith('NO_TTS_ENGINE')) {
    return `${raw}\n\nThe user installs local voices from Settings → Voice in the Mnemosyne OS app. This is a multi-GB download — tell them rather than waiting.`;
  }
  if (raw.startsWith('SCOPE_DENIED') || raw.startsWith('INTENT_DENIED')) {
    return `${raw}\n\nVoice rendering was not authorized for this MCP. It needs MNEMO_VOICE=1 in the MCP config AND the human approving the "voice:speak" permission when the app asks.`;
  }
  if (raw.startsWith('LICENSE_REQUIRED')) {
    return `${raw}\n\nLocal neural voices are a licensed feature of Mnemosyne OS. Nothing to retry here.`;
  }
  if (raw.startsWith('SCRIPT_TOO_LONG')) {
    return `${raw}\n\nSplit the script into scenes and render one file per scene.`;
  }
  return raw;
}

/** The shape {@link renderReport} needs — a subset of the host's job object. */
export interface VoiceJobLike {
  id: string;
  state: string;
  engine?: string;
  clone?: string | null;
  cloneWarning?: string | null;
  segments?: number;
  segmentsDone?: number;
  path?: string | null;
  seconds?: number | null;
  error?: string | null;
  etaSeconds?: number | null;
  realtimeFactor?: number | null;
}

/** Seconds → "3m 20s". */
function human(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

/**
 * Report a render's state to the agent.
 *
 * A render still running is reported as still running, with the id to poll —
 * never as a finished job with a missing file. That distinction is the whole
 * point of the job model: an agent that reads "done, path: none" concludes the
 * render produced nothing and starts over, doubling a wait it was already in.
 */
export function renderReport(job: VoiceJobLike, waited: number): string {
  const done = job.segmentsDone ?? 0;
  const total = job.segments ?? 0;
  const progress = total ? ` (${done}/${total} segments)` : '';

  if (job.state === 'done') {
    const warn = job.cloneWarning
      ? `\n\n⚠ The reference voice had a problem: ${job.cloneWarning}. Listen before publishing — the resemblance may be poor.`
      : '';
    return `# Voice-over ready\n\n**File:** \`${job.path}\`\n`
      + `**Length:** ${job.seconds === null || job.seconds === undefined ? 'unknown' : `${job.seconds}s`}\n`
      + `**Voice:** ${job.clone ?? 'the engine\'s built-in voice'} on ${job.engine ?? 'the local engine'}${progress}\n`
      + `${warn}\n\nTell the user the path. The file is a WAV — every video editor reads it.`;
  }
  if (job.state === 'failed') {
    return `# Render failed\n\n${voiceError(job.error ?? undefined)}\n\nJob \`${job.id}\`, stopped at segment ${done + 1} of ${total}. No file was written.`;
  }
  if (job.state === 'cancelled') {
    return `Render \`${job.id}\` was cancelled after ${done}/${total} segments. No file was written.`;
  }
  // Still rendering.
  const eta = typeof job.etaSeconds === 'number' ? `, about ${human(job.etaSeconds)} left` : '';
  return `# Still rendering\n\nJob \`${job.id}\` — ${done}/${total} segments done${eta}.\n\n`
    + `${waited > 0 ? `Waited ${human(waited)}; ` : ''}`
    + `synthesis runs at roughly real time, so a long script takes as long as it plays. `
    + `Call mnemosyne_speak_status with this job id to check again — do NOT start the render over.`;
}
