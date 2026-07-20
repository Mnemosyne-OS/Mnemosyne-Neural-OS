// init-flow.ts — Interactive prompts for chronicle init
// Separated from cli.ts to keep the orchestrator thin

import { getInquirer } from './lazy.js';
import chalk from 'chalk';
import { IDE_LIST, PROVIDERS_BY_IDE } from './providers.js';
import type { VaultConfig, RegisteredModel, ChronicleStyle } from './vault.js';

// ── Chronicle style options (shared across init + config commands) ──────────
export const CHRONICLE_STYLES = [
  { name: 'Session     — coding/work session, structured notes',  value: 'session' },
  { name: 'Reflection  — deep thoughts, retrospective',           value: 'reflection' },
  { name: 'Decision    — decision record (ADR-style)',             value: 'decision' },
  { name: 'Sweep       — daily digest of multiple sessions',      value: 'sweep' },
  { name: 'Narcissus   — personal / soul narrative (Mnemosyne)',  value: 'narcissus' },
];

// ── Primary profile (Steps 1-3) ─────────────────────────────────────────────
// Model is NOT asked — the chronicle is signed by the agent when it writes it.
export interface ProfileResult {
  vaultPath: string;
  ide: string;
  provider: string;
  defaultChronicleStyle: ChronicleStyle;
}

export async function askPrimaryProfile(existing?: VaultConfig | null): Promise<ProfileResult> {
  const inquirer = await getInquirer();
  const defaultVault =
    `${process.env['USERPROFILE'] ?? process.env['HOME'] ?? '~'}/Documents/MnemoVault`;

  const a = await (inquirer as any).prompt([
    // Step 1: Vault path
    {
      type: 'input',
      name: 'vaultPath',
      message: chalk.cyan('MnemoVault path?'),
      default: existing?.vaultPath ?? defaultVault,
      validate: (v: string) => v.trim() !== '' || 'Required',
    },
    // Step 2: IDE
    {
      type: 'list',
      name: 'ide',
      message: chalk.cyan('Your IDE?'),
      choices: IDE_LIST,
      default: existing?.ide ?? 'Antigravity',
    },
    {
      type: 'input',
      name: 'ideCustom',
      message: chalk.cyan('IDE name?'),
      when: (a: any) => a.ide === '__other__',
      validate: (v: string) => v.trim() !== '' || 'Required',
    },
    // Step 2b: Provider
    {
      type: 'list',
      name: 'provider',
      message: chalk.cyan('AI Provider?') + chalk.gray(' (becomes the folder name)'),
      choices: (a: any) => PROVIDERS_BY_IDE[a.ide] ?? PROVIDERS_BY_IDE['default'],
      when: (a: any) => a.ide !== '__other__',
      default: existing?.provider ?? 'Anthropic',
    },
    {
      type: 'input',
      name: 'providerCustom',
      message: chalk.cyan('Provider name?') + chalk.gray(' (e.g. EleutherAI)'),
      when: (a: any) => a.ide === '__other__' || a.provider === '__other__',
      validate: (v: string) => v.trim() !== '' || 'Required',
    },
    // Step 3: Chronicle style
    {
      type: 'list',
      name: 'defaultChronicleStyle',
      message: chalk.cyan('Default chronicle style?'),
      choices: CHRONICLE_STYLES,
      default: existing?.defaultChronicleStyle ?? 'session',
    },
  ]);

  const ide = (a.ide === '__other__' ? a.ideCustom : a.ide).trim();
  const provider = (!a.provider || a.provider === '__other__' ? a.providerCustom : a.provider).trim();

  return {
    vaultPath: a.vaultPath.trim(),
    ide,
    provider,
    defaultChronicleStyle: a.defaultChronicleStyle as ChronicleStyle,
  };
}

// ── Extra profile (Step 5 loop) ──────────────────────────────────────────────
export async function askExtraProfile(count: number): Promise<RegisteredModel | null> {
  const inquirer = await getInquirer();
  const { wantMore } = await (inquirer as any).prompt([{
    type: 'confirm',
    name: 'wantMore',
    message: chalk.cyan('Add another profile to your registry?') +
      (count > 0 ? chalk.gray(` (${count} already added)`) : ''),
    default: false,
  }]);
  if (!wantMore) return null;

  const e = await (inquirer as any).prompt([
    {
      type: 'list',
      name: 'ide',
      message: chalk.cyan('  IDE for this profile?'),
      choices: IDE_LIST,
      default: 'Antigravity',
    },
    {
      type: 'input',
      name: 'ideCustom',
      message: chalk.cyan('  IDE name?'),
      when: (a: any) => a.ide === '__other__',
      validate: (v: string) => v.trim() !== '' || 'Required',
    },
    {
      type: 'list',
      name: 'provider',
      message: chalk.cyan('  Provider?'),
      choices: (a: any) => PROVIDERS_BY_IDE[a.ide] ?? PROVIDERS_BY_IDE['default'],
      when: (a: any) => a.ide !== '__other__',
    },
    {
      type: 'input',
      name: 'providerCustom',
      message: chalk.cyan('  Provider name?'),
      when: (a: any) => a.ide === '__other__' || a.provider === '__other__',
      validate: (v: string) => v.trim() !== '' || 'Required',
    },
    {
      type: 'list',
      name: 'style',
      message: chalk.cyan('  Chronicle style for this profile?'),
      choices: CHRONICLE_STYLES,
      default: 'session',
    },
  ]);

  const ide = (e.ide === '__other__' ? e.ideCustom : e.ide).trim();
  const provider = (!e.provider || e.provider === '__other__' ? e.providerCustom : e.provider).trim();

  return {
    ide,
    provider,
    modelId: '',
    displayName: provider,
    defaultChronicleStyle: e.style as ChronicleStyle,
  };
}
