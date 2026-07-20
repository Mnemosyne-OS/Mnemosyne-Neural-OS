// ─────────────────────────────────────────────────────────────────────────────
// MnemoChronicle — Profile commands: init · switch · config
// ─────────────────────────────────────────────────────────────────────────────
import { Command } from 'commander';
import chalk from 'chalk';
import { getInquirer } from '../../lib/lazy.js';
import {
  loadVaultConfig, saveVaultConfig,
  type VaultConfig, type RegisteredModel, type ChronicleStyle,
} from '../../lib/vault.js';
import { askPrimaryProfile, askExtraProfile } from '../../lib/init-flow.js';
import { showWelcome } from '../../lib/ui.js';

export const vaultCmd = new Command();

vaultCmd
  .command('init')
  .description('Initialize .cli_resonance vault — choose IDE / Provider / Model')
  .action(async () => {
    const inquirer = await getInquirer();
    const existing = loadVaultConfig();
    console.log(chalk.hex('#8B5CF6').bold('\n⬡  MnemoChronicle — Vault Init\n'));
    if (existing) {
      console.log(chalk.yellow('  ⚠  Re-configuring vault:'));
      console.log(chalk.gray('     IDE:      ' + existing.ide + '\n     Provider: ' + existing.provider + '\n'));
    }
    const profile = await askPrimaryProfile(existing);
    const reg: RegisteredModel[] = existing?.registeredModels ?? [];
    if (existing && (existing.ide !== profile.ide || existing.provider !== profile.provider)) {
      const old: RegisteredModel = { ide: existing.ide, provider: existing.provider, defaultChronicleStyle: existing.defaultChronicleStyle };
      if (!reg.some(m => m.ide === old.ide && m.provider === old.provider)) reg.unshift(old);
    }
    let extra = await askExtraProfile(reg.length);
    while (extra) { console.log(chalk.green('  ✔  Added: ' + extra.ide + ' / ' + extra.provider)); reg.push(extra); extra = await askExtraProfile(reg.length); }
    const config: VaultConfig = { ...profile, registeredModels: reg };
    saveVaultConfig(config);
    const dir = `${config.vaultPath}/.cli_resonance/${config.ide}/${config.provider}/`;
    console.log(chalk.green('\n  ✔  Vault configured!'));
    console.log(chalk.gray(`     IDE: ${config.ide}  ·  Provider: ${config.provider}  ·  Style: `) + chalk.hex('#A78BFA')(config.defaultChronicleStyle ?? 'session'));
    if (reg.length > 0) console.log(chalk.gray('     + ' + reg.length + ' extra profile(s)'));
    console.log(chalk.gray('\n     Chronicles → ') + chalk.hex('#A78BFA')(dir) + '\n');
  });

vaultCmd
  .command('switch')
  .description('Switch the active profile to another registered one')
  .action(async () => {
    const inquirer = await getInquirer();
    const config = loadVaultConfig();
    if (!config) { console.log(chalk.red('\n  ✖  Not initialized.\n')); process.exit(1); }
    const profiles = config.registeredModels ?? [];
    if (profiles.length === 0) { console.log(chalk.yellow('\n  ⚠  No other profiles registered.\n')); return; }
    const { idx } = await (inquirer as any).prompt([{
      type: 'list', name: 'idx', message: chalk.cyan('Which profile to make active?'),
      choices: profiles.map((p: RegisteredModel, i: number) => ({ name: `${p.ide} / ${p.provider}  ·  ${p.displayName}`, value: i })),
    }]);
    const sel = profiles[idx];
    const displaced: RegisteredModel = { ide: config.ide, provider: config.provider, modelId: config.modelId, displayName: config.displayName, defaultChronicleStyle: config.defaultChronicleStyle };
    const newReg = profiles.filter((_: RegisteredModel, i: number) => i !== idx);
    newReg.push(displaced);
    saveVaultConfig({ ...config, ide: sel.ide, provider: sel.provider, modelId: sel.modelId, displayName: sel.displayName, defaultChronicleStyle: sel.defaultChronicleStyle ?? 'session', registeredModels: newReg });
    console.log(chalk.green(`\n  ✔  Switched to: ${sel.displayName} (${sel.provider})\n`));
    showWelcome();
  });

vaultCmd
  .command('config')
  .description('Edit settings (style, display name) of any registered profile')
  .action(async () => {
    const inquirer = await getInquirer();
    const config = loadVaultConfig();
    if (!config) { console.log(chalk.red('\n  ✖  Not initialized.\n')); process.exit(1); }
    const profiles = config.registeredModels ?? [];
    let targetIdx = -1;
    if (profiles.length > 0) {
      const { which } = await (inquirer as any).prompt([{
        type: 'list', name: 'which', message: chalk.cyan('Which profile to edit?'),
        choices: [
          { name: `★ ${config.ide} / ${config.provider}  ·  ${config.displayName}  [ACTIVE]`, value: -1 },
          ...profiles.map((p: RegisteredModel, i: number) => ({ name: `○ ${p.ide} / ${p.provider}  ·  ${p.displayName}`, value: i })),
        ],
      }]);
      targetIdx = which;
    }
    const isActive = targetIdx === -1;
    const curStyle = isActive ? (config.defaultChronicleStyle ?? 'session') : (profiles[targetIdx].defaultChronicleStyle ?? 'session');
    const curName  = isActive ? config.displayName : profiles[targetIdx].displayName;
    const STYLE_CHOICES = [
      { name: 'Session     — coding/work session', value: 'session' },
      { name: 'Reflection  — deep thoughts',       value: 'reflection' },
      { name: 'Decision    — ADR-style record',    value: 'decision' },
      { name: 'Sweep       — daily digest',        value: 'sweep' },
      { name: 'Narcissus   — soul narrative',      value: 'narcissus' },
    ];
    const edit = await (inquirer as any).prompt([
      { type: 'list',  name: 'style',       message: chalk.cyan('Chronicle style?'), default: curStyle, choices: STYLE_CHOICES },
      { type: 'input', name: 'displayName', message: chalk.cyan('Display name?'),    default: curName  },
    ]);
    if (isActive) {
      saveVaultConfig({ ...config, defaultChronicleStyle: edit.style as ChronicleStyle, displayName: edit.displayName });
    } else {
      const updated = [...profiles];
      updated[targetIdx] = { ...updated[targetIdx], defaultChronicleStyle: edit.style as ChronicleStyle, displayName: edit.displayName };
      saveVaultConfig({ ...config, registeredModels: updated });
    }
    console.log(chalk.green('\n  ✔  Profile updated!\n'));
    showWelcome();
  });
