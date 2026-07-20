/**
 * MnemoForge Dev Edition — Cursor IDE Connector
 * `mnemoforge dev cursor-import`
 *
 * Extrait les conversations Cursor (Composer + Chat) depuis les bases
 * SQLite locales et les convertit en DevChronicles pour le DevVault.
 *
 * Compatible Windows (AppData) + macOS (Library/Application Support).
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import chalk from 'chalk'
import type { DevChronicle, ConnectorImportResult } from '../../lib/dev-vault.js'

// ── Paths ──────────────────────────────────────────────────────────────────────

function getCursorStoragePath(): string {
  const platform = os.platform()
  if (platform === 'win32') {
    return path.join(os.homedir(), 'AppData', 'Roaming', 'Cursor', 'User', 'workspaceStorage')
  } else if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'workspaceStorage')
  } else {
    return path.join(os.homedir(), '.config', 'Cursor', 'User', 'workspaceStorage')
  }
}

function findWorkspaceDbs(storagePath: string, workspaceHash?: string): string[] {
  if (!fs.existsSync(storagePath)) return []

  if (workspaceHash) {
    const target = path.join(storagePath, workspaceHash, 'state.vscdb')
    return fs.existsSync(target) ? [target] : []
  }

  return fs.readdirSync(storagePath)
    .map(dir => path.join(storagePath, dir, 'state.vscdb'))
    .filter(p => fs.existsSync(p))
    .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size) // biggest first
}

// ── SQLite extraction (via better-sqlite3 if available, else raw file parse) ──

interface RawGeneration {
  unixMs: number
  generationUUID: string
  type: string
  textDescription?: string
}

async function extractFromDb(dbPath: string): Promise<{
  generations: RawGeneration[]
  prompts: { text: string; commandType: number }[]
}> {
  // Try better-sqlite3 first (optional dep), fall back to python
  try {
    // Dynamic import — optional peer dependency
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Database = (await import('better-sqlite3' as any)).default
    const db = new Database(dbPath, { readonly: true })

    const generations: RawGeneration[] = []
    const prompts: { text: string; commandType: number }[] = []

    const genRow = db.prepare("SELECT value FROM ItemTable WHERE key='aiService.generations'").get() as { value: string | Buffer } | undefined
    if (genRow) {
      const val = typeof genRow.value === 'string' ? genRow.value : genRow.value.toString('utf8')
      generations.push(...(JSON.parse(val) as RawGeneration[]))
    }

    const promptRow = db.prepare("SELECT value FROM ItemTable WHERE key='aiService.prompts'").get() as { value: string | Buffer } | undefined
    if (promptRow) {
      const val = typeof promptRow.value === 'string' ? promptRow.value : promptRow.value.toString('utf8')
      prompts.push(...(JSON.parse(val) as { text: string; commandType: number }[]))
    }

    db.close()
    return { generations, prompts }

  } catch {
    // better-sqlite3 not available — fallback to Python
    return await extractViaScript(dbPath)
  }
}

async function extractViaScript(dbPath: string): Promise<{
  generations: RawGeneration[]
  prompts: { text: string; commandType: number }[]
}> {
  const { spawn } = await import('child_process')

  const script = `
import sqlite3, json, sys
db = sqlite3.connect(sys.argv[1])
result = {}
for key in ['aiService.generations', 'aiService.prompts']:
    row = db.execute("SELECT value FROM ItemTable WHERE key=?", (key,)).fetchone()
    result[key] = json.loads(row[0]) if row else []
db.close()
print(json.dumps(result))
`

  return new Promise((resolve) => {
    const py = spawn('python', ['-c', script, dbPath])
    let output = ''
    py.stdout.on('data', (d: Buffer) => { output += d.toString() })
    py.on('close', () => {
      try {
        const parsed = JSON.parse(output)
        resolve({
          generations: parsed['aiService.generations'] ?? [],
          prompts: parsed['aiService.prompts'] ?? [],
        })
      } catch {
        resolve({ generations: [], prompts: [] })
      }
    })
    py.on('error', () => resolve({ generations: [], prompts: [] }))
  })
}

// ── Chronicle conversion ───────────────────────────────────────────────────────

function generationToChronicle(gen: RawGeneration, workspaceHash: string, existingIds: Set<string>): DevChronicle | null {
  if (!gen.textDescription?.trim()) return null
  const id = `cursor_${gen.generationUUID}`
  if (existingIds.has(id)) return null

  const tsMs = gen.unixMs ?? 0
  const timestamp = new Date(tsMs).toISOString()
  const content = gen.textDescription.trim()
  const sourceType = gen.type === 'composer' ? 'cursor_composer' : 'cursor_chat'

  // Heuristic: detect chronicle type from content
  const lower = content.toLowerCase()
  const chronicle_type = lower.includes('archit') || lower.includes('pourquoi') || lower.includes('décision') ? 'architectural'
    : lower.includes('bug') || lower.includes('erreur') || lower.includes('error') || lower.includes('fix') ? 'debug'
    : lower.includes('refactor') || lower.includes('clean') || lower.includes('supprime') ? 'refactor'
    : lower.includes('doc') || lower.includes('readme') || lower.includes('whitepaper') ? 'docs'
    : lower.includes('sécurité') || lower.includes('security') || lower.includes('auth') ? 'security'
    : 'feature'

  return {
    id,
    source: sourceType as DevChronicle['source'],
    chronicle_type,
    timestamp,
    timestamp_ms: tsMs,
    workspace: workspaceHash.slice(0, 8),
    content,
    story: `[Cursor ${gen.type.toUpperCase()} · ${timestamp.slice(0, 10)}] The developer instructed the AI: "${content}"`,
    facts: [
      `Developer instruction to Cursor: ${content}`,
      `Interaction type: ${gen.type}`,
      `Workspace: ${workspaceHash.slice(0, 8)}`,
      `Date: ${timestamp.slice(0, 10)}`,
    ],
    weight: 1.0,
    tags: ['cursor', gen.type, chronicle_type],
  }
}

// ── Main export function ───────────────────────────────────────────────────────

export interface CursorImportOptions {
  outputPath?: string
  workspaceHash?: string
  topWorkspaces?: number
  verbose?: boolean
}

export async function runCursorImport(opts: CursorImportOptions = {}): Promise<ConnectorImportResult> {
  const result: ConnectorImportResult = {
    connector: 'cursor_ide_v0.2',
    success: false,
    chronicles_imported: 0,
    chronicles_skipped: 0,
    errors: [],
  }

  const storagePath = getCursorStoragePath()
  if (opts.verbose) {
    console.log(chalk.gray(`  Scanning: ${storagePath}`))
  }

  let dbs = findWorkspaceDbs(storagePath, opts.workspaceHash)
  if (opts.topWorkspaces && !opts.workspaceHash) {
    dbs = dbs.slice(0, opts.topWorkspaces)
  }

  if (dbs.length === 0) {
    result.errors.push('No Cursor workspace databases found')
    return result
  }

  const existingIds = new Set<string>()
  const allChronicles: DevChronicle[] = []
  let minTs = Infinity
  let maxTs = 0

  for (const dbPath of dbs) {
    const hash = path.basename(path.dirname(dbPath))
    const sizeMb = (fs.statSync(dbPath).size / 1_048_576).toFixed(1)

    if (opts.verbose) {
      console.log(chalk.gray(`  [${hash.slice(0, 8)}...] (${sizeMb} MB)`))
    }

    try {
      const { generations } = await extractFromDb(dbPath)
      for (const gen of generations) {
        const chron = generationToChronicle(gen, hash, existingIds)
        if (!chron) { result.chronicles_skipped++; continue }
        existingIds.add(chron.id)
        allChronicles.push(chron)
        if (chron.timestamp_ms < minTs) minTs = chron.timestamp_ms
        if (chron.timestamp_ms > maxTs) maxTs = chron.timestamp_ms
        result.chronicles_imported++
      }
    } catch (e) {
      const msg = `Error reading ${hash.slice(0, 8)}: ${String(e)}`
      result.errors.push(msg)
      if (opts.verbose) console.log(chalk.red(`  ✖ ${msg}`))
    }
  }

  // Sort by timestamp ascending
  allChronicles.sort((a, b) => a.timestamp_ms - b.timestamp_ms)

  if (minTs !== Infinity) {
    result.date_range = {
      from: new Date(minTs).toISOString().slice(0, 10),
      to: new Date(maxTs).toISOString().slice(0, 10),
    }
  }

  // Write output
  const outputPath = opts.outputPath ?? path.join(process.cwd(), `cursor_chronicles_${Date.now()}.json`)
  const output = {
    export_date: new Date().toISOString(),
    connector: result.connector,
    total_chronicles: allChronicles.length,
    date_range: result.date_range,
    chronicles: allChronicles,
  }
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8')
  result.output_path = outputPath
  result.success = true

  return result
}
