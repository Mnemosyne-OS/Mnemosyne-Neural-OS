# IPC Security Bridge — Architecture Deep Dive

> **Audience:** Engineers evaluating Mnemosyne's security posture and architectural maturity.  
> **Status:** Production

---

## The Problem: Electron's Dual-Process Threat Model

Electron apps run in two isolated OS processes:

```
┌─────────────────────────────────────┐
│  RENDERER (Chromium sandbox)        │
│  React UI · TypeScript · User code  │
│                                     │
│  ❌ NO direct Node.js access        │
│  ❌ NO filesystem access            │
│  ❌ NO OS calls                     │
└────────────────┬────────────────────┘
                 │  Context Bridge (controlled boundary)
                 │
┌────────────────▼────────────────────┐
│  MAIN PROCESS (Node.js / Electron)  │
│  AI services · Vault · File I/O     │
│  IPC Registry · Window management  │
└─────────────────────────────────────┘
```

Misconfigured Electron apps either:
1. Enable `nodeIntegration: true` → renderer gets full OS access (critical vuln)
2. Use a single IPC channel for everything → no audit surface, no control

Mnemosyne does neither.

---

## Security Configuration (Electron `BrowserWindow`)

```typescript
// apps/desktop-dashboard/electron/window-setup.service.ts
const win = new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,   // Renderer cannot access Node APIs
    sandbox: true,            // Chromium sandbox enforced
    nodeIntegration: false,   // No Node.js in renderer — ever
    webSecurity: true,        // Same-origin policy enforced
  }
})
```

This configuration is A-grade per Electron Security Checklist. All four mitigations are **simultaneously active** — not just declared.

---

## The IPC Registry Pattern

Instead of scattered `ipcMain.handle()` calls, Mnemosyne uses a **centralized IPC Registry** that bootstraps all 30+ modules defensively at startup.

### Core bootstrap signature

```typescript
// electron/ipc-registry.ts
export async function initializeAllHandlers(
  services: IpcRegistryServices
): Promise<number> {
  let handlerCount = 0

  // Every module is wrapped in isolated try/catch.
  // A single failing module CANNOT cascade and bring down the whole IPC layer.
  
  // === MODULE 1: VAULT HANDLERS ===
  try {
    setVaultHandlerDependencies(
      ipcError,
      getMainWindow,
      trackFileModification,
      checkNarcissusChronicleFile   // Zod-validated path guard
    )
    registerVaultHandlers()
    console.log('[SYSTEM] ✅ Module [Vault] IPC Ready')
    handlerCount++
  } catch (error) {
    console.error('[SYSTEM] ❌ Module [Vault] IPC Failed:', error)
    // System continues — other modules are unaffected
  }

  // ... 30 more modules follow the same pattern

  console.log(`✅ [SYSTEM] IPC Bridge: Connected (${handlerCount} handlers)`)
  return handlerCount
}
```

**Key properties of this pattern:**
- **Fault isolation** — any module can fail independently without affecting others
- **Explicit dependency injection** — every handler receives its dependencies via `set*Dependencies()` functions, enabling clean unit testing
- **Observable** — startup logs show exactly which modules loaded (or failed), creating an audit trail

---

## Module Count at Runtime

At a healthy startup, the registry boots **30+ IPC modules** covering:

| Module | Responsibility |
|--------|---------------|
| `Vault` | Encrypted knowledge vault read/write |
| `Resonance` | Semantic search + cognitive indexing |
| `PolicyStudio` | FGAC enforcement — what AI can access |
| `NeuralLink` | MCP + P2P multi-agent transport |
| `Sentinel` | Self-healing system monitor |
| `VaultSecurity` | Shield, KeyVault, Watchtower subsystems |
| `Narcissus` | Temporal snapshot tracking (activity chronicle) |
| `MnemoImporter` | Queue-based file ingestion worker |
| `Agents` | Micro-kernel satellite orchestration |
| `Brain/Sanctum` | AI soul persistence and context restore |
| `Strategist` | BMAD 2.0 planning task management |
| `MnemoGuide` | Contextual knowledge delivery |
| … | 20+ additional modules |

---

## Dependency Injection at the Handler Level

Each module uses an explicit `set*Dependencies()` call before registration. This decouples service logic from IPC routing:

```typescript
// electron/ipc-registry.ts — Resonance module bootstrap
setResonanceHandlerDependencies(ipcError)

setOnIndexingComplete(() => {
  // Push event to renderer via safe IPC channel — no direct DOM access
  getMainWindow()?.webContents?.send('resonance-indexing-complete', {})
})

setOnIndexingProgress((indexed, total) => {
  getMainWindow()?.webContents?.send('resonance-indexing-progress', { indexed, total })
})

registerResonanceHandlers()
```

The `ipcError` wrapper is a typed error handler shared across all modules — ensuring consistent, Zod-validated error shapes cross the process boundary.

---

## The Context Bridge (379 Declared Methods)

The `preload.ts` file exposes the IPC surface to the renderer via `contextBridge.exposeInMainWorld`. Every single method is **explicitly declared** — no wildcard passthrough.

```typescript
// electron/preload-brain-api.ts (simplified excerpt)
contextBridge.exposeInMainWorld('mnemosyne', {
  // AI
  sendMessage:        (payload) => ipcRenderer.invoke('ai:send-message', payload),
  streamMessage:      (payload) => ipcRenderer.invoke('ai:stream-message', payload),
  
  // Vault
  readFile:           (path)    => ipcRenderer.invoke('vault:read-file', path),
  writeFile:          (path, c) => ipcRenderer.invoke('vault:write-file', path, c),
  
  // Resonance Engine
  semanticSearch:     (query)   => ipcRenderer.invoke('resonance:search', query),
  reindexVault:       ()        => ipcRenderer.invoke('resonance:reindex'),
  
  // Policy & Security
  checkFgacPolicy:    (ctx)     => ipcRenderer.invoke('policy:check', ctx),
  getSecurityStats:   ()        => ipcRenderer.invoke('get-security-stats'),
  
  // ... 370+ more explicit declarations
})
```

**Why this matters:** If the method is not in this list, the renderer **cannot call it** — even if a corresponding `ipcMain.handle()` exists. This is the zero-trust boundary.

---

## Dynamic Module Loading with Fallback

For modules with optional native dependencies, the registry uses dynamic `import()` with graceful degradation:

```typescript
// electron/ipc-registry.ts — FileOps module with fallback
try {
  const { registerFileOpsHandlers, setFileOpsHandlerDependencies } =
    await import('./handlers/file-ops.handlers')  // Has optional adm-zip dep
    
  setFileOpsHandlerDependencies(ipcError)
  registerFileOpsHandlers()
  console.log('[SYSTEM] ✅ Module [FileOps] IPC Ready')
  handlerCount++
} catch (error) {
  // adm-zip unavailable — fallback to minimal scan-directory only
  console.log('[SYSTEM] ⚠️ Registering fallback scan-directory')
  registerScanDirectoryFallback()  // Always available, no native deps
}
```

This is why Mnemosyne works across Windows, macOS (Intel + Apple Silicon), and Linux without platform-specific builds for every feature.

---

## Origin Validation on the Local WebSocket Bridge

For the P2P / local AI bridge (port 11435), incoming WebSocket connections are validated at connection time:

```typescript
// electron/LocalBridge.ts
this.wss.on('connection', (ws: WebSocket, req) => {
  const origin = req.headers.origin || ''
  const isPuterOrigin = origin.includes('puter.site') || origin.includes('puter.com')
  const isLocalhost  = origin.includes('localhost') || origin.includes('127.0.0.1')
  const isDev        = process.env.NODE_ENV === 'development'

  if (!isPuterOrigin && !(isDev && isLocalhost)) {
    console.warn(`🚨 [LocalBridge] Rejected — unauthorized origin: ${origin}`)
    ws.close(1008, 'Origin not allowed')
    return  // Connection terminated before any data is processed
  }

  // Only authorized origins reach this point
  this.activeClient = ws
  ws.send(JSON.stringify({ type: 'READY' }))
})
```

This prevents arbitrary local processes from injecting commands into the AI pipeline.

---

## Testing the IPC Layer

The IPC registry's dependency injection design makes every handler independently testable without a running Electron instance:

```typescript
// electron/policy-studio.handlers.test.ts (excerpt)
describe('PolicyStudio IPC Handlers', () => {
  beforeEach(() => {
    // Inject mock dependencies — no Electron runtime needed
    setPolicyHandlerDependencies(mockIpcError, mockVaultService)
    registerPolicyStudioHandlers()
  })

  it('enforces FGAC on vault read', async () => {
    const result = await invokeHandler('policy:check', {
      action: 'vault:read',
      soul: 'test-soul-id',
    })
    expect(result.allowed).toBe(false)  // No active grant — deny by default
  })
})
```

1,126 tests, 88 test files, 100% pass rate — including IPC handler coverage.

---

## Summary

| Property | Implementation |
|----------|---------------|
| `contextIsolation` | ✅ `true` — renderer isolated from Node.js |
| `sandbox` | ✅ `true` — Chromium sandbox enforced |
| `nodeIntegration` | ✅ `false` — never enabled |
| IPC declaration | ✅ 379 methods explicitly declared in preload |
| Module isolation | ✅ Per-module try/catch — no cascade failures |
| Dependency injection | ✅ All handlers testable without Electron |
| WebSocket origin guard | ✅ Connection rejected before any data flows |
| Error typing | ✅ Zod-validated `ipcError` wrapper on all channels |

---

*Part of the [Mnemosyne Neural OS](https://github.com/yaka0007/Mnemosyne-Neural-OS) technical documentation.*  
*Questions: [dev@mnemosyne-os.com](mailto:dev@mnemosyne-os.com)*
