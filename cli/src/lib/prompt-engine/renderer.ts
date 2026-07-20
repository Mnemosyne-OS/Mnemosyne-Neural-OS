// ─────────────────────────────────────────────────────────────────────────────
// MnemoForge — Prompt Template Renderer
// Interpolates {{VARIABLE}} placeholders in chronicle templates
// ─────────────────────────────────────────────────────────────────────────────
import type { ChronicleContext } from '../sources/antigravity.js';

export interface TemplateContext {
  SESSION_TITLE: string;
  FILES_TOUCHED: string;
  KEY_DECISIONS: string;
  COMMANDS_RUN: string;
  DATE: string;
  CONVERSATION_ID: string;
  [key: string]: string;
}

/**
 * Build a TemplateContext from a ChronicleContext.
 */
export function buildTemplateContext(ctx: ChronicleContext): TemplateContext {
  const decisions = ctx.keyDecisions.length > 0
    ? ctx.keyDecisions.map(d => `- ${d}`).join('\n')
    : '- (none captured automatically — add manually)';

  const files = ctx.filesTouched.length > 0
    ? ctx.filesTouched.slice(0, 15).map(f => `- \`${f}\``).join('\n')
    : '- (none detected)';

  const cmds = ctx.commandsRun.length > 0
    ? ctx.commandsRun.map(c => `\`${c}\``).join('\n')
    : '(none)';

  return {
    SESSION_TITLE:   ctx.sessionTitle || 'Untitled session',
    FILES_TOUCHED:   files,
    KEY_DECISIONS:   decisions,
    COMMANDS_RUN:    cmds,
    DATE:            new Date().toISOString().slice(0, 10),
    CONVERSATION_ID: ctx.conversationId.slice(0, 8) + '...',
  };
}

/**
 * Strip YAML frontmatter from template content.
 * Returns only the markdown body after the closing ---.
 */
export function stripFrontmatter(content: string): string {
  if (!content.startsWith('---')) return content;
  const end = content.indexOf('\n---', 3);
  if (end === -1) return content;
  return content.slice(end + 4).trimStart();
}

/**
 * Render a template string by replacing {{KEY}} with context values.
 * Unknown keys are left as-is.
 */
export function renderTemplate(template: string, ctx: TemplateContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => ctx[key] ?? `{{${key}}}`);
}

/**
 * Full pipeline: strip frontmatter → render → return markdown body.
 */
export function renderChronicleTemplate(content: string, ctx: ChronicleContext): string {
  const body = stripFrontmatter(content);
  const tplCtx = buildTemplateContext(ctx);
  return renderTemplate(body, tplCtx);
}
