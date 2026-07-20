// ─────────────────────────────────────────────────────────────────────────────
// MnemoForge — forge command (interactive REPL mode)
// A Claude Code-style interactive terminal for MnemoForge commands
// ─────────────────────────────────────────────────────────────────────────────
import { Command } from 'commander';
import chalk from 'chalk';
import readline from 'readline';
import { loadVaultConfig } from '../lib/vault.js';
import { listTemplates } from '../lib/prompt-engine/store.js';

export const forgeCommand = new Command('forge')
  .description('Interactive REPL mode — run MnemoForge commands interactively')
  .action(async () => {
    const config = loadVaultConfig();
    const workspace = config?.workspace ?? 'no vault';
    const style     = config?.defaultChronicleStyle ?? 'session';

    // ── Banner ──────────────────────────────────────────────────────────────
    console.log('\n' + chalk.hex('#8B5CF6').bold('  ⬡  MnemoForge — Forge Mode'));
    console.log(chalk.hex('#4B5563')('  ' + '─'.repeat(48)));
    console.log(chalk.gray(`  Workspace : `) + chalk.white(workspace));
    console.log(chalk.gray(`  Style     : `) + chalk.white(style));
    console.log(chalk.hex('#4B5563')('  ' + '─'.repeat(48)));
    console.log(chalk.gray('  Type a command or ') + chalk.white('help') + chalk.gray(' · ') + chalk.white('Ctrl+C') + chalk.gray(' to exit\n'));

    // ── REPL ────────────────────────────────────────────────────────────────
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.hex('#8B5CF6')('  ⬡ ') + chalk.white('forge') + chalk.hex('#4B5563')(' › '),
    });

    rl.prompt();

    rl.on('line', async (line: string) => {
      const input = line.trim();
      if (!input) { rl.prompt(); return; }

      await handleForgeCommand(input, config);
      rl.prompt();
    });

    rl.on('close', () => {
      console.log(chalk.hex('#8B5CF6').bold('\n  ⬡  Forge session ended. Chronicle the work.\n'));
      process.exit(0);
    });
  });

// ── Command dispatcher ────────────────────────────────────────────────────────

async function handleForgeCommand(input: string, config: any): Promise<void> {
  const [cmd, ...args] = input.split(/\s+/);

  switch (cmd) {

    case 'help':
    case '?':
      showHelp();
      break;

    case 'status':
      showStatus(config);
      break;

    case 'prompt':
      if (args[0] === 'list' || !args[0]) {
        showPromptList();
      } else if (args[0] === 'show' && args[1]) {
        showPromptPreview(args[1]);
      } else {
        hint('prompt list | prompt show <name>');
      }
      break;

    case 'chronicle':
      console.log(chalk.cyan('\n  ⟳  Opening chronicle wizard...\n'));
      console.log(chalk.gray('  Run outside forge: ') + chalk.white('mnemoforge chronicle commit\n'));
      break;

    case 'canvas':
      console.log(chalk.cyan('\n  ⟳  Opening canvas...\n'));
      console.log(chalk.gray('  Run outside forge: ') + chalk.white('mnemoforge canvas\n'));
      break;

    case 'clear':
    case 'cls':
      console.clear();
      console.log(chalk.hex('#8B5CF6').bold('  ⬡  MnemoForge — Forge Mode\n'));
      break;

    case 'exit':
    case 'quit':
    case 'q':
      console.log(chalk.hex('#8B5CF6').bold('\n  ⬡  Forge session ended.\n'));
      process.exit(0);
      break;

    default:
      console.log(chalk.yellow(`\n  ⚠  Unknown command: "${cmd}". Type help for available commands.\n`));
  }
}

// ── Sub-handlers ──────────────────────────────────────────────────────────────

function showHelp(): void {
  const cmds = [
    ['help', 'Show this help'],
    ['status', 'Show current vault + config'],
    ['prompt list', 'List all prompt templates'],
    ['prompt show <name>', 'Preview a prompt template'],
    ['chronicle', 'How to write a chronicle'],
    ['canvas', 'How to scaffold a project'],
    ['clear', 'Clear the terminal'],
    ['exit', 'Exit forge mode'],
  ];

  console.log(chalk.hex('#8B5CF6').bold('\n  ⬡  Forge Commands\n'));
  for (const [cmd, desc] of cmds) {
    console.log(`  ${chalk.white(cmd.padEnd(26))} ${chalk.gray(desc)}`);
  }
  console.log();
}

function showStatus(config: any): void {
  if (!config) {
    console.log(chalk.yellow('\n  ⚠  No vault found. Run: mnemoforge chronicle init\n'));
    return;
  }
  console.log(chalk.hex('#8B5CF6').bold('\n  ⬡  Vault Status\n'));
  console.log(`  ${chalk.gray('Workspace')}  ${chalk.white(config.workspace)}`);
  console.log(`  ${chalk.gray('IDE      ')}  ${chalk.white(config.ide)}`);
  console.log(`  ${chalk.gray('Provider ')}  ${chalk.white(config.provider)}`);
  console.log(`  ${chalk.gray('Style    ')}  ${chalk.white(config.defaultChronicleStyle ?? 'session')}`);
  console.log();
}

function showPromptList(): void {
  const templates = listTemplates();
  console.log(chalk.hex('#8B5CF6').bold('\n  ⬡  Prompt Templates\n'));
  for (const t of templates) {
    const src = t.source === 'custom'
      ? chalk.hex('#4ADE80')('[custom]')
      : chalk.hex('#6B7280')('[built-in]');
    console.log(`  ◈  ${chalk.white(t.name.padEnd(16))} ${src}  ${chalk.gray(t.description)}`);
  }
  console.log();
}

function showPromptPreview(name: string): void {
  const { getTemplate } = require('../lib/prompt-engine/store.js');
  const tpl = getTemplate(name);
  if (!tpl) {
    console.log(chalk.red(`\n  ✖  Template "${name}" not found.\n`));
    return;
  }
  console.log(chalk.hex('#8B5CF6').bold(`\n  ⬡  ${tpl.name} template\n`));
  const lines = tpl.content.split('\n').slice(0, 20);
  for (const l of lines) console.log(chalk.gray('  ') + l);
  if (tpl.content.split('\n').length > 20) console.log(chalk.hex('#4B5563')('  ...'));
  console.log();
}

function hint(msg: string): void {
  console.log(chalk.yellow(`\n  ⚠  Usage: ${msg}\n`));
}
