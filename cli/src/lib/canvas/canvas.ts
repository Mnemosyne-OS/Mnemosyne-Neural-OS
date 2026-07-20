// ─────────────────────────────────────────────────────────────────────────────
// MnemoCanvas — Orchestrator
// Handles template discovery, scaffolding, and project initialization
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { render, buildVars, toSlug, type CanvasVars, type CanvasFile } from './renderer.js';
import { CLI_TEMPLATE } from './templates/cli/files.js';


export interface CanvasTemplate {
  id: string;
  name: string;
  description: string;
  stack: string;
  icon: string;
  files: CanvasFile[];
}

export interface CanvasOptions {
  projectName: string;
  workspace: string;
  targetDir?: string;   // defaults to ./<project-slug>
  author?: string;
  email?: string;
  ecosystem?: string;   // defaults to 'Mnemosyne Neural OS'
  template: string;     // template id
  dryRun?: boolean;     // preview without writing to disk
}

// ── Template registry ─────────────────────────────────────────────────────
export const CANVAS_TEMPLATES: CanvasTemplate[] = [
  {
    id: 'cli',
    name: 'Node.js CLI',
    description: 'A full CLI project — Commander.js + Chalk + Inquirer + TypeScript',
    stack: 'Commander · Chalk · Inquirer · TypeScript',
    icon: '◈',
    files: CLI_TEMPLATE,
  },
  {
    id: 'api',
    name: 'REST API',
    description: 'Fastify API with Zod validation — production-ready (coming soon)',
    stack: 'Fastify · Zod · TypeScript',
    icon: '◆',
    files: [], // Phase 2
  },
  {
    id: 'react-module',
    name: 'React Module',
    description: 'Mnemosyne-compliant React 18 module (coming soon)',
    stack: 'React 18 · Tailwind · Framer Motion',
    icon: '◇',
    files: [], // Phase 2
  },
  {
    id: 'agent-service',
    name: 'Agent Service',
    description: 'Background AI agent service (coming soon)',
    stack: 'Node.js · TypeScript · Agent structure',
    icon: '✦',
    files: [], // Phase 2
  },
];

// ── Write a single file ───────────────────────────────────────────────────
function writeFile(
  rootDir: string,
  file: CanvasFile,
  vars: CanvasVars,
  log: (msg: string) => void
): void {
  const dest = path.join(rootDir, file.path);
  const dir = path.dirname(dest);
  fs.mkdirSync(dir, { recursive: true });
  const rendered = render(file.content, vars);
  fs.writeFileSync(dest, rendered, 'utf8');
  log(file.path);
}

// ── Scaffold result ───────────────────────────────────────────────────────
export interface ScaffoldResult {
  rootDir: string;
  filesCreated: string[];
  errors: string[];
}

// ── Main scaffold function ────────────────────────────────────────────────
export function scaffold(opts: CanvasOptions, onFile?: (file: string) => void): ScaffoldResult {
  const template = CANVAS_TEMPLATES.find(t => t.id === opts.template);
  if (!template) throw new Error(`Unknown template: ${opts.template}`);
  if (template.files.length === 0) throw new Error(`Template "${opts.template}" is not yet available.`);

  const slug = toSlug(opts.projectName);
  const rootDir = opts.targetDir ?? path.join(process.cwd(), slug);
  const vars = buildVars(opts.projectName, opts.workspace, opts.author, opts.email, opts.ecosystem);

  const filesCreated: string[] = [];
  const errors: string[] = [];

  // Dry-run mode — list files without writing
  if (opts.dryRun) {
    for (const file of template.files) {
      filesCreated.push(file.path);
      onFile?.(file.path);
    }
    return { rootDir, filesCreated, errors };
  }

  // Refuse to overwrite non-empty existing directory
  if (fs.existsSync(rootDir)) {
    const contents = fs.readdirSync(rootDir);
    if (contents.length > 0) {
      throw new Error(`Directory "${rootDir}" already exists and is not empty.`);
    }
  }

  fs.mkdirSync(rootDir, { recursive: true });

  for (const file of template.files) {
    try {
      writeFile(rootDir, file, vars, (f) => {
        filesCreated.push(f);
        onFile?.(f);
      });
    } catch (err: any) {
      errors.push(`${file.path}: ${err.message}`);
    }
  }

  return { rootDir, filesCreated, errors };
}
