<div align="center">

<img src="https://raw.githubusercontent.com/Mnemosyne-OS/Mnemosyne-Neural-OS/main/assets/banner-mnemosyne-os.png" width="100%" alt="Mnemosyne OS — Your memory. Your machine. Your rules." />

🌐 [**mnemosyne-os.io**](https://mnemosyne-os.io) — the product, for builders · [**mnemosyne-os.com**](https://mnemosyne-os.com) — the company, press & labs · [**docs.mnemosyne-os.io**](https://docs.mnemosyne-os.io) — the documentation

</div>

# @mnemosyne_os/create-app

> **Scaffold a Mnemosyne OS Layer 2 app in one command.**

```bash
npm create @mnemosyne_os/app my-awesome-app
```

That's it. You get a ready-to-run project wired to the local Mnemosyne OS
runtime:

- `app.manifest.json` — your app's identity and requested scopes
- `index.ts` — a working starter that connects, queries memory and ingests
- `package.json` — with [`@mnemosyne_os/sdk`](https://www.npmjs.com/package/@mnemosyne_os/sdk) already in place
- `tsconfig.json` + a project README

## What is a Layer 2 app?

A **standalone Node process** that talks to a running Mnemosyne OS instance
over its local WebSocket surface (`ws://127.0.0.1:7799`) through the official
SDK — semantic memory queries, ingestion, model inference, voice. Your code
runs outside the app; the memory never leaves the machine.

Building an **in-app widget** instead (an iframe cartridge rendered on the
canvas)? That's a different rail — use the
[cartridge SDK](https://www.npmjs.com/package/@mnemosyne_os/cartridge-sdk) and
its boilerplate.

## Requirements

- Node.js ≥ 18
- [Mnemosyne OS — Infinity Edition](https://mnemosyne-os.io/download) running
  locally (free download; Windows builds are code-signed)

## Next steps

- SDK reference: [`@mnemosyne_os/sdk`](https://www.npmjs.com/package/@mnemosyne_os/sdk)
- Give any MCP agent access to the same memory: [`@mnemosyne_os/mcp`](https://www.npmjs.com/package/@mnemosyne_os/mcp)
- Ship a UI skin in pure JSON: [`@mnemosyne_os/design-sdk`](https://www.npmjs.com/package/@mnemosyne_os/design-sdk)

---

## The OS your code talks to

<img src="https://raw.githubusercontent.com/Mnemosyne-OS/Mnemosyne-Neural-OS/main/assets/infinite-canvas.jpg" width="100%" alt="Mnemosyne OS — Infinity Edition: the infinite canvas, the image gallery, MnemoHub and the living memory" />

*Mnemosyne OS — Infinity Edition v1.4.0 · The Infinite Vision — [download](https://mnemosyne-os.io/download) · [mnemosyne-os.io](https://mnemosyne-os.io) · [mnemosyne-os.com](https://mnemosyne-os.com)*

## Where Mnemosyne OS lives

Published by XPACEGEMS LLC. Its official addresses:

- Product site: <https://mnemosyne-os.io>
- Organizations: <https://mnemosyne-os.com>
- Documentation: <https://docs.mnemosyne-os.io>
- Source: <https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS>
- Packages: the npm scope `@mnemosyne_os`

---

## License

MIT
