# Local-First Sovereignty — The Security Model

> *Your data. Your machine. Your keys. Your memory. Everything stays where you decided it should stay.*

---

## The Position Before the Technical Details

Most AI applications make a trade-off you don't get to negotiate: in exchange for intelligence, you send your conversations, your notes, your context, your decisions to a server you do not control.

Mnemosyne does not make that trade-off.

Not because of ideology. Because of architecture.

The system is local-first by design — not as a marketing position, but as a series of concrete technical decisions made at the lowest level of the stack. This chapter documents those decisions.

---

## The Three-Process Model: The First Security Boundary

Every Electron application runs in at least two processes. Mnemosyne runs in three, with an explicit security contract between each.

```
┌────────────────────────────────────────────────────────────┐
│  MAIN PROCESS (Node.js)                                    │
│  filesystem · IPC registry · AI service calls             │
│  Full Node.js access — never exposed to web content        │
│  ─────────────────────────────────────────────────────     │
│  PRELOAD SCRIPT (contextBridge)                            │
│  The one and only bridge between processes                 │
│  Explicit whitelist: only named functions cross this wall  │
│  ─────────────────────────────────────────────────────     │
│  RENDERER PROCESS (React/Vite)                             │
│  UI only — no direct Node.js access                        │
│  Cannot read files, cannot make system calls               │
│  Communicates exclusively through window.api               │
└────────────────────────────────────────────────────────────┘
```

**The security contract:** The renderer — where all UI code runs, where all user interaction happens, where potential injection vectors exist — has **zero direct access** to the filesystem, network stack, or system APIs. Every capability it needs must cross the `contextBridge` explicitly.

If a UI component calls `window.api.readFile(path)`, the preload script validates that call exists, then forwards it to the main process, which validates the path before touching any file. The renderer never sees the filesystem directly. It never will.

---

## Path Security: The Filesystem Whitelist

Every file operation that crosses the IPC boundary passes through `electron/path-security.ts` before a single byte is read or written.

```typescript
// Allowed directories (whitelist):
const ALLOWED = [
  path.join(documents, 'MnemoVault'), // The user's vault
  app.getPath('userData'),             // Application config
  app.getPath('temp'),                 // Temporary files
  app.getPath('downloads'),            // Imports
  app.getPath('documents'),            // User documents
]

// Every path is validated before use:
// - Null bytes → blocked immediately
// - Absolute path resolution → path traversal neutralized
// - Not in whitelist → ACCESS_DENIED
```

The validation function rejects:
- **Null byte injection** (`\0` in path string) — classic filesystem attack
- **Path traversal** (`../../etc/passwd` resolves to the actual path, then fails the whitelist check)
- **Arbitrary system access** — any path outside the five allowed directories returns `ACCESS_DENIED`

This runs on every IPC handler that touches the filesystem: `file-ops`, `project`, `resonance`, vault reads and writes.

---

## API Key Encryption: Electron safeStorage

API keys (Gemini, Groq, Anthropic, OpenAI, DeepSeek, OpenRouter, Zoho, and others) are stored in `mnemosyne-api-keys.enc` using **Electron's native `safeStorage` API**.

```typescript
// Store:
const encrypted = safeStorage.encryptString(JSON.stringify(keys))
fs.writeFileSync('mnemosyne-api-keys.enc', encrypted)

// Read:
const plain = safeStorage.decryptString(fs.readFileSync(filePath))
```

What `safeStorage` means in practice:

| Platform | Encryption Backend |
|---|---|
| **Windows** | DPAPI (Data Protection API — tied to user account) |
| **macOS** | Keychain |
| **Linux** | libsecret (GNOME Keyring / KWallet) |

The keys are encrypted using the operating system's native credential store. They cannot be decrypted by another user on the same machine, by another application, or by reading the file directly (it is binary ciphertext). If `safeStorage.isEncryptionAvailable()` returns false, the service refuses to store keys silently — it logs a warning and returns without writing.

The key file lives in `app.getPath('userData')` — outside the vault, inside the OS-protected application data space.

---

## The Security Stack: Four Operating Services

The vault security system is orchestrated by `vault-security.service.ts`, which aggregates four independent services into a unified `SecurityStats` report available from anywhere in the app.

### SHIELD — Vault Integrity Monitor

`shield.service.ts` scans the vault at runtime and classifies anomalies:

```
Severity levels: ok | warning | critical
Anomaly types:   corrupted | permission | suspicious | missing_required_folder | low_space
```

For each vault file, SHIELD checks: file permissions (read-only flag on Windows), filesystem state, and structural integrity. The report feeds into the security dashboard visible in the app.

### KEY VAULT — Access Audit Log

`keyvault.service.ts` maintains a rolling access log in `<vault>/.security/access-logs.json`:
- Last 1,000 access events (auto-trimmed)
- Each entry: `userId`, `timestamp`, `filePath`, `success: boolean`
- Failed authentication count exposed to dashboard
- Last successful access timestamp

This creates an audit trail. If something reads your vault unexpectedly, it appears here.

### WATCHTOWER — Network Monitor

`watchtower.service.ts` (16KB) monitors active network connections initiated by the application — allowing the user to see exactly what outbound traffic Mnemosyne is producing, to which endpoints, and when.

This is the transparency layer: you can verify that the only outbound calls are to the AI providers you configured. Nothing goes to Mnemosyne's servers (there are none in the local deployment).

### APP INTEGRITY — Binary Hash Verification

`app-integrity.service.ts` implements **SHA-256 verification of critical application files** at startup:

```typescript
// At startup, the service:
// 1. Loads app-integrity-manifest.json (embedded at build time)
// 2. Hashes each declared component: app.asar, main.js, preload.cjs
// 3. Compares against expected hashes from the CI build
// 4. Reports: ok | warn | missing | TAMPERED

const hash = crypto.createHash('sha256')
const stream = fs.createReadStream(filePath)
// streaming hash — safe for large files
```

**The security contract (from the codebase comments):**
> The pass/fail verdict is DETERMINISTIC (hash comparison). LLM output NEVER alters it.

If `app.asar` — the packaged application bundle — has been modified after build, the integrity check reports `TAMPERED`. The report is cached at startup and accessible via `getLastIntegrityReport()` throughout the session.

In CI builds, the manifest is populated with expected hashes automatically. In development, `expectedHash` is empty and the service logs hashes for reference without blocking.

---

## What Never Leaves Your Machine

By default, in a local deployment of Mnemosyne OS:

| Data | Where It Lives | Who Can Read It |
|---|---|---|
| Vault files (`.md`, `.json`) | `~/Documents/MnemoVault/` | You, the OS user |
| API keys | `userData/mnemosyne-api-keys.enc` | OS-encrypted, current user only |
| Soul definitions | `MnemoVault/souls/` | Local only |
| Chronicles | `MnemoVault/chronicles/` | Local only |
| RESONANCE_INDEX | Project workspace | Local only |
| Access logs | `MnemoVault/.security/` | Local only |
| App config | `userData/mnemosyne.config.json` | Local only |

**What goes to external services:**
- Text sent in a conversation → to the AI provider of your choice (Gemini, Groq, etc.)
- Distillation chunks (local mode) → to Ollama running on `localhost:11434` — stays on-device
- Distillation chunks (cloud mode) → to Gemini API with `maxOutputTokens: 256, temperature: 0.3`

There is no Mnemosyne cloud. There is no analytics endpoint. There is no telemetry. The Watchtower service exists precisely so you can verify this yourself, at any time.

---

## The Sovereignty Contract

Mnemosyne OS is local-first by architecture, not by configuration. The security model is not a setting you turn on. It is the structure of the system.

The AI that knows you — your soul, your history, your Chronicle archive — lives on your machine. Your API keys are encrypted by your OS. Your vault is in your documents folder. The only data that ever leaves your control is the content you choose to send in a conversation, to a provider you chose, using a key you own.

That is the sovereignty contract. It is enforced by code, not by policy.

---

*Part of the [Mnemosyne OS Documentation](./README.md)*\
*Related: [Architecture Overview →](./15-architecture.md) · [The Resonance Engine →](./16-resonance-engine.md) · [Soul Studio →](./07-soul-studio.md)*
