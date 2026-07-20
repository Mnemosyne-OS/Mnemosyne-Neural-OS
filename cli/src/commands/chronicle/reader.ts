// ─────────────────────────────────────────────────────────────────────────────
// MnemoChronicle — Reader commands: list · open
// ─────────────────────────────────────────────────────────────────────────────
import { Command } from 'commander';
import chalk from 'chalk';
import { getInquirer } from '../../lib/lazy.js';
import path from 'path';
import { loadVaultConfig, listChronicles, resolveChronicleDir } from '../../lib/vault.js';
import { parseChronicle, getChronicleType } from '../../lib/chronicle-parser.js';
import { renderChronicle } from '../../lib/chronicle-render.js';

const TYPE_COLORS: Record<string, chalk.Chalk> = {
  session: chalk.hex('#60A5FA'), decision: chalk.hex('#FB923C'),
  reflection: chalk.hex('#C084FC'), sweep: chalk.hex('#94A3B8'), narcissus: chalk.hex('#FBBF24'),
};
const TYPE_ICONS: Record<string, string> = {
  session: '◈', decision: '◆', reflection: '◇', sweep: '↻', narcissus: '✦',
};

export const readerCmd = new Command();

readerCmd
  .command('list')
  .description('List recent Chronicles in the vault')
  .option('-n, --count <n>', 'Number of chronicles to show', '10')
  .action((opts: any) => {
    const config = loadVaultConfig();
    if (!config) { console.log(chalk.red('\n  ✖  Not initialized.\n')); process.exit(1); }

    const dir = resolveChronicleDir(config);
    const all = listChronicles(config);
    const items = all.slice(0, parseInt(opts.count || '10'));

    const SEP = chalk.hex('#312E81')('  ' + '─'.repeat(72));
    console.log(chalk.hex('#8B5CF6').bold(`\n  ⬡  MnemoChronicle — Vault\n`));
    if (config.workspace) console.log(chalk.gray('  Workspace : ') + chalk.hex('#A78BFA')(config.workspace) + (config.resonanceProject ? chalk.gray('  ·  Project : ') + chalk.hex('#A78BFA')(config.resonanceProject) : ''));
    console.log(chalk.gray('  Agent     : ') + chalk.white(config.ide) + chalk.gray(' / ') + chalk.white(config.provider));
    console.log(chalk.gray(`  Vault     : `) + chalk.hex('#64748B')(dir));
    console.log(chalk.gray(`  Total     : `) + chalk.white(String(all.length)) + chalk.gray(` chronicles · showing ${items.length}\n`) + SEP);

    items.forEach((filename, i) => {
      const { title, type, tags, excerpt, date } = parseChronicle(filename, dir);
      const color = TYPE_COLORS[type] ?? chalk.white;
      const icon  = TYPE_ICONS[type] ?? '○';
      console.log(`\n  ${chalk.hex('#6B7280')(String(i + 1).padStart(2, ' '))}  ${color(`[${type}]`)}  ` + chalk.hex('#CBD5E1')(date) + '  ' + color(icon));
      console.log(chalk.white(`       ${title}`));
      if (excerpt) console.log(chalk.hex('#64748B')(`       "${excerpt}"`));
      if (tags.length > 0) console.log('       ' + tags.map(t => chalk.hex('#7C3AED')(t)).join('  '));
    });

    console.log('\n' + SEP + '\n');
    console.log(chalk.gray('  Tip: ') + chalk.white('mnemoforge chronicle list -n 20') + chalk.gray('  ·  ') + chalk.white('mnemoforge chronicle open') + chalk.gray('  to browse interactively\n'));
  });

readerCmd
  .command('open')
  .description('Browse and read chronicles interactively (arrow keys + Enter)')
  .option('-n, --count <n>', 'Max chronicles to show in picker', '20')
  .action(async (opts: any) => {
    const inquirer = await getInquirer();
    const config = loadVaultConfig();
    if (!config) { console.log(chalk.red('\n  ✖  Not initialized.\n')); process.exit(1); }

    const dir = resolveChronicleDir(config);
    const all = listChronicles(config);
    if (all.length === 0) { console.log(chalk.yellow('\n  No chronicles in vault yet.\n')); return; }

    const picks = all.slice(0, parseInt(opts.count || '20'));

    while (true) {
      const choices = picks.map((filename) => {
        const dateMatch = filename.match(/CHRONICLE-(\d{4}-\d{2}-\d{2})/);
        const slug = filename.replace(/^CHRONICLE-\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '').replace(/-/g, ' ');
        const type = getChronicleType(filename, dir);
        return {
          name: `  ${TYPE_ICONS[type] ?? '○'}  ${chalk.hex('#CBD5E1')(dateMatch?.[1] ?? '')}  ${chalk.white(slug)}`,
          value: filename, short: slug,
        };
      });
      choices.push({ name: chalk.hex('#475569')('\n  ✖  Quitter'), value: '__exit__', short: 'exit' });

      console.log(chalk.hex('#8B5CF6').bold('\n  ⬡  MnemoChronicle — Vault\n'));
      const { selected } = await (inquirer as any).prompt([{
        type: 'list', name: 'selected',
        message: chalk.hex('#A78BFA')('Sélectionner une chronicle  ') + chalk.gray('(↑↓ + Enter)'),
        choices, pageSize: 15,
      }]);

      if (selected === '__exit__') { console.log(chalk.gray('\n  Vault fermé.\n')); break; }
      renderChronicle(path.join(dir, selected));
    }
  });
