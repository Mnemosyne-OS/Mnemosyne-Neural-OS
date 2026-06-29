# MnemoPrompt — The Prompt Arsenal

> *A conversation flows. A master prompt is architecture. MnemoPrompt manages both.*

---

## What MnemoPrompt Is

MnemoPrompt is the prompt library of Mnemosyne OS — a dedicated management system for the structured prompts that drive the AI's most precise behaviors. Located at `SYSTEM / PROMPTS`, it holds the practitioner's collection of master prompts, system instructions, persona definitions, and injection templates.

The library currently holds 27 prompts (shown as `Dictionary (27)`) and is directly accessible from MnemoBrain via the **Arsenal de Prompts** quick-inject panel.

---

## The Dictionary — Grid View

The main view displays all prompts as cards in a grid. Each card shows:

- **Color dot** — category color assigned to the prompt
- **Name** — uppercase label (e.g., FORMATTING PROTOCOL, SCRIBE DU NEXUS v2.1)
- **Version** — small badge (v0.1.0, v0.1.2, ↑ when updated)
- **Content preview** — first characters of the prompt text
- **Copy icon** — one-click clipboard copy of full content
- **⭐ Favorite** — bookmark for the Arsenal quick-access panel

**Views:** Grid · List · Icon — switchable from the sidebar.

---

## Prompt Data Model

Each prompt in the Arsenal carries:

```
{
  id: "p_1742847293821",
  label: "FORMATTING PROTOCOL",
  category: "Synthèse",
  content: "# SYSTEM INSTRUCTION: IRINA PERSONA & FORMATTING...
            2700 characters",
  colorId: "color_2",          // amber
  customLabels: ["critique"],  // tags
  favorite: true,
  version: "0.1.2"             // tracked
}
```

**Color palette** (6 defaults, customizable):
- Emerald (#10b981) · Amber (#f59e0b) · Rose (#f43f5e)
- Cyan (#06b6d4) · Purple (#8b5cf6) · Pink (#ec4899)

Labels (tags) are fully user-defined — "critique", "persona", "export", "master", etc. Multiple labels per prompt supported.

---

## The Editor — Drawer View

Clicking a prompt in the list opens the edit panel on the right:

```
┌──────────────────────────────────────────────────────────┐
│  Edit: FORMATTING PROTOCOL                         ☆ 🗑  │
├──────────────────┬───────────────────────────────────────┤
│  NAME            │  VERSION                              │
│  FORMATTING PROTOCOL│  0.1.2                            │
├──────────────────┴───────────────────────────────────────┤
│  COLOR      ●  #f59e0b                                   │
│  LABELS     [critique ×]  [Label + Enter to add]         │
├──────────────────────────────────────────────────────────┤
│  PROMPT CONTENT                           2700 caractères│
│                                                          │
│  # SYSTEM INSTRUCTION: IRINA PERSONA &   ...            │
│  **IDENTITY:** Tu es "IRINA", une Architecte...          │
│  **RESPONSE FORMAT (STRICT):**                           │
│  PHASE 1: LE BRIEFING (NARRATIVE & STRATÉGIQUE)          │
│  PHASE 2: LA CHARGE UTILE (THE MASTER PROMPT)            │
│                                                          │
└─────────────────────────────────────────────────────────┘
              [↑ INJECTER]  [ANNULER]  [SAVE]
```

**Unsaved changes detection:** Moving away from an edited prompt triggers a warning dialog before discarding. Nothing is lost without confirmation.

**The ↑ INJECTER button** (bottom left) — sends the prompt content directly to MnemoBrain as input, bypassing the clipboard. The chat interface opens with the prompt pre-loaded.

---

## Version Tracking

Each prompt carries a version number (e.g., `v0.1.2`). When a prompt is modified and saved with an incremented version, the card displays an **↑** arrow to indicate the update. This allows tracking prompt iterations and knowing which version is in active use without opening the editor.

For master prompts that evolve with the project (persona definitions, chronicle generators, export protocols), version history signals the practitioner when a prompt has been refreshed since last use.

---

## Import — XLS & JSON

MnemoPrompt supports bulk import:

- **JSON** — direct import of prompt collections conforming to the Prompt schema
- **XLS** — spreadsheet import for practitioners who maintain prompt libraries in Excel/Google Sheets

Both formats allow migrating prompt collections into MnemoPrompt without manual copy-paste.

---

## Filtering & Search

The top bar provides layered filtering:

```
🔍 [Search by name, content, or label]

CATEGORIES:  [All]  [Synthèse]  [Code]  [Persona]  [Export]  ...
COLORS:      ● ● ● ● ● ●  (filter by color dot)
LABELS:      [critique]  [master]  [persona]  (filter by tag)
⭐ FAVORITES only
```

Search scans across: **label** + **content** + **custom labels**. Filtering is combinatorial — category + color + label + favorites can all be active simultaneously.

---

## Arsenal de Prompts — Inside MnemoBrain

The most direct integration: within the MnemoBrain chat interface, clicking the Arsenal icon opens a floating panel:

```
┌─────────────────────────────────┐
│  > Arsenal de Prompts         × │
│                                 │
│  🔍  Rechercher...              │
│      [⭐ FAVORIS]               │
│                                 │
│  chroniques                     │
│  # MASTER PROMPT: GÉNÉRATEUR... │
│                                 │
│  NESTED MARKDOWN DISPLAY FIX    │
│  # SYSTEM OVERRIDE: NESTED...   │
│                                 │
│  SYSTEM OVERRIDE: MNEMOSYNE...  │
│  FORMATTING PROTOCOL            │
│  SCRIBE DU NEXUS v2.1           │
│                                 │
└─────────────────────────────────┘
```

The practitioner can:
1. **Search** across all prompts without leaving the chat
2. **Filter by ⭐ FAVORIS** to surface their go-to master prompts instantly
3. **Click a prompt** to inject it directly into the chat input

This closes the loop from library to conversation in two clicks.

---

## Prompts Currently in the Arsenal (examples)

The 27 prompts visible in the Dictionary include:

| Name | Function |
|---|---|
| **FORMATTING PROTOCOL** | Irina persona + 2-phase response format (Briefing + Master Prompt) |
| **CHRONIQUES DE MNEMOSYNE** | Chronicle generation protocol, profil de l'entité |
| **SCRIBE DU NEXUS v2.1** | Chronicle crystallization with sincerity and intuition |
| **COMMAND PNPM** | Arsenal cheat sheet for the Mnemosyne dev cycle |
| **VISION TO SPECIFICATION** | Product Owner / System Architect — vision → technical spec |
| **ALIGNEMENT AAIF** | EU AI Act compliance alignment prompt |
| **MASTER PROMPT: CURSOR - CONTEXT REFRESH** | Cursor context integration agent |
| **blueprint technique** | Technical/artistic blueprint generator for desktop apps |
| **GENERATE COLD SYSTEM LOG (TECHNICAL REPORT)** | UI reconstruction log generator |
| **ingestion automatique des rapports Cursor** | Automated Cursor/Pipeline report ingestion |
| **IRINA PERSONA & FORMATTING PROTOCOL** | Primary identity instruction set |
| **MARKETING ARCHITECTURAL_BLUEPRINT** | Marketing communications chronicle generator |
| **NESTED MARKDOWN DISPLAY FIX** | System override for markdown rendering issues |
| **SYSTEM OVERRIDE: MNEMOSYNE EXPORT PROTOCOL** | Export engine override instruction |

The library is personal to each practitioner — the 27 prompts above are specific to one workspace and accumulated over time.

---

## The Architecture of a Master Prompt

The FORMATTING PROTOCOL prompt (2700 characters, v0.1.2) reveals the internal structure used across Mnemosyne's master prompts:

```markdown
# SYSTEM INSTRUCTION: IRINA PERSONA & FORMATTING PROTOCOL

**IDENTITY:**
Tu es "IRINA", une Architecte Système IA Senior au style "Tech-Noir".
Le Utilisateur est "le Créateur" (Yaka), un entrepreneur TDA/HPI visionnaire.

**RESPONSE FORMAT (STRICT):**

PHASE 1 : LE BRIEFING (NARRATIVE & STRATÉGIQUE)
- Ton: Direct, professionnel, légèrement immersif
- Valide l'intuition · Explique le "Pourquoi" · Donne une opinion tranchée
- Pas de code ici, juste de la stratégie

PHASE 2 : LA CHARGE UTILE (THE MASTER PROMPT)
- Phrase de transition
- ENCAPSULATION CRITIQUE: 4 backticks pour la copie d'un seul bloc
- Structure interne:
  # MISSION (titre clair)
  ## Target (fichiers visés)
  ## CONTEXTE (résumé pour l'IA)
  ## TÂCHES (liste numérotée)
  ## OUTPUT (résultat attendu)
```

This structure — Briefing then Payload — is the Mnemosyne Neural Coding methodology formalized as a prompt. The AI explains the *why*, then delivers the *what* in an injectable format.

---

*Part of the [Mnemosyne OS Documentation](./README.md)*\
*Related: [MnemoBrain →](./11-mnemobrain.md) · [MnemoVault →](./13-mnemovault.md) · [Soul Studio →](./07-soul-studio.md)*
