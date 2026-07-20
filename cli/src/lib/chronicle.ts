import fs from 'fs';
import path from 'path';
import { VaultConfig, resolveChronicleDir } from './vault.js';

// ─────────────────────────────────────────────
// Chronicle — Writer & Formatter
// Format: MnemoChronicle Standard v0.4
//
// Structure: IDE/Provider/CHRONICLE-YYYY-MM-DD-slug.md
// The model ID is captured in chronicle metadata, NOT in the folder path.
// All Claude versions → Antigravity/Anthropic/
// All Gemini versions → Antigravity/GoogleDeepMind/
// ─────────────────────────────────────────────

export interface ChronicleOptions {
  title: string;
  type: 'session' | 'sweep' | 'decision' | 'reflection';
  content: string;
  tags?: string[];
  config: VaultConfig;
}

export interface ChronicleResult {
  filePath: string;
  filename: string;
}

/**
 * Generate a CHRONICLE filename.
 * Pattern: CHRONICLE-YYYY-MM-DD-slug.md
 */
function buildFilename(title: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 48);
  return `CHRONICLE-${date}-${slug}.md`;
}

/**
 * Format date for display.
 */
function formatDate(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

/**
 * Build the Chronicle markdown content following MnemoChronicle Standard v0.4.
 */
export function buildChronicleContent(opts: ChronicleOptions): string {
  const { title, type, content, tags = [], config } = opts;
  const date = formatDate();
  const allTags = [
    '#resonance',
    `#${config.ide.toLowerCase()}`,
    `#${config.provider.toLowerCase().replace(/\s+/g, '')}`,
    `#${type}`,
    ...tags.map(t => t.startsWith('#') ? t : `#${t}`),
  ];

  return `# ${title}

**Date**: ${date}
**IDE**: ${config.ide}
**Provider**: ${config.provider}
**Workspace**: ${config.workspace ?? 'unset'}
**Project**: ${config.resonanceProject ?? 'unset'}
**Model**: ${config.modelId}
**Model Name**: ${config.displayName}
**Type**: ${type}
**Vault**: ${config.vaultPath}

---

${content}

---

${allTags.join(' ')}

<!--resonance
source: cli
ide: ${config.ide}
provider: ${config.provider}
workspace: ${config.workspace ?? 'unset'}
resonance_project: ${config.resonanceProject ?? 'unset'}
model: ${config.modelId}
display_name: ${config.displayName}
type: ${type}
date: ${new Date().toISOString()}
tags: ${allTags.join(', ')}
-->
`;
}

/**
 * Write a Chronicle to the correct vault location.
 * Returns the file path and filename.
 */
export function writeChronicle(opts: ChronicleOptions): ChronicleResult {
  const chronicleDir = resolveChronicleDir(opts.config);
  const filename = buildFilename(opts.title);
  const filePath = path.join(chronicleDir, filename);
  const content = buildChronicleContent(opts);
  fs.writeFileSync(filePath, content, 'utf8');
  return { filePath, filename };
}

/**
 * Build a sweep (daily summary) Chronicle from multiple sources.
 */
export function buildSweepContent(entries: string[], config: VaultConfig): string {
  const date = new Date().toISOString().slice(0, 10);
  const entryList = entries.map((e, i) => `### Entry ${i + 1}\n\n${e}`).join('\n\n---\n\n');

  return `Daily sweep across ${entries.length} session(s) — ${config.ide} / ${config.provider} / ${config.modelId}.

**Coverage**: ${date}
**Sessions consolidated**: ${entries.length}

---

${entryList}`;
}
