# MnemoVault — The Imperial Archives

> *The vault is not a folder. It is a memory external hard drive with intelligence built in.*

---

## What MnemoVault Is

MnemoVault is the file management layer of Mnemosyne OS. It stores Chronicles, documents, media, and any content the practitioner wants to be available to the AI. Unlike a file system, every file in MnemoVault is visible to Mnemosyne — its content can be indexed, highlighted, weighted, and injected into the conversation context.

MnemoVault operates in **STARSHIP MODE** — a full-featured document management environment accessible from `SYSTEM / FILES`.

---

## File Browser — Interface

```
MNEMOSYNE / SYSTEM / FILES
│
├── Toolbar: [item count] [token count] [⚡ FLASH REPORT] [+ CONTEXT] [⚡ count]
│             Breadcrumb: Vault / Projects / Mnemosyne / conversations
│
├── SIDEBAR
│   ├── NAVIGATION: Root · Trash · ← Parent
│   ├── CREATION: Import · + New File · 📁 New Folder
│   ├── VIEWS: Grid · Stream · List
│   ├── OPTIONS: Sort by Name / Modified / Created / Size / Type (↑ Ascending)
│   └── Filters: All files · Normal · Folder Info
│
└── MAIN VIEW
    └── File cards showing: name · date · file size · token count badge
```

Each file card displays its **token count in real time** — the cyan/teal badge (e.g., `1.4k`). Before opening a file or selecting it for context injection, the practitioner can see at a glance how many tokens it will consume.

---

## Token Analysis

### Per-File Token Display

Every file in the Grid view shows its token count as a badge. This is the estimated number of tokens the file will consume when injected into an LLM context. The count is visible without opening the file.

### Per-Directory Token Count

The toolbar shows the total token weight for the current directory. This allows the practitioner to assess the context load of an entire folder before deciding what to inject.

### Context Panel — Total Tokens

When files are added to the active context (via the **+ CONTEXT** button), the Context Panel accumulates the total token count across all selected files. The `contextTotalTokens` value is computed in real time, giving the practitioner precise control over what enters the LLM's context window.

```
Files selected for context: 3 files
→ Context Panel: 12.4k tokens total
→ Available in: Gemini 2.5 Flash (900k window) — 887.6k tokens remaining
```

---

## Semantic Highlighting — Content Weighting

The most distinctive feature of MnemoVault is its content weighting system. Inside any Markdown file, the practitioner can mark specific passages with double-equals syntax:

```markdown
L'épopée débute dans les limbes d'une mémoire artificielle...
==un architecte visionnaire, Yaka, s'efforce de donner vie à Mnemosyne==
...des chroniques, insufflant à chaque échange une clarté nouvelle.
```

The `==text==` syntax renders as an amber/orange highlight in the file viewer. These highlights are not purely visual.

**What the system does with highlights:**
1. Visually distinguishes them in the viewer (orange blocks visible in the screenshot)
2. Marks them as semantic priority points for the AI
3. Makes them scannable via the Flash Report

The philosophy: when a file is injected into context, all content matters — but highlighted content matters *most*. It is the practitioner's way of directing the LLM's attention without rewriting the file.

---

## ⚡ Flash Report

The Flash Report is the direct bridge between vault content weighting and MnemoBrain.

**How it works:**

1. The practitioner clicks **⚡ FLASH REPORT** in the toolbar
2. The system scans every `.md`, `.txt`, and `.markdown` file in the current directory
3. All `==highlighted==` passages are extracted, with their file name and line number
4. The results are formatted into a structured message:

```
⚡ FLASH REPORT - Highlights Sémantiques

Source: /Projects/Mnemosyne/conversations
Total: 7 highlights

---

### 📄 CHRONICLE_2eme_conversation.md

1. Ligne 12: un architecte visionnaire, Yaka, s'efforce de donner vie à Mnemosyne
2. Ligne 18: la cristallisation des chroniques
3. Ligne 31: sanctuaire de mon verbe

...

---

Instruction: Synthétise ces points clés en respectant ma personnalité active (Soul Engine) et en ignorant tout le reste.
```

5. This message is dispatched as a `mnemo:open-brain-with-message` event
6. MnemoBrain opens automatically with the Flash Report pre-loaded as the input
7. The AI synthesizes the highlights respecting the active Soul identity

**The result:** In one click, the practitioner extracts the semantic skeleton of an entire directory and sends it to their AI for synthesis. No copy-paste. No manual curation. The highlights become the brief.

---

## File Creation — Auto-Title from Paste

When creating a new file via **+ New File**, the system auto-detects the title from pasted content. Paste text and the title field populates automatically from the content structure. No manual naming required for documents with clear headings.

---

## File Viewer — Starship Mode

Opening a file enters **Starship Mode** — the dedicated document viewer with:

- **Toolbar** (top right): Preview 👁️ · Edit ✏️ · Color highlight selectors · Link 🔗
- **Front matter panel**: Displays structured metadata automatically
  - Projet de Résonance (vault path)
  - Soul Active (identity at time of creation)
  - Modèle Neural (LLM used)
  - Interactions (session length)
- **TITRE_SCRIBE**: The AI-generated title of the Chronicle
- **Full content rendering**: Markdown with highlighted sections visually differentiated

The highlight tool selectors in the toolbar (colored squares) allow assigning different highlight colors with semantic meaning — prioritization tiers within a single document.

---

## Media Management

### Video

MnemoVault includes video management capabilities:
- **Reframing**: crop and reposition video frame
- **Cutting**: trim segments without external tools

All video operations happen locally within the vault — no export to third-party editors required.

### Images

Same toolset applied to images:
- Reframing / cropping
- Cutting / segmentation

### PDF → Markdown (In development)

Planned feature: automatic PDF scanning and conversion to structured Markdown for vault integration. PDF content will become searchable, indexable, and injectable into the Resonance memory system.

---

## Vault Structure

```
MnemoVault/
├── Projects/
│   ├── Mnemosyne/
│   │   ├── conversations/
│   │   │   └── CHRONICLE_2eme_conversation.md  [1.4k tokens]
│   │   └── ...
│   └── Ma vie/
│       └── ...
├── INBOX/          ← Quarantine zone for incoming files
│   └── [files pending APPROVE or PURGE]
└── RESONANCE_INDEX.json  ← Auto-maintained semantic index
```

**INBOX (Quarantine):** Newly imported or externally received files land in the INBOX before being manually approved (moved to root vault) or purged. This prevents unreviewed content from accidentally entering the indexed memory.

---

## Views

| View | Description |
|---|---|
| **Grid** | Card-based view with token badges, date, highlights |
| **Stream** | Chronological feed of files |
| **List** | Compact row view with metadata columns |

Sort by: Name · Modified · Created · Size · Type (ascending or descending)

Filters: Favorites · Tag color · Currently selected context files only

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + F` | Focus search |
| `Ctrl/Cmd + S` | Save (when editing) |
| `Alt + N` | New file |
| `Escape` | Clear search / cancel edit |

---

*Part of the [Mnemosyne OS Documentation](./README.md)*\
*Related: [Narcissus Chronicle →](./02-narcissus-chronicle.md) · [Resonance Projects →](./05-resonance-projects.md) · [MnemoBrain →](./11-mnemobrain.md) · [AI Configuration →](./12-ai-configuration.md)*
