# @mnemosyne_os/design-sdk

> **Create custom UI skins for Mnemosyne OS using only JSON — Zero TypeScript required.**

[![Phase 62](https://img.shields.io/badge/Mnemosyne-Phase%2062-00cc6a?style=flat-square)](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)

---

## What is this?

The **Mnemosyne Design SDK** lets UI designers create complete custom themes for Mnemosyne OS by overriding CSS variables — no React, no TypeScript, no build step required.

A skin is a single `.json` file. Drop it into the app and see the result live.

---

## Quick Start

### 1. Create your skin file

```json
{
  "$schema": "https://unpkg.com/@mnemosyne_os/design-sdk/skin-schema.json",
  "id": "my-cyber-skin",
  "name": "CYBER PURPLE",
  "version": "1.0.0",
  "author": "you",
  "description": "Dark purple cyberpunk palette.",
  "tokens": {
    "--accent": "#9b59b6",
    "--accent-dim": "#7d3c98",
    "--accent-glow": "rgba(155, 89, 182, 0.15)",
    "--accent-border": "rgba(155, 89, 182, 0.28)",
    "--bg-hover": "rgba(155, 89, 182, 0.05)",
    "--status-active": "#9b59b6",
    "--text-accent": "#9b59b6",
    "--shadow-accent": "0 0 20px rgba(155, 89, 182, 0.2)",
    "--border-accent": "1px solid rgba(155, 89, 182, 0.28)"
  }
}
```

> **Tip:** Add `"$schema"` at the top for VS Code IntelliSense and auto-complete on all token names.

### 2. Validate before importing

```bash
node scripts/skin-validate.mjs my-cyber-skin.json
```

```
◈ Mnemosyne Skin Validator — Phase 62 / DR-014
──────────────────────────────────────────────────
✓ my-cyber-skin.json
  id:      my-cyber-skin
  name:    CYBER PURPLE
  version: 1.0.0
  author:  you
  tokens:  9 token(s) defined
──────────────────────────────────────────────────
✓ All 1 skin(s) valid — ready to import into Mnemosyne OS
```

### 3. Import into Mnemosyne OS

In the app, open the **right panel (Cockpit Dimensionnel)** → **◈ DESIGN SDK** section.

Drag & drop your `.json` file into the import zone, or click to browse.

The skin is applied instantly with a live preview.

---

## Available Tokens (36)

A skin can override any subset of these CSS variables.
**Unspecified tokens fall back to `mnemo-default` values.**

### Accent colors
| Token | Description | Default |
|---|---|---|
| `--accent` | Primary accent color | `#00cc6a` |
| `--accent-dim` | Dimmed accent | `#009e52` |
| `--accent-glow` | Glow / shadow (rgba) | `rgba(0,204,106,0.15)` |
| `--accent-border` | Border accent (rgba) | `rgba(0,204,106,0.25)` |

### Backgrounds
| Token | Description | Default |
|---|---|---|
| `--bg-void` | Deepest background | `#000000` |
| `--bg-surface` | Surface (panels) | `#0a0a0a` |
| `--bg-panel` | Panel background | `#0d0d0d` |
| `--bg-card` | Card / overlay | `rgba(13,13,13,0.85)` |
| `--bg-hover` | Hover state | `rgba(0,255,136,0.05)` |

### Status indicators
| Token | Description | Default |
|---|---|---|
| `--status-active` | Active / live | `#00cc6a` |
| `--status-idle` | Idle | `#4a4a4a` |
| `--status-hibernating` | Hibernating | `#ff6b00` |
| `--status-overload` | Error / overload | `#ff2244` |
| `--status-warning` | Warning | `#ffaa00` |

### Text
| Token | Description | Default |
|---|---|---|
| `--text-primary` | Primary text | `#e8e8e8` |
| `--text-secondary` | Secondary text | `#888888` |
| `--text-muted` | Muted text | `#444444` |
| `--text-accent` | Accent-colored text | `#00cc6a` |

### Typography
| Token | Description | Default |
|---|---|---|
| `--font-mono` | Monospace stack | `'JetBrains Mono', ...` |
| `--font-ui` | UI font stack | `'Inter', system-ui, sans-serif` |

### Spacing, Radius, Borders, Shadows, Transitions
See [`skin-schema.json`](./skin-schema.json) for the full list with descriptions.

### ⚠ Layout tokens (Advanced)
These exist but modifying them **may break the app layout**:
- `--titlebar-height`
- `--panel-left-width`
- `--panel-right-width`

---

## Built-in Skins

| ID | Name | Description |
|---|---|---|
| `mnemo-default` | MNEMO DEFAULT | Tech-Noir green terminal (baseline, immutable) |
| `mnemo-sith` | SITH RED | Crimson darkside, Order 66 |
| `mnemo-ghost` | GHOST | Cold grey, specter mode |
| `mnemo-aura` | AURA VIOLET | Quantum purple, cyberpunk |

Export any built-in as a starting template:
In the app → **◈ DESIGN SDK** → select a skin → **↑ EXPORT ACTIVE SKIN**.

---

## Design Rules

| Rule | Description |
|---|---|
| **DR-011** | One skin = one JSON file + zero TypeScript for the designer |
| **DR-012** | Skins may only override CSS variables (no code injection) |
| **DR-013** | `mnemo-default` is immutable and always available as fallback |
| **DR-014** | Any invalid skin is rejected with a clear error message |

---

## Using the npm package (TypeScript)

```bash
npm install @mnemosyne_os/design-sdk
```

```typescript
import { validateSkinManifest, MNEMO_DEFAULT_SKIN, type SkinManifest } from '@mnemosyne_os/design-sdk';

const mySkin: SkinManifest = {
  id: 'my-skin', name: 'MY SKIN', version: '1.0.0',
  tokens: { '--accent': '#ff6600' },
};

const result = validateSkinManifest(mySkin);
if (result.ok) {
  console.log('Valid skin:', result.skin.name);
} else {
  console.error('Invalid:', result.error);
}
```

### JSON Schema (VS Code IntelliSense)

Add to your `.json` file:
```json
{
  "$schema": "https://unpkg.com/@mnemosyne_os/design-sdk/skin-schema.json"
}
```

Or reference locally:
```json
{
  "$schema": "./node_modules/@mnemosyne_os/design-sdk/skin-schema.json"
}
```

---

## CLI Validator

```bash
# Validate one or more skin files
node scripts/skin-validate.mjs path/to/skin.json

# Show help + full token list
node scripts/skin-validate.mjs --help
```

---

## License

MIT — [Mnemosyne Neural OS](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS)
