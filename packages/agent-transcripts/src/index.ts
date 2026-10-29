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
  dayKey,
  asCount,
  emptyCounts,
  addCounts,
  totalCounts,
  type TokenCounts,
  type UsageSpec,
  type Artifact,
  type Connector,
  type ConnectorFormat,
  type ArchiveSpec,
  type ChatLogSpec,
  type TelegramSpec,
  type DocState,
  type SessionState,
} from './connector';

export {
  readArchive,
  describeArchive,
  accountedFor,
  RECORD_LEVEL_REASONS,
  toIso,
  htmlToText,
  stripPrefix,
  walkOpenAiPath,
  type ArchiveState,
  type ConversationState,
  type Role,
  type SkipReason,
  type Turn,
} from './archive';

export {
  readChatLog,
  accountedForLines,
  resolveDateOrder,
  CHAT_LINE_LEVEL_REASONS,
  type ChatLogState,
  type ChatTurn,
  type ChatRole,
  type ChatSkipReason,
  type ChatLineShape,
  type DateOrder,
} from './chatLog';

export {
  readTelegramExport,
  accountedForMessages,
  TELEGRAM_MESSAGE_LEVEL_REASONS,
  type TelegramExportState,
  type TelegramChatState,
  type TelegramTurn,
  type TelegramSkipReason,
  type TelegramChatSkipReason,
} from './telegram';

export {
  groupIntoBursts,
  DEFAULT_BURST_GAP_MINUTES,
  type Burst,
  type BurstReport,
} from './bursts';

export { shellWriteTargets, looksLikePath } from './shellWrites';

export {
  LIVE_MINUTES,
  minutesSince,
  lastSeen,
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
import chatgptExport from './connectors/chatgpt-export.json';
import claudeAiExport from './connectors/claude-ai-export.json';
import geminiTakeout from './connectors/gemini-takeout.json';
import whatsappBrowserExport from './connectors/whatsapp-browser-export.json';
import whatsappNativeExport from './connectors/whatsapp-native-export.json';
import whatsappNativeAndroid from './connectors/whatsapp-native-android.json';
import telegramDesktopJson from './connectors/telegram-desktop-json.json';
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

/**
 * Connectors for a PROVIDER'S DATA EXPORT, read with `readArchive`. Doc 118.
 *
 * Kept apart from CONNECTORS because the two answer different questions and a
 * caller must never reach for the wrong reader: an agent transcript is a live
 * file on your disk that an agent is still appending to, an export is a dead
 * archive a provider handed you once. Merging the two maps would make
 * `readSession` reachable with an archive connector, which fails as an empty
 * result rather than as an error.
 *
 * ⚠️ Only `gemini-takeout` has been run over a real export. The other two are
 * written against documented shape; each file says so in its own `_verified`,
 * and `archiveConnectorIsVerified` reads that rather than letting a caller
 * assume.
 */
export const ARCHIVE_CONNECTORS = {
  'chatgpt-export': chatgptExport as Connector,
  'claude-ai-export': claudeAiExport as Connector,
  'gemini-takeout': geminiTakeout as Connector,
} as const;

export type ArchiveConnectorId = keyof typeof ARCHIVE_CONNECTORS;

/**
 * Connectors for a MESSAGING APP'S EXPORTED LOG, read with `readChatLog`.
 * Doc 118 §9.
 *
 * A third map rather than a third entry in the other two, for the reason the
 * reader itself exists: this file holds ONE conversation between N named
 * PEOPLE, where an archive holds many conversations between a human and a
 * model. A caller that reached for `readArchive` with one of these would get an
 * empty result rather than an error, which is the failure mode the split
 * between CONNECTORS and ARCHIVE_CONNECTORS was already drawn to avoid.
 *
 * ⚠️ Only `whatsapp-browser-export` has been run over a real file, and even
 * that one is verified against a producer nobody could name (a browser
 * extension, not WhatsApp). The two native ones are written against documented
 * shape; each says so in its own `_verified`, and `archiveConnectorIsVerified`
 * reads that rather than letting a caller assume.
 */
export const CHATLOG_CONNECTORS = {
  'whatsapp-browser-export': whatsappBrowserExport as Connector,
  'whatsapp-native-export': whatsappNativeExport as Connector,
  'whatsapp-native-android': whatsappNativeAndroid as Connector,
} as const;

export type ChatLogConnectorId = keyof typeof CHATLOG_CONNECTORS;

/**
 * Connectors for a TELEGRAM EXPORT, read with `readTelegramExport`. Doc 118 §10.
 *
 * A fourth map, for the reason the other three are separate: a caller that
 * reached for `readChatLog` with one of these would get a null back rather than
 * an error, and a caller that reached for `readArchive` would get an empty
 * result — which is the failure mode this split exists to prevent. Telegram
 * shares the MODEL with the chat logs and the reader with nobody.
 *
 * ⚠️ Nothing here has been run over a real export. `_verified` says so on the
 * file, and `archiveConnectorIsVerified` reads it rather than letting a caller
 * assume.
 */
export const TELEGRAM_CONNECTORS = {
  'telegram-desktop-json': telegramDesktopJson as Connector,
} as const;

export type TelegramConnectorId = keyof typeof TELEGRAM_CONNECTORS;

export type ConnectorId = keyof typeof CONNECTORS;

/**
 * Whether this connector has ever been run over a real export.
 *
 * Read from the connector's own `_verified` note, so the answer cannot drift
 * from the file: a connector nobody has tested says MEASURED nowhere, and the
 * app shows the difference instead of presenting a belief as a fact.
 */
export function archiveConnectorIsVerified(conn: Connector): boolean {
  const note = (conn as unknown as { _verified?: unknown })._verified;
  return typeof note === 'string' && note.startsWith('MEASURED');
}
