// ─────────────────────────────────────────────────────────────────────────────
// MnemoChronicle — Markdown Parser
// Extracts metadata (title, type, date, tags, excerpt) from chronicle files
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';

export interface ParsedChronicle {
  title: string;
  type: string;
  tags: string[];
  excerpt: string;
  date: string;
}

export function parseChronicle(filename: string, dir: string): ParsedChronicle {
  const filePath = path.join(dir, filename);
  const rawSlug = filename.replace(/^CHRONICLE-\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '').replace(/-/g, ' ');
  let title = rawSlug.charAt(0).toUpperCase() + rawSlug.slice(1);
  let type = 'session';
  const tags: string[] = [];
  let excerpt = '';
  const dateMatch = filename.match(/CHRONICLE-(\d{4}-\d{2}-\d{2})/);
  let date = dateMatch ? dateMatch[1] : '';

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const resonanceIdx = raw.indexOf('<!--resonance');
    const content = resonanceIdx !== -1 ? raw.slice(0, resonanceIdx) : raw;
    const lines = content.split('\n');

    let inFrontmatter = false, frontmatterDone = false, dividerCount = 0;
    const bodyLines: string[] = [];

    for (const line of lines.slice(0, 40)) {
      const l = line.trim();
      if (l === '---' && !frontmatterDone) {
        dividerCount++;
        if (dividerCount === 1) { inFrontmatter = true; continue; }
        if (dividerCount === 2) { inFrontmatter = false; frontmatterDone = true; continue; }
      }
      if (inFrontmatter) {
        if (l.startsWith('title:')) title = l.replace('title:', '').trim().replace(/^['"]|['"]$/g, '');
        if (l.startsWith('type:'))  type  = l.replace('type:', '').trim();
        if (l.startsWith('date:') && l.match(/\d{4}-\d{2}-\d{2}/)) date = l.match(/\d{4}-\d{2}-\d{2}/)![0];
        continue;
      }
      if (l.startsWith('# '))        { title = l.slice(2).trim(); continue; }
      if (l.startsWith('**Type**:')) { type  = l.replace('**Type**:', '').trim().toLowerCase(); continue; }
      if (l.startsWith('**Date**:')) { const d = l.replace('**Date**:', '').trim(); if (d.match(/\d{4}-\d{2}-\d{2}/)) date = d.match(/\d{4}-\d{2}-\d{2}/)![0]; continue; }
      if (l.match(/^\*\*\w/))        continue;
      if (l === '---')               continue;
      if (l.length > 8 && !l.startsWith('#') && !l.match(/^\w+:\s*/) && (frontmatterDone || dividerCount === 0)) bodyLines.push(l);
    }

    const firstMeaningful = bodyLines.find(l => l.length > 10);
    if (firstMeaningful) excerpt = firstMeaningful.slice(0, 92) + (firstMeaningful.length > 92 ? '…' : '');
  } catch { /* use slug defaults */ }

  return { title, type, tags, excerpt, date };
}

export function getChronicleType(filename: string, dir: string): string {
  try {
    const raw = fs.readFileSync(path.join(dir, filename), 'utf8').slice(0, 800);
    const m = raw.match(/\*\*Type\*\*:\s*(\w+)/i) || raw.match(/^type:\s*(\w+)/im);
    return m ? m[1].toLowerCase() : 'session';
  } catch { return 'session'; }
}
