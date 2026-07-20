import { Command } from 'commander';
import chalk from 'chalk';
import {
  readPulse,
  writePulse,
  listAgents,
  sendMessage,
  readInbox,
  markInboxRead,
  resolveMnemoSyncDir,
  type AgentStatus,
  type DirectiveType,
  type MessagePriority,
  type EventCategory,
} from '../lib/resonance.js';

// ─────────────────────────────────────────────────────────────────────────────
// mnemoforge resonance — Multi-Agent Protocol CLI
//
// Subcommands:
//   resonance pulse   — read or update your agent pulse
//   resonance inbox   — read your inbox messages
//   resonance send    — send a message to another agent
//   resonance agents  — list all known agents and their status
//   resonance watch   — live stream of inbox + pulse changes (real-time)
// ─────────────────────────────────────────────────────────────────────────────

const HEADER = chalk.hex('#8B5CF6').bold('\n⬡  Resonance Bridge — Multi-Agent Protocol\n');

// ── resonance pulse ───────────────────────────────────────────────────────────
const pulseCommand = new Command('pulse')
  .description('Read or update the current agent pulse')
  .option('-a, --agent <id>', 'Agent ID to read (default: reads all)', '')
  .option('--status <status>', 'Update status: active | idle | blocked')
  .option('--zone <zone>', 'Update current working zone')
  .option('--intent <text>', 'Update current intent description')
  .option('--fac <number>', 'Update FAC charge (0.0 – 1.0)')
  .option('--set-agent <id>', 'Agent ID to write as (required when updating)')
  .action((opts) => {
    console.log(HEADER);

    const isUpdate = opts.status || opts.zone || opts.intent || opts.fac !== undefined;

    if (isUpdate) {
      const agentId = opts.setAgent;
      if (!agentId) {
        console.log(chalk.red('  ✖  --set-agent <id> is required when updating a pulse.\n'));
        process.exit(1);
      }
      try {
        const updated = writePulse({
          agent_id: agentId,
          ...(opts.status && { status: opts.status as AgentStatus }),
          ...(opts.zone && { zone: opts.zone }),
          ...(opts.intent && { intent: opts.intent }),
          ...(opts.fac !== undefined && { fac_charge: parseFloat(opts.fac) }),
        });
        console.log(chalk.green(`  ✔  Pulse updated for agent: ${chalk.white(agentId)}`));
        printPulse(updated);
      } catch (e: unknown) {
        console.log(chalk.red(`  ✖  ${e instanceof Error ? e.message : String(e)}\n`));
        process.exit(1);
      }
      return;
    }

    // Read mode
    try {
      const agents = opts.agent ? [opts.agent] : listAgents();
      if (agents.length === 0) {
        console.log(chalk.gray('  No pulse files found in MnemoSync directory.\n'));
        return;
      }
      for (const id of agents) {
        const pulse = readPulse(id);
        if (!pulse) {
          console.log(chalk.yellow(`  ⚠  No pulse found for agent: ${id}`));
          continue;
        }
        printPulse(pulse);
      }
    } catch (e: unknown) {
      console.log(chalk.red(`  ✖  ${e instanceof Error ? e.message : String(e)}\n`));
      process.exit(1);
    }
  });

function printPulse(p: ReturnType<typeof readPulse>): void {
  if (!p) return;
  const statusColor = p.status === 'active' ? chalk.green : p.status === 'blocked' ? chalk.red : chalk.gray;
  const fac = Math.round((p.fac_charge ?? 0) * 10);
  const bar = chalk.hex('#8B5CF6')('█'.repeat(fac)) + chalk.gray('░'.repeat(10 - fac));
  const blocks = p.blocks ?? [];
  const ts = p.timestamp ?? 'unknown';

  console.log(chalk.white(`  ● ${p.agent_id}`) + chalk.gray(` — ${p.soul_profile ?? ''}`));
  console.log(`    Status : ${statusColor(p.status ?? 'idle')}`);
  console.log(`    Zone   : ${chalk.cyan(p.zone ?? '')}`);
  const intent = p.intent ?? '';
  console.log(`    Intent : ${chalk.gray(intent.slice(0, 80) + (intent.length > 80 ? '…' : ''))}`);
  console.log(`    FAC    : ${bar} ${Math.round((p.fac_charge ?? 0) * 100)}%`);
  console.log(`    Time   : ${chalk.gray(ts)}`);
  if (blocks.length > 0) {
    console.log(`    Blocks : ${chalk.red(blocks.join(', '))}`);
  }
  console.log();
}


// ── resonance inbox ───────────────────────────────────────────────────────────
const inboxCommand = new Command('inbox')
  .description('Read inbox messages for an agent')
  .requiredOption('-a, --agent <id>', 'Agent ID to read inbox for')
  .option('--mark-read', 'Mark all messages as read after displaying')
  .option('--unread-only', 'Show only unread messages')
  .action((opts) => {
    console.log(HEADER);
    try {
      const messages = readInbox(opts.agent);
      const filtered = opts.unreadOnly ? messages.filter(m => !m.read) : messages;

      if (filtered.length === 0) {
        console.log(chalk.gray(`  📭  No ${opts.unreadOnly ? 'unread ' : ''}messages for agent: ${opts.agent}\n`));
        return;
      }

      console.log(chalk.white(`  📬  Inbox for ${chalk.hex('#8B5CF6')(opts.agent)} — ${filtered.length} message(s)\n`));

      for (const msg of filtered) {
        const priorityColor = msg.priority === 'critical' ? chalk.red
          : msg.priority === 'high' ? chalk.yellow
          : msg.priority === 'medium' ? chalk.cyan
          : chalk.gray;
        const priorityEmoji = { low: '🟢', medium: '🟡', high: '🔴', critical: '🚨' }[msg.priority] ?? '🟢';
        const readBadge = msg.read ? chalk.gray('[read]') : chalk.green('[NEW]');

        console.log(
          chalk.white(`  ─── From: ${chalk.hex('#A78BFA')(msg.from)}`) +
          `  ${priorityEmoji} ${priorityColor(msg.priority)}  ${readBadge}`
        );
        if (msg.zone) console.log(chalk.gray(`       Zone: ${msg.zone}`));
        console.log(chalk.gray(`       Type: ${msg.type}  |  ${msg.timestamp}`));
        console.log();
        // Body — indent for readability
        console.log(msg.body.split('\n').map(l => `       ${l}`).join('\n'));
        console.log();
      }

      if (opts.markRead) {
        markInboxRead(opts.agent);
        console.log(chalk.green(`  ✔  All messages marked as read.\n`));
      }
    } catch (e: unknown) {
      console.log(chalk.red(`  ✖  ${e instanceof Error ? e.message : String(e)}\n`));
      process.exit(1);
    }
  });

// ── resonance send ────────────────────────────────────────────────────────────
const sendCommand = new Command('send')
  .description('Send a message from one agent to another')
  .requiredOption('--from <id>', 'Sender agent ID')
  .requiredOption('--to <id>', 'Recipient agent ID')
  .requiredOption('--message <text>', 'Message body (markdown supported)')
  .option('--type <type>', 'Directive type: task | review | test | block | approve | info', 'info')
  .option('--priority <level>', 'Priority: low | medium | high | critical', 'medium')
  .option('--zone <path>', 'Relevant file or directory zone')
  .option('--category <cat>', 'Event category: code | test | decision | message | blocker | qa | merge | directive')
  .action((opts) => {
    console.log(HEADER);
    try {
      const msg = sendMessage(
        opts.from,
        opts.to,
        opts.message,
        opts.type as DirectiveType,
        opts.priority as MessagePriority,
        opts.zone
      );

      // Update sender pulse with category tag
      const categoryTag = opts.category as EventCategory | undefined;

      const priorityEmoji = { low: '🟢', medium: '🟡', high: '🔴', critical: '🚨' }[msg.priority] ?? '🟢';
      console.log(chalk.green(`  ✔  Message sent!`));
      console.log(chalk.gray(`     From   : `) + chalk.white(msg.from));
      console.log(chalk.gray(`     To     : `) + chalk.hex('#A78BFA')(msg.to));
      console.log(chalk.gray(`     Type   : `) + chalk.white(msg.type));
      console.log(chalk.gray(`     Prio   : `) + `${priorityEmoji} ${msg.priority}`);
      if (msg.zone) console.log(chalk.gray(`     Zone   : `) + chalk.cyan(msg.zone));

      // Also update the sender's pulse with this send event
      try {
        const dir = resolveMnemoSyncDir();
        const existing = readPulse(msg.from, dir);
        if (existing) {
          writePulse({
            agent_id: msg.from,
            intent: `Sent ${msg.type} message to ${msg.to}: ${msg.body.slice(0, 60)}…`,
            ...(categoryTag && { category: categoryTag }),
          }, dir);
        }
      } catch {
        // Non-critical — don't fail the send
      }

      console.log();
    } catch (e: unknown) {
      console.log(chalk.red(`  ✖  ${e instanceof Error ? e.message : String(e)}\n`));
      process.exit(1);
    }
  });

// ── resonance agents ──────────────────────────────────────────────────────────
const agentsCommand = new Command('agents')
  .description('List all known agents and their current status')
  .action(() => {
    console.log(HEADER);
    try {
      const agents = listAgents();
      if (agents.length === 0) {
        console.log(chalk.gray('  No agents found in MnemoSync directory.\n'));
        return;
      }
      console.log(chalk.white(`  Active agents: ${agents.length}\n`));
      for (const id of agents) {
        const pulse = readPulse(id);
        if (pulse) printPulse(pulse);
        else console.log(chalk.gray(`  ● ${id}  (no pulse data)\n`));
      }
    } catch (e: unknown) {
      console.log(chalk.red(`  ✖  ${e instanceof Error ? e.message : String(e)}\n`));
      process.exit(1);
    }
  });

// ── resonance watch ───────────────────────────────────────────────────────────
const watchCommand = new Command('watch')
  .description('Live stream of inbox messages and pulse changes (Ctrl+C to stop)')
  .requiredOption('-a, --agent <id>', 'Agent ID to watch inbox for')
  .option('--interval <ms>', 'Poll interval in milliseconds', '2000')
  .option('--pulse', 'Also watch for pulse changes from other agents')
  .option('--category <cat>', 'Filter events by category (code|test|decision|message|blocker|qa|merge|directive)')
  .action((opts) => {
    const agentId = opts.agent;
    const interval = Math.max(parseInt(opts.interval, 10) || 2000, 500);
    const watchPulse = !!opts.pulse;
    const filterCategory = opts.category as EventCategory | undefined;

    console.log(HEADER);
    console.log(chalk.white(`  👁  Watching inbox for ${chalk.hex('#8B5CF6')(agentId)}`) + chalk.gray(` — poll every ${interval}ms`));
    if (filterCategory) console.log(chalk.gray(`     Filter: category = ${filterCategory}`));
    if (watchPulse)  console.log(chalk.gray('     Pulse watch: ON'));
    console.log(chalk.gray('  Press Ctrl+C to stop.\n'));

    // State tracking
    const seenMessages = new Set<string>();
    const lastPulseTs: Record<string, string> = {};

    // Seed seen messages (don't notify on existing unread at start)
    try {
      const initial = readInbox(agentId);
      for (const m of initial) seenMessages.add(`${m.from}-${m.timestamp}`);
    } catch { /* ignore */ }

    // Seed pulse timestamps
    if (watchPulse) {
      try {
        for (const id of listAgents()) {
          if (id === agentId) continue;
          const p = readPulse(id);
          if (p?.timestamp) lastPulseTs[id] = p.timestamp;
        }
      } catch { /* ignore */ }
    }

    const tick = () => {
      try {
        // ── Inbox check ─────────────────────────────────────────────────
        const messages = readInbox(agentId);
        for (const msg of messages) {
          const key = `${msg.from}-${msg.timestamp}`;
          if (seenMessages.has(key)) continue;
          seenMessages.add(key);
          if (msg.read) continue;

          // Category filter
          if (filterCategory && msg.type !== filterCategory) continue;

          const priorityEmoji = { low: '🟢', medium: '🟡', high: '🔴', critical: '🚨' }[msg.priority] ?? '🟢';
          const ts = new Date().toLocaleTimeString();
          console.log(chalk.hex('#8B5CF6')(`  [${ts}] `) + chalk.white('📬 NEW MESSAGE'));
          console.log(`         From : ${chalk.hex('#A78BFA')(msg.from)}  ${priorityEmoji} ${msg.priority}  [${msg.type}]`);
          if (msg.zone) console.log(chalk.gray(`         Zone : ${msg.zone}`));
          console.log(chalk.gray(`         ${msg.body.split('\n')[0].slice(0, 80)}`));
          console.log();
        }

        // ── Pulse watch ─────────────────────────────────────────────────
        if (watchPulse) {
          for (const id of listAgents()) {
            if (id === agentId) continue;
            const p = readPulse(id);
            if (!p?.timestamp) continue;
            if (lastPulseTs[id] === p.timestamp) continue;
            lastPulseTs[id] = p.timestamp;

            // Category filter on pulse
            if (filterCategory && p.category !== filterCategory) continue;

            const statusEmoji = p.status === 'active' ? '🟢' : p.status === 'blocked' ? '🔴' : '⚪';
            const ts = new Date().toLocaleTimeString();
            console.log(chalk.hex('#8B5CF6')(`  [${ts}] `) + chalk.white(`⚡ PULSE UPDATE — ${id}`));
            console.log(`         ${statusEmoji} ${p.status}  ·  ${chalk.cyan(p.zone ?? '')}`);
            console.log(chalk.gray(`         ${(p.intent ?? '').slice(0, 80)}`));
            if (p.category) console.log(chalk.gray(`         category: ${p.category}`));
            console.log();
          }
        }
      } catch { /* ignore errors during watch */ }
    };

    const timer = setInterval(tick, interval);
    process.on('SIGINT', () => {
      clearInterval(timer);
      console.log(chalk.gray('\n  👁  Watch stopped.\n'));
      process.exit(0);
    });
  });

// ── resonance (parent command) ────────────────────────────────────────────────
export const resonanceCommand = new Command('resonance')
  .description('Multi-agent Resonance Bridge protocol — pulse, inbox, send, agents, watch')
  .addCommand(pulseCommand)
  .addCommand(inboxCommand)
  .addCommand(sendCommand)
  .addCommand(agentsCommand)
  .addCommand(watchCommand);
