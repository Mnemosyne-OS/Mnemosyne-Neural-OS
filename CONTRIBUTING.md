# Contributing to MnemoForge CLI

Thank you for your interest in contributing to **MnemoForge** — the AI inception engine for the Mnemosyne Neural OS ecosystem.

## What Can You Contribute To?

The **MnemoForge CLI** (`/cli`) is the open-source component of this repository (MIT License).
The Mnemosyne Neural OS platform itself is proprietary — contributions to the platform are not accepted via this public repository.

**Open to contributions:**
- Bug fixes in `cli/src/cli.ts`
- New scaffold templates (`cli/src/templates/`)
- Documentation improvements (`cli/README.md`)
- New `mnemoforge` commands (e.g., `mnemoforge add`, `mnemoforge upgrade`)
- Translations of templates and documentation

---

## Getting Started

### Prerequisites

- Node.js >= 18
- npm or pnpm

### Setup

```bash
git clone https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS.git
cd Mnemosyne-Neural-OS/cli
npm install
npm run build
```

### Test locally

```bash
node dist/cli.js init TestModule
```

### Run in watch mode (dev)

```bash
npm run dev
```

---

## Submitting a Contribution

1. **Fork** this repository
2. **Create a branch**: `git checkout -b feat/my-feature`
3. **Make your changes** — keep them focused and minimal
4. **Build**: `npm run build` (must pass with zero TypeScript errors)
5. **Test manually**: run `node dist/cli.js init TestModule` and verify output
6. **Commit** with a clear message: `feat: add mnemoforge upgrade command`
7. **Open a Pull Request** against `main`

---

## Code Standards

- **TypeScript strict mode** — zero `any`, zero type errors
- **No external dependencies** without discussion first (keep the CLI lean)
- **Templates must follow the Liquid Glass design system** (see `cli/src/templates/.cursorrules`)
- **Commit messages** follow [Conventional Commits](https://www.conventionalcommits.org/)

---

## Reporting Bugs

Use [GitHub Issues](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS/issues) with the `bug` label.

For **security vulnerabilities**, use [GitHub Security Advisories](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS/security/advisories/new) — never a public issue.

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./cli/LICENSE).

---

**XPACEGEMS LLC** — Miami, FL 33122, USA  
Questions? [dev@mnemosyne-os.com](mailto:dev@mnemosyne-os.com)
