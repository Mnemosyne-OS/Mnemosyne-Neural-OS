// src/lib/sources/index.ts
// Dispatches to the right source reader based on the active provider.
// Chronicle drafts are now generated via the prompt-engine template store.

import type { VaultConfig } from '../vault.js';
import { readAntigravitySource, type ChronicleContext } from './antigravity.js';
import { getTemplate, seedBuiltins } from '../prompt-engine/store.js';
import { renderChronicleTemplate } from '../prompt-engine/renderer.js';

// ── Provider → Source mapping ─────────────────────────────────────────────────

const PROVIDER_SOURCES: Record<string, () => ChronicleContext | null> = {
  'Anthropic':       readAntigravitySource,
  'GoogleDeepMind':  readAntigravitySource,
  // Future:
  // 'OpenAI':       readCursorSource,
  // 'Cursor':       readCursorSource,
};

/**
 * Read the conversation source for the configured provider.
 * Returns null if no source is available or supported.
 */
export function readSourceForConfig(config: VaultConfig): ChronicleContext | null {
  const reader = PROVIDER_SOURCES[config.provider] ?? PROVIDER_SOURCES['GoogleDeepMind'];
  try {
    return reader();
  } catch {
    return null;
  }
}

// ── Chronicle Markdown Generator ──────────────────────────────────────────────

/**
 * Generate a chronicle markdown draft from a ChronicleContext.
 * Uses the prompt-engine template store (custom > pack > built-in).
 * If no template is found, falls back to a minimal inline default.
 */
export function generateChronicleDraft(
  ctx: ChronicleContext,
  config: VaultConfig
): string {
  seedBuiltins();
  const style = config.defaultChronicleStyle ?? 'session';
  const date = new Date().toISOString().split('T')[0];
  const ide = config.ide;
  const provider = config.provider;

  const frontmatter = [
    '---',
    `date: ${date}`,
    `session: "${ctx.sessionTitle.replace(/"/g, "'")}"`,
    `ide: ${ide}`,
    `provider: ${provider}`,
    `style: ${style}`,
    `source: antigravity-brain`,
    `conversation_id: ${ctx.conversationId}`,
    `files_touched:`,
    ...ctx.filesTouched.slice(0, 10).map(f => `  - ${f}`),
    '---',
  ].join('\n');

  // Resolve template via store (custom > pack > built-in)
  const tpl = getTemplate(style);
  const body = tpl
    ? renderChronicleTemplate(tpl.content, ctx)
    : fallbackBody(ctx, style);

  return frontmatter + '\n\n' + body;
}

// ── Fallback (safety net — should never trigger if built-ins are seeded) ──────

function fallbackBody(ctx: ChronicleContext, style: string): string {
  return `# Chronicle — ${ctx.sessionTitle}\n\n> *Style: ${style} — template not found. Check: mnemoforge prompt list*\n\n---\n`;
}
