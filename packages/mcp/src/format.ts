/**
 * Pure formatting / classification helpers for the MCP server.
 *
 * Extracted from index.ts so they can be unit-tested without a live WS backend.
 * The resonance helpers here fix the bug where `mnemosyne_resonance_list` returned a
 * ~189KB code blob: a loose `content.includes('[RESONANCE:')` match treated any
 * source file or commit mentioning the literal token as a resonance, and a
 * greedy `/Name:\s*(.+)/` capture then swallowed the whole file as its "name".
 */

import type { MnemoChronicle, QueryResult } from './ws-client.js';
import { localStamp, parseStoredTime } from './local-time.js';

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

// A real position chronicle written by mnemosyne_position_update STARTS with this
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
  /** Minutes since the chronicle was saved; null when its time cannot be read, never a made-up 0. */
  agoMin:      number | null;
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
  const ts      = parseStoredTime(c.timestamp);
  const agoMin  = ts !== null ? Math.max(0, Math.round((now - ts) / 60000)) : null;
  return { id, phase, agoMin, chronicleId: String(c.id) };
}

/** One listing line of a resonance; an unreadable time says so instead of "0min ago". */
export function resonanceLine(v: ResonanceView): string {
  const age = v.agoMin === null ? 'update time unknown' : `updated ${v.agoMin}min ago`;
  return `- **${v.id}** · ${v.phase} · ${age} \`#${v.chronicleId}\``;
}

/** Render the full resonance listing body (without the surrounding headers). */
export function formatResonances(chronicles: MnemoChronicle[], now: number = Date.now()): string {
  return selectResonances(chronicles).map(c => resonanceLine(toResonanceView(c, now))).join('\n');
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
    return `${raw}\n\nThe voice you named does not exist. Call mnemosyne_voice_list for the real list and ask the user which one they meant.`
      + ` Do NOT retry with another name: a voice-over in the wrong voice sounds perfectly fine and is worthless.`;
  }
  if (raw.startsWith('CLONE_NOT_SUPPORTED')) {
    return `${raw}\n\nThat engine has fixed voices. Use "qwen3", "chatterbox" or "zonos" to clone, or drop the clone argument.`;
  }
  if (raw.startsWith('ENGINE_RETIRED')) {
    return `${raw}\n\nThat engine was removed from Mnemosyne OS. Use one the message lists, or omit engine and the host picks the best installed one.`;
  }
  if (raw.startsWith('ENGINE_NOT_INSTALLED') || raw.startsWith('NO_CLONING_ENGINE') || raw.startsWith('NO_TTS_ENGINE')) {
    return `${raw}\n\nThe user installs local voices from Settings → Voice in the Mnemosyne OS app. This is a multi-GB download, so tell them rather than waiting.`;
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
      ? `\n\n⚠ The reference voice had a problem: ${job.cloneWarning}. Listen before publishing: the resemblance may be poor.`
      : '';
    return `# Voice-over ready\n\n**File:** \`${job.path}\`\n`
      + `**Length:** ${job.seconds === null || job.seconds === undefined ? 'unknown' : `${job.seconds}s`}\n`
      + `**Voice:** ${job.clone ?? 'the engine\'s built-in voice'} on ${job.engine ?? 'the local engine'}${progress}\n`
      + `${warn}\n\nTell the user the path. The file is a WAV, and every video editor reads it.`;
  }
  if (job.state === 'failed') {
    return `# Render failed\n\n${voiceError(job.error ?? undefined)}\n\nJob \`${job.id}\`, stopped at segment ${done + 1} of ${total}. No file was written.`;
  }
  if (job.state === 'cancelled') {
    return `Render \`${job.id}\` was cancelled after ${done}/${total} segments. No file was written.`;
  }
  // Still rendering.
  const eta = typeof job.etaSeconds === 'number' ? `, about ${human(job.etaSeconds)} left` : '';
  return `# Still rendering\n\nJob \`${job.id}\`: ${done}/${total} segments done${eta}.\n\n`
    + `${waited > 0 ? `Waited ${human(waited)}; ` : ''}`
    + `synthesis runs at roughly real time, so a long script takes as long as it plays. `
    + `Call mnemosyne_voice_status with this job id to check again. Do NOT start the render over.`;
}

/** An ISO instant → epoch ms, or null when it cannot be read. */
function instantOf(iso: unknown): number | null {
  if (typeof iso !== 'string') return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/** The local day of an instant, `YYYY-MM-DD` (this machine's clock, never UTC). */
const localDay = (ms: number): string => localStamp(ms).slice(0, 10);
const localTime = (ms: number): string => localStamp(ms).slice(11);

/**
 * One line for a result whose source file no longer says what the memory says,
 * or null. Only `changed` and `missing` print: a current file, an unchecked one,
 * or a row with no file cost nothing, so a fresh vault adds zero tokens.
 * The path is printed because it is the fix: the agent can read the file.
 */
export function freshnessLine(freshness: unknown): string | null {
  if (!freshness || typeof freshness !== 'object') return null;
  const f = freshness as Record<string, unknown>;
  const filePath = typeof f['filePath'] === 'string' && f['filePath'] ? f['filePath'] : null;
  if (!filePath) return null;
  if (f['state'] === 'changed') {
    const modified = instantOf(f['modifiedAt']);
    const read = instantOf(f['readAt']);
    if (modified === null || read === null) return null;
    // Two dates on the same local day say nothing on their own: print the times.
    const when = localDay(modified) === localDay(read)
      ? `on ${localDay(modified)} at ${localTime(modified)}, after this memory was taken at ${localTime(read)}`
      : `on ${localDay(modified)}, after this memory was taken on ${localDay(read)}`;
    return `> ⚠️ Stale: the file changed ${when} (local time). Read \`${filePath}\` for its current state.`;
  }
  if (f['state'] === 'missing') {
    const read = instantOf(f['readAt']);
    return `> ⚠️ Gone: \`${filePath}\` no longer exists${read !== null ? `; this memory was taken on ${localDay(read)}` : ''}.`;
  }
  return null;
}

/**
 * What `mnemosyne_memory_query` says INSTEAD of results, or null when the rows
 * are real search results. Three answers that used to read as one:
 *
 *   - the app refused or failed: nothing was read, so "nothing found" would be
 *     a claim about the vault that the search never made;
 *   - the embed failed and the app fell back to the N most RECENT memories
 *     (`_semantic.used === false`). Those rows carry no score, the app prints
 *     them as 1.000, and shown as results they read as a perfect ranking that
 *     never happened. They are refused, never shown;
 *   - the search ran and matched nothing: the only honest "no chronicles found".
 *
 * An app too old to send `_semantic` is not a fallback: absent is not false.
 */
export function queryRefusal(result: QueryResult, vault: string, filterHint = ''): string | null {
  const failure = searchFailure(result, vault);
  if (failure !== null) return failure;
  if (result.chronicles.length === 0) {
    return `No chronicles found in vault:${vault} for this query${filterHint}. The search ran and matched nothing.`;
  }
  return null;
}

/**
 * The two answers of `queryRefusal` that say the rows are NOT a search result:
 * the app failed, or it fell back to its most recent memories. Null when the
 * search ran, whatever it found. The resonance tools read this one, because an
 * empty result means something of their own ("no resonance yet").
 * An empty error string reads as no reason, like an absent one.
 */
export function searchFailure(result: QueryResult, vault: string): string | null {
  if (!result.success) {
    return `Mnemosyne could not search vault:${vault}: ${result.error || 'no reason given'}. `
      + `This is a failed search, not an empty one: nothing was read, so it says nothing about what the vault holds.`;
  }
  const semantic = result._semantic;
  if (semantic && semantic.wanted === true && semantic.used === false) {
    return `Mnemosyne could not run this search on vault:${vault}: ${semantic.error || 'no reason given'}. `
      + `The app fell back to its most recent memories, which are not results for this query, so none are shown. `
      + `This says nothing about what the vault holds. Retry once the embedder is back, or use mnemosyne_memory_ask.`;
  }
  return null;
}

/**
 * The saved position of ONE resonance, or null. A search for an id ranks
 * whatever is nearest, so the first row can be any document: only a resonance
 * chronicle carrying this exact `[RESONANCE:<id>]` marker is that position.
 * Rows come newest-relevant first, so the first match is returned.
 */
export function findPosition(chronicles: MnemoChronicle[], resonanceId: string): MnemoChronicle | null {
  const marker = `[RESONANCE:${resonanceId}]`;
  return selectResonances(chronicles).find(c => unwrapContent(c.content ?? '').includes(marker)) ?? null;
}

/**
 * The score as printed beside a query row. A row nobody scored (a hit of the
 * keyword channel alone) says so: an older app sent 1 for it, and "1.000" read
 * as a perfect match.
 */
export function scoreLabel(score: unknown): string {
  return typeof score === 'number' && Number.isFinite(score)
    ? `score: ${score.toFixed(3)}`
    : 'unscored (keyword match)';
}

// Spine types that are design/vision/doc material: their identifiers (class
// names, file paths, intents) may be idealized and not match the actual code.
const DOC_SPINES = new Set([
  'DOCUMENT', 'VISION', 'NOTE', 'IDEATIONAL', 'HYPOTHESIS', 'CONTEXTUAL', 'CONCERN',
]);

/**
 * Whether a query row is design material an agent should check against the
 * source code before trusting its identifiers.
 *
 * NOTE is also the default spine of `mnemosyne_memory_ingest`, so it counts
 * only when the row came from a file on disk (DocWatch): an agent's own note
 * ("my validation drink is …") carried the "verify against the actual source
 * code" warning, seen under DeepSeek Harness on 2026-10-28.
 */
export function isDesignDoc(spineType: unknown, sourceAppId: unknown): boolean {
  const spine = String(spineType ?? '').toUpperCase();
  if (!DOC_SPINES.has(spine)) return false;
  return spine !== 'NOTE' || String(sourceAppId ?? '').toUpperCase() === 'DOCWATCH';
}

export interface QueryRowOptions {
  /** Characters of body kept before the truncation hint. */
  maxContentChars: number;
  /** The words-only vault judged this row a partial match (readCoverage). */
  notAdmitted?: boolean;
}

/**
 * One result row of `mnemosyne_memory_query`, as the agent reads it. Lives
 * here so the output itself is tested: the guards it carries (the date line
 * omitted when the time cannot be read, the design-doc warning) were checked
 * only by reading index.ts as text, and inverting either left every test green
 * (verification of 2026-10-28).
 */
export function formatQueryRow(c: MnemoChronicle, index: number, options: QueryRowOptions): string {
  const savedAt  = parseStoredTime(c.timestamp);
  const stale    = freshnessLine(c.freshness);
  const raw      = unwrapContent(c.content ?? '');
  const totalLen = raw.length;
  const truncated = totalLen > options.maxContentChars;
  const snippet  = truncated ? raw.slice(0, options.maxContentChars).trimEnd() + '…' : raw;
  const truncHint = truncated
    ? `\n\n_(content truncated, ${totalLen} chars total. Re-query with max_content_chars: ${Math.min(totalLen, 4000)} for the full body, or call mnemosyne_memory_query with a more specific text to surface the right chunk.)_`
    : '';
  return [
    `### [${index + 1}] ${c.spineType} · ${scoreLabel(c.score)}`,
    `**ID:** ${c.id}`,
    // An unreadable time prints no date line: absent, never a made-up one.
    ...(savedAt !== null ? [`**Date:** ${localStamp(savedAt)}`] : []),
    `**Source:** ${c.source_app_id}`,
    // Design material is flagged so an agent verifies its identifiers before trusting them.
    ...(isDesignDoc(c.spineType, c.source_app_id)
      ? ['> ⚠️ Design/vision doc: verify class names, file paths and identifiers against the actual source code before relying on them.']
      : []),
    ...(stale ? [stale] : []),
    ...(options.notAdmitted ? ['> Not admitted: this row matches only some words of the query.'] : []),
    '',
    snippet || '_(no content)_',
    truncHint,
  ].join('\n');
}

export interface CoverageView {
  /** One line for the whole answer. */
  summary: string;
  /** Per served row, in rank order: true when the engine would NOT admit it. */
  notAdmitted: boolean[];
}

/**
 * What the engine measured about a words-only vault's rows, or null when it
 * measured nothing (any other vault, or an older app). `admitted` counts the
 * rows the chat would let into an answer; a row it would not admit matches only
 * some words of the question, and is the nearest the engine comes to "I don't
 * know". Per-row verdicts are used only when they line up with the rows shown.
 */
export function readCoverage(result: QueryResult): CoverageView | null {
  const raw = result._semantic?.lexicalCoverage;
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as { measured?: unknown; admitted?: unknown; rows?: unknown };
  if (typeof c.measured !== 'number' || typeof c.admitted !== 'number' || c.measured <= 0) return null;
  const rows = Array.isArray(c.rows) ? c.rows : [];
  const aligned = rows.length === result.chronicles.length;
  const notAdmitted = result.chronicles.map((_, i) => {
    const r = aligned ? rows[i] as { admitted?: unknown } | null : null;
    return !!r && typeof r === 'object' && r.admitted === false;
  });
  const summary = c.admitted === 0
    ? `> ⚠️ Words-only vault: the engine judged none of the ${c.measured} rows it measured worth a place in an answer. They match only some words of the query; treat this as "nothing found".`
    : `> Words-only vault: the engine judged ${c.admitted} of the ${c.measured} rows it measured worth a place in an answer.`;
  return { summary, notAdmitted };
}
