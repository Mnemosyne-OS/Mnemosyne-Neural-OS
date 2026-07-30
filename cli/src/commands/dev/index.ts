/**
 * MnemoForge Dev Edition — `dev` command group
 * Tous les connectors et outils de la Dev Edition.
 *
 * Usage:
 *   mnemoforge dev cursor-import [options]
 *   mnemoforge dev git-import [options]      (Sprint 8)
 *   mnemoforge dev github-import [options]   (Sprint 9)
 *   mnemoforge dev vault-status              (Sprint 8)
 */

import { Command } from 'commander'
import chalk from 'chalk'
import path from 'path'
import { runCursorImport } from './cursor-import.js'
import type { CursorImportOptions } from './cursor-import.js'

const DEV_ASCII = `
  ██████╗ ███████╗██╗   ██╗    ███████╗██████╗ ██╗████████╗██╗ ██████╗ ███╗   ██╗
  ██╔══██╗██╔════╝██║   ██║    ██╔════╝██╔══██╗██║╚══██╔══╝██║██╔═══██╗████╗  ██║
  ██║  ██║█████╗  ██║   ██║    █████╗  ██║  ██║██║   ██║   ██║██║   ██║██╔██╗ ██║
  ██║  ██║██╔══╝  ╚██╗ ██╔╝    ██╔══╝  ██║  ██║██║   ██║   ██║██║   ██║██║╚██╗██║
  ██████╔╝███████╗ ╚████╔╝     ███████╗██████╔╝██║   ██║   ██║╚██████╔╝██║ ╚████║
  ╚═════╝ ╚══════╝  ╚═══╝      ╚══════╝╚═════╝ ╚═╝   ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝
`

export const devCommand = new Command('dev')
  .description('Mnemosyne OS Dev Edition — connectors, vault & IDE bridge tools')
  .addHelpText('beforeAll', chalk.hex('#22d3ee')(DEV_ASCII))

// ── cursor-import ──────────────────────────────────────────────────────────────

devCommand
  .command('cursor-import')
  .description('Extract Cursor IDE conversations and import as DevVault Chronicles')
  .option('-w, --workspace <hash>', 'Target a specific Cursor workspace hash')
  .option('-n, --top <number>', 'Only scan the N largest workspaces', '5')
  .option('-o, --output <path>', 'Output JSON file path')
  .option('--vault <path>', 'Path to DevVault directory (default: cwd/DevVault)')
  .option('-v, --verbose', 'Show detailed extraction progress')
  .action(async (opts: {
    workspace?: string
    top?: string
    output?: string
    vault?: string
    verbose?: boolean
  }) => {
    console.log(chalk.hex('#22d3ee').bold('\n⬡  MnemoForge Dev · Cursor Import\n'))
    console.log(chalk.gray('  Scanning Cursor IDE SQLite databases...\n'))

    const importOpts: CursorImportOptions = {
      workspaceHash: opts.workspace,
      topWorkspaces: opts.top ? parseInt(opts.top) : 5,
      verbose: opts.verbose ?? false,
    }

    if (opts.output) {
      importOpts.outputPath = path.resolve(opts.output)
    } else if (opts.vault) {
      const vaultPath = path.resolve(opts.vault)
      importOpts.outputPath = path.join(vaultPath, 'chronicles', 'chronicle_cursor', `cursor_import_${Date.now()}.json`)
    }

    try {
      const result = await runCursorImport(importOpts)

      if (!result.success) {
        console.log(chalk.red(`\n  ✖  Import failed:\n`))
        result.errors.forEach(e => console.log(chalk.red(`     ${e}`)))
        process.exit(1)
      }

      console.log(chalk.green('\n  ✔  Import complete!\n'))
      console.log(chalk.gray('  Chronicles imported: ') + chalk.white(String(result.chronicles_imported)))
      console.log(chalk.gray('  Chronicles skipped:  ') + chalk.gray(String(result.chronicles_skipped)))

      if (result.date_range) {
        console.log(chalk.gray('  Date range:          ') + chalk.white(`${result.date_range.from} → ${result.date_range.to}`))
      }

      if (result.output_path) {
        console.log(chalk.gray('  Output:              ') + chalk.hex('#22d3ee')(result.output_path))
      }

      if (result.errors.length > 0) {
        console.log(chalk.yellow(`\n  ⚠  ${result.errors.length} workspace(s) had errors (see verbose for details)`))
      }

      console.log(chalk.gray('\n  Next: ') + chalk.white('mnemoforge chronicle add ' + (result.output_path ?? 'cursor_chronicles.json')) + '\n')

    } catch (e: unknown) {
      console.log(chalk.red(`\n  ✖  Unexpected error: ${String(e)}\n`))
      process.exit(1)
    }
  })

// ── git-import (stub — Sprint 8) ───────────────────────────────────────────────

devCommand
  .command('git-import')
  .description('[Sprint 8] Import git history as DevVault Chronicles + Git Spine')
  .option('--repo <path>', 'Path to git repository (default: cwd)')
  .option('--since <date>', 'Only import commits since date (YYYY-MM-DD)')
  .option('-o, --output <path>', 'Output JSON file path')
  .action(() => {
    console.log(chalk.hex('#22d3ee').bold('\n⬡  MnemoForge Dev · Git Import\n'))
    console.log(chalk.yellow('  ⚠  Coming in Sprint 8\n'))
    console.log(chalk.gray('  This connector will parse git log and generate:\n'))
    console.log(chalk.gray('  ├── Git Chronicles (commit messages + context)\n'))
    console.log(chalk.gray('  ├── Git Spine entries (branches, tags, authors)\n'))
    console.log(chalk.gray('  └── Architecture Spine (ADR auto-detection in commit messages)\n'))
    console.log(chalk.hex('#22d3ee')('  Star the repo to be notified: github.com/Mnemosyne-OS/Mnemosyne-Neural-OS\n'))
  })

// ── github-import (stub — Sprint 9) ───────────────────────────────────────────

devCommand
  .command('github-import')
  .description('[Sprint 9] Import GitHub Issues, PRs and Reviews as DevVault Chronicles')
  .action(() => {
    console.log(chalk.hex('#22d3ee').bold('\n⬡  MnemoForge Dev · GitHub Import\n'))
    console.log(chalk.yellow('  ⚠  Coming in Sprint 9\n'))
  })

// ── vault-status ───────────────────────────────────────────────────────────────

devCommand
  .command('vault-status')
  .description('[Sprint 8] Show DevVault health status and chronicle counts by connector')
  .action(() => {
    console.log(chalk.hex('#22d3ee').bold('\n⬡  MnemoForge Dev · Vault Status\n'))
    console.log(chalk.yellow('  ⚠  Coming in Sprint 8\n'))
    console.log(chalk.gray('  This will show:\n'))
    console.log(chalk.gray('  ├── Chronicle count by connector\n'))
    console.log(chalk.gray('  ├── Spine health (Architecture, Git, Dependency, Error, API)\n'))
    console.log(chalk.gray('  ├── Memory Anchor count\n'))
    console.log(chalk.gray('  └── Last sync timestamps\n'))
  })
