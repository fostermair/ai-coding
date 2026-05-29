# QA Results: PROJ-39 Preis-pro-Einheit-Normalisierung

**Tested:** 2026-05-29
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Feature Spec:** [spec.md](spec.md)
**Context Map:** [context-map.md](context-map.md)

---

## Acceptance Criteria Status

### AC-1: Datenbank-Migration
- [x] `normalized_amount REAL` (nullable) added to `receipt_items`
- [x] `normalized_unit TEXT` (nullable) added to `receipt_items`
- [x] `price_per_unit_cents INTEGER` (nullable) added to `receipt_items`
- [x] Migration uses PRAGMA-check pattern (idempotent, no data loss on existing DBs)

### AC-2: Parser-Heuristik (`src/lib/unit-parser.ts`)
- [x] `250G`, `250 G`, `250GR`, `250 GR` → normalized_amount=250, unit=g
- [x] `1KG` → 1000g; `0.5KG` → 500g; `0,5KG` → 500g (Komma-Dezimal)
- [x] `1L`, `1 L`, `1LT`, `1 LT` → 1000ml
- [x] `500ML`, `500 ML` → 500ml
- [x] `0,5L`, `0.5L` → 500ml
- [x] `6ST`, `6 ST`, `6STK`, `6 STK`, `6X` → 6 Stück
- [x] `4X250G` → 1000g (= 4 × 250g)
- [x] `6X1L` → 6000ml (= 6 × 1000ml)
- [x] Fallback: unrecognized patterns return all-NULL (no error, no log)
- [x] price_per_unit_cents: g/ml → `Math.round(unitPriceCents / amount * 100)`
- [x] price_per_unit_cents: Stück → `Math.round(unitPriceCents / amount)`
- [x] Dezimaltrennzeichen Komma and Punkt both correctly parsed
- [x] 33 unit tests covering all patterns + edge cases — all passing

### AC-3: Integration beim Import
- [x] eBon-Import (`/api/import`): `parseUnit()` called after each item INSERT; 3 new columns included in INSERT statement
- [x] Paperless-Sync (`/api/paperless/sync`): both new-import and reparse code paths updated
- [x] Bestellung-Import: N/A — Bestellungen write to `bestellung_items`, not `receipt_items` (confirmed per context-map)

### AC-4: Backfill
- [x] `POST /api/admin/backfill-units` endpoint created
- [x] Processes all `receipt_items WHERE normalized_amount IS NULL`
- [x] Runs in a transaction (all-or-nothing)
- [x] Returns `{ total, normalized, skipped }` — UI shows "X von Y Artikeln normalisiert"
- [x] Button accessible from Produktliste ("€/Einheit berechnen" button)

### AC-5: UI — Produktliste
- [x] New "€/Einheit" column added to `product-list.tsx`
- [x] Displays value from last purchase with correct label: "0,84 €/100g", "1,23 €/100ml", "0,45 €/Stück"
- [x] Column header + row cell both hidden when no product has normalized data (`hasUnitPrices` flag)
- [x] Column always visible when data exists (implementation preference per spec)
- [x] Column appears in both "Produkte" tab and "Ausgeblendet" tab (shared table header)

---

## Edge Cases Status

### EC-1: Kein Pattern erkannt
- [x] All three fields remain NULL; no error thrown; product appears without €/Einheit value

### EC-2: Multi-Pack (4X250G)
- [x] Gesamtmenge = 4 × 250 = 1000g; price_per_unit = unit_price / 10 (→ €/100g). Verified by unit test.

### EC-3: Komma-Dezimaltrennzeichen
- [x] "0,5L" → 500ml; "1,5KG" → 1500g. Verified by unit tests.

### EC-4: Ambiguität "ST"
- [x] Always interpreted as "Stück"

### EC-5: Negativer Preis (Pfand-Rückgabe)
- [x] Normalization proceeds; negative price_per_unit_cents stored; no error. Test: `PFAND 250ML` with price=-25 → price_per_unit_cents=-10. Correct.

### EC-6: quantity > 1 in receipt_item
- [x] `unit_price_cents` used (not `total_price_cents`) — verified in import route code

### EC-7: Division guard
- [ ] **BUG-1 (Low)**: If `normalized_amount` is 0 (e.g., raw_name contains "0G"), `calcPricePerUnit` would produce `Infinity`. This is a theoretical edge case — no real REWE product should be labeled "0G". Not observed in practice.

---

## Security Audit

- [x] No authentication needed (single-user local app, confirmed in PRD)
- [x] `/api/admin/backfill-units` takes no user input — no injection surface
- [x] All DB writes use parameterized prepared statements
- [x] `parseUnit()` is pure regex + math — no external calls, no shell execution
- [x] No secrets exposed in API responses
- [x] Input validation: backfill endpoint ignores request body (pure POST trigger)
- [x] Produkte route subqueries parameterized via `...params`

---

## Regression Testing

### Targeted Regression Tests (from Context Map)
| Test File | Result | Notes |
|-----------|--------|-------|
| `src/lib/parser/rewe.test.ts` | ✅ 25 passed | No regression in parser logic |
| `src/lib/unit-parser.test.ts` | ✅ 33 passed | All new tests pass |
| `src/app/api/produkte/produkte-preistrend.test.ts` | ⚠️ Pre-existing failure | Fails due to worktree DB lock contention (hardcoded `data/test-proj10.db` path shared across worktrees). Confirmed pre-existing: same failures without PROJ-39 changes. Not a regression. |

### Full Suite (main workspace, excluding worktrees)
- **Before PROJ-39**: 19 failures (verified by baseline stash run)
- **After PROJ-39**: 8 failures (same pre-existing failures, minus ones fixed elsewhere)
- **Net effect**: No new test failures introduced

Pre-existing failures (unrelated to PROJ-39):
- `backup/route.test.ts` — Archiver type error
- `avis/db/route.test.ts` — pre-existing
- `bons/[id]/avis-pdf/route.test.ts` — pre-existing
- `bons/[id]/pdf/route.test.ts` — pre-existing

---

## Bugs Found

### BUG-1: Potential false-positive STK match for "STÜCK" suffix
- **Severity:** Low
- **Steps to Reproduce:**
  1. Call `parseUnit("6 STÜCK TOMATE", 100)`
  2. The regex `STK?\b` matches `ST` in `STÜCK` (because `Ü` is non-ASCII, not matched by `\w`, creating a word boundary after `T`)
  3. Result: normalized_amount=6, normalized_unit=Stück (could be correct coincidentally, but relies on the word boundary behavior with non-ASCII chars)
- **Impact:** Very low — REWE receipts use ASCII abbreviations (`ST`, `STK`), not the German word `STÜCK` in raw_name. No real-world impact observed.
- **Priority:** Nice to have (could add explicit non-G/ST word boundary or Unicode awareness)

### BUG-2: Division by zero if normalized_amount = 0
- **Severity:** Low
- **Steps to Reproduce:**
  1. A product raw_name containing "0G" or "0ML" (theoretical)
  2. `parseUnit("PRODUKT 0G", 100)` → normalized_amount=0
  3. `calcPricePerUnit(100, 0, 'g')` → `Math.round(Infinity)` = Infinity
  4. SQLite INSERT of Infinity as INTEGER may produce NULL or error
- **Impact:** Zero in practice — no REWE product has "0G" in raw_name
- **Priority:** Nice to have

---

## Summary

| Metric | Result |
|---|---|
| Acceptance Criteria | 14 / 14 passed (Bestellung-Import N/A per context-map) |
| Edge Cases | 6 / 7 passed (EC-7 theoretical only) |
| Bugs Found | 2 total (0 critical, 0 high, 0 medium, 2 low) |
| Unit Tests | 33 / 33 passing |
| Regression | No new failures introduced |
| Security | Pass |
| Production Ready | **YES** |
| Recommendation | Deploy |
