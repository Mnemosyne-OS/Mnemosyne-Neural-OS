# IPC Security Bridge — Architecture Deep Dive

> **Audience:** Engineers evaluating Mnemosyne's security posture.
> **Status:** Production. This describes the boundary conceptually; it discloses no
> proprietary implementation. See also [Governance & Sovereignty](GOVERNANCE.md).

---

## The problem: Electron's dual-process threat model

An Electron app runs in two isolated OS processes. Get the boundary wrong and the renderer
— which runs web content — gains the powers of the main process.

```
┌─────────────────────────────────────┐
│  RENDERER (Chromium)                │
│  React UI · TypeScript · web content │
│  ❌ no direct Node.js access         │
│  ❌ no filesystem access             │
│  ❌ no OS calls                      │
└────────────────┬────────────────────┘
                 │  Context Bridge (the only door)
┌────────────────▼────────────────────┐
│  MAIN PROCESS (Node.js / Electron)  │
│  AI · Vault · file I/O · services   │
│  the sealed Cognitive Core           │
└─────────────────────────────────────┘
```

Misconfigured Electron apps typically fail one of two ways: they enable
`nodeIntegration: true` (handing the renderer full OS access), or they route everything
through a single catch-all IPC channel (no validation, no audit surface). Mnemosyne does
neither.

---

## Window security configuration

Every window is created with the same hardened defaults:

```typescript
new BrowserWindow({
  webPreferences: {
    contextIsolation: true,   // renderer cannot reach Node APIs
    nodeIntegration: false,   // no Node.js in the renderer — ever
    webSecurity: true,        // same-origin policy enforced
    sandbox: true,            // Chromium sandbox for web content
  },
})
```

`contextIsolation`, `nodeIntegration: false`, and `webSecurity` are enforced on **every**
window. The Chromium `sandbox` is on for web content and relaxed only on the windows that
host **local-AI worker threads** (in-process inference and embeddings need it) — and there
it is compensated by context isolation and Zod-validated IPC. No window that renders
untrusted or remote content ever runs unsandboxed.

---

## The centralized IPC Registry

Instead of scattered `ipcMain.handle()` calls, Mnemosyne bootstraps its handlers through a
**centralized registry** whose defining property is **fault isolation**: every module is
registered inside its own `try/catch`, so a single failing module cannot cascade and bring
down the whole IPC layer.

```typescript
// Conceptual shape — every module follows the same defensive pattern
export async function initializeAllHandlers(services): Promise<number> {
  let count = 0
  for (const module of MODULES) {
    try {
      module.injectDependencies(services)   // explicit DI — see below
      module.register()
      count++
    } catch (err) {
      logger.error(`[IPC] module ${module.name} failed to load`, err)
      // the system continues — other modules are unaffected
    }
  }
  return count
}
```

Key properties:

- **Fault isolation** — any module can fail independently; no cascade.
- **Explicit dependency injection** — each handler receives its services via an injection
  step, which also makes every handler unit-testable without a running Electron instance.
- **Observable** — startup logs record exactly which modules loaded, creating an audit trail.

---

## The Context Bridge — an allow-list, not a passthrough

The preload exposes the IPC surface to the renderer through
`contextBridge.exposeInMainWorld`. Every method is **explicitly declared** — there is no
wildcard passthrough:

```typescript
contextBridge.exposeInMainWorld('mnemosyne', {
  sendMessage: (payload) => ipcRenderer.invoke('<ai channel>', payload),
  readMemory:  (query)   => ipcRenderer.invoke('<vault channel>', query),
  checkPolicy: (ctx)     => ipcRenderer.invoke('<fgac channel>', ctx),
  // …every method declared, one by one
})
```

**Why it matters:** if a method is not in this list, the renderer **cannot call it** — even
if a matching `ipcMain.handle()` exists. This is the zero-trust boundary. In total, the
bridge exposes **242 Zod-validated IPC channels**, auto-generated and checked by a drift
test on every build.

Every channel validates its input with a **Zod schema** and returns a typed
`{ success, error?, data? }` shape through a shared error wrapper — so a malformed or
malicious payload is rejected at the boundary, with a consistent, auditable error.

---

## Origin validation on the local bridge

For the local WebSocket / agent bridge, incoming connections are validated **at connection
time**, before any data is processed: a connection whose origin is not on the allow-list is
closed immediately (code `1008`, logged for audit). Only authorized, local origins reach the
message loop. This prevents arbitrary local processes from injecting commands into the AI
pipeline.

---

## Testability

Because handlers receive their dependencies by injection, every one is testable in isolation
— mock the services, register the handler, assert its behavior — with no Electron runtime.
FGAC handlers, for example, are covered by tests asserting **deny-by-default**: a vault
action with no active grant returns `allowed: false`. The IPC layer ships under a green CI
gate (typecheck · lint · i18n · tests).

---

## Summary

| Property | Implementation |
|---|---|
| `contextIsolation` | ✅ `true` — renderer isolated from Node.js, every window |
| `nodeIntegration` | ✅ `false` — never enabled |
| `webSecurity` | ✅ `true` — same-origin enforced |
| `sandbox` | ✅ `true` for web content · relaxed only for local-AI worker windows (compensated) |
| IPC surface | ✅ 242 explicitly declared, Zod-validated channels — no wildcard passthrough |
| Module isolation | ✅ per-module `try/catch` — no cascade failures |
| Dependency injection | ✅ every handler testable without Electron |
| Local bridge | ✅ origin validated before any data flows |
| Error typing | ✅ Zod-validated typed error wrapper on all channels |

---

*Part of the [Mnemosyne Neural OS](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS) documentation.*
*Questions: [dev@mnemosyne-os.com](mailto:dev@mnemosyne-os.com)*
