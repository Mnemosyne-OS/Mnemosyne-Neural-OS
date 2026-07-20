// ─────────────────────────────────────────────────────────────────────────────
// MnemoCanvas — Template Renderer
// Simple variable interpolation engine — zero dependencies
// ─────────────────────────────────────────────────────────────────────────────

// ── Shared types ──────────────────────────────────────────────────────────

export interface CanvasFile {
  path: string;       // relative to project root
  content: string;    // raw template string with {{VAR}} placeholders
}

export interface CanvasVars {
  PROJECT_NAME: string;       // MyCLI
  PROJECT_SLUG: string;       // my-cli
  PROJECT_PASCAL: string;     // MyCli
  WORKSPACE: string;          // Mnemosyne-OS
  ECOSYSTEM: string;          // Mnemosyne Neural OS (white-label)
  DATE: string;               // 2026-04-05
  AUTHOR: string;             // Tony Trochet
  AUTHOR_EMAIL: string;       // tony@xpacegems.com
  MNEMOFORGE_VERSION: string; // 1.2.5
}

// ── Renderer ──────────────────────────────────────────────────────────────

export function render(template: string, vars: CanvasVars): string {
  return Object.entries(vars).reduce((out, [key, val]) => {
    return out.replaceAll(`{{${key}}}`, val as string);
  }, template);
}

export function toSlug(name: string): string {
  return name
    .replace(/([A-Z])/g, (m, i) => (i > 0 ? '-' : '') + m)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function toPascal(slug: string): string {
  return slug.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

export function buildVars(
  projectName: string,
  workspace: string,
  author = 'XPACEGEMS',
  email = '',
  ecosystem = 'Mnemosyne Neural OS'
): CanvasVars {
  const slug = toSlug(projectName);
  return {
    PROJECT_NAME: projectName,
    PROJECT_SLUG: slug,
    PROJECT_PASCAL: toPascal(slug),
    WORKSPACE: workspace,
    ECOSYSTEM: ecosystem,
    DATE: new Date().toISOString().slice(0, 10),
    AUTHOR: author,
    AUTHOR_EMAIL: email,
    MNEMOFORGE_VERSION: '1.2.5',
  };
}
