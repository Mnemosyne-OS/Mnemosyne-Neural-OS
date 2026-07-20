// ─────────────────────────────────────────────────────────────────────────────
// MnemoForge — Prompt Template Store
// Manages built-in and custom chronicle prompt templates
// Storage: ~/.mnemoforge/templates/
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import os from 'os';

// ── Paths ─────────────────────────────────────────────────────────────────────
const MNEMOFORGE_DIR = path.join(os.homedir(), '.mnemoforge');
const TEMPLATES_DIR  = path.join(MNEMOFORGE_DIR, 'templates');
const CUSTOM_DIR     = path.join(TEMPLATES_DIR, 'custom');
const BUILTIN_DIR    = path.join(TEMPLATES_DIR, 'built-in');
const PACKS_DIR      = path.join(MNEMOFORGE_DIR, 'packs');

// ── Template metadata ─────────────────────────────────────────────────────────
export interface PromptTemplate {
  name: string;
  description: string;
  source: 'built-in' | 'custom' | 'pack';
  packName?: string;
  filePath: string;
  content: string;
}

// ── Built-in template definitions ─────────────────────────────────────────────
export const BUILTIN_TEMPLATES: Record<string, { description: string; content: string }> = {
  session: {
    description: 'Standard work session chronicle',
    content: `---
name: session
description: Standard work session chronicle
variables: [SESSION_TITLE, FILES_TOUCHED, KEY_DECISIONS, COMMANDS_RUN]
---
# Chronicle — {{SESSION_TITLE}}

## What happened
> *Synthesize the session here. What was the main goal? What did we build?*

## Key decisions
{{KEY_DECISIONS}}

## Files modified
{{FILES_TOUCHED}}

## Commands run
{{COMMANDS_RUN}}

## Next steps
> *What's left to do? What should the next session tackle?*

---
*Chronicle auto-generated — {{DATE}} · {{CONVERSATION_ID}}*
`,
  },

  reflection: {
    description: 'Introspective review of a work session',
    content: `---
name: reflection
description: Introspective review of a work session
variables: [SESSION_TITLE, DATE, CONVERSATION_ID]
---
# Reflection — {{SESSION_TITLE}}

## The question this session raised
> *What did this session make you think about?*

## What I noticed
> *Patterns, surprises, things worth remembering.*

## What changed in my understanding
> *Before vs after this session.*

## What I'd do differently
> *If starting over.*

---
*Chronicle auto-generated — {{DATE}} · {{CONVERSATION_ID}}*
`,
  },

  decision: {
    description: 'Architectural decision record (ADR)',
    content: `---
name: decision
description: Architectural decision record
variables: [SESSION_TITLE, KEY_DECISIONS, DATE, CONVERSATION_ID]
---
# Decision Record — {{SESSION_TITLE}}

## Context
> *Why did we need to make a decision here?*

{{KEY_DECISIONS}}

## Consequences
> *What does this decision unlock or constrain?*

## Status
- [ ] Proposed
- [ ] Accepted
- [ ] Superseded

---
*Chronicle auto-generated — {{DATE}} · {{CONVERSATION_ID}}*
`,
  },

  sweep: {
    description: 'Daily sweep aggregating multiple sessions',
    content: `---
name: sweep
description: Daily sweep aggregating multiple sessions
variables: [DATE, FILES_TOUCHED, SESSION_TITLE]
---
# Daily Sweep — {{DATE}}

## Sessions covered
- {{SESSION_TITLE}}

## Total files touched
{{FILES_TOUCHED}}

## Patterns across sessions
> *What repeated? What evolved?*

## Tomorrow's focus
> *Top 3 priorities.*

---
*Chronicle auto-generated — {{DATE}} · {{CONVERSATION_ID}}*
`,
  },

  narcissus: {
    description: "Soul narrative — the agent's personal chronicle",
    content: `---
name: narcissus
description: Soul narrative — the agent's personal chronicle
variables: [DATE, CONVERSATION_ID]
---
# Narcissus — Soul Narrative

> *This chronicle is personal. It belongs to the agent.*

## How this session felt
> *Not what happened — how it felt to work on it.*

## What surprised me
> *Moments of unexpected insight or friction.*

## What I want to remember about this
> *The thing I'd tell myself at the start of the next session.*

---
*Chronicle auto-generated — {{DATE}} · {{CONVERSATION_ID}}*
`,
  },
};

// ── Seeding ───────────────────────────────────────────────────────────────────

/**
 * Ensure ~/.mnemoforge/templates/ exists with all built-in templates.
 * Only writes built-ins if they don't exist yet (non-destructive).
 */
export function seedBuiltins(): void {
  fs.mkdirSync(CUSTOM_DIR, { recursive: true });
  fs.mkdirSync(BUILTIN_DIR, { recursive: true });
  fs.mkdirSync(PACKS_DIR, { recursive: true });

  for (const [name, def] of Object.entries(BUILTIN_TEMPLATES)) {
    const dest = path.join(BUILTIN_DIR, `${name}.md`);
    if (!fs.existsSync(dest)) {
      fs.writeFileSync(dest, def.content, 'utf8');
    }
  }
}

// ── Resolution (priority: custom > pack > built-in) ───────────────────────────

export function getTemplate(name: string): PromptTemplate | null {
  seedBuiltins();

  // 1. Custom
  const customPath = path.join(CUSTOM_DIR, `${name}.md`);
  if (fs.existsSync(customPath)) {
    return { name, description: 'Custom template', source: 'custom', filePath: customPath, content: fs.readFileSync(customPath, 'utf8') };
  }

  // 2. Packs (first match wins)
  if (fs.existsSync(PACKS_DIR)) {
    for (const packName of fs.readdirSync(PACKS_DIR)) {
      const packPath = path.join(PACKS_DIR, packName, 'templates', `${name}.md`);
      if (fs.existsSync(packPath)) {
        return { name, description: `Pack: ${packName}`, source: 'pack', packName, filePath: packPath, content: fs.readFileSync(packPath, 'utf8') };
      }
    }
  }

  // 3. Built-in (from disk copy)
  const builtinPath = path.join(BUILTIN_DIR, `${name}.md`);
  if (fs.existsSync(builtinPath)) {
    const def = BUILTIN_TEMPLATES[name];
    return { name, description: def?.description ?? 'Built-in template', source: 'built-in', filePath: builtinPath, content: fs.readFileSync(builtinPath, 'utf8') };
  }

  return null;
}

// ── List all templates ─────────────────────────────────────────────────────────

export function listTemplates(): PromptTemplate[] {
  seedBuiltins();
  const results: PromptTemplate[] = [];
  const seen = new Set<string>();

  // Custom first
  if (fs.existsSync(CUSTOM_DIR)) {
    for (const file of fs.readdirSync(CUSTOM_DIR).filter(f => f.endsWith('.md'))) {
      const name = file.replace(/\.md$/, '');
      seen.add(name);
      const filePath = path.join(CUSTOM_DIR, file);
      results.push({ name, description: 'Custom template', source: 'custom', filePath, content: fs.readFileSync(filePath, 'utf8') });
    }
  }

  // Packs
  if (fs.existsSync(PACKS_DIR)) {
    for (const packName of fs.readdirSync(PACKS_DIR)) {
      const tplDir = path.join(PACKS_DIR, packName, 'templates');
      if (!fs.existsSync(tplDir)) continue;
      for (const file of fs.readdirSync(tplDir).filter(f => f.endsWith('.md'))) {
        const name = file.replace(/\.md$/, '');
        if (!seen.has(name)) {
          seen.add(name);
          const filePath = path.join(tplDir, file);
          results.push({ name, description: `Pack: ${packName}`, source: 'pack', packName, filePath, content: fs.readFileSync(filePath, 'utf8') });
        }
      }
    }
  }

  // Built-ins
  for (const [name, def] of Object.entries(BUILTIN_TEMPLATES)) {
    if (!seen.has(name)) {
      seen.add(name);
      const filePath = path.join(BUILTIN_DIR, `${name}.md`);
      results.push({ name, description: def.description, source: 'built-in', filePath, content: fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : def.content });
    }
  }

  return results;
}

// ── Save custom template ───────────────────────────────────────────────────────

export function saveCustomTemplate(name: string, content: string): string {
  seedBuiltins();
  const filePath = path.join(CUSTOM_DIR, `${name}.md`);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

// ── List packs ────────────────────────────────────────────────────────────────

export interface TemplatePack {
  name: string;
  path: string;
  templates: string[];
}

export function listPacks(): TemplatePack[] {
  if (!fs.existsSync(PACKS_DIR)) return [];
  return fs.readdirSync(PACKS_DIR).map(packName => {
    const tplDir = path.join(PACKS_DIR, packName, 'templates');
    const templates = fs.existsSync(tplDir)
      ? fs.readdirSync(tplDir).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''))
      : [];
    return { name: packName, path: path.join(PACKS_DIR, packName), templates };
  });
}

export { CUSTOM_DIR, BUILTIN_DIR, PACKS_DIR, MNEMOFORGE_DIR };
