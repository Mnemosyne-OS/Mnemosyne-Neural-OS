# 🔐 Security Policy — Mnemosyne Neural OS

**Security Score: A-grade** | Last Audit: March 31, 2026 | Status: ✅ Production-Ready

---

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x.x (current) | ✅ Active support |
| 0.2.x | ✅ Security patches only |
| < 0.2 | ❌ End of life |

---

## Reporting a Vulnerability

We take security seriously. If you discover a vulnerability, please report it **responsibly and privately**.

### How to Report

1. **Do NOT** open a public GitHub issue for security vulnerabilities
2. Use **[GitHub Security Advisories](https://github.com/yaka0007/Mnemosyne-Neural-OS/security/advisories/new)** (preferred)
3. Or email directly: **[dev@mnemosyne-os.com](mailto:dev@mnemosyne-os.com)**

Please include:
- Type of vulnerability (e.g., XSS, RCE, path traversal)
- Steps to reproduce
- Potential impact assessment
- Suggested remediation (if any)

### Response Timeline

| Severity | Acknowledgment | Resolution Target |
|----------|---------------|-------------------|
| 🔴 Critical | < 24 hours | 7 days |
| 🟠 High | < 48 hours | 14 days |
| 🟡 Medium | < 72 hours | 30 days |
| 🟢 Low | < 7 days | Next release |

Responsible disclosures will be credited in release notes (unless anonymity is requested).

---

## Security Architecture

Mnemosyne is designed with a **defense-in-depth** philosophy. Security is enforced at every layer of the stack.

### 🖥️ Electron Hardening (A-grade)

All Electron security mitigations are active in production:

| Setting | Value | Why |
|---------|-------|-----|
| `contextIsolation` | `true` | Isolates renderer from main process |
| `nodeIntegration` | `false` | Prevents Node.js access from renderer |
| `sandbox` | `true` (web content) · `false` (local-AI workers) | Web content is sandboxed; local-AI worker windows relax it to run in-process inference, compensated by `contextIsolation` + Zod-validated IPC |
| `webSecurity` | `true` | Enforces same-origin policy |
| `devTools` | disabled in production | Prevents runtime inspection |
| IPC surface | `contextBridge` only | 242 explicitly declared IPC channels |

All IPC handlers are **Zod-validated** with structured audit logging.

### 🗄️ Data & Secrets Security

- ✅ API keys stored in **OS system keychain** via `keytar` — never in config files or source code
- ✅ No secrets in source code (enforced via `.gitignore` + pre-commit hooks)
- ✅ **Path traversal protection** — whitelist-based absolute path validation on all file operations
- ✅ **Command injection protection** — dangerous patterns blocked at IPC handler level
- ✅ File size limits on all read operations
- ✅ **Shield + Watchtower module** — runtime integrity monitoring (vault checksums, network anomalies, keyvault protection)

### 🌐 Network & Content Security

- ✅ **Content Security Policy (CSP)** — strict domain whitelist enforced
- ✅ `X-Content-Type-Options: nosniff`
- ✅ `X-Frame-Options: DENY`
- ✅ `Referrer-Policy: strict-origin-when-cross-origin`
- ✅ **Neural Link P2P (MnemoSync)** — end-to-end encrypted via Noise Protocol over libp2p

> **Known limitation:** `'unsafe-inline'` is present in CSP for styles — required by the dynamic theming system. A nonce-based CSP migration is planned for v1.1.

### 🔑 OAuth & Authentication

- ✅ Cryptographically secure state tokens (`crypto.randomBytes`)
- ✅ State token expiration: 10-minute TTL
- ✅ Single-use state validation (replay attack prevention)
- ✅ Automatic cleanup of expired tokens
- 🔄 PKCE support — implemented but pending activation (v1.1 target)

### 🏗️ Build & Supply Chain Security

- ✅ Source maps **disabled** in production builds
- ✅ All sensitive files in `.gitignore`
- ✅ Dependency audits before each release (`pnpm audit`)
- ✅ GitHub Actions CI enforces typecheck + lint + tests on every push

---

## Security Audit Results

**Latest audit: March 31, 2026**

```
Critical vulnerabilities  : 0
High vulnerabilities      : 0
Medium vulnerabilities    : 0
Overall security score    : A-grade
Electron security grade   : A (all mitigations active)
TypeScript errors         : 0 (strict mode, noUncheckedIndexedAccess)
```

---

## Security Best Practices for Contributors

### ✅ Do

- Use `contextBridge` for all renderer ↔ main process communication
- Validate all user inputs with Zod schemas
- Use `validateAbsolutePath()` for all file system operations
- Apply the principle of least privilege for IPC handlers
- Run `pnpm audit` before submitting a PR
- Use `crypto.randomBytes()` for all security-sensitive random values

### ❌ Don't

- Never commit secrets, API keys, or tokens
- Never use `eval()`, `new Function()`, or dynamic code execution
- Never disable security features (contextIsolation, sandbox, CSP)
- Never use `shell.openExternal()` with user-provided or unvalidated URLs
- Never expose Node.js APIs to the renderer process
- Never use `Math.random()` for cryptographic purposes

---

## Dependency Security

We audit dependencies before every release:

```bash
pnpm audit
pnpm audit --fix  # auto-fix where safe
```

All **High** and **Critical** findings are resolved before any public release.

---

## Security Contact

| Channel | Contact |
|---------|---------|
| GitHub Security Advisories | [Report privately](https://github.com/yaka0007/Mnemosyne-Neural-OS/security/advisories/new) |
| Email | [dev@mnemosyne-os.com](mailto:dev@mnemosyne-os.com) |
| Response SLA | < 48 hours for acknowledgment |

**XPACEGEMS LLC** — Miami, FL 33122, USA

---

*This security policy applies to the Mnemosyne Neural OS platform and the MnemoForge CLI.*  
*Last updated: April 2026*
