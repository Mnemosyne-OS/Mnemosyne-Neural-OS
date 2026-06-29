# `mnemoapp.json` — App Manifest Specification

Every Layer 2 application running on Mnemosyne OS must declare an `mnemoapp.json`
at its root. This file is the **public contract** between your app and the OS.

The OS validates this manifest at registration time and enforces it at every IPC call.
Any operation not declared in the manifest will be rejected — Zero-Trust by design.

---

## Schema

```json
{
  "id":          "com.example.my-app",
  "name":        "My App",
  "version":     "1.0.0",
  "api_version": "2.0",
  "author":      "Your Name",
  "description": "Short description of what your app does.",
  "scopes":      ["bridge:read", "vault:query"],
  "entry":       "dist/app.js"
}
```

---

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | ✅ | Unique reverse-domain app identifier (e.g. `com.example.my-app`) |
| `name` | `string` | ✅ | Human-readable display name |
| `version` | `string` | ✅ | Semver app version (e.g. `1.0.0`) |
| `api_version` | `string` | ✅ | Mnemosyne SDK version your app targets (currently `"2.0"`) |
| `author` | `string` | — | App author or organization name |
| `description` | `string` | — | One-line description for MnemoStore display |
| `scopes` | `string[]` | ✅ | Permissions your app requires (see below) |
| `entry` | `string` | — | Main entry point relative to app root (used by MnemoStore launcher) |

---

## Available Scopes (Phase 59)

### Bridge API

| Scope | Access | Unlocks |
|-------|--------|---------|
| `bridge:read` | READ | `computeResonance`, `getBridgeHistory`, `getBridgeSessions` |

### Vault API

| Scope | Access | Unlocks |
|-------|--------|---------|
| `vault:query` | READ | `sendPulse` with `QUERY` intent — semantic memory search |
| `vault:read:DEV` | READ | Chronicle access for the DEV vault |
| `vault:read:SOCIAL` | READ | Chronicle access for the SOCIAL vault |
| `vault:write:DEV` | WRITE | `ingest()` into the DEV vault (requires explicit grant) |

### System

| Scope | Access | Unlocks |
|-------|--------|---------|
| `neural:graph:read` | READ | NeuralGraph topology (experimental) |
| `monorepo:read` | READ | Git log + markdown file access |
| `agents:read` | READ | List connected Layer 2 apps |
| `llm:query` | READ | Direct LLM generation via `sendPulse` (premium) |
| `nft:validate` | READ | MnemoStore NFT licence validation |

> **Principle of least privilege** — only declare the scopes you actually need.
> MnemoStore reviewers inspect scope declarations and may flag over-requested permissions.

---

## Minimal Example — Resonance Filter App

The minimum viable `mnemoapp.json` for an app that only reads bridge resonance:

```json
{
  "id":          "com.example.resonance-filter",
  "name":        "Resonance Filter",
  "version":     "1.0.0",
  "api_version": "2.0",
  "description": "Measures resonance of any text against your cognitive bridge graph.",
  "scopes":      ["bridge:read"],
  "entry":       "dist/app.js"
}
```

---

## Full Example — Bridge Explorer

```json
{
  "id":          "com.example.bridge-explorer",
  "name":        "Bridge Explorer",
  "version":     "1.2.0",
  "api_version": "2.0",
  "author":      "Jane Dev",
  "description": "Explore your semantic bridge timeline with filters and resonance scoring.",
  "scopes": [
    "bridge:read",
    "vault:query",
    "vault:read:DEV",
    "vault:read:SOCIAL"
  ],
  "entry": "dist/main.js"
}
```

---

## Validation Rules

The OS enforces the following at registration:

1. **`id`** must match `[a-z][a-z0-9.-]+` — reverse-domain format.
2. **`version`** must be a valid semver string.
3. **`api_version`** must be `"2.0"` or higher.
4. **`scopes`** must be a non-empty array of known scope strings.
5. **Unknown fields** are silently ignored (forward-compatible).

---

## Migration from `app.manifest.json` (SDK v1.x)

If your app uses the old `app.manifest.json` format from SDK v1.x, rename the file
to `mnemoapp.json` and update the following fields:

| SDK v1.x | SDK v2.0 (`mnemoapp.json`) |
|----------|---------------------------|
| `mnemosyne_sdk: "^1.x"` | `api_version: "2.0"` |
| `scopes: ["vault:read:DEV"]` | Same (unchanged) |
| `intents: ["QUERY"]` | Removed — intents are inferred from scopes |
| `vaults: ["DEV"]` | Removed — derived from vault scopes |

> The `mnemosyne_sdk` field from v1.x is still accepted for backward compatibility
> but is deprecated. Use `api_version` in all new apps.
