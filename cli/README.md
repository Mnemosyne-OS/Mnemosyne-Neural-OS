<div align="center">

```
███╗   ███╗███╗   ██╗███████╗███╗   ███╗ ██████╗ ███████╗ ██████╗ ██████╗  ██████╗ ███████╗
████╗ ████║████╗  ██║██╔════╝████╗ ████║██╔═══██╗██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝
██╔████╔██║██╔██╗ ██║█████╗  ██╔████╔██║██║   ██║█████╗  ██║   ██║██████╔╝██║  ███╗█████╗  
██║╚██╔╝██║██║╚██╗██║██╔══╝  ██║╚██╔╝██║██║   ██║██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝  
██║ ╚═╝ ██║██║ ╚████║███████╗██║ ╚═╝ ██║╚██████╔╝██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗
╚═╝     ╚═╝╚═╝  ╚═══╝╚══════╝╚═╝     ╚═╝ ╚═════╝ ╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝
```

**MnemoForge CLI** — The Inception Engine of the Mnemosyne Neural OS

[![NPM Version](https://img.shields.io/badge/version-1.2.2-violet?style=flat-square)](https://www.npmjs.com/package/@mnemosyne_os/forge)
[![Status](https://img.shields.io/badge/status-beta-orange?style=flat-square)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Part of Mnemosyne](https://img.shields.io/badge/ecosystem-Mnemosyne%20Neural%20OS-8B5CF6?style=flat-square)](https://github.com/yaka0007/Mnemosyne-Neural-OS)

</div>

> **⚠️ This package is in active beta development.** APIs and commands may change between minor versions. We are using it in production on Mnemosyne OS itself — feedback and issues welcome.

---

## What is MnemoForge?

**MnemoForge** is the official CLI for the [Mnemosyne Neural OS](https://github.com/yaka0007/Mnemosyne-Neural-OS) ecosystem.

It gives AI agents something they fundamentally lack: **persistent, versionable, IDE-agnostic memory**.

Every time an agent starts a new session, it starts from zero. MnemoForge fixes this with two systems:

| System | Purpose |
|---|---|
| **Chronicles** | Structured memory files capturing key decisions and sessions |
| **Workspace / Resonance Project** | Project-level rules that any agent reads at session start |

> **"Don't just scaffold code. Scaffold intelligence."**

---

## Install

```bash
npm install -g @mnemosyne_os/forge
```

Verify:

```bash
mnemoforge --version
```

---

## Quick Start

```bash
# 1. Initialize the vault (once per machine)
mnemoforge chronicle init

# 2. Set up a Workspace (ecosystem / org)
mnemoforge workspace init
# → Workspace name: Mnemosyne-OS

# 3. Create a Resonance Project (feature / component)
mnemoforge project init
# → Project: CLI
# → Chronicles vault: ~/MnemoVault/Mnemosyne-OS/CLI/Antigravity/Anthropic/

# 4. Check workspace rules before starting work (agent briefing)
mnemoforge workspace show

# 5. Archive a chronicle written by your agent
mnemoforge chronicle archive --file "handbook/chronicles/CHRONICLE-2026-04-05-my-decision.md"
```

---

## Core Concepts

### Chronicles

Chronicles are structured Markdown files that capture key decisions, sessions, and architectural moments.

```
CHRONICLE-YYYY-MM-DD-short-slug.md
```

They are written by the AI agent at the moment a decision is made — not after. They are archived into a structured vault organized by Workspace → Project → IDE → Provider.

**Chronicle styles:** `session` · `decision` · `reflection` · `sweep` · `narcissus`

### Workspace & Resonance Project

```
MnemoVault/
  Mnemosyne-OS/          ← Workspace (ecosystem)
    CLI/                 ← Resonance Project (feature)
      Antigravity/       ← IDE
        Anthropic/       ← Provider
          CHRONICLE-...md
    Dashboard/
      ...
```

The `WORKSPACE.json` file stores project-level rules readable by any agent at session start — independent of any IDE, cloud, or session state.

---

## Commands

### Scaffold

```bash
mnemoforge init [module-name]   # scaffold a new Mnemosyne module
```

### Chronicle (Memory)

```bash
mnemoforge chronicle init       # configure vault (IDE, provider, path)
mnemoforge chronicle archive --file <path>   # archive an agent-written chronicle
mnemoforge chronicle commit     # create a chronicle interactively or --auto
mnemoforge chronicle list       # list chronicles in the vault
mnemoforge chronicle sweep      # generate a daily consolidation chronicle
```

### Workspace

```bash
mnemoforge workspace init       # create WORKSPACE.json in the current project
mnemoforge workspace show       # display rules as an agent briefing
mnemoforge workspace add-rule "<rule>" [--section <section>]
```

### Resonance Project

```bash
mnemoforge project init         # link workspace + project + scaffold handbook/chronicles/
```

---

## Neural Coding

MnemoForge implements **Neural Coding** — a development methodology where:

- The **human** holds the intention and understands the system
- The **agent** understands the context and executes without mechanical re-explanations
- The **memory** persists outside of any IDE, session, or conversation

The code follows the thought. Not the other way around.

→ [Read the Neural Coding definition](https://github.com/yaka0007/Mnemosyne-Neural-OS/tree/main/cli/docs/04-neural-coding.md)

---

## Documentation

Full documentation available in the [cli/docs](https://github.com/yaka0007/Mnemosyne-Neural-OS/tree/main/cli/docs) folder:

- [Getting Started](https://github.com/yaka0007/Mnemosyne-Neural-OS/blob/main/cli/docs/01-getting-started.md)
- [Chronicle System](https://github.com/yaka0007/Mnemosyne-Neural-OS/blob/main/cli/docs/02-chronicle.md)
- [Workspace Memory](https://github.com/yaka0007/Mnemosyne-Neural-OS/blob/main/cli/docs/03-workspace.md)
- [Neural Coding Principles](https://github.com/yaka0007/Mnemosyne-Neural-OS/blob/main/cli/docs/04-neural-coding.md)
- [Command Reference](https://github.com/yaka0007/Mnemosyne-Neural-OS/blob/main/cli/docs/05-command-reference.md)

---

## Roadmap

- [x] `mnemoforge init` — module scaffolding with AI governance injection
- [x] `mnemoforge chronicle init/archive/commit/list/sweep` — agent memory vault
- [x] `mnemoforge workspace init/show/add-rule` — project safety memory
- [x] `mnemoforge project init` — Resonance Project hierarchy
- [ ] `mnemoforge workspace watcher` — auto-archive chronicles on file creation
- [ ] `mnemoforge canvas` — deploy pre-configured project templates
- [ ] Chronicle certification — cryptographic signature (Neural Coding P5)

---

## Development

```bash
git clone https://github.com/yaka0007/Mnemosyne-Neural-OS.git
cd Mnemosyne-Neural-OS/cli
npm install
npm run build
npm link
mnemoforge --version
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Language | TypeScript 5 (strict) |
| CLI Framework | Commander.js v11 |
| Prompts | Inquirer.js v8 |
| Output Styling | Chalk v4 |

---

## License

MIT © 2026 [XPACEGEMS LLC](https://xpacegems.com) — Tony Trochet

---

## About

**XPACEGEMS LLC** — Independent AI Software Lab  
Miami, FL 33122, USA  
Founder & Lead Architect: [Tony Trochet](https://www.linkedin.com/in/tony-t-19544650/)

Built as part of **Mnemosyne Neural OS** — a sovereign AI operating system.  
Built through **Neural Coding** — human-architected, with Antigravity (Google DeepMind), Claude (Anthropic), and Cursor directed as instruments.

> *"The model may not know who it is. The soul does."*

---

<div align="center">

**[⭐ Star on GitHub](https://github.com/yaka0007/Mnemosyne-Neural-OS)** · **[📖 Documentation](https://github.com/yaka0007/Mnemosyne-Neural-OS/tree/main/cli/docs)** · **[🐛 Report Issues](https://github.com/yaka0007/Mnemosyne-Neural-OS/issues)**

</div>
