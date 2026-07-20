// ─────────────────────────────────────────────────────────────────────────────
// MnemoForge — workspace + project commands
// ─────────────────────────────────────────────────────────────────────────────
import { Command } from 'commander';
import chalk from 'chalk';
import { getInquirer } from '../lib/lazy.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DEFAULT_VAULT, loadVaultConfig, saveVaultConfig, type VaultConfig } from '../lib/vault.js';

// ── workspace ─────────────────────────────────────────────────────────────
export const workspaceCommand = new Command('workspace')
  .description('Workspace & Resonance Project memory — rules that survive IDE sessions');

workspaceCommand
  .command('init')
  .description('Initialize a Workspace (ecosystem / org container) in the current directory')
  .option('--name <name>', 'Workspace name (e.g. Mnemosyne-OS)')
  .action(async (opts: any) => {
    const inquirer = await getInquirer();
    console.log(chalk.hex('#8B5CF6').bold('\n⬡  MnemoWorkspace — Init\n'));
    const answers = await inquirer.prompt([
      { type: 'input', name: 'name', message: 'Workspace name (e.g. Mnemosyne-OS):',
        default: opts.name ?? path.basename(process.cwd()), when: !opts.name },
    ]);
    const name: string = opts.name ?? answers.name;
    const wsPath = path.join(process.cwd(), '.cli_resonance', 'WORKSPACE.json');
    const existing = fs.existsSync(wsPath) ? JSON.parse(fs.readFileSync(wsPath, 'utf8')) : {};
    const ws = { ...existing, workspace: name, workspace_version: '0.1',
      last_updated: new Date().toISOString().slice(0, 10), updated_by: 'mnemoforge workspace init' };
    fs.mkdirSync(path.join(process.cwd(), '.cli_resonance'), { recursive: true });
    fs.writeFileSync(wsPath, JSON.stringify(ws, null, 2), 'utf8');
    console.log(chalk.green(`  ✔  Workspace "${name}" initialized\n`));
    console.log(chalk.gray(`     → .cli_resonance/WORKSPACE.json\n`));
    console.log(chalk.cyan('  Next: ') + chalk.white('mnemoforge project init') + chalk.gray('  ← create a Resonance Project\n'));
  });

workspaceCommand
  .command('show')
  .description('Show workspace rules (agent briefing before starting work)')
  .action(async () => {
    const inquirer = await getInquirer();
    const config = loadVaultConfig();
    const wsPath = path.join(process.cwd(), '.cli_resonance', 'WORKSPACE.json');
    const globalWsPath = path.join(
      config?.vaultPath ?? path.join(os.homedir(), 'Documents', 'MnemoVault'),
      '.cli_resonance', 'WORKSPACE.json'
    );
    const target = fs.existsSync(wsPath) ? wsPath : fs.existsSync(globalWsPath) ? globalWsPath : null;

    console.log(chalk.hex('#8B5CF6').bold('\n⬡  MnemoWorkspace — Agent Briefing\n'));
    if (!target) {
      console.log(chalk.yellow('  ⚠  No WORKSPACE.json found.'));
      console.log(chalk.gray('     Run from a project root or use: mnemoforge workspace init\n'));
      return;
    }

    const ws = JSON.parse(fs.readFileSync(target, 'utf8'));
    console.log(chalk.cyan(`  Project  : `) + chalk.white(ws.project ?? '—'));
    console.log(chalk.cyan(`  Version  : `) + chalk.gray(ws.version ?? '—'));
    console.log(chalk.cyan(`  Source   : `) + chalk.gray(target));
    if (config?.workspace) console.log(chalk.cyan(`  Vault ws : `) + chalk.gray(config.workspace));

    const printRules = (label: string, rules: string[]) => {
      if (!rules?.length) return;
      console.log(chalk.hex('#8B5CF6')(`\n  ▸ ${label}`));
      rules.forEach(r => console.log(chalk.gray('    • ') + r));
    };
    Object.entries(ws).forEach(([key, val]: [string, any]) => {
      if (val?.rules?.length) printRules(key, val.rules);
    });
    if (ws.neural_coding?.principles?.length) printRules('neural_coding.principles', ws.neural_coding.principles);
    console.log(chalk.gray(`\n  Last updated: ${ws.last_updated ?? '—'} by ${ws.updated_by ?? '—'}\n`));
  });

workspaceCommand
  .command('add-rule')
  .description('Append a rule to the workspace safety memory')
  .argument('<rule>', 'The rule text to add')
  .option('--section <section>', 'Section to add to (npm | architecture | dev)', 'dev')
  .action(async (rule: string, opts: any) => {
    const inquirer = await getInquirer();
    const wsPath = path.join(process.cwd(), '.cli_resonance', 'WORKSPACE.json');
    if (!fs.existsSync(wsPath)) {
      console.log(chalk.red('\n  ✖  No WORKSPACE.json in current directory.\n'));
      process.exit(1);
    }
    const ws = JSON.parse(fs.readFileSync(wsPath, 'utf8'));
    const section = opts.section ?? 'dev';
    if (!ws[section]) ws[section] = {};
    if (!ws[section].rules) ws[section].rules = [];
    ws[section].rules.push(rule);
    ws.last_updated = new Date().toISOString().slice(0, 10);
    ws.updated_by = 'agent (auto)';
    fs.writeFileSync(wsPath, JSON.stringify(ws, null, 2), 'utf8');
    console.log(chalk.hex('#8B5CF6').bold('\n⬡  MnemoWorkspace — Rule Added\n'));
    console.log(chalk.green(`  ✔  [${section}] ${rule}\n`));
  });

// ── project ───────────────────────────────────────────────────────────────
export const projectCommand = new Command('project')
  .description('Resonance Project — a component or feature within a Workspace');

projectCommand
  .command('init')
  .description('Initialize a Resonance Project — links a workspace + project to the vault')
  .action(async () => {
    const inquirer = await getInquirer();
    console.log(chalk.hex('#8B5CF6').bold('\n⬡  Resonance Project — Init\n'));
    const wsPath = path.join(process.cwd(), '.cli_resonance', 'WORKSPACE.json');
    const wsData = fs.existsSync(wsPath) ? JSON.parse(fs.readFileSync(wsPath, 'utf8')) : {};
    const existingConfig = loadVaultConfig();

    const answers = await inquirer.prompt([
      { type: 'input', name: 'workspace', message: 'Workspace name (ecosystem / org):', default: wsData.workspace ?? 'Mnemosyne-OS' },
      { type: 'input', name: 'resonanceProject', message: 'Resonance Project name (feature / component):', default: path.basename(process.cwd()) },
    ]);

    const config: VaultConfig = {
      ...(existingConfig ?? { vaultPath: DEFAULT_VAULT, ide: 'Antigravity', provider: 'Anthropic' }),
      workspace: answers.workspace, resonanceProject: answers.resonanceProject,
    };
    saveVaultConfig(config);

    const ws = { ...wsData, workspace: answers.workspace, resonanceProject: answers.resonanceProject,
      last_updated: new Date().toISOString().slice(0, 10) };
    fs.mkdirSync(path.join(process.cwd(), '.cli_resonance'), { recursive: true });
    fs.writeFileSync(wsPath, JSON.stringify(ws, null, 2), 'utf8');
    fs.mkdirSync(path.join(process.cwd(), 'handbook', 'chronicles'), { recursive: true });

    console.log(chalk.green(`\n  ✔  Resonance Project "${answers.resonanceProject}" initialized\n`));
    console.log(chalk.cyan('  Workspace    : ') + chalk.white(answers.workspace));
    console.log(chalk.cyan('  Project      : ') + chalk.white(answers.resonanceProject));
    console.log(chalk.cyan('  Vault path   : ') + chalk.gray(`${config.vaultPath}/${answers.workspace}/${answers.resonanceProject}/`));
    console.log(chalk.cyan('  Chronicles   : ') + chalk.gray('./handbook/chronicles/\n'));
  });
