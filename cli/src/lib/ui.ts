// ─────────────────────────────────────────────────────────────────────────────
// MnemoForge — Welcome Dashboard (shared UI)
// ─────────────────────────────────────────────────────────────────────────────
import chalk from 'chalk';
import { loadVaultConfig, listChronicles } from './vault.js';
import { initLang, t } from './i18n/index.js';

const V   = chalk.hex('#8B5CF6');
const V2  = chalk.hex('#A78BFA');
const V3  = chalk.hex('#C4B5FD');
const V4  = chalk.hex('#DDD6FE');
const DIM = chalk.gray;
const WHT = chalk.white;

export const ASCII = [
  V('███╗   ███╗███╗   ██╗███████╗███╗   ███╗ ██████╗ '),
  V('████╗ ████║████╗  ██║██╔════╝████╗ ████║██╔═══██╗'),
  V2('██╔████╔██║██╔██╗ ██║█████╗  ██╔████╔██║██║   ██║'),
  V3('██║╚██╔╝██║██║╚██╗██║██╔══╝  ██║╚██╔╝██║██║   ██║'),
  V4('██║ ╚═╝ ██║██║ ╚████║███████╗██║ ╚═╝ ██║╚██████╔╝'),
  chalk.hex('#EDE9FE')('╚═╝     ╚═╝╚═╝  ╚═══╝╚══════╝╚═╝     ╚═╝ ╚═════╝ '),
].join('\n');

// ── Layout ────────────────────────────────────────────────────────────────────
// W = responsive inner width, capped between 80 and 110 chars.
// CRITICAL: apply .padEnd() on raw strings BEFORE wrapping with chalk.
// This guarantees accurate visible-length calculations.
const TERM_W = process.stdout.columns ?? 100;
const W = Math.max(80, Math.min(110, TERM_W - 6));
const wEq = '═'.repeat(W);

// p(): trim to n chars then pad to exactly n (raw string, no chalk)
const p   = (s: string, n: number) => s.slice(0, n).padEnd(n);
const L   = (s: string) => console.log(V('  ║') + s + V('║'));
const sep = () => console.log(V('  ╠' + wEq + '╣'));

// Column widths for the 2-col command grid — proportional to W
// Layout: 2 + LC + LD + 4 + RC + RD + 2 = W
// Allocate: LC=19, LD=W/2-23, RC=18, RD=W/2-20
const LC = 19;
const LD = Math.floor(W / 2) - 22;
const RC = 18;
const RD = W - LC - LD - RC - 8; // 8 = 2+4+2

export function showWelcome(): void {
  const config = loadVaultConfig();

  // Init language from vault config (falls back to OS locale → 'en')
  initLang(config?.lang);

  console.log();
  console.log(ASCII);
  console.log();

  // ── Header ────────────────────────────────────────────────────────────────
  console.log(V('  ╔' + wEq + '╗'));
  L(chalk.hex('#F5F3FF').bold(p('  ' + t('header_title'), W)));
  L(DIM(p('  MnemoForge CLI  v1.4.1  ·  XPACEGEMS LLC', W)));
  sep();

  // ── Resonance Profiles ────────────────────────────────────────────────────
  if (config) {
    const profiles    = config.registeredModels ?? [];
    const chronCount  = listChronicles(config).length;
    const activeStyle = config.defaultChronicleStyle ?? 'session';
    const activeName  = ((config.ide ?? '—') + ' / ' + (config.provider ?? '—'));
    const ollamaModel = config.localAI?.model;

    L(DIM(p('  ' + t('section_profiles'), W)));

    // Active: star(3) + name(30) + style(14) + chron(12) + [✓](3) + pad
    const nameW   = 30;
    const styleW  = 14;
    const chronW  = 12;
    const trailW  = W - 3 - nameW - styleW - chronW - 3;
    L(
      '  ' + chalk.green('★') + ' '
      + WHT(p(activeName, nameW))
      + DIM(p(activeStyle, styleW))
      + DIM(p(chronCount + ' chron.', chronW))
      + chalk.green('[✓]')
      + ' '.repeat(Math.max(0, trailW))
    );

    profiles.forEach((pm, i) => {
      const pName  = (pm.ide ?? '') + ' / ' + (pm.provider ?? '');
      const pStyle = pm.defaultChronicleStyle ?? 'session';
      const pTag   = '[' + (i + 1) + '] ' + t('profile_switch');
      const trail  = W - 3 - nameW - styleW - chronW - pTag.length - 1;
      L(
        '  ' + DIM('○') + ' '
        + DIM(p(pName, nameW))
        + DIM(p(pStyle, styleW))
        + ' '.repeat(chronW)
        + DIM(pTag)
        + ' '.repeat(Math.max(0, trail))
      );
    });

    if (ollamaModel) {
      L(DIM(p('  ' + '─'.repeat(W - 4), W)));
      L(
        '  ' + chalk.hex('#4ADE80')('⬡') + ' '
        + DIM(p(t('local_ai'), 12))
        + DIM(p(ollamaModel, W - 16))
      );
    }

    if (config.soulProfile) {
      L(DIM(p('  ' + '─'.repeat(W - 4), W)));
      L(
        '  ' + chalk.hex('#8B5CF6')('⬡') + ' '
        + DIM(p(t('soul_profile'), 12))
        + chalk.hex('#A78BFA')(p(config.soulProfile, W - 16))
      );
    }
  } else {
    L(chalk.yellow(p('  ' + t('no_vault'), W)));
  }

  // ── Commands 2-col ────────────────────────────────────────────────────────
  sep();
  const leftHead  = p('  ' + t('col_chronicle'), LC + LD + 2);
  const rightHead = p(t('col_workspace'), RC + RD);
  L(chalk.hex('#64748B')(leftHead) + '  ' + chalk.hex('#64748B')(rightHead) + '  ');
  L(DIM(p('  ' + '─'.repeat(LC + LD), LC + LD + 2)) + DIM(p('─'.repeat(RC + RD), RC + RD)) + '  ');

  // [left-command, left-desc, right-command, right-desc]
  const rows: [string, string, string, string][] = [
    [t('cmd_chron_init'),   t('desc_chron_init'),   t('cmd_canvas'),      t('desc_canvas')      ],
    [t('cmd_chron_switch'), t('desc_chron_switch'), t('cmd_prompt_list'), t('desc_prompt_list') ],
    [t('cmd_chron_commit'), t('desc_chron_commit'), t('cmd_prompt_new'),  t('desc_prompt_new')  ],
    [t('cmd_chron_open'),   t('desc_chron_open'),   t('cmd_forge'),       t('desc_forge')       ],
    [t('cmd_chron_list'),   t('desc_chron_list'),   t('cmd_config'),      t('desc_config')      ],
    ['                ',    '                    ', t('cmd_serve'),        t('desc_serve')        ],
    ['                ',    '                    ', t('cmd_soul_passport'), t('desc_soul_passport') ],
    ['                ',    '                    ', t('cmd_soul_dex'),      t('desc_soul_dex')      ],
    ['                ',    '                    ', t('cmd_soul_inject'),   t('desc_soul_inject')   ],
    ['                ',    '                    ', t('cmd_soul_switch'),   t('desc_soul_switch')   ],
  ];

  for (const [lc, ld, rc, rd] of rows) {
    // 2 + LC + LD + 2 + 2 + RC + RD + 2 = W
    L('  ' + V2(p(lc, LC)) + DIM(p(ld, LD)) + '  ' + '  ' + V2(p(rc, RC)) + DIM(p(rd, RD)) + '  ');
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  sep();
  L(DIM(p('  ' + t('header_tagline'), W)));
  console.log(V('  ╚' + wEq + '╝'));
  console.log();
}
