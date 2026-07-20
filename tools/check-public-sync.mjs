#!/usr/bin/env node
/**
 * Public ↔ npm drift checker.
 *
 * Fails loud (exit 1) when the public repo has drifted from what is actually
 * published on npm — the class of problems that keeps biting this mirror:
 *   - a package's source version is BEHIND its published npm version
 *   - a package is committed under an orphan / wrong scope
 *   - the README quickstart points at an unpublished scope (404)
 *
 * Dependency-free. Node 18+ (uses global fetch). Run: node tools/check-public-sync.mjs
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Canonical name -> path to its package.json in this repo.
const PACKAGES = {
  '@mnemosyne_os/sdk': 'packages/sdk/package.json',
  '@mnemosyne_os/public-contracts': 'packages/public-contracts/package.json',
  '@mnemosyne_os/create-app': 'packages/create-app/package.json',
  '@mnemosyne_os/design-sdk': 'packages/design-sdk/package.json',
  '@mnemosyne_os/forge': 'cli/package.json',
}

const errors = []
const warnings = []
const rows = []

const readJSON = (p) => JSON.parse(readFileSync(resolve(root, p), 'utf8'))

/** Compare two x.y.z strings. Returns <0, 0, >0. Pre-release tags are ignored. */
function cmpVersion(a, b) {
  const norm = (v) => String(v).split('-')[0].split('.').map((n) => Number(n) || 0)
  const pa = norm(a)
  const pb = norm(b)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0)
  }
  return 0
}

async function npmLatest(name) {
  const url = `https://registry.npmjs.org/${name.replace('/', '%2F')}/latest`
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (res.status === 404) return { unpublished: true }
  if (!res.ok) throw new Error(`npm ${res.status}`)
  const json = await res.json()
  return { version: json.version }
}

for (const [name, path] of Object.entries(PACKAGES)) {
  const pkg = readJSON(path)

  if (pkg.name !== name) {
    errors.push(`${path}: name is "${pkg.name}" but should be "${name}" (orphan/wrong scope)`)
  }

  let latest
  try {
    latest = await npmLatest(name)
  } catch (e) {
    warnings.push(`${name}: could not reach npm (${e.message}) — version check skipped`)
    rows.push([name, pkg.version, '?', 'skip'])
    continue
  }

  if (latest.unpublished) {
    rows.push([name, pkg.version, '—', 'unpublished'])
    warnings.push(`${name}: not published on npm (source-only package)`)
    continue
  }

  const d = cmpVersion(pkg.version, latest.version)
  let status
  if (d < 0) {
    status = 'BEHIND'
    errors.push(`${name}: repo is ${pkg.version} but npm latest is ${latest.version} — repo is BEHIND npm`)
  } else if (d > 0) {
    status = 'ahead'
    warnings.push(`${name}: repo ${pkg.version} is ahead of npm ${latest.version} (unpublished bump?)`)
  } else {
    status = 'ok'
  }
  rows.push([name, pkg.version, latest.version, status])
}

// README quickstart must resolve to a published scope.
const readme = readFileSync(resolve(root, 'README.md'), 'utf8')
const orphanCreate = readme.match(/npm create @mnemosyne\/app/)
if (orphanCreate) {
  errors.push('README: `npm create @mnemosyne/app` uses the orphan scope (404 on npm) — use `@mnemosyne_os/app`')
}
if (!/npm create @mnemosyne_os\/app/.test(readme)) {
  warnings.push('README: no `npm create @mnemosyne_os/app` quickstart found')
}

// Report.
const icon = (s) => (s === 'ok' ? '✔' : s === 'BEHIND' ? '✖' : '…')
console.log('\nPublic ↔ npm sync check\n')
for (const [n, v, l, s] of rows) {
  console.log(`  ${icon(s)} ${n.padEnd(34)} repo=${String(v).padEnd(9)} npm=${l}`)
}
if (warnings.length) {
  console.log('\nWarnings:')
  for (const w of warnings) console.log(`  ⚠ ${w}`)
}
if (errors.length) {
  console.log('\nErrors:')
  for (const e of errors) console.log(`  ✖ ${e}`)
  console.log('\nPublic repo has drifted from npm. Fix the above before merging.\n')
  process.exit(1)
}
console.log('\nAll public packages are in sync with npm. ✅\n')
