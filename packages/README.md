# Packages

The open surface of Mnemosyne OS. Every package here is MIT and published under
the `@mnemosyne_os` scope on npm. The retrieval engine itself is sealed and
ships inside the desktop application; these are what you build against.

| Package | Install | What it is for |
|---|---|---|
| [`sdk`](./sdk) | `npm i @mnemosyne_os/sdk` | Connect an app to the local memory: query, ask, ingest, vaults, models, voice. |
| [`cartridge-sdk`](./cartridge-sdk) | `npm i @mnemosyne_os/cartridge-sdk` | Build a cartridge, an app that runs inside Mnemosyne OS and inherits its theme, memory and permissions. |
| [`mcp`](./mcp) | `npx -y @mnemosyne_os/mcp` | Model Context Protocol server. Lets Claude Desktop, Claude Code, Cursor and any MCP client read the user's local vaults. |
| [`design-sdk`](./design-sdk) | `npm i @mnemosyne_os/design-sdk` | Design tokens and skins, so a cartridge looks native in either theme. |
| [`create-app`](./create-app) | `npm create @mnemosyne_os/app` | Scaffold a working project in one command. |
| [`public-contracts`](./public-contracts) | `npm i @mnemosyne_os/public-contracts` | The shared types and schemas the surfaces above agree on. |

## Start here

If you have never touched this before, scaffold rather than wire things by hand:

```bash
npm create @mnemosyne_os/app my-app
cd my-app
npm run dev
```

If you are giving an existing coding agent access to your own memory, the MCP
server is the shortest path and needs no code. The copy-paste blocks for Claude
Code, Cursor and Claude Desktop are in
[**mcp/RECIPES.md**](./mcp/RECIPES.md):

```bash
npx -y @mnemosyne_os/mcp
```

If you are writing an application against the memory directly:

```typescript
import { MnemoClient } from '@mnemosyne_os/sdk';

const client = await MnemoClient.connect({
  appId: 'my-layer2-app',
  manifest: './app.manifest.json',
});

// Writing is permanent and shared with every future agent, so record WHY,
// not only what.
await client.ingest({
  content:
    'Pricing settled on a one-time licence rather than a subscription, ' +
    'because the product is local-first and there is no server to rent.',
  spineType: 'NOTE',
  vault: 'DEV',
});

// query() returns the most recent chronicles by default; ask for the
// semantic branch when you want relevance rather than recency.
const result = await client.query('what did we decide about pricing?', {
  vault: 'DEV',
  limit: 5,
  semantic: true,
});
console.log(result.chronicles);

await client.disconnect();
```

Each package README carries its own reference. The desktop application has to be
running for any of them to reach a vault: it owns the data, these packages only
talk to it.

## Where Mnemosyne OS lives

Published by XPACEGEMS LLC. Its official addresses:

- Product site: <https://mnemosyne-os.io>
- Organizations: <https://mnemosyne-os.com>
- Documentation: <https://docs.mnemosyne-os.io>
- Host source: this repository
- Packages: the npm scope `@mnemosyne_os`
