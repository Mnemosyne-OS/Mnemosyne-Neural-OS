<div align="center">

<br/>

```
███╗   ███╗███╗   ██╗███████╗███╗   ███╗ ██████╗ ███████╗██╗   ██╗███╗   ██╗███████╗
████╗ ████║████╗  ██║██╔════╝████╗ ████║██╔═══██╗██╔════╝╚██╗ ██╔╝████╗  ██║██╔════╝
██╔████╔██║██╔██╗ ██║█████╗  ██╔████╔██║██║   ██║███████╗ ╚████╔╝ ██╔██╗ ██║█████╗  
██║╚██╔╝██║██║╚██╗██║██╔══╝  ██║╚██╔╝██║██║   ██║╚════██║  ╚██╔╝  ██║╚██╗██║██╔══╝  
██║ ╚═╝ ██║██║ ╚████║███████╗██║ ╚═╝ ██║╚██████╔╝███████║   ██║   ██║ ╚████║███████╗
╚═╝     ╚═╝╚═╝  ╚═══╝╚══════╝╚═╝     ╚═╝ ╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═══╝╚══════╝
```

### The sovereign AI Operating System

**Open to build on · Private at the core**

<br/>

[![CI](https://github.com/yaka0007/Mnemosyne-Neural-OS/actions/workflows/ci.yml/badge.svg)](https://github.com/yaka0007/Mnemosyne-Neural-OS/actions)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript)
![Electron](https://img.shields.io/badge/Electron-39-47848f?logo=electron)
![React](https://img.shields.io/badge/React-18-61dafb?logo=react)
![Tests](https://img.shields.io/badge/tests-1336%20passed-22c55e)
![License](https://img.shields.io/badge/license-open--core-8b5cf6)
[![version](https://img.shields.io/github/v/release/yaka0007/Mnemosyne-Neural-OS?include_prereleases&label=version&color=f59e0b)](https://github.com/yaka0007/Mnemosyne-Neural-OS/releases)

<br/><br/>

<!-- Download + MnemoForge badges: auto-updated by `.github/workflows/sync-readme-release-badges.yml` on Release (tags `v…` = OS setup, `cli-…` = CLI). -->
[![Download Mnemosyne OS](https://img.shields.io/badge/Download-Mnemosyne%20OS%20(v1.1.0--beta.1)%20%C2%B7%20NEW-111827?style=for-the-badge&logo=github)](https://github.com/yaka0007/Mnemosyne-Neural-OS/releases/tag/v1.1.0-beta.1)
[![MnemoForge CLI](https://img.shields.io/badge/📦_MnemoForge_CLI_(Open_Source)-8b5cf6?style=for-the-badge&logo=npm)](https://github.com/yaka0007/Mnemosyne-Neural-OS/releases/tag/cli-v1.3.18)

<br/>

</div>

---

## Build on Mnemosyne OS

**Mnemosyne OS is a sovereign, local-first AI operating system — with an open
developer surface to build on top of it.** Your apps, agents, and skins talk to a
private AI memory runtime through a **public Gateway contract**. You build against a
stable, documented surface; the Cognitive Core stays sealed and never exposed.

Two ways in:

- 🛠️ **Build on it** — scaffold an app and you're talking to the memory vault in minutes.
- 💾 **Run it** — install the flagship desktop app, [Infinity Edition](https://github.com/yaka0007/Mnemosyne-Neural-OS/releases/tag/v1.1.0-beta.1).

```bash
npm create @mnemosyne/app
```

| Package | What it does |
|---|---|
| [`@mnemosyne_os/sdk`](https://www.npmjs.com/package/@mnemosyne_os/sdk) | Connect an app to the local AI memory runtime (WebSocket / Electron IPC) |
| [`@mnemosyne_os/public-contracts`](https://www.npmjs.com/package/@mnemosyne_os/public-contracts) | Shared types & Zod schemas — the integration contract |
| [`@mnemosyne_os/design-sdk`](https://www.npmjs.com/package/@mnemosyne_os/design-sdk) | Build custom UI skins in pure JSON — zero TypeScript |
| [`@mnemosyne_os/eval-sdk`](packages/eval-sdk) | Evaluate an integration without touching the core |
| [`@mnemosyne/create-app`](packages/create-app) | Scaffold a new Mnemosyne app in one command |

Start from the [cartridge boilerplate](examples/cartridge-boilerplate) and you're
ingesting and querying the vault — under FGAC, scoped, and consent-gated — in minutes.

> **🛡️ Zero-Trust by design.** Every SDK connection authenticates with a short-lived
> JWT, listens on `127.0.0.1` only, and is bounded by the scopes your app manifest
> declares. The OS sees your requests; you never see the core.

---

## The open ecosystem

The open surface of Mnemosyne OS is **MIT-licensed** and free to build on:

- **Layer-2 SDK** (`/packages`) — the integration surface above: connect apps, build
  skins, scaffold projects, evaluate against the Gateway.
- **MnemoForge CLI** (`/cli`) — the sovereign developer tool: give any AI agent
  persistent memory, a behavioral identity, and an automated publish pipeline.

```bash
npm install -g @mnemosyne_os/forge
mnemoforge
```

| Feature | Command |
|---|---|
| 🪬 Soul Protocol — inject behavioral archetypes into your IDE | `mnemoforge soul inject` |
| 📋 Canvas Rules — living ruleset persisted across sessions | vault-based, auto-applied |
| 🗂️ Chronicle System — structured AI memory files | `mnemoforge chronicle write` |
| 🔌 MCP Server — expose vault tools to any agent | `mnemoforge serve` |
| 🖥️ Responsive dashboard | `mnemoforge` |

[![npm version](https://img.shields.io/npm/v/@mnemosyne_os/forge?color=8b5cf6&label=%40mnemosyne_os%2Fforge)](https://www.npmjs.com/package/@mnemosyne_os/forge)

→ **[CLI Documentation](https://mnemosyne-os.gitbook.io/mnemosyne-os-cli)** · **[npm package](https://www.npmjs.com/package/@mnemosyne_os/forge)** · **[Release notes](https://github.com/yaka0007/Mnemosyne-Neural-OS/releases/tag/cli-v1.3.18)**

---

## The flagship app — Mnemosyne OS Infinity Edition

The reference application of the ecosystem: a **production-grade AI Operating System**
that puts multi-agent intelligence under strict user control. Powered by a
**Decentralized Neural Kernel**, it integrates LLMs locally and privately via a secure
**libp2p Transport** and an audited **IPC Registry**.

Unlike fragmented AI wrappers, Mnemosyne enforces **Zero-Raw-Data** policies — your
encrypted knowledge vault is never indiscriminately exposed. Every agentic connection
is governed by strict **FGAC (Fine-Grained Access Control)**, ensuring total
sovereignty over what executes, what's stored, and what syncs.

### Core Modules

| Module | Description |
|--------|-------------|
| 🔮 **Resonance** | Cognitive semantic architecture injecting continuous, resonant memory into the AI's context |
| 🧠 **MnemoBrain** | Multi-model AI conversation hub — Claude, Ollama (local), OpenAI-compatible |
| 🎭 **Soul Studio** | AI identity builder — 16 MBTI archetypes, OCEAN personality model, custom soul profiles |
| 🌐 **MnemoDex** | Universal index of 16 MBTI archetypes and custom AI souls |
| 🗄️ **MnemoVault** | Encrypted local knowledge vault with full-text search and file management |
| 🔄 **MnemoSync** | Multi-agent orchestration with P2P Shadow Sync and real-time coordination |
| 🛡️ **Policy Studio** | AI governance layer with FGAC (Fine-Grained Access Control) |
| 📊 **MnemoStrategist** | AI planner integrating the BMAD 2.0 system for real-life project creation (Web2 & Web3) |
| ⚡ **MnemoForge** | AI-driven app generator — scaffold full Mnemosyne modules from a prompt |
| 🧩 **MnemoHub** | Centralized ecosystem hub for managing all optional apps, widgets, and features |
| 🔗 **NexusGraph** | Knowledge graph visualization |
| 🎯 **Cockpit** | Personalized AI dashboard with modular widgets |

### Interface Gallery

<br/>

<div align="center">
  <img src="assets/nexus-graph.png" alt="Nexus Graph: Active Resonance" width="800" />
  <br/>
  <em>Nexus Graph: Semantic memory vector visualization of your local knowledge vault</em>
  <br/><br/><br/>

  <img src="assets/soulstudio.png" alt="Soul Studio Welcome" width="800" />
  <br/>
  <em>Soul Studio: The genesis terminal for building AI identities</em>
  <br/><br/><br/>

  <img src="assets/genesis-protocol.png" alt="Genesis Protocol" width="800" />
  <br/>
  <em>Genesis Protocol: Configuration of the Soul's temporal anchor and Astral Birth Certificate</em>
  <br/><br/><br/>

  <img src="assets/personality-forge.png" alt="MnemoDex Ecosystem" width="800" />
  <br/>
  <em>MnemoDex: Universal index of MBTI AI Archetypes ready for immediate initialization</em>
  <br/><br/><br/>

  <img src="assets/mnemohub.png" alt="MnemoHub Platform" width="800" />
  <br/>
  <em>MnemoHub: Centralized ecosystem for installing modular AI applications and widgets</em>
  <br/><br/>
</div>

---

## Why it's safe to build on

The open SDK and the sealed core are separated by a single boundary: the **Gateway**.
Apps speak a public contract; the core's internals are never shipped to, or reachable
from, third-party code.

```
┌─────────────────────────────────────────────────────────┐
│                    RENDERER PROCESS                     │
│  React 18 · TypeScript strict · Vite · Framer Motion   │
│  Zustand (state) · i18next (EN/FR/ES) · Tailwind CSS   │
│                                                         │
│  30+ lazy-loaded routes · Suspense boundaries          │
│  62+ i18n namespaces · 88 test files · 1,336 tests     │
└────────────────────┬────────────────────────────────────┘
                     │ Context Bridge · Zod-validated IPC
                     │ contextIsolation: true · nodeIntegration: false
┌────────────────────▼────────────────────────────────────┐
│                    MAIN PROCESS (Electron)               │
│  IPC Registry · Modular services architecture           │
│  Structured logging (ANSI → userData/logs/main.log)     │
│  Content Security Policy · Node.js binary resolver      │
│                                                         │
│  Services: AI · Vault · Drive · Workspace · Shadow      │
│             Window · Network · FGAC · Scheduler         │
└─────────────────────────────────────────────────────────┘
```

**Security-first Electron architecture**
- `contextIsolation: true`, `nodeIntegration: false` on every window
- `sandbox: true` for web content — relaxed only for the local-AI worker threads, mitigated by context isolation + Zod-validated IPC
- Explicitly declared IPC methods via Context Bridge, validated with Zod + audit logging
- Strict Content Security Policy

**Sovereignty enforced in code**
- FGAC governs exactly what an agent — or a third-party app — can read, write, or sync
- 24h TTL on access grants, auto-healing on refresh
- P2P Shadow Sync with alert system and OS notifications
- No telemetry without consent

**Stack**
- **Runtime:** Electron 39, Node.js 22
- **Frontend:** React 18, TypeScript (strict mode), Vite
- **State:** Zustand with `useShallow` atomic selectors
- **AI Integration:** Claude API, Ollama (local LLMs), OpenAI-compatible endpoints
- **Testing:** Vitest + Testing Library — 1,336 tests, 100% pass rate
- **CI/CD:** GitHub Actions — typecheck + lint + i18n validation + tests

---

## Open-core & Licensing

Mnemosyne OS follows an **open-core model**: an open, MIT-licensed developer
ecosystem built around a proprietary core.

| Component | License | Description |
|-----------|---------|-------------|
| **Developer SDK** (`/packages/*`) | [MIT](./LICENSE) | Open — build apps, agents & skins on Mnemosyne OS |
| **MnemoForge CLI** (`/cli`) | [MIT](./cli/LICENSE) | Open source — free to use, modify, and redistribute |
| **Mnemosyne Neural OS** (platform) | Proprietary | © 2026 XPACEGEMS LLC — All rights reserved |

The **SDK** and **MnemoForge CLI** are MIT licensed — fork them, build on them, ship
your own apps. The **Mnemosyne Neural OS platform** — the desktop application,
Resonance Engine, MnemoVault, MnemoSync, Policy Studio, and associated services — is
**proprietary software**. No part of the platform may be copied, modified, or
distributed without explicit written permission from XPACEGEMS LLC.

> For licensing inquiries: [dev@mnemosyne-os.com](mailto:dev@mnemosyne-os.com)

---

## Quality

```
TypeScript errors     : 0   (strict mode, noUncheckedIndexedAccess)
ESLint warnings       : 0
Test pass rate        : 100%  (1,336 / 1,336)
Test files            : 88
CI pipeline           : ✅ Green (typecheck → lint → i18n → tests)
Source files          : 1,281 TS/TSX files
Lines of code         : 220,000+ (src) + 43,000+ (electron)
Languages             : 3 (EN / FR / ES)
i18n namespaces       : 62+
Electron security     : A-grade (all mitigations active)
```

---

## Development Philosophy

Mnemosyne is built on three principles:

**1. Sovereignty** — Your data stays local. Your models run locally if you choose. No
telemetry without consent. FGAC controls what the AI can and cannot access.

**2. Multi-model** — No vendor lock-in. Claude for reasoning quality, Ollama for
local/offline runs, any OpenAI-compatible endpoint. The soul profile layer works
across all backends.

**3. Agentic by design** — Not a chat interface with file upload. A real orchestration
layer where multiple AI agents coordinate, with policy enforcement and audit trails.

---

## Roadmap

- [x] **Public beta — Mnemosyne OS v1.1.0-beta.1** (Soul Studio · Resonance · First Contact)
- [x] **MnemoForge CLI v1.3.18 published on npm** — [`@mnemosyne_os/forge`](https://www.npmjs.com/package/@mnemosyne_os/forge) · Soul Protocol · Canvas Rules · Chronicle System · MCP Server
- [ ] 🚀 **Mnemosyne OS Infinity Edition — V1 final public launch**
- [ ] Team features (shared vault, multi-soul coordination)
- [ ] Self-hosted sync server
- [ ] Plugin marketplace for community soul profiles

---

## About

**XPACEGEMS LLC** — Independent AI software lab  
**Headquarters:** 2932 NW 72 AVE, Miami, FL 33122, USA  
**Founder & Lead Architect:** Tony Trochet  
**LinkedIn:** [Tony Trochet](https://www.linkedin.com/in/tony-t-19544650/)  
**GitHub:** [@yaka0007](https://github.com/yaka0007)

> Built with Claude (Anthropic) · Antigravity (Google DeepMind) · Cursor

---

<div align="center">

### Maintainer — live GitHub stats (year to date)

<!--PROFILE_STATS_START-->
![GitHub contributions 2026](https://img.shields.io/static/v1?label=contributions+2026&message=1771&color=22c55e&logo=github&style=flat-square)
![Commits 2026](https://img.shields.io/static/v1?label=commits+2026&message=1733&color=0369a1&logo=github&style=flat-square)
*Includes private repos · updated weekly by Actions*
<!--PROFILE_STATS_END-->

<br/>

*"The model may not know who it is. The soul does."*

<br/>

[![last commit](https://img.shields.io/github/last-commit/yaka0007/Mnemosyne-Neural-OS/main?label=last%20commit)](https://github.com/yaka0007/Mnemosyne-Neural-OS/commits/main/)
[![commit activity](https://img.shields.io/github/commit-activity/m/yaka0007/Mnemosyne-Neural-OS?label=commit%20activity)](https://github.com/yaka0007/Mnemosyne-Neural-OS/graphs/commit-activity)

</div>
