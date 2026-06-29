# Architecture Overview

> *"Une usine qui permet de construire les plans."*
> — Tony, Architect of Mnemosyne OS

---

## The Design Philosophy

Mnemosyne OS is built on a single premise: **every module follows the same architecture**. From the file manager to the AI brain, from the prompt library to the Soul Studio, the code follows an identical structural pattern. This consistency is not accidental — it was chosen from day one as the foundation on which every future module can be added without friction.

The result: a platform where adding a new AI capability means creating a new set of standardized files, not rewriting the core.

---

## Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Desktop runtime** | Electron | Cross-platform (Windows · macOS · Linux) native app |
| **Bundler** | Vite | Fast HMR development + optimized production builds |
| **UI Framework** | React 18 + TypeScript | Renderer process |
| **State Management** | Zustand | Global stores with slice pattern |
| **Styling** | Tailwind CSS + CSS variables | Theme system with dark/light modes |
| **Internationalization** | i18next | FR · EN · ES |
| **Local LLM** | node-llama-cpp | Native GPU inference (GGUF models) |
| **Testing** | Vitest | Unit + integration tests co-located with source |
| **Packaging** | electron-builder | Signed release builds (Win/macOS/Linux) |
| **API Documentation** | TypeDoc | Auto-generated from TypeScript annotations |

---

## Repository Structure

```
_MNEMOSYNE_SYSTEM/
├── apps/
│   └── desktop-dashboard/      ← Main Electron application
│       ├── electron/           ← Main process (Node.js)
│       │   ├── main.ts         ← App entry point
│       │   ├── ipc-registry.ts ← 20KB · ALL IPC handlers registered here
│       │   ├── preload/        ← contextBridge → exposes window.api
│       │   ├── handlers/       ← Feature-specific IPC handlers
│       │   └── services/       ← Native services (file I/O, AI, crypto)
│       └── src/                ← Renderer process (React + TypeScript)
│           ├── App.tsx         ← Root router and layout
│           ├── main.tsx        ← React entry point
│           ├── components/     ← All UI modules (see below)
│           ├── store/          ← 41 Zustand stores
│           ├── hooks/          ← Global React hooks
│           ├── services/       ← Client-side service layer
│           ├── i18n/           ← Translation files (FR/EN/ES)
│           ├── types/          ← Global TypeScript interfaces
│           ├── theme/          ← Theme tokens and CSS variables
│           └── utils/          ← Shared utilities
│
├── packages/
│   └── mnemoforge-cli/         ← CLI tools + public documentation
│       └── Mnemosyne-Neural-OS-public/
│           ├── mnemosyne-docs/ ← This GitBook
│           ├── handbook/       ← Neural Coding methodology
│           └── doc/            ← Technical architecture docs
│
└── apps/mnemosync/             ← MnemoSync agent tracking extension
```

---

## The Two Processes — Electron Architecture

Mnemosyne OS runs two processes that communicate through a strictly defined IPC contract.

```
┌─────────────────────────────────────────────────────────────┐
│  MAIN PROCESS (Node.js — Electron)                          │
│                                                             │
│  main.ts → app-lifecycle.ts → ipc-registry.ts              │
│                                                             │
│  Responsibilities:                                          │
│  • File system operations (vault read/write)                │
│  • Native LLM inference (node-llama-cpp)                    │
│  • AI API calls (Gemini, GROQ, OpenRouter...)               │
│  • Embeddings (Jina AI → RESONANCE_INDEX.json)              │
│  • Electron windows, auto-update, system tray               │
│  • Settings persistence (mnemosyne.config.json 284KB)       │
├─────────────────────────────────────────────────────────────┤
│  IPC BRIDGE (contextBridge — preload/index.ts)              │
│                                                             │
│  window.api.sendNeuralQuery()                               │
│  window.api.sendNeuralQueryWithThinking()                   │
│  window.api.readFile()  window.api.writeFile()              │
│  window.api.getSettings()  window.api.saveSettings()        │
│  window.api.loadResonanceIndex()                            │
│  window.api.getLastChronicles()                             │
│  window.api.processInboxFile()                              │
│  window.api.getCurrentWorkspace()                           │
│  ... (100+ handlers registered in ipc-registry.ts)         │
├─────────────────────────────────────────────────────────────┤
│  RENDERER PROCESS (React + Vite)                            │
│                                                             │
│  App.tsx → Sidebar → [Active Module]                        │
│                                                             │
│  Responsibilities:                                          │
│  • All UI rendering                                         │
│  • State management (Zustand)                               │
│  • User interactions                                        │
│  • Real-time updates (polling, events)                      │
└─────────────────────────────────────────────────────────────┘
```

**Rule:** The renderer never touches the filesystem directly. Every native operation goes through `window.api`. This makes the architecture auditable, testable, and secure.

---

## The Universal Module Pattern

Every feature module in Mnemosyne OS follows this exact structure:

```
components/[module]/
├── [Module].types.ts       ← DATA CONTRACT (interfaces, enums, defaults)
├── use[Module].ts          ← STATE + LOGIC (zero UI, pure business logic)
├── [Module].tsx            ← ROOT ORCHESTRATOR (composes sub-components)
├── [Module]MainArea.tsx    ← Primary content zone (presentation only)
├── [Module]Sidebar.tsx     ← Navigation panel (presentation only)
├── [Module]Header.tsx      ← Toolbar + breadcrumb (presentation only)
├── [Module]Drawer.tsx      ← Detail panel (presentation only)
└── README.md               ← Module documentation
```

**Evidence across the codebase:**

| Module | Types file | Logic hook | Orchestrator |
|---|---|---|---|
| **MnemoPrompt** | `Arsenal.types.ts` | `useArsenal.ts` (305 lines) | `Arsenal.tsx` |
| **MnemoVault** | `FileNode` in `global.d.ts` | `useMnemoXState.ts` | `MnemoX/index.tsx` |
| **MnemoBrain** | `brain/types.ts` | `useNeuralLink.ts` (370 lines) | `SanctumPortal.tsx` |
| **Soul Studio** | `soul-store.types.ts` (9.5KB) | `soulStore.ts` (19KB) | `SoulStudio.tsx` |
| **Vault** | `FileNode` | `useVaultData.ts` | `VaultView.tsx` |

**The pattern in one sentence:** *Define the contract → isolate the logic → compose the presentation.*

---

## Global State — The 41 Zustand Stores

State is managed through Zustand stores, organized by domain. No prop-drilling. No context abuse. Each store is a self-contained slice of truth.

### Core Stores

| Store | Size | Responsibility |
|---|---|---|
| **brainStore** | 3.4KB + 7 slices | Orchestrates ALL conversation state |
| **soulStore** | 19KB | Soul identities, OCEAN calibration, active Soul |
| **appsStore** | 21KB | MnemoHub module management, app lifecycle |
| **systemStore** | 15KB | System health, module registry, app state |
| **modelsStore** | 13KB | AI providers, model activation, API keys |
| **configStore** | 11KB | User configuration, preferences |
| **projectStore** | split into 6 files | Resonance Projects (workspace management) |
| **resonanceStore** | 3.5KB | RESONANCE_INDEX.json, RAG queries |
| **useTaskStore** | 11KB | Strategist tasks, Thought Matrix output |

### brainStore — The Slice Architecture

The conversation brain is the most complex store. Instead of a monolithic state, it follows the **Zustand slice pattern** — each concern isolated in its own file:

```typescript
useBrainStore = create()({
  ...createMessagesSlice(),   // 21KB — message history, crystallized/uncrystallized
  ...createStreamingSlice(),  // streaming tokens, live response buffering
  ...createContextSlice(),    // selected context files, systemDNAContent
  ...createPersonaSlice(),    // active persona, soul injection
  ...createModesSlice(),      // currentMode: 'sanctum' | 'standard' | 'brain'
  ...createSanctumSlice(),    // sanctum-specific state (hashtags, stability)
  ...createVaultSlice(),      // vault file integration, 16KB of vault logic
})
```

**V5.1 "Fragmented Architecture"** — label in code: designed for mobile optimization and independent slice loading.

### projectStore — File-Level Separation

Even within a single domain, large stores split by concern:

```
projectStore.ts                      ← Store definition + initial state
projectStore.types.ts                ← All interfaces
projectStore.actions.project.ts      ← CRUD operations (17KB)
projectStore.actions.bridge.ts       ← IPC bridge actions  
projectStore.actions.registry.ts     ← Module registry management
projectStore.selectors.ts            ← Computed derived state
projectStore.utils.ts                ← Pure utility functions
```

---

## The IPC Registry — 100+ Handlers

`electron/ipc-registry.ts` (20KB) is the single registration point for all IPC channels. Every `window.api.xxx()` call in the renderer maps to a handler registered here.

Categories of registered handlers:
- **Neural** — `sendNeuralQuery`, `sendNeuralQueryWithThinking` (Gemini, GROQ, OpenRouter, local)
- **File system** — `readFile`, `writeFile`, `createFolder`, `deleteItem`, `moveItem`
- **Vault** — `getInboxFiles`, `processInboxFile`, `exportVault`
- **Settings** — `getSettings`, `saveSettings`, `resetSettings`
- **Resonance** — `loadResonanceIndex`, `updateResonanceIndex`, `reindexVault`
- **Chronicles** — `getLastChronicles`, `saveChronicle`, `getChronicles`
- **Models** — `downloadLlamaModel`, `getLocalModels`, `runOllamaModel`
- **Workspace** — `getCurrentWorkspace`, `setWorkspace`, `getWorkspaceInfo`
- **System** — `getSystemInfo`, `checkForUpdates`, `openExternal`

---

## Persistence Layer

Mnemosyne OS uses a single unified persistence approach:

```
mnemosyne.config.json  (284KB)
├── prompts[]          ← All 27+ MnemoPrompt entries
├── prism{}            ← Tag and color taxonomy
├── arsenal{}          ← Color and label managers
├── models{}           ← Provider configs, API keys (encrypted)
├── settings{}         ← User preferences, theme, language
├── souls[]            ← Soul Studio identities
└── projects[]         ← Resonance Project workspaces
```

Read/write via:
```typescript
const settings = await window.api.getSettings()   // reads config.json
await window.api.saveSettings(updatedSettings)     // writes config.json
```

Every module that persists data uses this same pair. No module writes files independently.

---

## Internationalization — Three Languages

The full interface renders in French, English, and Spanish. Translation files live in `src/i18n/` and cover every module, label, tooltip, and error message.

```
i18n/
├── fr/   ← Primary language (development language)
├── en/   ← Secondary (documentation output)  
└── es/   ← Tertiary
```

Module keys are namespaced: `arsenal.searchPlaceholder`, `vault.secureConnection`, `brain.thinking`, etc.

---

## Testing Architecture

Tests are co-located with source files in `__tests__/` subdirectories:

```
store/
├── brainStore.ts
├── brain/
│   ├── __tests__/
│   │   └── messages.slice.test.ts
│   └── slices/
│       └── messages.slice.ts
├── __tests__/
└── resonanceReindexStore.test.ts
```

Test runner: **Vitest** — configuration in `vitest.config.ts`. Coverage tracked. Integration tests in `tests/`.

---

## Build Pipeline

```
Development:
  pnpm run dev          → Vite HMR + Electron main reload
  
Production:
  pnpm run build        → Vite production bundle + electron-builder
  •  electron-builder.yml         → Windows (NSIS installer + portable)
  •  electron-builder.mac.yml     → macOS (DMG + code signing)
  •  electron-builder.linux.yml   → Linux (AppImage + DEB)
  
Testing:
  pnpm run test         → Vitest unit tests
  pnpm run typecheck    → TypeScript strict check (tsconfig.json)
  
Documentation:
  typedoc               → Auto-generates API docs from JSDoc annotations
```

---

## Adding a New Module

The architecture was designed to make module addition frictionless. The checklist:

```
1. Create components/[module]/[Module].types.ts
   └── Define Prompt interface, ViewMode type, DEFAULT_x constants

2. Create components/[module]/use[Module].ts
   └── State + handlers (zero JSX, pure logic + window.api calls)

3. Create presentation components
   └── [Module]MainArea.tsx · [Module]Sidebar.tsx · [Module]Header.tsx

4. Register in electron/ipc-registry.ts
   └── Any new native operations needed

5. Add to store/ if global state needed
   └── New Zustand store or extend existing slice

6. Add i18n keys to src/i18n/{fr,en,es}/[module].json

7. Register in Sidebar.tsx and appsStore.ts
   └── Module appears in navigation
```

A developer following this structure produces a module immediately consistent with the rest of the codebase.

---

## The Coherence Theorem

Every featured documented in this GitBook — **MnemoBrain, MnemoVault, MnemoPrompt, Soul Studio, MnemoHub, AI Configuration** — runs on this architecture without modification.

The 3-layer memory injection system (`useNeuralLink.ts`) calls `window.api.sendNeuralQuery()`. The Flash Report (`flashReportUtils.ts`) dispatches a custom DOM event. The Soul Studio (`soulStore.ts` 19KB) persists via `window.api.saveSettings()`. MnemoPrompt (`useArsenal.ts`) persists via `window.api.saveSettings()`. The pattern repeats without exception.

This is not code uniformity for its own sake. It is the foundation that transforms Mnemosyne OS from an application into a **platform** — one where every new AI capability, every new module, every new memory system slots in without disturbing what already exists.

---

*Part of the [Mnemosyne OS Documentation](./README.md)*\
*See also: [Developer Guide →](./16-developer-guide.md) · [MnemoBrain →](./11-mnemobrain.md) · [MnemoHub →](./09-mnemohub.md)*
