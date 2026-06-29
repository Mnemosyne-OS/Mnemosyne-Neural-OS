# MnemoHub — The Mnemosyne Module Store

> *Mnemosyne OS is not an application. It is a platform. MnemoHub is proof of that.*

---

## What MnemoHub Is

MnemoHub is the official module store for the Mnemosyne OS ecosystem — a curated marketplace where users install capability extensions, and where developers publish and certify new modules.

It exists in two forms:

**The Web Store** — a standalone browsable catalogue accessible from a browser, where developers and users can discover, explore, and preview available modules before installing.

**The In-App Store** — integrated directly into the Mnemosyne OS desktop application, providing one-click installation, installed module management, and pre-installed module visibility.

Both surfaces share the same catalogue, the same certification system, and the same permission model.

---

## The Module Catalogue

At launch, MnemoHub already ships with **13 modules** across six categories:

| Module | Category | Description |
|---|---|---|
| **Cortex Auditif V3.0** | Utilitaires | Local audio transcription via Whisper + local LLM (Ollama). Archives, batches. |
| **MnemoVision — Vision & OCR** | Créatif | Visual processing — image recognition, OCR, visual data extraction. |
| **Studio vidéo Mnemo** | Créatif | Local video studio — cut, compress, process from the Vault via native FFmpeg. |
| **MnemoLingua — Traduction** | Utilitaires | Multilingual translation and linguistic analysis via local LLM. |
| **Stratège Mnemosyne** | Productivité | AI Roadmap — turns strategic prompts into Kanban with calendar export (ICS) and Brain hooks. |
| **BMAD 2.0** | Productivité | Brief-Mapping-Architecture-Delivery — frames a project in 4 steps with AI support. |
| **MnemoShare — Partage Vault** | Utilitaires | Secure vault content sharing — export, temporary links, collaboration. |
| **Google Drive** | Google | Google Drive integration — sync and access to Drive files from the Vault. |
| **Chronos Legacy** | Créatif | Family archive — local family archiving. *(Coming soon)* |
| **Mnemo-Lingua** | Système | Pre-installed. Text and `.md` file translation via LLM (FR, EN, ES, DE, IT). |
| **Policy Studio** | Système | Pre-installed. FGAC policy editor and access rule manager. |

Modules are filterable by platform type: **Bureau · Mobile · Web · Compagnon**, and by status: **Tous · Installés**.

---

## The Permission Model

Every module in MnemoHub must declare the permissions it requires before a user can install it. These permissions are displayed on the module card and reviewed at install time.

The permission system uses a namespaced scope model:

| Permission | Meaning |
|---|---|
| `mnemo:resonance-read` | Read access to the Resonance context layer |
| `mnemo:ui-overlay` | Can render UI elements over the Mnemosyne interface |
| `sandbox:fs-read` | Read access to sandboxed filesystem paths |
| `sandbox:fs-write-scoped` | Write access, scoped to declared paths only |
| `sandbox:network` | External network access (flagged, visible to user) |

No module can access host resources outside its declared permissions. The sandbox enforces this at runtime. A module requesting `sandbox:network` is clearly visible to the user — no hidden exfiltration is architecturally possible.

This permission model is the public-facing expression of the same sovereignty principle that governs the core application: **every access is declared, visible, and user-controlled.**

---

## The Developer Program — Mnemosyne Certified

MnemoHub includes a **developer certification program** — designed to be earned, not applied for. The bar is simple: demonstrated work, documented quality, and alignment with the Mnemosyne OS standards.

The program has two levels.

---

### Level 1 — Trusted Developer

A Trusted Developer is a builder who has demonstrated they can produce quality extensions for Mnemosyne OS. The requirements are straightforward:

- **Works with the Mnemo-SDK** — uses the official tooling and follows the documented development rules
- **Quality demonstrated by output** — the extensions are complete, functional, and respect the permission model
- **Alignment with Mnemosyne principles** — local-first, sovereign, no hidden data access

There is no formal application. Trusted Developer status is validated by the work itself.

---

### Level 2 — Mnemosyne Certified

The **Mnemosyne Certified** badge is the top-level designation. It requires something concrete: a track record.

> *A developer must have published at least several working extensions before being eligible for Mnemosyne Certified status.*

This requirement exists by design. The certification isn't a promise — it's a recognition of demonstrated practice. A developer who has published multiple solid extensions has already proven they understand the ecosystem, respect the architecture, and deliver quality. The badge makes that visible to users and to the platform.

Mnemosyne Certified brings:
- Featured placement in the MnemoHub catalogue
- Priority visibility for new module releases
- Access to advanced platform APIs
- The `Mnemosyne Certified ✓` badge on the developer profile and module cards

---

### Developer Tooling

| Tool | Description |
|---|---|
| **Mnemo-SDK** | React / TypeScript SDK for building modules |
| **Sandbox API** | Native FS and IPC access via sandbox, host uncompromised |
| **Skill Pack Builder** | For Cortex Auditif modules and local LLM (Ollama) skill packs |
| **Vector DB integration** | Local vector database access for search-capable modules |
| **manifest.json** | Declarative module definition (schemaVersion, id, version, permissions, entrypoints) |

---

### Revenue Model *(coming soon)*

Every module on MnemoHub can be published as **free** or **paid**. When the revenue model activates, developers who publish paid modules will receive a share of each sale — a direct monetization path within the ecosystem.

The specifics of the revenue split and payout model are in preparation and will be documented when the system goes live.

## Why MnemoHub Changes the Product Category

A standalone app has users.
A platform with a certified module store has an **ecosystem**.

The difference matters enormously for how the product is evaluated — by users, by developers, and by investors.

When a new developer publishes a module to MnemoHub, they are extending the capabilities of every Mnemosyne OS installation. The installed base grows more capable without any action from the core team. The value of holding Mnemosyne OS increases with every module published.

This is the **network effect model** applied to a sovereign, local-first AI platform:

> The more modules exist, the more reasons to install Mnemosyne OS.  
> The more Mnemosyne OS is installed, the more reason to build modules.  
> The platform value scales — without the platform needing to centralize user data to do it.

That last point is the differentiation. Most app store ecosystems require the platform operator to be the central intermediary for everything: payments, data, distribution, identity. MnemoHub can function with the user's identity and vault remaining entirely local. The store is a discovery layer. The execution is local.

---

## Current Status

MnemoHub is in active beta. The web store and in-app store are operational. The developer certification program is open for early applications. The catalogue grows as the ecosystem develops.

### Review & Rating System *(coming soon)*

The module detail pages already include the full review and rating infrastructure — 5-star rating widget, written review field, aggregate score display on catalogue cards. The UI is complete and visible in the store today.

The backend persistence layer for storing and retrieving community reviews is in development. When activated, this turns the catalogue into a community-curated quality signal — where BMAD 2.0 at 4.8★ or Strategist at 4.5★ becomes public social proof for new users evaluating the ecosystem.

**Planned additions:**

- Extended language packs (zh-CN, ar, ru) — to be distributed as MnemoHub modules
- Community-published Skill Packs for local LLM workflows
- MnemoForge-built apps (AI-generated modules submitted to the store)
- Community reviews and ratings — backend activation
- Publisher branding update: `Mnemosyne OS ✓` (replacing current `XPACEGEMS ✓`)

---

*Part of the [Mnemosyne OS Documentation](./README.md)*\
*Related: [Local-First Sovereignty →](./17-security-sovereignty.md) · [Multilanguage →](./19-multilanguage.md) · [Architecture Overview →](./15-architecture.md)*
