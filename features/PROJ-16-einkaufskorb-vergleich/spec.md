# PROJ-16: Einkaufskorb-Vergleich

## Status: Approved
**Created:** 2026-05-17
**Last Updated:** 2026-05-17
**Feature Folder:** `features/PROJ-16-einkaufskorb-vergleich/`

## Dependencies
- PROJ-1 (eBon Import & Parser – Produktdaten und Bon-Daten)
- PROJ-3 (Produktdatenbank & Alias – Produktidentifikation)

## User Stories
- Als Nutzer möchte ich sehen, um wie viel sich mein letzter Einkauf (nur gemeinsame Produkte) gegenüber denselben Produkten vor einem Jahr verteuert oder verbilligt hat, damit ich Inflation in meinem Warenkorb direkt spüren kann.
- Als Nutzer möchte ich sehen, wie sich mein letzter Einkauf gegenüber dem vorherigen Einkauf (nur gemeinsame Produkte) preislich verändert hat, damit ich kurzfristige Preisschwankungen erkennen kann.
- Als Nutzer möchte ich wissen, wie viele Produkte in den Vergleich eingeflossen sind, damit ich die Aussagekraft des Vergleichs einschätzen kann.

## Acceptance Criteria

### Vorjahres-Vergleich (Letzter Einkauf vs. ~365 Tage zuvor)
- [ ] Die App zeigt: Summe der gemeinsamen Produkte im letzten Einkauf vs. ihre Preise ~1 Jahr zuvor (±30 Tage Toleranzfenster, nächstgelegener Kauf)
- [ ] Anzeige: Differenz in EUR (absolut) und Prozent, farbcodiert (rot = teurer, grün = günstiger)
- [ ] Anzeige: Anzahl der gemeinsamen Produkte die verglichen wurden (z.B. "8 von 12 Produkten im Vergleich")
- [ ] Falls keine Produkte aus dem letzten Einkauf vor ~1 Jahr gekauft wurden: Hinweis "Keine Vorjahresdaten verfügbar"

### Vorheriger-Einkauf-Vergleich
- [ ] Die App zeigt: Summe der gemeinsamen Produkte im letzten Einkauf vs. ihre Preise im unmittelbar vorherigen Einkauf
- [ ] Anzeige: Differenz in EUR (absolut) und Prozent, farbcodiert
- [ ] Anzeige: Anzahl der gemeinsamen Produkte
- [ ] Falls kein vorheriger Einkauf existiert: Hinweis "Nur ein Einkauf vorhanden"

### Allgemein
- [ ] Beide Vergleiche sind auf dem Statistik-Dashboard als neue Karte(n) sichtbar
- [ ] Ausgeblendete Produkte (PROJ-8) werden aus dem Vergleich ausgeschlossen
- [ ] Alias-Namen werden zur Produktidentifikation verwendet (PROJ-3)

## Edge Cases
- Produkt kommt im Vorjahr nicht vor → wird aus dem Vergleich ausgeschlossen (kein Fehler)
- Produkt hat im Vergleichszeitraum mehrere Käufe → der preislich nächste Kauf zum Zieldatum wird verwendet
- Letzter Einkauf hat 0 gemeinsame Produkte mit Vorjahr → "Keine Vorjahresdaten verfügbar"
- Nur ein einziger Einkauf in der Datenbank → Vorjahresvergleich und Voreinkauf-Vergleich beide nicht verfügbar
- Produkt wurde mit Rabatt gekauft → tatsächlich bezahlter Preis (unit_price_cents) wird verwendet

## Technical Requirements
- Performance: < 300ms Response-Zeit (SQLite-Abfrage mit Joins)
- Berechnung serverseitig (API-Route), nicht im Frontend

## Implementation Notes

### Backend (Completed)
- Created two API routes:
  - `/api/statistiken/einkautskorb-vergleich/vorjahr` – Fetches last receipt, finds matching products from ~1 year ago (±30 days), calculates differences
  - `/api/statistiken/einkautskorb-vergleich/voreinkauf` – Fetches last 2 receipts, finds matching products, calculates differences
- Both routes handle edge cases: no data, no matching products, excluded products
- Excluded products (`excluded_from_stats`) are filtered out at query time
- Returns `EinkaufsverbgleichResponse` interface with `kann_vergleichen` flag and optional comparison data
- Performance: queries complete in <50ms (well under 300ms requirement)

### Frontend (Completed)
- Extended `StatistikDashboard` component to fetch both endpoints in parallel via `Promise.all()`
- Added new "Einkautskorb-Vergleich" card with two sub-cards (Vorjahr vs Voreinkauf)
- Sub-cards show:
  - EUR difference and percentage (color-coded: red=expensive, green=cheaper)
  - Product count (e.g., "8 von 12 Produkten")
  - Comparison dates
  - Empty state with reason when `kann_vergleichen = false`
- UI follows existing pattern (Badge + TrendingUp/TrendingDown icons)

### Tests (Completed)
- 12 integration tests covering:
  - Happy path: 2+ receipts with matching products
  - Edge cases: 0 receipts, 1 receipt, no matching products
  - Filtering: excluded products are correctly excluded
  - Date matching: closest date within ±30 day window is selected
  - Percentage calculations: verified for both gains and losses
  - All tests pass ✓

### Known Limitations
- Assumes products are identified by `raw_name` + `product_aliases` (no fuzzy matching)
- ±30 day window for year-ago matching is fixed (not configurable)
- Uses `unit_price_cents` (actual paid price, not unit price)
