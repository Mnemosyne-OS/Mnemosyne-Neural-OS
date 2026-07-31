# Governance & Sovereignty

> The part most AI memory systems skip. Mnemosyne is built so that **the human governs**
> what the AI is allowed to remember, use, and share — and so that, by default, nothing
> leaves your machine. This page explains what that means concretely.

---

## The tenet

> **Memory perceives, situates, and reveals; the human governs.**

Mnemosyne never silently deletes, never judges truth, and never mixes domains without the
human's consent. Every capability below is an expression of that single principle.

---

## 1. What the human controls

**Per-memory consent (Neural Map).** In the Neural Map, any node can be disabled. A
disabled memory is excluded from *all* future retrieval — enforced at the query layer,
**before any similarity computation** — and the exclusion persists across sessions. This
is not a soft preference: what you turn off is invisible to the AI.

**Vault protection levels.** Memory is partitioned into Vaults by life domain, each with a
protection level and a consent boundary:

- **Normal** — ordinary domain memory, readable/writable within its declared scope.
- **Maximum** — private/sensitive (e.g. a personal journal): never read for cross-vault
  work, never mixed or exposed, never written, unless you ask in the moment.
- **mixableWith** — declares which other Vaults a Vault may be blended with. An isolated
  Vault (`mixableWith: []`) is never blended into others.

**Consolidation is governed, not silent.** Dream State's rule is **augment, never
replace**: consolidated ledgers are *written* memories, appended alongside the raw — which
is always kept. Because a ledger is a real memory, you can inspect and revoke it.
Consolidation is never a silent deletion of the raw.

**Deletion and permission changes are the human's to make.** The system may *propose* them;
it never performs them silently.

---

## 2. What agents and apps are allowed to do

Third-party apps, cartridges, and external agents never get a blank cheque over your vault.

- **FGAC (Fine-Grained Access Control)** governs exactly what each can read, write, or sync.
- Every SDK connection authenticates with a **short-lived, scoped JWT**, listens on
  `127.0.0.1` only, and is bounded by the scopes its app manifest declares.
- Access grants carry a **24h TTL** and auto-heal on refresh.
- The OS sees an app's requests; the app never sees the sealed core.

An agent asked to "handle everything" still only touches what its scope was granted.

---

## 3. What leaves your machine — and what never does

**By default, your memory stays local.**

| Data | Where it lives |
|---|---|
| Vault content (Chronicles, documents) | Your disk only — **AES-256 encrypted at rest once you arm it** |
| Embedding vectors | Your disk (same key); decrypted into RAM only while a Vault is open |
| Neural Map, exclusions, ledgers | Your disk |
| Telemetry | **None without consent** |

**Cloud is opt-in, and scoped.** If you configure a cloud model or cloud embeddings, only
the specific request you make is sent to that provider — never your vault wholesale. With a
local provider (Ollama), the entire pipeline runs offline and **no content leaves the
machine at all**.

**The chain is plumbing, not surveillance.** License ownership is recorded on-chain (Base),
so it's publicly verifiable — but only the *fact of ownership* is on-chain, never vault
content. Verifying costs you nothing (no gas, no token to manage).

---

## 4. Sovereign authentication

A local wallet is the only credential. There is **no account and no server-side password**
to breach.

- On first launch, a signed challenge verifies your **Engramm** license on-chain. Licensing
  and encryption are separate concerns: verifying a license does not arm a key.
- **Encryption at rest is something you switch on** (Settings → Backup & Restore, shipped
  in v1.3.5). Activating mints a 32-byte AES-256 key, shows you a **24-word recovery
  phrase** and makes you confirm it, and only then seals the key into the machine's **OS
  keystore**. Abandon the flow and nothing is written — no vault is touched.
- **Until you arm it, vaults sit on your disk in cleartext.** They are still local, still
  yours, still never uploaded — but they are not encrypted, and we would rather say so
  than let you assume otherwise.
- Once armed, physical theft yields encrypted SQLite. The recovery phrase is what restores
  it on a new machine; nobody else holds a copy.

---

## 5. Where to go deeper

- [Security Policy](../SECURITY.md) — reporting, hardening table, supported versions
- [IPC Security Bridge](IPC_SECURITY_BRIDGE.md) — the validated main↔renderer boundary
- [Privacy & telemetry](PRIVACY_TELEMETRY.md) — the no-telemetry stance
- [Design decisions](DESIGN_DECISIONS.md) — *why* sovereignty is enforced in code, not policy
