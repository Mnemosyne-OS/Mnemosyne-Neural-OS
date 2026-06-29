# AI Configuration — Provider Orchestration

> *"Providers, API keys and models in one place."*

---

## Overview

Mnemosyne's AI Configuration is the central control panel for all language models, embedding engines, voice services, and specialized AI providers. Everything routes through this single interface.

**Current scale:** 4 / 10 providers active · 53 models configured

Providers are organized by category. Each model carries metadata about its function, cost, context window, and capabilities. Toggle any model on or off in two clicks.

---

## Provider Categories

### ⚡ Cloud Rapide — LPU & Multi-Models

High-throughput, free-tier providers optimized for speed.

| Provider | Models | Status | Notes |
|---|---|---|---|
| **Groq** | 4/7 active | ✅ Connected | LPU hardware · Ultra-rapid · FREE tier |
| **OpenRouter** | 10/10 active | ✅ Connected | +40 cloud models in one integration |

Groq runs on Language Processing Units (LPU) — dedicated inference hardware that delivers responses noticeably faster than standard GPU cloud. Free tier requires no payment.

OpenRouter aggregates 40+ models from multiple providers under one API key — a single connection that unlocks Claude, Mistral, Llama variants, and more.

---

### 🌐 Major Providers

| Provider | Models | Status | Specialty |
|---|---|---|---|
| **Google Gemini** | 5/5 active | ✅ Connected | Primary LLM · Thinking mode · Multimodal |
| **OpenAI** | — | Not configured | GPT-4o · Reasoning models |
| **Anthropic Claude** | 1/1 active | Configured | Long documents · Careful reasoning |
| **DeepSeek** | 2/2 active | Configured | Code · Math · Affordable |
| **Grok (xAI)** | 3/5 active | Configurable | Thinking · 131k context · Real-time web |
| **MiniMax** | 3 models | Configurable | 1M context window · Roleplay |

**Grok 3 Mini** — example of per-model metadata displayed in the interface:
```
THINKING  ·  $0.3↑  ·  $0.5↓  /M tokens  ·  131k ctx
```
Every model shows: architecture tags (THINKING, Vision, Rapid), pricing per million tokens (input↑ / output↓), and context window size.

**MiniMax** (Long context 1M — Roleplay):
- MiniMax Text 01 — $1.37 / 1M ctx · General
- MiniMax M2 (Rapide) — $0.37 / 33M ctx · Speed
- MiniMax M2 Vision — $0.37 / 33M ctx · Visual

---

### 🔴 Embeddings & Resonance Memory — CRITICAL

> *"Sans embedding, Résonance ne peut pas indexer ton Vault ni injecter la mémoire dans les conversations."*

This is the operational backbone of the entire memory system. Without an active embedding provider, Layer 3 of the memory injection pipeline cannot function — RESONANCE_INDEX cannot be built, and automatic context injection cannot occur.

| Provider | Free Tier | Status | Notes |
|---|---|---|---|
| **Jina AI** 🔴 | 1M tokens/month | ✅ Connected | Recommended · RAG-specialized |
| **Cohere** | 1000 req/month | Configurable | Multilingual embeddings |

**Why embeddings matter:** When a user sends a message, the system converts both the message and the vault content into numerical vectors. Relevant vault fragments are found by measuring vector distance — not keyword matching. This enables the "25 memories injected" figure: 25 semantically related fragments located and compiled automatically.

Jina AI provides this at zero cost for 1M tokens/month, with an architecture specifically optimized for RAG (Retrieval-Augmented Generation). It is the recommended provider.

The **Resonance — Mémoire Sémantique** section within this same configuration block provides:
- Diagnostic tools
- Semantic search testing
- Manual vault re-indexing

---

### 🖥️ Local Models — node-llama-cpp

Mnemosyne detects local hardware and displays it in the configuration panel.

**Hardware detected (current machine):**
```
GPU:  NVIDIA GeForce RTX 4050 Laptop GPU · VRAM: 6.0GB
RAM:  31.4GB total · 3.9GB free
CPU:  Intel Core Ultra 7
```

**Installed GGUF models:**
| Model | Size | VRAM usage |
|---|---|---|
| HF Bartowski Meta Llama 3.1 8B Instruct | 4.50B | ~5GB |
| HF Bartowski Qwen2.5 14B Instruct | 8.37B | ~8GB |
| HF TheBloke Mistral 7B Instruct V0.2 | 4.07B | ~5GB |
| TinyLlama 1.1B Chat V1.0 Q4_K_M | 0.63B | ~1GB |

Each installed model shows a ▶ (load) and 🗑️ (delete) button. A **Recommended Models Catalog** link guides configuration based on detected VRAM.

**Ollama (fallback):** If Ollama is installed, additional models become available automatically — Llama 3.2, Llama 3.1, Mistral, DeepSeek R1, Qwen 1.5.

Local inference = no API call, no cost, complete privacy. Runs at the latency of local GPU inference.

---

### 🎯 Specialized Services

| Service | Function | Notes |
|---|---|---|
| **Deepgram** | Live voice recognition | Cloud · Used for "Direct (cloud)" mode in Brain |
| **Puter Satellite (Free)** | GPT-4o, Claude 3.5, Llama | No API key required · Free Cloud AI via Puter OS |
| **Puter Satellite (Cloud)** | 4/4 models | Configurable |

**Deepgram** provides real-time voice transcription — the input method for hands-free sessions in MnemoBrain's voice mode. Note: audio is processed on Deepgram's servers (not local).

**Puter Satellite** is a notable inclusion: free access to GPT-4o, Claude 3.5, and Llama 3, through the Puter Cloud OS — with no API key, no payment, no account. When no other provider is configured, Puter provides fallback access to frontier models.

---

## How Models Are Assigned Functions

Within Mnemosyne, each model is not just "on" or "off" — it is assigned to a specific function. The same configuration panel where providers are enabled is where the model-to-function mapping is defined.

Functions in the system:
- **Primary conversation** (MnemoBrain main chat) — typically Gemini 2.5 Flash / Groq
- **Thought Matrix agents** — Strategist, BMAD, Config Agent, Limbic System each have their own assigned model
- **Embeddings** — Jina AI (dedicated, cannot be a conversation model)
- **Voice input** — Deepgram (dedicated, audio only)
- **Local inference** — node-llama-cpp models, toggled on demand by VRAM availability

A model with `THINKING` capability routes through a different API path that captures `thoughtsTokenCount` separately from `candidatesTokenCount` — the internal reasoning process is logged, visible in developer mode, and costs additional tokens. The trade-off: slower, deeper responses for complex reasoning tasks.

---

## Settings Navigation

The Configuration IA panel is accessed from Settings sidebar (MNEMOSYNE / SYSTEM / SETTINGS):

```
SYSTEM CONFIG
  ├── IDENTITY           → Soul management
  ├── Configuration IA   → This panel
  ├── Résonance          → Memory indexing
  ├── Apparence          → UI themes
  ├── SYSTEM DNA         → Knowledge base files
  ├── Neural-Link        → Connection settings
  ├── Share Server       → Multi-device sync
  ├── NARCISSUS          → Chronicle configuration
  └── Agents             → Thought Matrix agent management
```

---

*Part of the [Mnemosyne OS Documentation](./README.md)*\
*Related: [MnemoBrain →](./11-mnemobrain.md) · [Resonance Projects →](./05-resonance-projects.md) · [MnemoHub →](./09-mnemohub.md)*
