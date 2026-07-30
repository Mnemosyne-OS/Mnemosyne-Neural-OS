# CONTRIBUTING_AI.md
## Agent Onboarding Guide — Mnemosyne Neural OS

> **This document is written for AI agents (LLMs) contributing to Mnemosyne Neural OS.**  
> If you are a human contributor, read this too — it documents the patterns every contributor must follow.

---

## 0. Before You Write a Single Line

Read these documents first. They are not optional context — they are the law:

| Document | Why It Matters |
|----------|---------------|
| [IPC Security Bridge](./doc/IPC_SECURITY_BRIDGE.md) | Every interaction between main process and renderer goes through this |
| [Documentation index](./doc/README.md) | Concepts, architecture, governance & design-decision docs |
| [Privacy & Telemetry](./doc/PRIVACY_TELEMETRY.md) | No telemetry SDK; keys in OS secure storage |

---

## 1. System Overview

Mnemosyne is an **Electron + React** desktop application in a PNPM monorepo.

```
Two processes. One boundary. No exceptions.

┌─────────────────────────────────┐
│  Renderer Process (React/Vite)   │  ← UI, state, user interactions
│  contextIsolation: true          │
│  sandbox: true                   │
│  nodeIntegration: false          │
└──────────────┬──────────────────┘
               │  contextBridge (preload.ts)
               │  379 explicitly declared methods
               │  NO direct Node.js access
┌──────────────┴──────────────────┐
│  Main Process (Electron/Node.js) │  ← File system, AI, vault, services
│  IPC Registry (centralized)      │
│  Modular handlers (30+ modules)  │
│  Structured logging              │
└─────────────────────────────────┘
```

**Core constraint:** The renderer never has direct access to the file system, AI APIs, or any Node.js module. All cross-process communication goes through the IPC Registry.

---

## 2. The IPC Module Pattern

This is the most important pattern in the codebase. Every new feature that needs to cross the process boundary follows this exact structure.

### 2.1 Creating a New IPC Handler Module

**File location:** `electron/handlers/[feature-name].handlers.ts`

```typescript
// electron/handlers/example.handlers.ts

import { ipcMain } from 'electron'
import { z } from 'zod'
import { logger } from '../services/logger.service'

// ─── Input Schemas (Zod validation — MANDATORY) ───────────────────────────────

const ExampleInputSchema = z.object({
  id: z.string().uuid(),
  payload: z.string().min(1).max(10000),
})

// ─── Response Types (typed — NEVER return plain objects or null on error) ─────

type ExampleResult =
  | { ok: true; data: string }
  | { ok: false; error: string; code: string }

// ─── Handler Registration ─────────────────────────────────────────────────────

export function registerExampleHandlers(): void {
  ipcMain.handle('example:do-something', async (_event, raw) => {
    // 1. Validate input
    const parsed = ExampleInputSchema.safeParse(raw)
    if (!parsed.success) {
      logger.warn('[EXAMPLE] Invalid input', parsed.error.flatten())
      return { ok: false, error: 'Invalid input', code: 'EXAMPLE_INVALID_INPUT' } satisfies ExampleResult
    }

    const { id, payload } = parsed.data

    try {
      // 2. Business logic
      const result = await processExample(id, payload)

      // 3. Always return typed result
      return { ok: true, data: result } satisfies ExampleResult

    } catch (e: unknown) {
      // 4. NEVER swallow errors silently
      const message = e instanceof Error ? e.message : String(e)
      logger.error('[EXAMPLE] Handler failed', { id, message })
      return { ok: false, error: message, code: 'EXAMPLE_INTERNAL_ERROR' } satisfies ExampleResult
    }
  })
}

async function processExample(id: string, payload: string): Promise<string> {
  // Implementation
  return `processed:${id}`
}
```

### 2.2 Registering the Module in the IPC Registry

**File:** `electron/ipc-registry.ts`

```typescript
// In initializeAllHandlers():
import { registerExampleHandlers } from './handlers/example.handlers'

// Add to the handler map:
const handlers = [
  // ... existing handlers ...
  { name: 'example', fn: registerExampleHandlers },
]
```

### 2.3 Exposing Methods in the Preload

**File:** `electron/preload.ts`

```typescript
// In the contextBridge.exposeInMainWorld call:
example: {
  doSomething: (input: { id: string; payload: string }) =>
    ipcRenderer.invoke('example:do-something', input),
},
```

### 2.4 Using from the Renderer

```typescript
// In any React component or hook:
const result = await window.electronAPI.example.doSomething({ id, payload })

if (!result.ok) {
  // ALWAYS handle the error case
  setError(result.error)
  return
}

// Use result.data
```

---

## 3. Error Handling Rules

These are non-negotiable. Every violation will be vetoed.

### Rule 1: Typed Errors, Always

```typescript
// ❌ WRONG — untyped, loses information
return null
return false
return undefined
throw new Error('something failed')

// ✅ CORRECT — typed, actionable
return { ok: false, error: 'Descriptive message', code: 'MODULE_ERROR_CODE' }
```

### Rule 2: No Silent Catch

```typescript
// ❌ WRONG — swallows the error
try {
  await doSomething()
} catch (e) {
  // silent
}

// ❌ WRONG — console only, no structured log
try {
  await doSomething()
} catch (e) {
  console.error(e)
}

// ✅ CORRECT — logged + returned
try {
  await doSomething()
} catch (e: unknown) {
  const message = e instanceof Error ? e.message : String(e)
  logger.error('[MODULE] Operation failed', { context, message })
  return { ok: false, error: message, code: 'MODULE_OPERATION_FAILED' }
}
```

### Rule 3: TypeScript Unknown in Catch

```typescript
// ❌ WRONG — TypeScript strict error
} catch (e) {
  return { error: e.message } // TS18046
}

// ✅ CORRECT
} catch (e: unknown) {
  const message = e instanceof Error ? e.message : String(e)
  return { error: message }
}
```

### Rule 4: Error Codes Are Namespaced

```
MODULE_OPERATION_NOUN   →  RESONANCE_NO_EMBEDDING_PROVIDER
                           VAULT_FILE_NOT_FOUND
                           POLICY_CONFLICT_DETECTED
                           IPC_HANDLER_NOT_REGISTERED
```

---

## 4. React Component Patterns

### 4.1 Lazy Loading (Required for Heavy Components)

```typescript
// ✅ Every heavy view must use React.lazy + Suspense
const MyHeavyView = lazy(() => import('./views/MyHeavyView'))

// In the router:
<Suspense fallback={<MnemoFallback />}>
  <MyHeavyView />
</Suspense>

// ❌ NEVER render lazy() without Suspense
const MyHeavyView = lazy(() => import('./views/MyHeavyView'))
return <MyHeavyView /> // Will crash on state update
```

### 4.2 State Management (Zustand)

```typescript
// ✅ Use atomic selectors — never select the whole store
const userName = useMyStore(state => state.user.name)
const userAge = useMyStore(state => state.user.age)

// ✅ For multiple values, use useShallow
import { useShallow } from 'zustand/react/shallow'
const { name, age } = useMyStore(useShallow(state => ({
  name: state.user.name,
  age: state.user.age,
})))

// ❌ WRONG — causes unnecessary re-renders
const { user, settings, vault } = useMyStore()
```

### 4.3 i18n

```typescript
// ✅ New components — use namespace
const { t } = useTranslation('my-feature')
return <span>{t('my.key')}</span>
// requires: public/locales/en/my-feature.json

// ✅ Legacy components — use aggregator
const { t } = useTranslation()
return <span>{t('myFeature.my.key')}</span>

// ❌ NEVER hardcode user-visible strings
return <span>Hello World</span>
```

### 4.4 TypeScript Strictness

The project uses `strict: true` and `noUncheckedIndexedAccess: true`.

```typescript
// ✅ All array accesses need null checks
const items = getItems() // string[]
const first = items[0] // string | undefined
if (first !== undefined) {
  use(first)
}

// ✅ All props must be typed
interface MyComponentProps {
  name: string
  count?: number
  onAction: (id: string) => void
}
```

---

## 5. Security Rules (Electron)

These settings are in `electron/main.ts` and **must never be changed:**

```
contextIsolation: true   → Never set to false
sandbox:          true   → Web-content windows; relaxed only for local-AI worker windows (see note)
nodeIntegration:  false  → Never set to true
webSecurity:      true   → Never set to false
webviewTag:       false  → Never set to true
```

> **Note on `sandbox`.** Windows that render web content run sandboxed. A small number
> of local-AI worker windows require `sandbox: false` to spawn in-process inference
> threads; they carry no remote content and are compensated by `contextIsolation: true`,
> `nodeIntegration: false`, and Zod-validated IPC through the Gateway. Never relax
> `sandbox` on a window that renders untrusted or remote content.

**IPC Channel Naming:**
```
module:action-verb   →  vault:read-file
                        resonance:search
                        policy:apply-grant
                        brain:generate
```

**Origin Validation (WebSocket bridge):**  
All WebSocket connections must validate origin against the allowed list before processing any message. See `LocalBridge.ts`.

---

## 6. Testing Requirements

**Framework:** Vitest + @testing-library/react

Every new module should include tests for:
- ✅ The happy path
- ✅ At least 2 failure paths
- ✅ Edge cases specific to the feature

```typescript
// electron/handlers/__tests__/example.handlers.test.ts
import { describe, it, expect, vi } from 'vitest'

describe('example handlers', () => {
  it('returns ok:true on valid input', async () => {
    const result = await processExample('valid-id', 'valid-payload')
    expect(result).toBe('processed:valid-id')
  })

  it('handles empty payload gracefully', async () => {
    // test failure path
  })
})
```

**Run before every commit:**
```bash
pnpm typecheck   # Must exit 0
pnpm lint        # Must exit 0
pnpm test        # Must be 100% pass rate
```

---

## 7. The Embedding Cascade — When You Need AI

If your feature requires text embeddings, **always use the existing cascade.** Never call an AI provider directly from a handler.

```typescript
// ✅ CORRECT — use the existing service
import { resonanceService } from '../services/resonance.service'
const embedding = await resonanceService.generateEmbedding(text)
// Automatically handles: Ollama → Jina → Cohere → Gemini → OpenAI
// Automatically handles: local-only mode, rate limiting, dimension tracking
// Automatically throws: RESONANCE_NO_EMBEDDING_PROVIDER on total failure

// ❌ WRONG — calling OpenAI directly from a handler
import OpenAI from 'openai'
const openai = new OpenAI({ apiKey })
const embed = await openai.embeddings.create(...)
```

---

## 8. Policy & Access Control — When You Need Permissions

If your feature controls access to sensitive data or actions, use the FGAC system.

```typescript
// ✅ Check permissions before executing sensitive operations
import { policyService } from '../services/policy.service'

const access = await policyService.checkAccess({
  agentId: context.agentId,
  resource: 'vault:encrypted-files',
  action: 'read',
})

if (!access.granted) {
  return { ok: false, error: 'Access denied', code: 'POLICY_ACCESS_DENIED' }
}

// Proceed with the operation
```

---

## 9. Logging Standards

```typescript
import { logger } from '../services/logger.service'

// Always prefix with module name in brackets
logger.info('[MY-MODULE] Operation description', { relevant: 'context' })
logger.warn('[MY-MODULE] Warning description', { id, reason })
logger.error('[MY-MODULE] Error description', { id, message, stack })

// ❌ NEVER use console.log in main process
console.log('debug') // Will pollute the terminal with raw output

// ❌ NEVER log secrets, keys, or passwords
logger.info('[VAULT] Opened', { key: userKey }) // WRONG
logger.info('[VAULT] Opened', { path: filePath }) // CORRECT
```

---

## 10. What Will Be Vetoed

If you produce any of the following, expect a Veto and a re-articulation request.

| Pattern | Reason |
|---------|--------|
| `catch (e) { return null }` | Silent failure |
| `catch (e) { return false }` | Silent failure |
| `console.log()` in main process | Use logger |
| `nodeIntegration: true` | Security violation |
| Lazy component without Suspense | Runtime crash |
| Hardcoded user-visible string | i18n violation |
| Direct AI API call bypassing cascade | Architecture violation |
| `any` type in TypeScript | Type safety violation |
| Unnamespaced IPC channel (`'doThing'`) | Convention violation |
| Feature flag in wrong process | Architecture violation |

---

## 11. Contribution Checklist

Before submitting any change:

```
□ pnpm typecheck passes (0 errors)
□ pnpm lint passes (0 warnings)
□ pnpm test passes (100% rate)
□ New IPC handlers are registered in ipc-registry.ts
□ New IPC methods are exposed in preload.ts
□ All user-visible strings use i18next
□ Error paths return typed { ok: false } objects
□ No silent catch blocks
□ No hardcoded secrets or API keys
□ Security settings unchanged
```

---

## 12. Getting Help

Read the architecture docs. They contain the design decisions behind every pattern.

If something is unclear: describe your intent precisely (see [Intention Articulation](./handbook/02-the-three-pillars/01-intention-articulation.md)) and ask.

**Contact:** [dev@mnemosyne-os.com](mailto:dev@mnemosyne-os.com)  
**Repository:** [github.com/Mnemosyne-OS/Mnemosyne-Neural-OS](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS)

---

> *"Not all rules — only the primary ones. The constraints that define what the core is and how it breathes.*  
> *Write those right. Write those first.*  
> *After that, imagination has no ceiling."*  
> — Tony Trochet, Creator of Mnemosyne Neural OS
