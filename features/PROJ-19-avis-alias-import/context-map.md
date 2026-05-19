# Context Map: PROJ-19 AVIS-Import & automatische Alias-Zuweisung

**Status:** Architected | **Created:** 2026-05-19

## Relevanzte Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/lib/parser/avis.ts` | Neu erstellen | AVIS PDF-Parser (ähnlich zu rewe.ts) |
| `src/app/api/avis/import/route.ts` | Neu erstellen | Manual AVIS-Upload: parse → match → auto-set → return pending |
| `src/app/api/paperless/avis-sync/route.ts` | Neu erstellen | Paperless AVIS-Sync (env-var gated) |
| `src/components/avis-confirmation-dialog.tsx` | Neu erstellen | Low-confidence match review UI |
| `src/components/import-zone.tsx` | Erweitern | Add AVIS upload section + Paperless AVIS sync button + show AvisConfirmationDialog |
| `src/lib/parser/rewe.ts` | Nur lesen | Parser structure pattern to follow |
| `src/app/api/import/route.ts` | Nur lesen | Import route pattern + `logImport` helper (to replicate) |
| `src/app/api/paperless/sync/route.ts` | Nur lesen | Paperless sync pattern (to replicate for avis-sync) |
| `src/app/api/produkte/[name]/alias/route.ts` | Nur lesen | Existing alias upsert logic + protection of existing aliases |
| `src/lib/db.ts` | Nur lesen | DB schema + table structure |

## Kritische Typen & Interfaces

### Aus `src/lib/parser/rewe.ts` (Muster für `avis.ts`):

```typescript
// Muster: Parser gibt strukturierte Daten zurück
interface ParsedDiscount {
  position: number;
  type: "euro" | "percent";
  amount: number;
}

interface ParsedItem {
  raw_name: string;
  item_type: "standard" | "pfand" | "leergut" | "concession" | "discount";
  quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
  tax_code: number;
  bonus_excluded: boolean;
  concessionaire_code?: string;
  position: number;
}

interface ParsedReceipt {
  receipt_nr: string;
  market_nr: string;
  market_name: string;
  market_address: string;
  market_uid: string;
  items: ParsedItem[];
  discounts: ParsedDiscount[];
  total_cents: number;
  payment_method: string;
  date: string; // YYYY-MM-DD
  time: string;
}
```

### Für `avis.ts` (neue Typen nach Spec):

```typescript
interface ParsedAvisItem {
  name: string; // Artikelbezeichnung
  qty: number; // Bestellmenge (oder gg für Gramm)
  unitPrice: number; // Einzelpreis in cents
  totalPrice: number; // Betrag
  deliveryQty: number; // Liefermenge
  section: "Lieferbar" | "Nicht lieferbar" | "Ersatzartikel";
  status: "available" | "unavailable" | "substitute";
}

interface ParsedAvis {
  pickupDate: string; // YYYY-MM-DD
  orderNumber: string; // Bestellnummer
  marketName?: string;
  items: ParsedAvisItem[];
}
```

### API Response Types (für beide new routes):

```typescript
interface MatchResult {
  avisName: string;
  avisQty: number;
  avisPrice: number;
  ebonRawName: string;
  ebonQty: number;
  ebonPrice: number;
  ebonDate: string;
  confidence: number; // 0-100
}

interface AvisImportResponse {
  auto_set: number; // Aliases automatically set
  pending_approval: number; // Need user confirmation
  unmatched: number; // Could not match
  errors: number; // Parse/DB errors
  pending_matches: MatchResult[]; // Low-confidence matches for user review
  unmatched_items: Array<{ name: string; price: number; date: string }>;
  import_log_id: string;
}
```

### DB Schema (existing, no changes):

```typescript
// product_aliases table
interface ProductAlias {
  raw_name: string; // PRIMARY KEY
  alias: string; // Human-readable name (can be empty)
  updated_at: string;
  excluded_from_stats?: boolean;
  seasonal?: boolean;
}

// import_log table
interface ImportLog {
  id?: number;
  filename: string; // e.g. "[AVIS] Bestellnummer-123" or "[REWE] Bon.pdf"
  status: "success" | "error" | "duplicate";
  message?: string;
  imported_at: string;
}
```

## Nicht-lesen-Liste

- `src/components/bon-detail.tsx` — uses aliases but doesn't need changes for PROJ-19
- `src/components/bon-list.tsx` — unaffected
- `src/components/product-list.tsx` — unaffected (aliases already displayed)
- `src/app/api/produkte/route.ts` — unaffected (returns aliases via query)
- `src/app/api/statistiken/**` — unaffected
- `src/app/api/export/**` — unaffected (exports already include aliases)
- All shadcn/ui components — use existing ones, no changes needed

## Tests

### Bestehende Tests (read + prüfen auf Regression)

| Test-Datei | Test-Ziel | Aktion | Warum relevant |
|---|---|---|---|
| `src/lib/parser/rewe.test.ts` | eBon parser | Nur lesen | Shows parser test pattern; reuse for avis.test.ts |
| `src/app/api/import/route.ts` tests (inline) | Import route | Nur lesen | Shows import route pattern; reuse for avis/import route |
| `src/app/api/paperless/sync/sync.test.ts` | Paperless sync | Nur lesen | Shows Paperless sync pattern; reuse for avis-sync route |
| All existing `/api/**/*.test.ts` | Regression | Prüfen nach Änderungen | No changes to existing functionality, but run before final QA |

### Neue Tests (erstellen)

| Test-Datei | Typ | Coverage |
|---|---|---|
| `src/lib/parser/avis.test.ts` | Unit | parseAvis() with 4 sample PDFs (provided by user or mocked text samples from spec) |
| `src/app/api/avis/import/import.test.ts` | Integration | POST /api/avis/import: happy path + duplicate handling + low-confidence matches |
| `src/app/api/paperless/avis-sync/sync.test.ts` | Integration | POST /api/paperless/avis-sync: env-var gating + Paperless API call + error handling |
| `tests/e2e/avis-import.spec.ts` (Playwright) | E2E | Full flow: upload PDF → see import summary → confirm low-confidence matches → verify aliases set |

## Matching Confidence Formula

```
confidence = 0
if (avis_date >= ebon_date - 1d AND avis_date <= ebon_date + 1d):
  confidence += 40
if (avis_price >= ebon_price - 2 AND avis_price <= ebon_price + 2):
  confidence += 40
if (is_weight_item):
  // For weight items, only use price + fuzzy name match
  confidence += 20 (partial price match)
else:
  if (avis_qty == ebon_qty):
    confidence += 20
  else if (avis_qty within ±10% of ebon_qty):
    confidence += 10

// Fuzzy name matching as tiebreaker (0-20 additional points)
// Only use if confidence is still below decision threshold
fuzzy_score = levenshtein_similarity(avis_name, ebon_name)
if (fuzzy_score > 0.7):
  confidence += 20
else if (fuzzy_score > 0.5):
  confidence += 10

// Decision
if (confidence >= 80):
  auto_set = true
else:
  add to pending_matches for user confirmation
```

## Implementation Notes

- **AVIS Format Parsing:** Use regex similar to `rewe.ts` for section headers and table row extraction
- **Duplicate Detection:** Check `import_log` table where `filename = '[AVIS] {orderNumber}'` and `status = 'success'`
- **Alias Protection:** Before `INSERT OR UPDATE` on `product_aliases`, check if row exists with non-empty `alias` field — if so, skip this item
- **PDF Polyfill:** Copy the pdfjs polyfill block from `src/app/api/import/route.ts` (DOMMatrix, ImageData, Path2D)
- **Error Handling:** Wrap PDF parsing and matching in try-catch; accumulate errors and return in response
- **Paperless Integration:** Reuse `PAPERLESS_URL` and `PAPERLESS_TOKEN` from env; add new optional env var `PAPERLESS_AVIS_TAG` or `PAPERLESS_AVIS_CORRESPONDENT_ID` to filter documents

## Verification Checklist

- [ ] Dev server starts: `npm run dev`
- [ ] Upload sample AVIS PDF via import-zone → import summary displays
- [ ] Auto-set aliases appear in `/produkte` product list
- [ ] Manually set aliases are NOT overwritten
- [ ] Upload same AVIS twice → duplicate message shown
- [ ] Low-confidence match → confirmation dialog appears → confirm → alias set
- [ ] Reject a low-confidence match → item stays without alias
- [ ] Unmatched items shown in summary
- [ ] `npm test` — all unit tests pass (existing + new)
- [ ] `npm run test:e2e` — E2E test for AVIS import flow passes
- [ ] Paperless env vars missing → AVIS sync button hidden or returns error
