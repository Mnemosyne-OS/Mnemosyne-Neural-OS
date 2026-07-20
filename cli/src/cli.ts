#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// MnemoForge CLI — Entry Point
// Mnemosyne Neural OS · AI Inception Engine · XPACEGEMS LLC
// ─────────────────────────────────────────────────────────────────────────────

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';


import { loadVaultConfig, saveVaultConfig, loadCustomModels, saveCustomModels, importFromModelCard, type VaultConfig, type RegisteredModel } from './lib/vault.js';
import { askPrimaryProfile, askExtraProfile } from './lib/init-flow.js';
import { ASCII, showWelcome } from './lib/ui.js';

import { workspaceCommand, projectCommand } from './commands/workspace.js';
import { chronicleCommand } from './commands/chronicle/index.js';
import { canvasCommand } from './commands/canvas.js';
import { promptCommand } from './commands/prompt.js';
import { forgeCommand } from './commands/forge.js';
import { configCommand } from './commands/config.js';
import { soulCommand } from './commands/soul/index.js';
import { resonanceCommand } from './commands/resonance.js';
import { mnemoSyncCommand } from './commands/mnemosync.js';
import { devCommand } from './commands/dev/index.js';

// ── Bootstrap ─────────────────────────────────────────────────────────────
const program = new Command();

program
  .name('mnemoforge')
  .description('MnemoForge — AI Inception Engine for the Mnemosyne Neural OS ecosystem')
  .version('1.3.4', '-v, --version', 'Display current version')
  .addHelpText('beforeAll', ASCII + '\n')
  .action(() => { showWelcome(); });

// ── init (top-level — vault setup shortcut) ───────────────────────────────
program
  .command('init')
  .description('Scaffold a new Mnemosyne-grade module with AI governance DNA')
  .argument('[module-name]', 'Name of the module to create (PascalCase recommended)')
  .action(async () => {
    console.log(chalk.hex('#8B5CF6').bold('\n⬡  MnemoChronicle — Vault Init\n'));
    const existing = loadVaultConfig();
    if (existing) {
      console.log(chalk.yellow('  ⚠  Already configured:'));
      console.log(chalk.gray('     IDE:      ' + existing.ide));
      console.log(chalk.gray('     Provider: ' + existing.provider + '\n'));
    }

    const profile = await askPrimaryProfile(existing);
    const registeredModels: RegisteredModel[] = existing?.registeredModels ?? [];
    if (existing && (existing.ide !== profile.ide || existing.provider !== profile.provider)) {
      const old: RegisteredModel = { ide: existing.ide, provider: existing.provider, defaultChronicleStyle: existing.defaultChronicleStyle };
      if (!registeredModels.some(m => m.ide === old.ide && m.provider === old.provider)) registeredModels.unshift(old);
    }
    let extra = await askExtraProfile(registeredModels.length);
    while (extra) {
      console.log(chalk.green('  ✔  Added: ' + extra.provider + ' (' + extra.ide + ') · style: ' + extra.defaultChronicleStyle));
      registeredModels.push(extra);
      extra = await askExtraProfile(registeredModels.length);
    }

    const config: VaultConfig = { ...profile, registeredModels };
    saveVaultConfig(config);

    // ── Bootstrap Resonance Bridge data dir ──────────────────────────────────
    const resonanceDataDir = path.join(config.vaultPath, 'apps', 'mnemosync', 'data');
    const messagesDir = path.join(resonanceDataDir, 'messages');
    fs.mkdirSync(messagesDir, { recursive: true });

    const pulseFile = path.join(resonanceDataDir, `${config.ide.toLowerCase()}.pulse.json`);
    if (!fs.existsSync(pulseFile)) {
      const pulse = {
        agent_id: config.ide.toLowerCase(),
        soul_profile: `${config.ide} · ${config.provider}`,
        timestamp: new Date().toISOString(),
        zone: '.',
        intent: 'Initialized via mnemoforge init',
        files_touched: [],
        fac_charge: 0.0,
        status: 'idle',
        blocks: [],
        protocol_version: '0.1',
      };
      fs.writeFileSync(pulseFile, JSON.stringify(pulse, null, 2), 'utf8');
    }
    // ─────────────────────────────────────────────────────────────────────────

    const res = config.vaultPath + '/.cli_resonance/' + config.ide + '/' + config.provider + '/';
    console.log(chalk.green('\n  ✔  Vault configured!'));
    console.log(chalk.gray('     IDE:      ') + chalk.white(config.ide));
    console.log(chalk.gray('     Provider: ') + chalk.white(config.provider));
    console.log(chalk.gray('     Style:    ') + chalk.hex('#A78BFA')(config.defaultChronicleStyle ?? 'session'));
    if (registeredModels.length > 0) console.log(chalk.gray('     + ' + registeredModels.length + ' extra profile(s)'));
    console.log(chalk.gray('\n     Chronicles → ') + chalk.hex('#A78BFA')(res));
    console.log(chalk.hex('#8B5CF6')('     Resonance  → ') + chalk.white(resonanceDataDir) + '\n');
    console.log(chalk.gray('  Run ') + chalk.white('mnemoforge resonance agents') + chalk.gray(' to see your agents.\n'));

  });

// ── models ────────────────────────────────────────────────────────────────
const models = new Command('models')
  .description('Manage the local model registry (UniversalModelCard compatible)');

models
  .command('import <file>')
  .description('Import a model from a UniversalModelCard JSON file')
  .action((file: string) => {
    const resolved = path.resolve(file);
    if (!fs.existsSync(resolved)) { console.log(chalk.red(`\n  ✖  File not found: ${resolved}\n`)); process.exit(1); }
    const entry = importFromModelCard(resolved);
    if (!entry) { console.log(chalk.red('\n  ✖  Could not extract model info.\n')); process.exit(1); }
    const existing = loadCustomModels();
    if (existing.some(m => m.modelId === entry.modelId)) { console.log(chalk.yellow(`\n  ⚠  Model already registered: ${entry.modelId}\n`)); return; }
    saveCustomModels([...existing, entry]);
    console.log(chalk.green(`\n  ✔  Model imported! ${entry.displayName} (${entry.provider})\n`));
  });

models
  .command('list')
  .description('List all registered custom models')
  .action(() => {
    const custom = loadCustomModels();
    console.log(chalk.hex('#8B5CF6').bold('\n⬡  Custom Models Registry\n'));
    if (custom.length === 0) { console.log(chalk.gray('  No custom models. Use: mnemoforge models import <file.json>\n')); return; }
    custom.forEach((m, i) => {
      console.log(chalk.gray(`  ${String(i + 1).padStart(2, ' ')}. `) + chalk.white(`${m.displayName}`) + chalk.gray(` · ${m.provider} · ${m.modelId}`));
    });
    console.log();
  });

// ── Register all commands ─────────────────────────────────────────────────
program.addCommand(workspaceCommand);
program.addCommand(projectCommand);
program.addCommand(chronicleCommand);
program.addCommand(models);
program.addCommand(canvasCommand);
program.addCommand(promptCommand);
program.addCommand(forgeCommand);
program.addCommand(configCommand);
program.addCommand(soulCommand);
program.addCommand(resonanceCommand);
program.addCommand(mnemoSyncCommand);
program.addCommand(devCommand);

// ── serve — MCP server ────────────────────────────────────────────────────────
program
  .command('serve')
  .description('Start MnemoForge MCP server (stdio — for Claude, Cursor, Antigravity)')
  .option('-p, --port <number>', 'Reserved for future HTTP transport', '3141')
  .action(async () => {
    const { startMcpServer } = await import('./mcp/server.js');
    await startMcpServer();
  });

program.parse(process.argv);
