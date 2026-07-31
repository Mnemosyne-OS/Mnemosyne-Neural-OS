# Mnemosyne Neural OS — Public Roadmap

> This roadmap covers the **open-source MnemoForge CLI**, the **Developer SDK**, and publicly released **Infinity Edition** milestones.
> Internal platform R&D is tracked separately. For the live feature list, see the [README](README.md#roadmap).

---

## ✅ Shipped

| Milestone | When | Notes |
|-----------|------|-------|
| Infinity Edition — 6 public releases | 2026 | Flagship desktop app, now at [**v1.3.3 · The Sovereign Ledger**](https://github.com/Mnemosyne-OS/Mnemosyne-Neural-OS/releases/tag/v1.3.3-infinity) |
| MnemoHub | 2026 | Signed cartridge marketplace — community submission pipeline + live publishing |
| Sovereign identity | 2026 | Claim a public pseudonym bound to your wallet — no account, no password |
| Dream State | 2026 | Idle-time consolidation engine — replays and links memories across sessions |
| LongMemEval-M — verifiable benchmark | Jul 2026 | 72.9% on the full-haystack (hard) variant — [auditable](https://yaka0007.github.io/MnemosyneOS---benchmarks/verification-kit/) from the published grader + logs |
| MnemoForge CLI v1.3.18 | 2026 | [`@mnemosyne_os/forge`](https://www.npmjs.com/package/@mnemosyne_os/forge) — Soul Protocol · Canvas Rules · Chronicle System · MCP Server |
| Layer-2 Developer SDK | Jun 2026 | `@mnemosyne_os/sdk` · `design-sdk` · `eval-sdk` · `public-contracts` |
| Public beta — v1.1.0-beta.1 | Jun 2026 | Soul Studio · Resonance · First Contact |
| Open-core licensing model | Apr 2026 | CLI + Developer SDK = MIT · Platform = proprietary |
| Local-only mode (100% offline) | Q1 2026 | Ollama-powered, zero cloud required |
| Multi-provider embedding cascade | Q1 2026 | Ollama → Jina → Cohere → Gemini → OpenAI |
| Per-document memory governance | Q1 2026 | Interactive memory graph + per-project isolation & bridges |

---

## 🚧 In progress

| Milestone | Notes |
|-----------|-------|
| Signed installers (Windows + macOS) | Code-signing so installs pass OS reputation checks out of the box |
| Context compression protocols | Keep a growing lifetime of memory cheap to carry on modest, on-device hardware |
| Creator economy | Paid visibility for cartridges, revenue flowing back to builders (plumbing pre-wired) |

---

## 🔮 Next

| Milestone | Notes |
|-----------|-------|
| Synaptic P2P | Sovereign libp2p mesh (`mnemosync-p2p`) — reach peers directly, no classic internet required |
| Team vaults | Shared, multi-user vaults + multi-agent coordination |
| Self-hosted sync server | For teams that don't want the cloud relay |
| Plugin marketplace | Community Soul Profiles and cartridge templates |
| Nonce-based CSP | Remove `unsafe-inline` while keeping dynamic themes |

---

## 📦 MnemoForge CLI

The open-source entry point to the ecosystem — give any AI agent persistent memory, a
behavioral identity, and an automated publish pipeline.

**Current — v1.3.18** ✅
- `mnemoforge soul inject` — a persistent personality profile injected into your IDE
- Canvas Rules — a living ruleset persisted across sessions
- `mnemoforge chronicle write` — structured AI memory files
- `mnemoforge serve` — an MCP server exposing vault tools to any agent

**Next**
- `mnemoforge add` / `upgrade` — component scaffolding + standards migration
- Community template registry

---

## How to follow progress

- ⭐ **Star this repo** to get notified of releases
- 👁 **Watch → Releases only** for version announcements
- 💬 **[GitHub Discussions](../../discussions)** for community feedback
- 🐛 **[Issues](../../issues)** for bug reports and feature requests

---

*Last updated: July 2026 · XPACEGEMS LLC*
