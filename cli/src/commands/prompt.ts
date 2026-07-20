// ─────────────────────────────────────────────────────────────────────────────
// MnemoForge — prompt commands
// Manage chronicle prompt templates (list, show, create, edit, pack)
// ─────────────────────────────────────────────────────────────────────────────
import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import { getInquirer } from '../lib/lazy.js';
import { listTemplates, getTemplate, saveCustomTemplate, listPacks, seedBuiltins } from '../lib/prompt-engine/store.js';
import { stripFrontmatter } from '../lib/prompt-engine/renderer.js';

export const promptCommand = new Command('prompt')
  .description('Manage chronicle prompt templates (list, show, create, edit, pack)');

promptCommand
  .command('list')
  .description('Browse prompt templates interactively (arrow keys + Enter)')
  .action(async () => {
    seedBuiltins();
    const inquirer = await getInquirer();

    const SOURCE_ICONS: Record<string, string> = { custom: '★', pack: '◆', 'built-in': '◈' };
    const SOURCE_COLORS: Record<string, chalk.Chalk> = {
      custom:    chalk.hex('#4ADE80'),
      pack:      chalk.hex('#FBBF24'),
      'built-in': chalk.hex('#6B7280'),
    };

    while (true) {
      const templates = listTemplates();

      const choices = templates.map(t => ({
        name: `  ${SOURCE_ICONS[t.source] ?? '○'}  ${SOURCE_COLORS[t.source](t.source.padEnd(10))}  ${chalk.white(t.name.padEnd(14))}  ${chalk.hex('#64748B')(t.description)}`,
        value: t.name,
        short: t.name,
      }));
      choices.push({ name: chalk.hex('#475569')('  ✖  Exit'), value: '__exit__', short: 'exit' });

      console.log(chalk.hex('#8B5CF6').bold('\n  ⬡  MnemoForge — Prompt Templates\n'));
      const { selected } = await (inquirer as any).prompt([{
        type: 'list', name: 'selected',
        message: chalk.hex('#A78BFA')('Select a template  ') + chalk.gray('(↑↓ + Enter)'),
        choices, pageSize: 12,
      }]);

      if (selected === '__exit__') { console.log(chalk.gray('\n  Closed.\n')); break; }

      // ── Render template ────────────────────────────────────────────────────
      const tpl = getTemplate(selected)!;
      const body = stripFrontmatter(tpl.content);
      const lines = body.split('\n');
      const srcColor = SOURCE_COLORS[tpl.source];

      console.log();
      console.log(chalk.hex('#8B5CF6').bold(`  ⬡  ${tpl.name}`) + '  ' + srcColor(`[${tpl.source}]`));
      console.log(chalk.gray(`  ${tpl.description}`));
      console.log(chalk.hex('#334155')('  ' + '─'.repeat(58)));
      lines.forEach(l => console.log('  ' + chalk.white(l)));
      console.log(chalk.hex('#334155')('  ' + '─'.repeat(58)));
      console.log(chalk.hex('#64748B')(`\n  Path: ${tpl.filePath}\n`));
    }
  });

// ── prompt show <name> ────────────────────────────────────────────────────────
promptCommand
  .command('show <name>')
  .description('Display the content of a prompt template')
  .action((name: string) => {
    const tpl = getTemplate(name);
    if (!tpl) {
      console.log(chalk.red(`\n  ✖  Template "${name}" not found. Run: mnemoforge prompt list\n`));
      process.exit(1);
    }

    const srcLabel = tpl.source === 'custom'
      ? chalk.hex('#4ADE80')('[custom]')
      : tpl.source === 'pack'
        ? chalk.hex('#FBBF24')(`[pack:${tpl.packName}]`)
        : chalk.hex('#6B7280')('[built-in]');

    console.log(chalk.hex('#8B5CF6').bold(`\n  ⬡  Template: ${tpl.name}  ${srcLabel}\n`));
    console.log(chalk.gray(`  Path: ${tpl.filePath}\n`));
    console.log(chalk.hex('#334155')('  ' + '─'.repeat(60)));
    console.log(tpl.content.split('\n').map(l => '  ' + l).join('\n'));
    console.log(chalk.hex('#334155')('  ' + '─'.repeat(60)) + '\n');
  });

// ── prompt create ─────────────────────────────────────────────────────────────
promptCommand
  .command('create')
  .description('Create a new custom prompt template (interactive)')
  .action(async () => {
    const inquirer = await getInquirer();
    seedBuiltins();
    console.log(chalk.hex('#8B5CF6').bold('\n  ⬡  Create Prompt Template\n'));
    console.log(chalk.gray('  Available variables: {{SESSION_TITLE}} {{FILES_TOUCHED}} {{KEY_DECISIONS}} {{COMMANDS_RUN}} {{DATE}} {{CONVERSATION_ID}}\n'));

    const answers = await (inquirer as any).prompt([
      {
        type: 'input',
        name: 'name',
        message: chalk.hex('#A78BFA')('Template name (slug, e.g. my-review):'),
        validate: (v: string) => /^[a-z0-9-]+$/.test(v.trim()) || 'Lowercase letters, numbers, hyphens only',
      },
      {
        type: 'input',
        name: 'description',
        message: chalk.hex('#A78BFA')('Short description:'),
        validate: (v: string) => v.trim().length > 0 || 'Required',
      },
      {
        type: 'list',
        name: 'startFrom',
        message: chalk.hex('#A78BFA')('Start from:'),
        choices: [
          { name: 'Blank template', value: 'blank' },
          { name: 'Copy from built-in: session', value: 'session' },
          { name: 'Copy from built-in: reflection', value: 'reflection' },
          { name: 'Copy from built-in: decision', value: 'decision' },
          { name: 'Copy from built-in: narcissus', value: 'narcissus' },
        ],
      },
    ]);

    const { name, description, startFrom } = answers;

    let content: string;
    if (startFrom === 'blank') {
      content = [
        '---',
        `name: ${name}`,
        `description: ${description}`,
        'variables: [SESSION_TITLE, DATE]',
        '---',
        `# {{SESSION_TITLE}}`,
        '',
        '> *Your template content here.*',
        '',
        '---',
        '*Chronicle auto-generated — {{DATE}} · {{CONVERSATION_ID}}*',
        '',
      ].join('\n');
    } else {
      const base = getTemplate(startFrom);
      content = base ? base.content.replace(/^name:.*$/m, `name: ${name}`).replace(/^description:.*$/m, `description: ${description}`) : '';
    }

    const filePath = saveCustomTemplate(name, content);
    console.log(chalk.hex('#4ADE80').bold(`\n  ✔  Template "${name}" created\n`));
    console.log(chalk.gray(`  ${filePath}\n`));

    // Open in VS Code
    const { openEditor } = await (inquirer as any).prompt([{
      type: 'confirm', name: 'openEditor',
      message: chalk.hex('#A78BFA')('Open in VS Code to edit?'),
      default: true,
    }]);
    if (openEditor) {
      try {
        const { spawn } = await import('child_process');
        spawn('code', [filePath], { detached: true, stdio: 'ignore', shell: true }).unref();
      } catch { /* VS Code not available */ }
    }
  });

// ── prompt edit <name> ────────────────────────────────────────────────────────
promptCommand
  .command('edit <name>')
  .description('Edit an existing prompt template in VS Code')
  .action(async (name: string) => {
    const inquirer = await getInquirer();
    seedBuiltins();
    const tpl = getTemplate(name);
    if (!tpl) {
      console.log(chalk.red(`\n  ✖  Template "${name}" not found.\n`));
      process.exit(1);
    }

    let targetPath = tpl.filePath;

    // If built-in, copy to custom first
    if (tpl.source === 'built-in') {
      const { confirm } = await (inquirer as any).prompt([{
        type: 'confirm', name: 'confirm',
        message: chalk.yellow(`  "${name}" is a built-in. Copy to custom/ to edit?`),
        default: true,
      }]);
      if (!confirm) return;
      targetPath = saveCustomTemplate(name, tpl.content);
      console.log(chalk.hex('#4ADE80')(`  ✔  Copied to custom: ${targetPath}`));
    }

    console.log(chalk.cyan(`\n  Opening ${name} in VS Code...\n`));
    try {
      const { spawn } = await import('child_process');
      spawn('code', [targetPath], { detached: true, stdio: 'ignore', shell: true }).unref();
    } catch {
      console.log(chalk.gray(`  Edit manually: ${targetPath}`));
    }
  });

// ── prompt pack list ──────────────────────────────────────────────────────────
const packCmd = promptCommand.command('pack').description('Manage template packs');

packCmd
  .command('list')
  .description('List installed template packs')
  .action(() => {
    const packs = listPacks();
    console.log(chalk.hex('#8B5CF6').bold('\n  ⬡  Template Packs\n'));

    if (packs.length === 0) {
      console.log(chalk.gray('  No packs installed.\n'));
      console.log(chalk.gray(`  Install a pack by placing it in:`));
      console.log(chalk.white(`  ~/.mnemoforge/packs/<pack-name>/\n`));
      console.log(chalk.gray('  A pack folder must contain: pack.json + templates/*.md\n'));
      return;
    }

    for (const pack of packs) {
      console.log(`  ◆  ${chalk.white(pack.name)}`);
      console.log(chalk.gray(`       Templates: ${pack.templates.join(', ') || '(none)'}`));
      console.log(chalk.hex('#334155')(`       Path: ${pack.path}\n`));
    }
  });

packCmd
  .command('install <path>')
  .description('Install a local template pack from a directory path')
  .action(async (packPath: string) => {
    const inquirer = await getInquirer();
    const resolved = require('path').resolve(packPath);
    if (!fs.existsSync(resolved)) {
      console.log(chalk.red(`\n  ✖  Path not found: ${resolved}\n`));
      process.exit(1);
    }
    const packName = require('path').basename(resolved);
    const dest = require('path').join(require('os').homedir(), '.mnemoforge', 'packs', packName);

    if (fs.existsSync(dest)) {
      const { overwrite } = await (inquirer as any).prompt([{
        type: 'confirm', name: 'overwrite',
        message: chalk.yellow(`  Pack "${packName}" already installed. Overwrite?`),
        default: false,
      }]);
      if (!overwrite) return;
      fs.rmSync(dest, { recursive: true });
    }

    fs.cpSync(resolved, dest, { recursive: true });
    console.log(chalk.hex('#4ADE80').bold(`\n  ✔  Pack "${packName}" installed\n`));
    console.log(chalk.gray('  Run mnemoforge prompt pack list to verify.\n'));
  });
