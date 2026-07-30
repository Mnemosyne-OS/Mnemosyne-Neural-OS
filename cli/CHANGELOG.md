# Changelog

All notable changes to MnemoForge CLI are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.0.0] — 2026-04-03

### 🎉 Initial Public Release

**MnemoForge CLI** is now publicly available as part of the [Mnemosyne Neural OS](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS) ecosystem.

#### Added
- `mnemoforge init <module-name>` — Scaffold a Mnemosyne-grade module with AI governance DNA
- Interactive mode: prompts for module name if not provided as argument
- Input validation: enforces valid module name format
- **`.cursorrules`** template — Liquid Glass design system constraints for AI agents
- **`AGENT_INSTRUCTIONS.md`** template — Structured mission directive for AI agents (Cursor, Claude, Copilot)
- **`index.tsx`** template — React 18 + Framer Motion boilerplate, Mnemosyne-compliant
- Visual ASCII banner with violet gradient styling
- Error handling with clear, actionable messages
- TypeScript strict mode — zero `any` tolerance

#### Technical
- Node.js 18+ compatibility
- Commander.js v11 CLI framework
- Inquirer.js v8 interactive prompts
- Chalk v4 terminal styling
- Template variable substitution (`{{MODULE_NAME}}`)

---

*XPACEGEMS LLC · Tony Trochet · MIT License*
