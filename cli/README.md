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

[![NPM Version](https://img.shields.io/npm/v/@mnemosyne_os/forge?style=flat-square&color=8B5CF6&label=version)](https://www.npmjs.com/package/@mnemosyne_os/forge)
[![Status](https://img.shields.io/badge/status-beta-orange?style=flat-square)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Ollama](https://img.shields.io/badge/Ollama-local%20AI-black?style=flat-square)](https://ollama.com)
[![Part of Mnemosyne](https://img.shields.io/badge/ecosystem-Mnemosyne%20Neural%20OS-8B5CF6?style=flat-square)](https://github.com/yaka0007/Mnemosyne-Neural-OS)

</div>

> **⚠️ Active beta.** APIs may change between minor versions. We run this in production on the Mnemosyne OS monorepo — feedback welcome.

---

## Ecosystem

| Package | Version | Role |
|---------|---------|------|
| **`@mnemosyne_os/forge`** | `1.4.7` | **CLI — scaffold, chronicles, MCP server, resonance agents** |
| [`@mnemosyne_os/sdk`](https://www.npmjs.com/package/@mnemosyne_os/sdk) | `1.0.0` | SDK — build Layer 2 apps connected to Mnemosyne OS runtime |
| [`@mnemosyne_os/sync`](https://www.npmjs.com/package/@mnemosyne_os/sync) | `0.0.1` | P2P — anonymous multi-agent synchronization via libp2p |

> All packages are independent. Use only what you need.

---

## What is MnemoForge?

**MnemoForge** is the official CLI for the [Mnemosyne Neural OS](https://github.com/yaka0007/Mnemosyne-Neural-OS) — a sovereign AI operating system built for the next generation of developer-agent collaboration.

It gives AI agents something they fundamentally lack: **persistent, versionable, IDE-agnostic memory**.

Every time an agent starts a session, it starts from zero. MnemoForge fixes this:

| System | Purpose |
|---|---|
| **Chronicles** | Structured memory files — key decisions, sessions, architectural moments |
| **Resonance Profiles** | IDE + Provider + Workspace identity — any agent, any tool |
| **Resonance Bridge** | Multi-agent protocol — pulse, inbox, send — agents talk to each other |
| **Local AI Filter** | Ollama integration — compress context before MCP injection (token-safe) |
| **MCP Server** | `mnemoforge serve` — exposes vault tools to any MCP-compatible agent |
| **Soul Profiles** | `mnemoforge soul dex` — inject behavioral archetypes (Architect, Shipper...) into your IDE |
| **Canvas Rules** | Living ruleset of agent + human rules, persisted in vault, never re-explained |

> **"Don't just scaffold code. Scaffold intelligence."**

---

## Install

```bash
npm install -g @mnemosyne_os/forge
```

Then run:

```bash
mnemoforge
```

---

## Quick Start

```bash
# 1. Configure your vault + Resonance profile
mnemoforge chronicle init

# 2. Configure Local AI (Ollama)
mnemoforge config ollama
# → Detects Ollama, lists models, saves your choice

# 3. Open interactive REPL
mnemoforge forge

# 4. Write a chronicle (interactive)
mnemoforge chronicle commit

# 5. Browse your vault
mnemoforge chronicle open
```

---

## Commands

### 🔮 Resonance Bridge (Multi-Agent Protocol)

> *Enable real-time coordination between AI agents in the same workspace.*

```bash
# See all agents and their current status
mnemoforge resonance agents

# Read your inbox (messages from other agents)
mnemoforge resonance inbox --agent cursor-ai
mnemoforge resonance inbox --agent cursor-ai --unread-only --mark-read

# Send a message to another agent
mnemoforge resonance send \
  --from antigravity \
  --to cursor-ai \
  --type task \
  --priority high \
  --message "Feature X ready, please write tests" \
  --zone "packages/mnemoforge-cli/src/core/"

# Update your agent pulse from the terminal
mnemoforge resonance pulse --set-agent antigravity --status active --zone "src/" --intent "Coding feature X"

# Read a specific agent's pulse
mnemoforge resonance pulse --agent cursor-ai
```

**Message types:** `task` · `review` · `test` · `block` · `approve` · `info`  
**Priorities:** `low` · `medium` · `high` · `critical`

> The Resonance Bridge protocol is **file-based** — messages live in `apps/mnemosync/data/messages/*.md`, readable by any agent or human. No server required.

---

### 🧠 Chronicle (Memory Vault)

```bash
mnemoforge chronicle init       # configure vault + Resonance profile
mnemoforge chronicle switch     # change active profile (IDE / Provider)
mnemoforge chronicle commit     # write a new chronicle interactively
mnemoforge chronicle open       # interactive vault browser
mnemoforge chronicle list       # list recent chronicles
mnemoforge chronicle sweep      # generate a daily consolidation chronicle
```

### 🏗 Canvas (Project Scaffolding)

```bash
mnemoforge canvas               # scaffold a new AI-native project
```

Templates included: `api` · `react-module` · `agent-service` (+ custom)

### 💬 Prompt Engine

```bash
mnemoforge prompt list          # browse & use prompt templates interactively
mnemoforge prompt create        # create a custom reusable prompt template
```

### ⚙️ Config & Local AI

```bash
mnemoforge config               # settings dashboard (vault, profile, AI)
mnemoforge config ollama        # detect Ollama, select memory filter model
mnemoforge config edit          # edit vault configuration
```

### 🔁 Forge (REPL Mode)

```bash
mnemoforge forge                # interactive REPL with all commands
```

### 🌐 MCP Server *(coming v1.4)*

```bash
mnemoforge serve                # start MCP server on port 3141
mnemoforge serve --port 4000    # custom port
```

> The MCP server will expose `write_chronicle()` and `get_context()` tools, letting Antigravity, Cursor, and Claude Code write chronicles natively — with Ollama pre-filtering context to reduce token usage.

---

## Local AI Integration (Ollama)

MnemoForge supports local AI via [Ollama](https://ollama.com) for **context compression** — filtering chronicle content before MCP injection to reduce token consumption.

```bash
# Setup
mnemoforge config ollama

# What it does:
# → Pings Ollama at localhost:11434
# → Lists available models (mistral, deepseek-r1, phi3, llama3...)
# → Saves your choice to vault config
# → Used as pre-filter when reading chronicles via MCP
```

**Recommended models for memory compression:**
- `phi3:mini` — fastest, lightweight
- `mistral:7b` — good balance  
- `llama3.2:latest` — solid general purpose
- `deepseek-r1:latest` — best reasoning (slower start)

---

## Resonance Profile Architecture

```
MnemoVault/
  Mnemosyne-OS/            ← Workspace
    CLI/                   ← Resonance Project
      Antigravity/         ← IDE
        Anthropic/         ← Provider
          CHRONICLE-2026-04-05-session.md
          CHRONICLE-2026-04-05-decision.md
    Dashboard/
      Cursor/
        Claude/
          ...
```

Each profile is completely independent. Switch between `Antigravity/Anthropic` and `Cursor/Claude` without losing any history.

**Chronicle styles:** `session` · `decision` · `reflection` · `sweep` · `narcissus`

---

## Neural Coding

MnemoForge implements **Neural Coding** — a development methodology where:

- The **human** holds the intention and understands the system  
- The **agent** understands the context and executes without re-explaining everything  
- The **memory** persists outside any IDE, session, or conversation

The code follows the thought. Not the other way around.

→ [Read the Neural Coding definition](https://mnemosyneos.gitbook.io/)

---

## Roadmap

- [x] `chronicle init/commit/list/open/switch/sweep` — agent memory vault
- [x] `workspace init/show/add-rule` — project safety memory
- [x] `project init` — Resonance Project hierarchy
- [x] `canvas` — AI-native project scaffolding
- [x] `prompt list/create` — reusable prompt templates (interactive)
- [x] `forge` — interactive REPL mode
- [x] `config` — settings dashboard + Ollama detection + local AI selection
- [x] `serve` stub — MCP server preview *(v1.3.8)*
- [x] `resonance agents/inbox/send/pulse` — multi-agent Resonance Bridge protocol *(v1.4)*
- [ ] `@mnemosync` VS Code Chat Participant — inbox in Cursor chat *(v1.4)*
- [ ] `serve` — live MCP server with `write_chronicle` + `get_context` tools *(v1.5)*
- [ ] Ollama context compression pipeline for MCP *(v1.5)*
- [ ] `@resonance-bridge/sdk` — standalone protocol package *(v2.0)*
- [x] `@mnemosyne_os/sdk` — official SDK for Layer 2 app development *(v1.0.0)*
- [ ] Chronicle certification — cryptographic signature *(v2.0)*

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Language | TypeScript 5 (strict) |
| CLI Framework | Commander.js v11 |
| Prompts | Inquirer.js v8 |
| Styling | Chalk v4 |
| Local AI | Ollama REST API |

---

## Documentation

Full docs on GitBook: **[mnemosyneos.gitbook.io](https://mnemosyneos.gitbook.io)**

- Getting Started
- Chronicle System
- Resonance Profiles
- Local AI & Ollama
- MCP Server (upcoming)
- Neural Coding Principles
- Command Reference

---

## License

MIT © 2026 [XPACEGEMS LLC](https://xpacegems.com) — Tony Trochet

---

## About

**XPACEGEMS LLC** — Independent AI Software Lab  
Miami, FL 33122, USA  
Founder & Lead Architect: [Tony Trochet](https://www.linkedin.com/in/tony-t-19544650/)

Built as part of **Mnemosyne Neural OS** — a sovereign AI operating system.  
Powered by **Antigravity (Google DeepMind)** · **Claude (Anthropic)** · **Cursor**

> *"Memory is the architecture of intelligence."*

---

<div align="center">

**[⭐ Star on GitHub](https://github.com/yaka0007/Mnemosyne-Neural-OS)** · **[📖 GitBook Docs](https://mnemosyneos.gitbook.io)** · **[📦 npm](https://www.npmjs.com/package/@mnemosyne_os/forge)** · **[🐛 Issues](https://github.com/yaka0007/Mnemosyne-Neural-OS/issues)**

</div>
