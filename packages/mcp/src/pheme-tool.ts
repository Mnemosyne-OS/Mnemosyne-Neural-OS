/**
 * pheme-tool — `mnemosyne_pheme_watch` and `mnemosyne_pheme_radar`: the
 * agent's two hands on Pheme, the human's reputation instrument (doc 75 §14).
 *
 *   watch — put a subreddit, an HN query or a topic on the radar, or take one
 *           off. The lists are the HUMAN's: an op that would empty one is
 *           refused, every op reports for itself, and the human sees a receipt
 *           in Pheme naming who changed what.
 *   radar — read what the radar last found: fresh threads worth a genuine
 *           reply, with the tier the Mnemosyne pass gave them. As fresh as the
 *           last time the human scanned; the answer says when that was.
 *
 * ⛔ There is no tool to post. Pheme drafts, the human posts. This module
 * renders sentences an agent reads; it never decides anything.
 */

export interface PhemeRpcClient {
  _rpc<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
}

export type PhemeOpKind = 'sub' | 'topic' | 'hnQuery';
export interface PhemeOp { op: 'add' | 'remove'; kind: PhemeOpKind; value: string }

export interface PhemeOpResult extends PhemeOp {
  outcome: 'applied' | 'already' | 'absent' | 'refused';
  reason?: 'WOULD_EMPTY' | 'BAD_VALUE' | 'LIST_FULL';
}

export interface PhemeLists { subs: string[]; hnQueries: string[]; topics: string[] }

export interface PhemeWatchResult {
  ok: boolean;
  error?: string;
  results?: PhemeOpResult[];
  applied?: number;
  lists?: PhemeLists;
  revision?: number;
  nudged?: boolean;
}

export interface PhemeRadarLine {
  id: string; title: string; url: string; target: string; network: 'reddit' | 'hackernews';
  timestamp: string; score: number; matched: string[];
  tier?: 'high' | 'mid' | 'low'; reason?: string; points?: number; comments?: number;
}

export interface PhemeRadarResult {
  ok: boolean;
  error?: string;
  scannedAt?: string;
  rankedAt?: string;
  items?: PhemeRadarLine[];
  failed?: string[];
  lists?: PhemeLists;
  mirrorUpdatedAt?: string | null;
}

const KINDS: readonly PhemeOpKind[] = ['sub', 'topic', 'hnQuery'];

/** The ops as the host expects them, or the reason none can be built. */
export function phemeOps(args: Record<string, unknown>): { ops: PhemeOp[] } | { error: string } {
  const raw = args['ops'];
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'NO_OPS' };
  const ops: PhemeOp[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if ((o['op'] !== 'add' && o['op'] !== 'remove') || !KINDS.includes(o['kind'] as PhemeOpKind)) continue;
    if (typeof o['value'] !== 'string' || !o['value'].trim()) continue;
    ops.push({ op: o['op'], kind: o['kind'] as PhemeOpKind, value: o['value'].trim() });
  }
  return ops.length > 0 ? { ops } : { error: 'NO_OPS' };
}

function label(kind: PhemeOpKind, value: string): string {
  return kind === 'sub' ? `r/${value}` : kind === 'hnQuery' ? `HN "${value}"` : `topic "${value}"`;
}

const NO_PROFILE = 'Pheme has no profile on this machine yet: the human has not opened it and finished its onboarding. An agent does not set Pheme up for them — ask them to open Pheme (the reputation cartridge) once, then call again.';

function listsBlock(lists: PhemeLists | undefined): string {
  if (!lists) return '';
  const subs = lists.subs.length ? lists.subs.map(s => `r/${s}`).join(', ') : 'none';
  const hn = lists.hnQueries.length ? lists.hnQueries.map(q => `"${q}"`).join(', ') : 'none';
  const topics = lists.topics.length ? lists.topics.join(', ') : 'none';
  return `\n\nWatched now — subreddits: ${subs}. HN queries: ${hn}. Topics: ${topics}.`;
}

export function renderPhemeWatch(result: PhemeWatchResult): string {
  if (!result.ok) {
    switch (result.error) {
      case 'NO_PROFILE': return NO_PROFILE;
      case 'TOO_LARGE': return 'Pheme refused the change: its settings mirror would exceed the host\'s size cap. Nothing was written. Ask the human to trim their lists in Pheme.';
      default: return `Pheme refused the change: ${result.error ?? 'unknown error'}. Nothing was written.`;
    }
  }
  const lines = (result.results ?? []).map(r => {
    const what = label(r.kind, r.value);
    const verb = r.op === 'add' ? 'add' : 'remove';
    switch (r.outcome) {
      case 'applied': return `- ${verb} ${what}: done`;
      case 'already': return `- ${verb} ${what}: already on the list, nothing changed`;
      case 'absent': return `- ${verb} ${what}: was not on the list, nothing changed`;
      case 'refused':
        if (r.reason === 'WOULD_EMPTY') return `- ${verb} ${what}: refused — it is the last entry, and an agent never empties one of the human's lists. They can, in Pheme.`;
        if (r.reason === 'LIST_FULL') return `- ${verb} ${what}: refused — the list is full (the radar cannot lap more).`;
        return `- ${verb} ${what}: refused — not a usable value.`;
      default: return `- ${verb} ${what}: ${String(r.outcome)}`;
    }
  });
  const applied = result.applied ?? 0;
  const head = applied === 0
    ? 'No change to Pheme\'s watch lists.'
    : `${applied} change${applied > 1 ? 's' : ''} written to Pheme's watch lists (revision ${result.revision ?? '?'}). ` +
      (result.nudged
        ? 'Pheme is open and has been told; the human sees a receipt naming this agent.'
        : 'Pheme is not open right now; it adopts the change and shows the receipt the next time the human opens it.');
  return `${head}\n${lines.join('\n')}${listsBlock(result.lists)}`;
}

function ago(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const min = Math.max(0, Math.round((now - t) / 60_000));
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function renderPhemeRadar(result: PhemeRadarResult, now: number = Date.now()): string {
  if (!result.ok) {
    switch (result.error) {
      case 'NO_PROFILE': return NO_PROFILE;
      case 'NO_RADAR':
        return 'Pheme has not projected a radar yet: the human has not run a scan since this version, so there is nothing to read — not "no threads", no measurement. Ask them to open Pheme and press Scan; the radar is projected after every scan.' + listsBlock(result.lists);
      default: return `Pheme could not hand the radar over: ${result.error ?? 'unknown error'}.`;
    }
  }
  const items = result.items ?? [];
  // 🚨 The date is the first thing said. A projection is as fresh as the last
  // scan the HUMAN ran; an agent reading it a week later must not take it for
  // this morning's threads.
  const when = result.scannedAt ? `scanned ${ago(result.scannedAt, now)} (${result.scannedAt})` : 'scan time unknown';
  const ranked = result.rankedAt ? `, Mnemosyne pass ${ago(result.rankedAt, now)}` : ', no Mnemosyne pass yet (no tiers)';
  const failed = result.failed && result.failed.length > 0 ? `\nSubs the scan could not cover: ${result.failed.join(', ')}.` : '';
  if (items.length === 0) {
    return `Pheme's radar, ${when}${ranked}: no thread on it after the human's own hiding and staleness rules.${failed}${listsBlock(result.lists)}`;
  }
  const lines = items.map(i => {
    const tier = i.tier ? `[${i.tier}] ` : '';
    const meta = [
      i.target,
      typeof i.points === 'number' ? `${i.points} pts` : null,
      typeof i.comments === 'number' ? `${i.comments} comments` : null,
      `score ${Math.round(i.score)}`,
      ago(i.timestamp, now),
    ].filter(Boolean).join(' · ');
    const why = i.reason ? `\n    why: ${i.reason}` : '';
    return `- ${tier}${i.title}\n    ${meta}\n    ${i.url}${why}`;
  });
  return `Pheme's radar, ${when}${ranked}. ${items.length} thread${items.length > 1 ? 's' : ''} worth a look, tier first then score.\nThe human posts; you draft. Do not post as them.\n${lines.join('\n')}${failed}`;
}

export async function handlePhemeWatch(client: PhemeRpcClient, appId: string, args: Record<string, unknown>): Promise<string> {
  const built = phemeOps(args);
  if ('error' in built) {
    return 'Nothing to do: "ops" must hold at least one { op: "add" | "remove", kind: "sub" | "topic" | "hnQuery", value }.';
  }
  const result = await client._rpc<PhemeWatchResult>('sdk.pheme.watch', { appId, ops: built.ops });
  return renderPhemeWatch(result);
}

export async function handlePhemeRadar(client: PhemeRpcClient, appId: string, args: Record<string, unknown>): Promise<string> {
  const params: Record<string, unknown> = { appId };
  if (typeof args['limit'] === 'number' && Number.isFinite(args['limit'])) params['limit'] = args['limit'];
  if (args['tier'] === 'high' || args['tier'] === 'mid' || args['tier'] === 'low') params['tier'] = args['tier'];
  const result = await client._rpc<PhemeRadarResult>('sdk.pheme.radar', params);
  return renderPhemeRadar(result);
}
