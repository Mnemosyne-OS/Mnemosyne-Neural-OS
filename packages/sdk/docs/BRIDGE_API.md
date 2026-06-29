# Bridge API — Mnemosyne OS SDK v2.0

> **Scope required:** `bridge:read`  
> **IPC channels:** `mnemosync:compute-resonance`, `mnemosync:get-bridge-history`, `mnemosync:get-bridge-sessions`

---

## Overview

The Bridge API gives your Layer 2 app read access to the **cognitive bridge graph** —
a persistent record of semantic connections between memory vaults (DEV, SOCIAL, PERSONAL, etc.).

A **bridge** is a pair of memories that the system found semantically adjacent
(cosine similarity ≥ 0.72) during a Semantic Reflect scan.

```
DEV vault                         SOCIAL vault
─────────────────────────────     ──────────────────────────────
"Phase 55 dimensional bridge"  ↔  "reddit post about local RAG"
cosine: 0.986 (CRITICAL match)
```

Phase 59 upgrades `computeResonance` from keyword heuristic to **true vector embedding**:
embed the input text → cosine vs. stored bridge spine vectors → real similarity scores.

---

## Method: `computeResonance(text, topK?)`

**[Phase 59 — Vector upgrade]** Computes a resonance score for any text against the bridge graph.

```typescript
const result = await window.mnemosyne.computeResonance(text, topK);
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `text` | `string` | — | Text to measure (draft post, commit message, note, code snippet) |
| `topK` | `number` | `5` | Max number of bridge matches to return |

### Returns

```typescript
{
  success:    boolean;
  score:      number;      // average cosine of top matches (0.0 – 0.99)
  level:      'HIGH_RESONANCE' | 'MEDIUM' | 'LOW';
  topMatches: Array<{
    bridgeId:  number;
    fromLabel: string;     // memory label from the source vault
    toLabel:   string;     // memory label from the target vault
    cosine:    number;     // true cosine similarity (Phase 59: real embedding)
    vault:     string;     // source vault (DEV | SOCIAL | PERSONAL | ...)
  }>;
}
```

### Level thresholds

| Level | Score range | Meaning |
|-------|------------|---------|
| `HIGH_RESONANCE` | ≥ 0.80 | Strong semantic alignment with your cognitive graph |
| `MEDIUM` | 0.60 – 0.79 | Moderate alignment — related themes present |
| `LOW` | < 0.60 | Weak alignment — not strongly related |

### Example

```typescript
// Before publishing a post — check resonance with your dev work
const result = await window.mnemosyne.computeResonance(
  "I built a system that finds semantic bridges between my Reddit activity and codebase",
  5,
);

if (result.level === 'HIGH_RESONANCE') {
  console.log(`Score: ${(result.score * 100).toFixed(0)}% — aligned with your bridge graph!`);
  console.log(`Top match: ${result.topMatches[0].fromLabel} ↔ ${result.topMatches[0].toLabel}`);
}
```

### Phase 58 vs. Phase 59

| | Phase 58 | Phase 59 |
|---|---|---|
| Algorithm | Keyword matching + stored cosine blend | True embedding cosine similarity |
| Score type | Heuristic approximation | Real vector distance |
| Model | None (no embedding call) | IRINA 768D (Vertex AI) or Nomic 512D (local) |
| Resilience | Always available | Falls back to Phase 58 heuristic if model offline |

---

## Method: `getBridgeHistory(opts?)`

Returns the history of persisted semantic bridges, with optional filters.

```typescript
const { success, bridges } = await window.mnemosyne.getBridgeHistory({
  limit:       50,
  minCosine:   0.80,
  vaultFilter: 'SOCIAL',
  onlyNew:     true,
  since:       '2026-04-01T00:00:00Z',
});
```

### Options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | `number` | `500` | Max results to return |
| `minCosine` | `number` | `0.0` | Minimum cosine similarity filter |
| `vaultFilter` | `string` | `'ALL'` | Filter by vault (`'DEV'`, `'SOCIAL'`, `'ALL'`, etc.) |
| `onlyNew` | `boolean` | `false` | Return only bridges discovered for the first time |
| `since` | `string` (ISO) | — | Filter bridges scanned after this date |

### Returns

```typescript
{
  success: boolean;
  bridges: Array<{
    id:           number;
    scanned_at:   string;   // ISO timestamp
    from_id:      number;   // Chronicle ID in source vault
    from_vault:   string;
    from_spine:   string;   // SpineType of source chronicle
    from_label:   string;   // First 120 chars of source memory
    to_id:        number;
    to_vault:     string;
    to_spine:     string;
    to_label:     string;
    cosine:       number;   // Stored cosine from the scan (REFLECT scan value)
    session_id:   string;   // UUID of the scan session
    llm_synthesis:string | null;  // AI-generated synthesis (if available)
    is_new:       number;   // 1 = first time this pair was detected
    tags:         string;   // JSON array of tags
  }>;
}
```

---

## Method: `getBridgeSessions()`

Returns the list of scan sessions (each scan = one run of Semantic Reflect).

```typescript
const { success, sessions, totalBridges } = await window.mnemosyne.getBridgeSessions();
```

### Returns

```typescript
{
  success:      boolean;
  totalBridges: number;   // Total bridges ever persisted
  sessions: Array<{
    id:           string;   // UUID
    scanned_at:   string;
    threshold:    number;   // Cosine threshold used during the scan
    total_found:  number;
    new_count:    number;
    llm_synthesis:string | null;
    duration_ms:  number | null;
  }>;
}
```

---

## Scope declaration

Add `bridge:read` to your `mnemoapp.json` to unlock the Bridge API:

```json
{
  "scopes": ["bridge:read"]
}
```

> **`bridge:read`** grants READ access to `getBridgeHistory`, `getBridgeSessions`, `computeResonance`.  
> It never grants the ability to write or modify bridges.  
> `saveBridges` is CORE-ONLY and inaccessible to Layer 2 apps.
