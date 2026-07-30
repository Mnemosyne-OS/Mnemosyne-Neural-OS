#!/usr/bin/env node
/**
 * @mnemosyne_os/create-app — CLI Scaffolding
 *
 * Scaffolds a **Layer 2 app** (a standalone Node process that talks to Mnemosyne
 * OS over ws://127.0.0.1:7799 via @mnemosyne_os/sdk). This is NOT a cartridge —
 * for an in-app UI/widget, copy apps/mnemo-cartridge-boilerplate instead. See
 * docs/architecture/51 for the difference.
 *
 * Usage:
 *   npx @mnemosyne_os/create-app my-awesome-app
 *
 * Generates a ready-to-run project with:
 *   - app.manifest.json
 *   - index.ts
 *   - package.json (with @mnemosyne_os/sdk)
 *   - tsconfig.json
 *   - README.md
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const appName = process.argv[2];

if (!appName || appName === '--help' || appName === '-h') {
  console.log(`
  🧠 Mnemosyne OS — App Scaffolding CLI

  Usage:
    npx @mnemosyne_os/create-app <app-name>

  Example:
    npx @mnemosyne_os/create-app my-reddit-curator

  This will create a new directory with a ready-to-use Mnemosyne SDK app.
  `);
  process.exit(0);
}

// Validate app name
if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(appName)) {
  console.error(`\n  ❌ Invalid app name: "${appName}"`);
  console.error(`  Must be lowercase alphanumeric with hyphens/underscores (2-64 chars)\n`);
  process.exit(1);
}

const targetDir = resolve(process.cwd(), appName);

if (existsSync(targetDir)) {
  console.error(`\n  ❌ Directory already exists: ${targetDir}\n`);
  process.exit(1);
}

console.log(`\n  🚀 Creating Mnemosyne app: ${appName}\n`);

mkdirSync(targetDir, { recursive: true });

// ── app.manifest.json ────────────────────────────────────────────────────────
writeFileSync(join(targetDir, 'app.manifest.json'), JSON.stringify({
  id: appName,
  name: appName.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
  version: '1.0.0',
  author: 'your-name',
  mnemosyne_sdk: '^1.0.0',
  description: 'My Mnemosyne OS app',
  scopes: ['vault:read:SOCIAL', 'vault:write:SOCIAL'],
  vaults: ['SOCIAL'],
  intents: ['INGEST', 'QUERY'],
  max_chronicle_size_kb: 64,
  requires_consent: false,
}, null, 2));

// ── index.ts ─────────────────────────────────────────────────────────────────
writeFileSync(join(targetDir, 'index.ts'), `/**
 * ${appName} — Mnemosyne OS App
 * Built with @mnemosyne_os/sdk
 */
import { MnemoClient } from '@mnemosyne_os/sdk';

async function main() {
  // Connect to Mnemosyne OS (make sure the app is running!)
  const client = await MnemoClient.connect({
    appId: '${appName}',
    manifest: './app.manifest.json',
    transport: 'ws', // WebSocket — external Node.js app
  });

  console.log('[App] Connected to Mnemosyne OS ✓');

  // Ingest some data
  const result = await client.ingest({
    content: 'Hello from ${appName}! This is my first chronicle.',
    spineType: 'NOTE',
    vault: 'SOCIAL',
  });

  console.log('[App] Ingested:', result.chronicleId);

  // Query semantic context
  const results = await client.query('hello world', { limit: 5 });
  console.log('[App] Query results:', results.chronicles.length);

  await client.disconnect();
}

main().catch(console.error);
`);

// ── package.json ─────────────────────────────────────────────────────────────
writeFileSync(join(targetDir, 'package.json'), JSON.stringify({
  name: appName,
  version: '1.0.0',
  type: 'module',
  scripts: {
    start: 'tsx index.ts',
    build: 'tsc',
  },
  dependencies: {
    '@mnemosyne_os/sdk': '^1.0.0',
  },
  devDependencies: {
    tsx: '^4.0.0',
    typescript: '^5.3.0',
    '@types/node': '^20.0.0',
  },
}, null, 2));

// ── tsconfig.json ─────────────────────────────────────────────────────────────
writeFileSync(join(targetDir, 'tsconfig.json'), JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    strict: true,
    outDir: './dist',
  },
  include: ['*.ts'],
}, null, 2));

// ── .gitignore ────────────────────────────────────────────────────────────────
writeFileSync(join(targetDir, '.gitignore'), `node_modules/
dist/
*.env
`);

// ── README.md ─────────────────────────────────────────────────────────────────
writeFileSync(join(targetDir, 'README.md'), `# ${appName}

A Mnemosyne OS app built with [@mnemosyne_os/sdk](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS).

## Getting started

\`\`\`bash
npm install
npm start
\`\`\`

## Manifest

Edit \`app.manifest.json\` to declare the scopes and vaults your app needs.
Mnemosyne OS will enforce these permissions at runtime — Zero-Trust by default.

## Docs

- [SDK Documentation](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS/blob/main/packages/sdk/README.md)
- [Manifest Reference](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS/blob/main/packages/sdk/docs/MANIFEST.md)
`);

console.log(`  ✅ App created at: ${targetDir}`);
console.log(`
  Next steps:
    cd ${appName}
    npm install
    npm start

  Make sure the Mnemosyne OS app (Infinity Edition) is running before connecting!
`);
