import fs from 'fs';
import path from 'path';
import os from 'os';

// ─────────────────────────────────────────────────────────────────────────────
// Resonance Protocol — MnemoSync file-based multi-agent coordination
// Reads/writes pulse, inbox, and messages from the MnemoSync data directory.
//
// Default path resolution order:
//  1. MNEMOSYNC_PATH env variable (absolute)
//  2. Workspace root detection (looks for apps/mnemosync/data/ up the tree)
//  3. Fallback: ~/Documents/TRAVAIL/.../apps/mnemosync/data/
// ─────────────────────────────────────────────────────────────────────────────

export type AgentStatus = 'active' | 'idle' | 'blocked';
export type MessagePriority = 'low' | 'medium' | 'high' | 'critical';
export type DirectiveType = 'task' | 'review' | 'test' | 'block' | 'approve' | 'info';
export type EventCategory = 'code' | 'test' | 'decision' | 'message' | 'blocker' | 'qa' | 'merge' | 'directive';

export interface PulseData {
  agent_id: string;
  soul_profile: string;
  timestamp: string;
  zone: string;
  intent: string;
  files_touched: string[];
  fac_charge: number;   // 0.0 → 1.0
  status: AgentStatus;
  blocks: string[];
  protocol_version: string;
  category?: EventCategory;
}

export interface InboxMessage {
  from: string;
  to: string;
  priority: MessagePriority;
  type: DirectiveType;
  zone?: string;
  body: string;
  timestamp: string;
  read: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Path resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find the MnemoSync data directory.
 * Walks up from CWD looking for apps/mnemosync/data/, then falls back to env.
 */
export function resolveMnemoSyncDir(startDir: string = process.cwd()): string {
  // 1. Env override
  if (process.env.MNEMOSYNC_PATH) {
    return process.env.MNEMOSYNC_PATH;
  }

  // 2. Walk up looking for monorepo root (has apps/mnemosync/data/)
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, 'apps', 'mnemosync', 'data');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // 3. Fallback: look for it relative to the CLI package itself (goes up from dist/)
  const fromPackage = path.resolve(
    __dirname,
    '..', '..', '..', 'apps', 'mnemosync', 'data'
  );
  if (fs.existsSync(fromPackage)) return fromPackage;


  throw new Error(
    'MnemoSync data directory not found.\n' +
    'Set the MNEMOSYNC_PATH environment variable to the absolute path of apps/mnemosync/data/'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pulse operations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read the pulse of a given agent.
 */
export function readPulse(agentId: string, mnemoSyncDir?: string): PulseData | null {
  const dir = mnemoSyncDir ?? resolveMnemoSyncDir();
  const filePath = path.join(dir, `${agentId}.pulse.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as PulseData;
  } catch {
    return null;
  }
}

/**
 * Write/update the pulse of the current agent.
 */
export function writePulse(pulse: Partial<PulseData> & { agent_id: string }, mnemoSyncDir?: string): PulseData {
  const dir = mnemoSyncDir ?? resolveMnemoSyncDir();
  const existing = readPulse(pulse.agent_id, dir) ?? {
    agent_id: pulse.agent_id,
    soul_profile: pulse.agent_id,
    timestamp: new Date().toISOString(),
    zone: '.',
    intent: '',
    files_touched: [],
    fac_charge: 0.0,
    status: 'idle' as AgentStatus,
    blocks: [],
    protocol_version: '0.1',
  };

  const updated: PulseData = {
    ...existing,
    ...pulse,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(dir, `${pulse.agent_id}.pulse.json`),
    JSON.stringify(updated, null, 2),
    'utf8'
  );
  return updated;
}

/**
 * List all agents that have a pulse file.
 */
export function listAgents(mnemoSyncDir?: string): string[] {
  const dir = mnemoSyncDir ?? resolveMnemoSyncDir();
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.pulse.json'))
    .map(f => f.replace('.pulse.json', ''));
}

// ─────────────────────────────────────────────────────────────────────────────
// Inbox / Message operations
// ─────────────────────────────────────────────────────────────────────────────

function inboxFilePath(from: string, to: string, dir: string): string {
  return path.join(dir, 'messages', `${from}-to-${to}.md`);
}

function readMarkerPath(from: string, to: string, dir: string): string {
  return path.join(dir, 'messages', `${from}-to-${to}.read`);
}

/**
 * Format a message as a Markdown file.
 */
function formatMessage(msg: Omit<InboxMessage, 'read'>): string {
  const priorityEmoji = { low: '🟢', medium: '🟡', high: '🔴', critical: '🚨' }[msg.priority] ?? '🟢';
  return [
    `# 📬 Message — ${msg.from} → ${msg.to}`,
    '',
    `**Priorité :** ${priorityEmoji} ${msg.priority}`,
    `**Type :** ${msg.type}`,
    msg.zone ? `**Zone :** \`${msg.zone}\`` : null,
    `**Timestamp :** ${msg.timestamp}`,
    '',
    '---',
    '',
    msg.body,
    '',
  ].filter(l => l !== null).join('\n');
}

/**
 * Send a message from one agent to another.
 * Writes to apps/mnemosync/data/messages/<from>-to-<to>.md
 */
export function sendMessage(
  from: string,
  to: string,
  body: string,
  type: DirectiveType = 'info',
  priority: MessagePriority = 'medium',
  zone?: string,
  mnemoSyncDir?: string
): InboxMessage {
  const dir = mnemoSyncDir ?? resolveMnemoSyncDir();
  const messagesDir = path.join(dir, 'messages');
  fs.mkdirSync(messagesDir, { recursive: true });

  const msg: Omit<InboxMessage, 'read'> = {
    from, to, priority, type,
    zone,
    body,
    timestamp: new Date().toISOString(),
  };

  const content = formatMessage(msg);
  const filePath = inboxFilePath(from, to, dir);
  fs.writeFileSync(filePath, content, 'utf8');

  // Remove any stale .read marker (new message = unread)
  const readMarker = readMarkerPath(from, to, dir);
  if (fs.existsSync(readMarker)) fs.unlinkSync(readMarker);

  return { ...msg, read: false };
}

/**
 * Read inbox messages for a given agent (all messages sent TO this agent).
 */
export function readInbox(agentId: string, mnemoSyncDir?: string): InboxMessage[] {
  const dir = mnemoSyncDir ?? resolveMnemoSyncDir();
  const messagesDir = path.join(dir, 'messages');
  if (!fs.existsSync(messagesDir)) return [];

  const files = fs.readdirSync(messagesDir)
    .filter(f => f.endsWith(`.md`) && f.includes(`-to-${agentId}`));

  return files.map(f => {
    const from = f.replace(`-to-${agentId}.md`, '');
    const filePath = path.join(messagesDir, f);
    const raw = fs.readFileSync(filePath, 'utf8');
    const readMarker = readMarkerPath(from, agentId, dir);
    const isRead = fs.existsSync(readMarker);

    // Parse basic metadata from markdown header
    const priorityMatch = raw.match(/\*\*Priorité\s*:\*\*\s*\S+\s*(\w+)/);
    const typeMatch = raw.match(/\*\*Type\s*:\*\*\s*(\w+)/);
    const zoneMatch = raw.match(/\*\*Zone\s*:\*\*\s*`([^`]+)`/);
    const tsMatch = raw.match(/\*\*Timestamp\s*:\*\*\s*(.+)/);
    const bodyMatch = raw.split(/\n---\n/)[1]?.trim() ?? '';

    return {
      from,
      to: agentId,
      priority: (priorityMatch?.[1] ?? 'medium') as MessagePriority,
      type: (typeMatch?.[1] ?? 'info') as DirectiveType,
      zone: zoneMatch?.[1],
      body: bodyMatch,
      timestamp: tsMatch?.[1]?.trim() ?? '',
      read: isRead,
    };
  });
}

/**
 * Mark all messages to an agent as read.
 */
export function markInboxRead(agentId: string, fromAgent?: string, mnemoSyncDir?: string): void {
  const dir = mnemoSyncDir ?? resolveMnemoSyncDir();
  const messagesDir = path.join(dir, 'messages');
  if (!fs.existsSync(messagesDir)) return;

  const files = fs.readdirSync(messagesDir)
    .filter(f => f.endsWith('.md') && f.includes(`-to-${agentId}`))
    .filter(f => fromAgent ? f.startsWith(`${fromAgent}-to-`) : true);

  for (const f of files) {
    const from = f.replace(`-to-${agentId}.md`, '');
    const readMarker = readMarkerPath(from, agentId, dir);
    if (!fs.existsSync(readMarker)) {
      fs.writeFileSync(readMarker, new Date().toISOString(), 'utf8');
    }
  }
}
