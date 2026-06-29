# Multilanguage — The Language Pack System

> *Mnemosyne speaks your language. And if it doesn't yet — someone can build the pack.*

---

## Three Languages, Bundled from Day One

Mnemosyne OS ships with three fully integrated languages, bundled directly in the application:

| Language | Code | Status |
|---|---|---|
| **English** | `en` | ✅ Bundled |
| **French** | `fr` | ✅ Bundled |
| **Spanish** | `es` | ✅ Bundled |

Every string in the interface — Soul Studio, MnemoBrain, MnemoVault, the settings panel, onboarding flows, error messages — is stored in structured JSON namespaces. The translation layer uses **i18next**, with automatic fallback chaining: if a string is missing in the active language, the system falls back gracefully to French, then English.

---

## The Language Pack Architecture

Beyond the three bundled languages, Mnemosyne OS implements a **downloadable Language Pack system** — a runtime extension mechanism that allows any language to be added without modifying or rebuilding the application.

### How It Works

```
User installs a language pack (via MnemoHub)
       ↓
Pack is stored locally in userData/language-packs/
       ↓
At startup: bootstrapLanguagePacks() runs
       ↓
Main process: reads pack metadata + JSON namespaces
       ↓
IPC: sends resources to renderer
       ↓
i18next: addResourceBundle() — merges pack over bundled strings
       ↓
Interface switches to new language — no restart required
```

The bootstrap is a safe no-op if no packs are installed. It adds zero startup cost when running in a bundled language.

### Pack Format

Each language pack is structured around a metadata manifest and a set of JSON namespace files:

```json
{
  "locale": "zh-CN",
  "packVersion": "1.0.0",
  "displayNameEn": "Chinese (Simplified)",
  "installDir": "~/.mnemosyne/language-packs/zh-CN/",
  "namespaces": ["common", "soul-studio", "mnemobrain", "vault", "settings"]
}
```

Namespaces match exactly the structure of the bundled locales, allowing packs to override any subset of strings and inherit the rest through the fallback chain (`lang → fr → en`).

---

## Extended Language Packs — Coming to MnemoHub

The Language Pack system is designed for three strategic markets not covered by the bundled languages:

| Language | Code | Script | Market |
|---|---|---|---|
| **Chinese (Simplified)** | `zh-CN` | CJK | 1.4B+ users, largest AI consumer market |
| **Arabic** | `ar` | RTL | 400M+ speakers, fast-growing AI adoption |
| **Russian** | `ru` | Cyrillic | 150M+ speakers, strong tech-fluent user base |

These packs are in preparation and will be available for download via **MnemoHub** — the module and extension marketplace. Once installed, they activate immediately without restarting the application.

The RTL support for Arabic is handled at the layout level: i18next signals the language direction, and the interface adapts accordingly.

---

## Community Language Packs

The pack format is fully documented and open. Any developer or community can produce a language pack for Mnemosyne OS by:

1. Copying the English namespace JSON files as a base
2. Translating all string values
3. Creating the metadata manifest
4. Publishing to MnemoHub (or distributing directly as a `.zip`)

This creates a community localization model: new languages can appear without any involvement from the core team, and the runtime system handles loading them identically to official packs.

---

## Why This Matters

The choice to build language as an extension system rather than a compile-time configuration means two things:

**For users:** Adding a language is as simple as installing a module. No new version of the app required.

**For the project:** The app's localization roadmap is not limited by the core team's capacity. Anyone can add a new language. The architecture scales to hundreds of locales if community demand exists.

In the context of a *local-first, sovereign AI platform*, language sovereignty matters as much as data sovereignty. A practitioner in China, Russia, or the Arab world should be able to use Mnemosyne OS in their own language — and should be able to trust that no text processing of their vault happens in a language they didn't choose.

---

*Part of the [Mnemosyne OS Documentation](./README.md)*\
*Related: [MnemoHub →](./09-mnemohub.md) · [Soul Studio →](./07-soul-studio.md) · [Local-First Sovereignty →](./17-security-sovereignty.md)*
