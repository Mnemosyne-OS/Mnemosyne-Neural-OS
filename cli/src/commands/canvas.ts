// ─────────────────────────────────────────────────────────────────────────────
// MnemoForge — canvas commands
// ─────────────────────────────────────────────────────────────────────────────
import { Command } from 'commander';
import chalk from 'chalk';
import { getInquirer } from '../lib/lazy.js';
import { loadVaultConfig } from '../lib/vault.js';
import { CANVAS_TEMPLATES, scaffold } from '../lib/canvas/canvas.js';
import { toSlug } from '../lib/canvas/renderer.js';

export const canvasCommand = new Command('canvas')
  .description('Scaffold a full Mnemosyne-grade project from a template');

// ── canvas (interactive picker) ───────────────────────────────────────────
canvasCommand
  .action(async () => {
    const inquirer = await getInquirer();
    const config = loadVaultConfig();
    const defaultWorkspace = config?.workspace ?? 'Mnemosyne-OS';

    console.log(chalk.hex('#8B5CF6').bold('\n  ⬡  MnemoCanvas — Project Inception\n'));

    const available = CANVAS_TEMPLATES.filter(t => t.files.length > 0);
    const comingSoon = CANVAS_TEMPLATES.filter(t => t.files.length === 0);

    const templateChoices = [
      ...available.map(t => ({
        name: `  ${t.icon}  ${chalk.white(t.name.padEnd(18))}  ${chalk.gray(t.stack)}`,
        value: t.id, short: t.name,
      })),
      new (inquirer as any).Separator(chalk.hex('#312E81')('  ── Coming soon ──')),
      ...comingSoon.map(t => ({
        name: `  ${t.icon}  ${chalk.hex('#475569')(t.name.padEnd(18))}  ${chalk.hex('#334155')(t.stack)}`,
        value: `__soon__${t.id}`, short: t.name,
      })),
      new (inquirer as any).Separator(),
      { name: chalk.hex('#475569')('  ✖  Cancel'), value: '__cancel__', short: 'cancel' },
    ];

    const { templateId } = await (inquirer as any).prompt([{
      type: 'list', name: 'templateId',
      message: chalk.hex('#A78BFA')('Select a template:'),
      choices: templateChoices, pageSize: 12,
    }]);

    if (templateId === '__cancel__') return;
    if (String(templateId).startsWith('__soon__')) {
      console.log(chalk.yellow(`\n  ⏳ This template is not yet available. Coming soon!\n`));
      return;
    }

    const { projectName, workspace, ecosystem, runInstall } = await (inquirer as any).prompt([
      { type: 'input', name: 'projectName', message: chalk.hex('#A78BFA')('Project name:'), validate: (v: string) => v.trim().length > 0 || 'Required' },
      { type: 'input', name: 'workspace', message: chalk.hex('#A78BFA')('Workspace (Resonance):'), default: defaultWorkspace },
      { type: 'input', name: 'ecosystem', message: chalk.hex('#A78BFA')('Ecosystem name (white-label):'), default: 'Mnemosyne Neural OS' },
      { type: 'confirm', name: 'runInstall', message: chalk.hex('#A78BFA')('Run npm install?'), default: false },
    ]);

    const slug = toSlug(projectName);
    console.log(chalk.gray(`\n  ⟳  Scaffolding ${chalk.white(projectName)} into ./${slug}...\n`));

    try {
      const result = scaffold({ projectName, workspace, ecosystem, template: templateId }, (file) => {
        console.log(chalk.hex('#4ADE80')('  ✔  ') + chalk.hex('#6B7280')(file));
      });

      console.log(chalk.hex('#4ADE80').bold(`\n  ✔  ${result.filesCreated.length} files created`));

      if (runInstall) {
        console.log(chalk.gray('\n  ⟳  npm install...'));
        const { execSync } = await import('child_process');
        try {
          execSync('npm install', { cwd: result.rootDir, stdio: 'inherit' });
          console.log(chalk.hex('#4ADE80').bold('  ✔  Dependencies installed'));
        } catch {
          console.log(chalk.yellow('  ⚠  npm install failed — run manually in the project folder'));
        }
      }

      if (result.errors.length > 0) {
        result.errors.forEach(e => console.log(chalk.red(`     ${e}`)));
      }

      console.log(chalk.hex('#8B5CF6').bold(`\n  ⬡  ${projectName} is ready.\n`));
      console.log(chalk.gray('  Next steps:'));
      console.log('  ' + chalk.white(`cd ${slug}`));
      console.log('  ' + chalk.white('mnemoforge chronicle init') + chalk.gray('   ← link your vault'));
      console.log('  ' + chalk.white('mnemoforge workspace show') + chalk.gray('   ← brief your agent'));
      console.log('  ' + chalk.white('npm run dev') + '\n');
    } catch (err: any) {
      console.log(chalk.red(`\n  ✖  ${err.message}\n`));
      process.exit(1);
    }
  });

// ── canvas list ───────────────────────────────────────────────────────────
canvasCommand
  .command('list')
  .description('List all available canvas templates')
  .action(() => {
    console.log(chalk.hex('#8B5CF6').bold('\n  ⬡  MnemoCanvas — Templates\n'));
    for (const t of CANVAS_TEMPLATES) {
      const a = t.files.length > 0;
      const status = a ? chalk.hex('#4ADE80')('✔ available') : chalk.hex('#475569')('⏳ coming soon');
      console.log(`  ${t.icon}  ${chalk.white(t.name.padEnd(20))}  ${status}`);
      console.log(chalk.gray(`       ${t.description}`));
      console.log(chalk.hex('#334155')(`       ${t.stack}\n`));
    }
  });

// ── canvas deploy <template> ──────────────────────────────────────────────
canvasCommand
  .command('deploy <template>')
  .description('Deploy a template directly (non-interactive)')
  .option('--name <name>', 'Project name')
  .option('--workspace <ws>', 'Workspace name', 'Mnemosyne-OS')
  .option('--ecosystem <eco>', 'Ecosystem name (white-label)', 'Mnemosyne Neural OS')
  .option('--dir <dir>', 'Target directory')
  .option('--dry-run', 'Preview files without writing to disk')
  .action(async (templateId: string, opts: any) => {
    const inquirer = await getInquirer();
    const projectName = opts.name ?? templateId;
    const dryRun: boolean = opts.dryRun ?? false;
    console.log(chalk.hex('#8B5CF6').bold('\n  ⬡  MnemoCanvas — Deploy\n'));
    if (dryRun) console.log(chalk.yellow('  [dry-run] No files will be written.\n'));
    try {
      const result = scaffold(
        { projectName, workspace: opts.workspace, ecosystem: opts.ecosystem, targetDir: opts.dir, template: templateId, dryRun },
        (file) => console.log(chalk.hex('#4ADE80')('  ✔  ') + chalk.hex('#6B7280')(file))
      );
      const label = dryRun ? 'files would be created' : 'files created';
      console.log(chalk.hex('#4ADE80').bold(`\n  ✔  ${result.filesCreated.length} ${label} · ${result.rootDir}\n`));
    } catch (err: any) {
      console.log(chalk.red(`\n  ✖  ${err.message}\n`));
      process.exit(1);
    }
  });
