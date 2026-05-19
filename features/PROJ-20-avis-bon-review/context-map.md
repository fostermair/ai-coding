# Context Map: PROJ-20 AVIS-Status & Alias-Review in Bon-Ansicht

**Status:** Architected | **Created:** 2026-05-19

## Relevante Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/lib/db.ts` | Erweitern | Migration: neue Tabelle `avis_matches` + Index |
| `src/app/api/bons/route.ts` | Erweitern | Berechnet AVIS-Status per Bon im Response |
| `src/app/api/bons/[id]/route.ts` | Erweitern | Erweitert Items um `avis_match`-Daten |
| `src/app/api/avis/matches/[matchId]/confirm/route.ts` | Neu erstellen | Bestätigung: setzt `status='confirmed'`, speichert Alias |
| `src/app/api/avis/matches/[matchId]/reject/route.ts` | Neu erstellen | Ablehnung: setzt `status='rejected'` |
| `src/app/api/avis/import/route.ts` | Erweitern | Schreibt Matches in neue `avis_matches`-Tabelle |
| `src/components/bon-list.tsx` | Erweitern | Neue AVIS-Badge-Spalte + AvisStatusBadge-Komponente |
| `src/components/bon-detail.tsx` | Erweitern | Neue Match-Status-Spalte + Inline-Bestätigungs-UI pro Zeile |
| `src/app/api/produkte/[name]/alias/route.ts` | Nur lesen | Alias-Speicherungs-Pattern (wird von confirm-route aufgerufen) |

## Kritische Typen & Interfaces

### `avis_matches` Tabellenstruktur:

```typescript
interface AvisMatch {
  id: number; // INTEGER PRIMARY KEY
  receipt_id: number; // FK to receipts(id)
  receipt_item_id: number | null; // FK to receipt_items(id), NULL if no match found
  import_log_id: number; // FK to import_log(id) where filename starts with "[AVIS]"
  avis_item_name: string; // Full product name from AVIS
  avis_unit_price_cents: number; // Unit price from AVIS
  confidence: number; // 0–100 confidence score
  status: "pending" | "confirmed" | "rejected" | "auto_set"; // Current state
  created_at: string; // ISO datetime
  updated_at: string; // ISO datetime
}
```

### Bon-Status-Ableitung (berechnetes Feld in API Response):

```typescript
type AvisStatus = "complete" | "pending" | "none" | "no_matches";
// Logik (SQL-Subquery in GET /api/bons):
// - "complete": mindestens ein Match existiert, ALLE sind confirmed oder auto_set, KEINE pending
// - "pending": mindestens ein Match mit status='pending'
// - "no_matches": Matches existieren, aber ALLE sind rejected oder receipt_item_id IS NULL
// - null/keine Spalte: keine avis_matches für diese receipt_id
```

### GET /api/bons Response (erweitert):

```typescript
interface BonListItem {
  id: number;
  receipt_date: string;
  receipt_time: string;
  store_name: string;
  receipt_nr: string;
  market_nr: string;
  total_amount_cents: number;
  payment_method: string;
  item_count: number;
  avis_status?: "complete" | "pending" | "no_matches"; // NEW
}
```

### GET /api/bons/[id] Response (erweitert):

```typescript
interface ReceiptItem {
  id: number;
  receipt_id: number;
  raw_name: string;
  item_type: string;
  quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
  tax_code?: string;
  bonus_excluded: number;
  concessionaire_code?: string;
  position: number;
  alias?: string; // existing
  discounts: Array<DiscountInfo>; // existing
  
  // NEW: AVIS match info
  avis_match?: {
    matchId: number;
    avisItemName: string;
    avisUnitPriceCents: number;
    confidence: number; // 0–100
    status: "pending" | "confirmed" | "rejected" | "auto_set";
  };
}
```

### PUT /api/avis/matches/[matchId]/confirm Request & Response:

```typescript
// Request body
interface ConfirmMatchRequest {
  confirmed_alias: string; // The alias name to save (from avis_item_name)
}

// Response
interface ConfirmMatchResponse {
  success: boolean;
  matchId: number;
  status: "confirmed";
  alias: string;
  message: string;
}
```

### PUT /api/avis/matches/[matchId]/reject Request & Response:

```typescript
// Request body (empty or optional reason)
interface RejectMatchRequest {
  reason?: string;
}

// Response
interface RejectMatchResponse {
  success: boolean;
  matchId: number;
  status: "rejected";
  message: string;
}
```

## Nicht-lesen-Liste

- `src/components/product-list.tsx` — unaffected, no changes for PROJ-20
- `src/app/api/produkte/route.ts` — returns product list with aliases, unaffected
- `src/app/api/statistiken/**` — all statistics routes, unaffected
- `src/app/api/export/**` — export routes, unaffected
- `src/components/import-zone.tsx` — import upload section, unaffected (PROJ-19 responsibility)
- `src/components/avis-confirmation-dialog.tsx` — PROJ-19 confirmation dialog for low-confidence matches at import time, NOT the inline UI in bon-detail

## Tests

### Bestehende Tests (read + prüfen auf Regression)

| Test-Datei | Test-Ziel | Aktion | Warum relevant |
|---|---|---|---|
| `src/app/api/paperless/sync/sync.test.ts` | Paperless sync pattern | Nur lesen | Shows async API route test pattern |
| All `src/app/api/**/*.test.ts` | Existing APIs | Regression-Check | Run full test suite after changes — no existing tests should break |

### Neue Tests (erstellen)

| Test-Datei | Typ | Coverage |
|---|---|---|
| `src/app/api/avis/matches/confirm.test.ts` | Integration | PUT /api/avis/matches/[matchId]/confirm: happy path + error cases (matchId not found, already confirmed, etc) |
| `src/app/api/avis/matches/reject.test.ts` | Integration | PUT /api/avis/matches/[matchId]/reject: happy path + error cases |
| `src/app/api/bons/bons-avis-status.test.ts` | Unit | GET /api/bons: avis_status calculation (complete / pending / no_matches / null) for different match scenarios |
| `tests/e2e/bon-avis-review.spec.ts` (Playwright) | E2E | Full flow: import AVIS with pending matches → bon-list shows badge → click bon → see pending matches → confirm one → see status update → reject another → verify no alias saved |

## Database Migration

New table to add to `src/lib/db.ts`:

```
CREATE TABLE IF NOT EXISTS avis_matches (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id          INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  receipt_item_id     INTEGER REFERENCES receipt_items(id) ON DELETE SET NULL,
  import_log_id       INTEGER NOT NULL REFERENCES import_log(id),
  avis_item_name      TEXT NOT NULL,
  avis_unit_price_cents INTEGER NOT NULL,
  confidence          INTEGER NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
  status              TEXT NOT NULL DEFAULT 'pending',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_avis_matches_dedup
  ON avis_matches(receipt_id, avis_item_name, import_log_id);
CREATE INDEX IF NOT EXISTS idx_avis_matches_receipt_id
  ON avis_matches(receipt_id);
CREATE INDEX IF NOT EXISTS idx_avis_matches_status
  ON avis_matches(status);
```

## Key Implementation Details

### Bon-Status Calculation (in GET /api/bons)

```
SELECT
  r.id,
  ...(existing fields)...,
  CASE
    WHEN (SELECT COUNT(*) FROM avis_matches am WHERE am.receipt_id = r.id) = 0
      THEN NULL
    WHEN (SELECT COUNT(*) FROM avis_matches am WHERE am.receipt_id = r.id AND am.status = 'pending') > 0
      THEN 'pending'
    WHEN (SELECT COUNT(*) FROM avis_matches am WHERE am.receipt_id = r.id AND am.status IN ('confirmed', 'auto_set')) > 0
      AND (SELECT COUNT(*) FROM avis_matches am WHERE am.receipt_id = r.id AND am.status NOT IN ('confirmed', 'auto_set', 'rejected')) = 0
      THEN 'complete'
    ELSE 'no_matches'
  END AS avis_status
FROM receipts r
```

### Item-Level Match Info (in GET /api/bons/[id])

```
SELECT
  ri.*,
  pa.alias,
  (SELECT json_object(
    'matchId', am.id,
    'avisItemName', am.avis_item_name,
    'avisUnitPriceCents', am.avis_unit_price_cents,
    'confidence', am.confidence,
    'status', am.status
  ) FROM avis_matches am
   WHERE am.receipt_item_id = ri.id
   LIMIT 1) AS avis_match
FROM receipt_items ri
LEFT JOIN product_aliases pa ON pa.raw_name = ri.raw_name
WHERE ri.receipt_id = ?
```

### Bestätigung Flow (in PUT /api/avis/matches/[matchId]/confirm)

1. Validate matchId exists and status = 'pending'
2. Find receipt_item_id from avis_matches
3. Call existing PUT /api/produkte/[raw_name]/alias to save the alias
4. Update avis_matches set status = 'confirmed', updated_at = now()
5. Return success + the confirmed status

### Ablehnung Flow (in PUT /api/avis/matches/[matchId]/reject)

1. Validate matchId exists
2. Update avis_matches set status = 'rejected', updated_at = now()
3. Do NOT touch product_aliases
4. Return success

## Frontend Components

### `AvisStatusBadge` (new, simple component)

Used in `bon-list.tsx` to display the AVIS status:
- Props: `status: "complete" | "pending" | "no_matches" | null`
- Renders: Badge with icon + text (✓ / ⚠ / ⊗ / nothing)

### `bon-list.tsx` changes

- Add column header "AVIS" after existing columns
- For each bon row, render `<AvisStatusBadge status={bon.avis_status} />`
- Badge should be clickable → navigate to `/bons/{id}`

### `bon-detail.tsx` changes

- For each item with `avis_match`, show new column or inline indicator
- If `avis_match.status === 'pending'`:
  - Show AVIS name + confidence badge (e.g. "75%")
  - Show eBon name in separate column
  - Show [✓ Confirm] and [✗ Reject] buttons
  - On click, call confirm/reject endpoint
  - On success, update local state to show new status + refresh bon-list badge
- If `avis_match.status === 'confirmed'` or `'auto_set'`:
  - Show green indicator + "auto-gesetzt" label
- If `avis_match.status === 'rejected'`:
  - Show gray indicator + "kein Match" label
- If no `avis_match`:
  - Show nothing (normal alias column behavior)

## Verification Checklist

- [ ] Dev server starts: `npm run dev`
- [ ] Bon-list shows correct AVIS badge (complete / pending / none) after import
- [ ] Badge is clickable → navigates to bon-detail
- [ ] Bon-detail shows pending matches with AVIS name + confidence + buttons
- [ ] Click [✓ Confirm] → alias saved, status updates to "auto-gesetzt", badge updates
- [ ] Click [✗ Reject] → no alias saved, status updates to "kein Match", badge updates
- [ ] Re-importing same AVIS with same rejected match → shows as pending again (idempotent)
- [ ] Manually set aliases NOT shown in review UI
- [ ] `npm test` — all tests pass (existing + new)
- [ ] `npm run test:e2e` — E2E test for full bon-detail workflow passes
- [ ] No regression in other bon-list or bon-detail functionality
