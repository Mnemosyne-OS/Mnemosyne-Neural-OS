# Documentation — Mnemosyne Neural OS

The map of everything written about Mnemosyne. New here? Start with **Concepts**, then
**Architecture**, then the **whitepaper** for the memory engine in depth.

---

## Start here

| Doc | What it covers |
|---|---|
| 📖 [Concepts & Glossary](CONCEPTS.md) | The mental model (Vault → Chronicle → Spine → Resonance → governance) and every product/architecture term defined |
| 🏗️ [Architecture Overview](ARCHITECTURE.md) | The process model, the engines, and the life of a memory from ingestion to answer |

## The memory engine, in depth

| Doc | What it covers |
|---|---|
| 📄 [The Resonance Engine — Whitepaper](RESONANCE_ENGINE_WHITEPAPER.md) | The full multi-engine cognitive memory architecture — a living document, current as of v1.3.3 |
| 🔬 [Benchmark — LongMemEval-M (recomputable)](https://yaka0007.github.io/MnemosyneOS---benchmarks/verification-kit/) | 64.6 → 72.9 %, full-haystack — re-derive the score yourself in one command |

## Governance, security & privacy

| Doc | What it covers |
|---|---|
| 🛡️ [Governance & Sovereignty](GOVERNANCE.md) | What the human controls, what agents are allowed to do, and what never leaves your machine |
| 🔐 [Security Policy](../SECURITY.md) | Reporting a vulnerability, the hardening table, supported versions |
| 🔗 [IPC Security Bridge](architecture/IPC_SECURITY_BRIDGE.md) | The Zod-validated main ↔ renderer boundary, for engineers evaluating the security posture |
| 🕵️ [Privacy & Telemetry](technical/PRIVACY_TELEMETRY.md) | The no-telemetry-without-consent stance |

## The thinking behind it

| Doc | What it covers |
|---|---|
| 🧭 [Design Decisions](DESIGN_DECISIONS.md) | *Why* it's built this way — open-core, local-first, augment-never-replace, fail-loud, and more |
| 🌐 [Neural Fusion Spec](technical/NEXUS_GRAPH_FUSION_SPEC.md) | Multi-zone knowledge-graph indexing (technical spec) |

## Build on it

| Resource | What it covers |
|---|---|
| 🧩 [SDK packages](../packages) | `@mnemosyne_os/sdk`, `design-sdk`, `public-contracts`, `create-app` — the integration surface |
| ⚡ [MnemoForge CLI docs](../cli/docs) | Give any agent persistent memory, an identity, and a publish pipeline |
| 📦 [Cartridge boilerplate](../examples/cartridge-boilerplate) | Scaffold a cartridge and talk to the vault in minutes |
| 🗺️ [Featured cartridges](../README.md#the-cartridges-are-real--and-readable) | Real, source-inspectable reference implementations |

## The method

| Resource | What it covers |
|---|---|
| 📚 [The Neural Coding Handbook](../handbook) | The human-directed development methodology Mnemosyne was built with |

---

*Something here out of date? These docs track the product as it ships — open an issue or a PR.*
