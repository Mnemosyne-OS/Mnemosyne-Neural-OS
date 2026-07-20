# `app.manifest.json` — App Manifest Specification

Every Layer 2 application declares an `app.manifest.json`. It is the **public
contract** between your app and the OS: the OS validates it at `register()` and
enforces the declared scopes/intents on every RPC — anything not declared is
rejected (Zero-Trust).

> **Source of truth:** the Zod schema in [`src/manifest.ts`](../src/manifest.ts)
> (`AppManifestSchema`). If this doc and that schema ever disagree, the schema
> wins — it is what actually validates your manifest.

---

## Schema

```json
{
  "id":            "my-app",
  "name":          "My App",
  "version":       "1.0.0",
  "author":        "Your Name",
  "mnemosyne_sdk": "^1.2.0",
  "description":   "Short description of what your app does.",
  "scopes":        ["vault:read:DEV", "bridge:read"],
  "vaults":        ["DEV"],
  "intents":       ["QUERY", "BRIDGE_READ"],
  "max_chronicle_size_kb": 64,
  "requires_consent": false
}
```

---

## Fields

| Field | Type | Required | Rule |
|-------|------|----------|------|
| `id` | `string` | ✅ | `^[a-z0-9][a-z0-9_-]{1,63}$` — lowercase, hyphens/underscores, 2–64 chars. **Not** reverse-domain; dots are rejected. |
| `name` | `string` | ✅ | 2–64 chars |
| `version` | `string` | ✅ | SemVer (e.g. `1.0.0`) |
| `mnemosyne_sdk` | `string` | ✅ | SemVer range of the SDK you target (e.g. `^1.2.0`) |
| `scopes` | `string[]` | ✅ | ≥ 1 scope, each from the list below |
| `vaults` | `string[]` | ✅ | ≥ 1 vault: a core id (`DEV`/`SOCIAL`/`PERSONAL`/`FINANCE`/`RESEARCH`) or a custom `UPPER_SNAKE_CASE` id |
| `intents` | `string[]` | ✅ | ≥ 1 intent from the list below |
| `author` | `string` | — | ≤ 64 chars |
| `description` | `string` | — | ≤ 256 chars |
| `max_chronicle_size_kb` | `number` | — | 1–1024, default `64` |
| `requires_consent` | `boolean` | — | **Deprecated / no effect.** The OS decides whether to prompt from the declared scopes (`requiresOsGrant`), not from this flag. |

> Unknown fields are allowed (the schema is not `.strict()`), so MnemoStore-specific
> fields (`uiMode`, `uiEntryPoint`, …) pass through untouched.

---

## Scopes

| Scope | Unlocks |
|-------|---------|
| `vault:read:<VAULT>` / `vault:write:<VAULT>` | Read/write a vault. `<VAULT>` ∈ `DEV`, `SOCIAL`, `PERSONAL`, `FINANCE`, `RESEARCH` |
| `vault:read:CUSTOM` / `vault:write:CUSTOM` | Wildcard for **any** user-created (non-core) vault |
| `share:request` / `share:grant` | Cross-app sharing (`requestShare`) |
| `monorepo:read` | `gitLog` + `readFile` (`.md` only) |
| `agents:read` | `agentsList` |
| `neural:graph:read` | `graphQuery` (NeuralGraph) |
| `bridge:read` | `getBridgeHistory`, `computeResonance` (Perpetual Memory Bridges) |
| `llm:query` | Direct LLM generation (premium) |
| `nft:validate` | Reserved for MnemoStore NFT gating — **roadmap, not yet wired** |

## Intents

`INGEST`, `QUERY`, `CORRELATE`, `FORGET`, `GIT_LOG`, `LIST_AGENTS`,
`LIST_VAULTS`, `BRIDGE_READ`.

> **Least privilege** — declare only what you use. Any `vault:*`, `share:*`, or
> `llm:query` scope always triggers the OS consent prompt (`requiresOsGrant`),
> regardless of `requires_consent`.

---

## Minimal example — bridge reader

```json
{
  "id":            "resonance-filter",
  "name":          "Resonance Filter",
  "version":       "1.0.0",
  "mnemosyne_sdk": "^1.2.0",
  "description":   "Scores any text against your cognitive bridge graph.",
  "scopes":        ["bridge:read"],
  "vaults":        ["DEV"],
  "intents":       ["BRIDGE_READ"]
}
```

---

## Note on the never-shipped `mnemoapp.json` v2

Earlier drafts of this doc described an `mnemoapp.json` with a reverse-domain
`id`, an `api_version: "2.0"` field, an `entry` field, and a `vault:query` scope,
and claimed `intents`/`vaults` were removed. **None of that shipped.** The SDK
validator rejects every one of those. Use `app.manifest.json` exactly as above.
