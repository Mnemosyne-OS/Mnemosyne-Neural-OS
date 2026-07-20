// ─────────────────────────────────────────────────────────────────────────────
// MnemoChronicle — Terminal Renderer
// Renders Markdown chronicle files as colored terminal output
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import chalk from 'chalk';

export function renderChronicle(filePath: string): void {
  const raw = fs.readFileSync(filePath, 'utf8');
  const resonanceIdx = raw.indexOf('<!--resonance');
  const content = resonanceIdx !== -1 ? raw.slice(0, resonanceIdx) : raw;

  console.log('\n' + chalk.hex('#312E81')('  ' + '─'.repeat(72)));
  console.log(chalk.gray(`  ${filePath}`));
  console.log(chalk.hex('#312E81')('  ' + '─'.repeat(72)) + '\n');

  let dividerCount = 0;
  for (const line of content.split('\n')) {
    const l = line.trim();
    if (l.startsWith('# '))   { console.log('\n  ' + chalk.hex('#8B5CF6').bold(l.slice(2))); continue; }
    if (l.startsWith('## '))  { console.log('\n  ' + chalk.hex('#A78BFA').bold('  ' + l.slice(3))); continue; }
    if (l.startsWith('### ')) { console.log('  ' + chalk.hex('#C084FC')('    ' + l.slice(4))); continue; }
    if (l === '---') { dividerCount++; if (dividerCount <= 2) console.log(chalk.hex('#312E81')('  ' + '─'.repeat(60))); continue; }
    if (l.match(/^\*\*[\w\s]+\*\*:/)) {
      const p = l.match(/^\*\*([\w\s]+)\*\*:\s*(.*)/) ?? [];
      if (p.length >= 3) console.log('  ' + chalk.hex('#64748B')(`  ${p[1].padEnd(14)} `) + chalk.hex('#94A3B8')(p[2]));
      continue;
    }
    if (l.startsWith('> '))  { console.log('  ' + chalk.hex('#7C3AED')('  │ ') + chalk.hex('#DDD6FE').italic(l.slice(2))); continue; }
    if (l.startsWith('- ') || l.startsWith('* ')) { console.log('  ' + chalk.hex('#6B7280')('    • ') + chalk.white(l.slice(2))); continue; }
    if (l.match(/^\d+\. /))  { console.log('  ' + chalk.hex('#6B7280')('    ') + chalk.white(l)); continue; }
    if (l.startsWith('```')) { console.log('  ' + chalk.hex('#312E81')('    ' + '·'.repeat(50))); continue; }
    if (l.match(/^#\w/) && !l.startsWith('# ')) {
      console.log('\n  ' + (l.match(/#\w+/g) ?? []).map((t: string) => chalk.hex('#7C3AED')(t)).join('  '));
      continue;
    }
    if (l.length > 0) { console.log('  ' + chalk.hex('#E2E8F0')('  ' + l)); } else { console.log(); }
  }

  console.log('\n' + chalk.hex('#312E81')('  ' + '─'.repeat(72)));
  console.log(chalk.gray(`\n  Open in editor → `) + chalk.white(`code "${filePath}"`) + '\n');
}
