// ─────────────────────────────────────────────────────────────────────────────
// MnemoChronicle — Writer commands: commit · sweep · archive
// ─────────────────────────────────────────────────────────────────────────────
import { Command } from 'commander';
import chalk from 'chalk';
import { getInquirer } from '../../lib/lazy.js';

import fs from 'fs';
import path from 'path';
import { loadVaultConfig, resolveChronicleDir, listChronicles } from '../../lib/vault.js';
import { writeChronicle, buildSweepContent } from '../../lib/chronicle.js';
import { readSourceForConfig, generateChronicleDraft } from '../../lib/sources/index.js';

export const writerCmd = new Command();

writerCmd
  .command('commit')
  .description('Write a new Chronicle to the vault')
  .option('-t, --title <title>', 'Chronicle title')
  .option('--type <type>', 'Chronicle style: session | reflection | decision | sweep | narcissus')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--auto', 'Auto-generate draft and open in VS Code')
  .action(async (opts: any) => {
    const config = loadVaultConfig();
    if (!config) { console.log(chalk.red('\n  ✖  Not initialized. Run: mnemoforge chronicle init\n')); process.exit(1); }
    console.log(chalk.hex('#8B5CF6').bold('\n⬡  MnemoChronicle — New Chronicle\n'));

    const tags = opts.tags ? opts.tags.split(',').map((t: string) => t.trim()) : [];

    if (opts.auto) {
      console.log(chalk.cyan('  ⟳  Reading conversation source…'));
      const ctx = readSourceForConfig(config);
      let draftContent = '', draftTitle = opts.title ?? 'Session chronicle';
      if (ctx) {
        draftContent = generateChronicleDraft(ctx, config);
        draftTitle   = opts.title || ctx.sessionTitle.slice(0, 60) || draftTitle;
        console.log(chalk.green(`  ✔  Draft from: ${ctx.conversationId.slice(0, 8)}…  ·  ${ctx.filesTouched.length} files · ${ctx.keyDecisions.length} decisions`));
      } else {
        console.log(chalk.yellow('  ⚠  No source — blank template.\n'));
        draftContent = generateChronicleDraft({ conversationId: 'manual', startedAt: null, sessionTitle: draftTitle, filesTouched: [], commandsRun: [], keyDecisions: [], rawTurns: [], sourcePath: '' }, config);
      }
      const { filePath, filename } = writeChronicle({ title: draftTitle, type: (opts.type ?? config.defaultChronicleStyle ?? 'session') as any, content: draftContent, tags, config });
      console.log(chalk.green(`\n  ✔  ${filename}`) + chalk.gray(`\n     ${filePath}`));
      console.log(chalk.cyan('\n  Opening in VS Code…\n'));
      try { const { spawn } = await import('child_process'); spawn('code', [filePath], { detached: true, stdio: 'ignore', shell: true }).unref(); } catch { /**/ }
      return;
    }

    const inquirer = await getInquirer();
    const answers = await (inquirer as any).prompt([
      { type: 'input', name: 'title', message: chalk.cyan('Title?'), default: opts.title, when: !opts.title, validate: (v: string) => v.trim() !== '' || 'Required' },
      { type: 'input', name: 'content', message: chalk.cyan('Short summary') + chalk.gray(' (edit after)'), default: '' },
    ]);
    const { filePath, filename } = writeChronicle({ title: opts.title || answers.title, type: (opts.type ?? config.defaultChronicleStyle ?? 'session') as any, content: answers.content, tags, config });
    console.log(chalk.green(`\n  ✔  ${filename}`) + chalk.gray(`\n     ${filePath}\n`));
    console.log(chalk.gray(`  Tip: use `) + chalk.white('--auto') + chalk.gray(' to generate a full draft automatically.\n'));
  });

writerCmd
  .command('sweep')
  .description('Create a daily sweep Chronicle from recent entries')
  .action(async () => {
    const config = loadVaultConfig();
    if (!config) { console.log(chalk.red('\n  ✖  Not initialized.\n')); process.exit(1); }
    const today = new Date().toISOString().slice(0, 10);
    const recent = listChronicles(config).filter(f => f.includes(today));
    console.log(chalk.hex('#8B5CF6').bold('\n⬡  MnemoChronicle — Daily Sweep\n'));
    console.log(chalk.gray(`  Found ${recent.length} chronicle(s) from today (${today})\n`));
    if (recent.length === 0) { console.log(chalk.yellow('  No chronicles today to sweep.\n')); return; }
    const inquirer = await getInquirer();
    const { ok } = await (inquirer as any).prompt([{ type: 'confirm', name: 'ok', message: `Create sweep from ${recent.length} chronicle(s)?`, default: true }]);
    if (!ok) return;
    const sweepContent = buildSweepContent(recent, config);
    const { filePath, filename } = writeChronicle({ title: `Daily Sweep — ${today}`, type: 'sweep', content: sweepContent, tags: ['sweep', today], config });
    console.log(chalk.green(`\n  ✔  ${filename}`) + chalk.gray(`\n     ${filePath}\n`));
  });

writerCmd
  .command('archive')
  .description('Archive an agent-written .md file into the vault')
  .option('-f, --file <path>', 'Path to the .md chronicle file')
  .action(async (opts: any) => {
    const config = loadVaultConfig();
    if (!config)   { console.log(chalk.red('\n  ✖  Not initialized.\n')); process.exit(1); }
    if (!opts.file){ console.log(chalk.red('\n  ✖  Specify --file <path>\n')); process.exit(1); }
    const srcPath = path.resolve(opts.file);
    if (!fs.existsSync(srcPath)) { console.log(chalk.red(`\n  ✖  File not found: ${srcPath}\n`)); process.exit(1); }
    const destDir = resolveChronicleDir(config);
    fs.mkdirSync(destDir, { recursive: true });
    const filename = path.basename(srcPath);
    fs.copyFileSync(srcPath, path.join(destDir, filename));
    console.log(chalk.hex('#8B5CF6').bold('\n⬡  MnemoChronicle — Archived\n'));
    console.log(chalk.green(`  ✔  ${filename}`) + chalk.gray(`\n     → ${path.join(destDir, filename)}\n`));
  });
