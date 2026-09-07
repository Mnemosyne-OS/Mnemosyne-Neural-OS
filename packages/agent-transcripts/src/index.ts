/**
 * @mnemosyne_os/agent-transcripts
 *
 * Reading what coding agents already write on disk, without asking them
 * anything. Doc 93.
 *
 * The whole surface is environment-free: it takes text and returns a
 * normalised model. Where the text comes from is the caller's business — a
 * postMessage bridge in the cartridge, `node:fs` in the MCP server (see
 * `./node`). That is what lets one implementation serve a screen and an agent
 * without either of them learning the other's plumbing.
 *
 * Two rules travel with this code and are not negotiable:
 *
 *  1. **A connector is DATA, never code.** It says how to interpret a folder,
 *     never where to read, and it carries no pattern of its own. People will
 *     exchange connectors; the worst case has to be a failed parse.
 *  2. **The narrator cannot be the subject.** Nothing here reports that an
 *     agent is working — a crashed agent and an idle one fall equally silent.
 *     It reports when a line was last written.
 */
export {
  readSession,
  readDoc,
  completeLines,
  describeConnector,
  MAX_ARTIFACTS,
  type Artifact,
  type Connector,
  type ConnectorFormat,
  type DocState,
  type SessionState,
} from './connector';

export { shellWriteTargets, looksLikePath } from './shellWrites';

export {
  LIVE_MINUTES,
  minutesSince,
  isRecent,
  liveSessions,
  collisions,
  collisionReport,
  findSelf,
  type Collision,
  type CollisionReport,
  type LiveLike,
} from './liveness';

export {
  overlappingTouches,
  TOUCH_WINDOW_MS,
  type Touch,
  type OverlapReport,
  type OverlapOptions,
} from './overlap';

export {
  walkSource,
  activeDirs,
  shouldSweep,
  SWEEP_EVERY_MS,
  type DirEntry,
  type ReadDir,
  type WalkResult,
} from './walk';

import claudeCode from './connectors/claude-code.json';
import claudeMemory from './connectors/claude-memory.json';
import antigravity from './connectors/antigravity.json';
import antigravityNotes from './connectors/antigravity-notes.json';
import antigravityIde from './connectors/antigravity-ide.json';
import antigravityIdeNotes from './connectors/antigravity-ide-notes.json';
import openclaw from './connectors/openclaw.json';
import type { Connector } from './connector';

/**
 * The connectors shipped with this package.
 *
 * ⚠️ An agent with no working connector does NOT get an entry. A card that
 * cannot open is a promise the app cannot keep, and an empty list is more
 * honest than a row that greets you with an apology.
 */
export const CONNECTORS = {
  'claude-code': claudeCode as Connector,
  'claude-memory': claudeMemory as Connector,
  'antigravity': antigravity as Connector,
  'antigravity-notes': antigravityNotes as Connector,
  'antigravity-ide': antigravityIde as Connector,
  'antigravity-ide-notes': antigravityIdeNotes as Connector,
  // ⚠️ Unlike the others, this source never fills on its own: OpenClaw 2 keeps
  // its live sessions in SQLite, and `events.jsonl` only exists where a human
  // ran `openclaw sessions export-trajectory`. Pointing the picker at a folder
  // that holds no export is not a fault to explain away — there is simply
  // nothing there yet.
  'openclaw': openclaw as Connector,
} as const;

export type ConnectorId = keyof typeof CONNECTORS;
