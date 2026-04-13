# PROJ-4: Preisentwicklungs-Chart

## Status: Approved
**Created:** 2026-04-07
**Last Updated:** 2026-04-10

## Dependencies
- Requires: PROJ-1 (eBon Import & Parser) – Preisdaten müssen vorhanden sein
- Requires: PROJ-3 (Produktdatenbank & Alias-Verwaltung) – Alias-Namen für lesbare Chart-Titel

## User Stories
- Als Nutzer möchte ich die Preisentwicklung eines Produkts über Zeit als Linien-Chart sehen, damit ich Preissteigerungen erkenne
- Als Nutzer möchte ich das Produkt über eine Suchfunktion auswählen können, damit ich schnell das richtige Produkt finde
- Als Nutzer möchte ich sehen, an welchem Datum welcher Preis gezahlt wurde (Tooltip), damit ich genaue Daten nachschauen kann
- Als Nutzer möchte ich erkennen können, ob Rabatte den Preis beeinflusst haben, damit ich Netto- vs. Brutto-Preis vergleiche

## Acceptance Criteria
- [ ] Produktauswahl via Suchfeld mit Autocomplete (Rohname + Alias)
- [ ] Linien-Chart zeigt Kaufpreis (Brutto) des Produkts über Zeit (X-Achse: Datum, Y-Achse: EUR)
- [ ] Jeder Datenpunkt im Chart ist ein tatsächlicher Kauf (mit Datum und Preis)
- [ ] Tooltip bei Hover zeigt: Datum, Preis, Bon-Nr., Markt
- [ ] Wenn Rabatt angewendet wurde: Datenpunkt visuell markiert (z.B. anderer Farbpunkt) und Tooltip zeigt Originalpreis + Rabatt
- [ ] Chart-Titel zeigt Alias (wenn vorhanden) oder Rohname
- [ ] Mindestens 2 Datenpunkte nötig für Chart; bei nur 1 Kauf: Hinweistext "Nur ein Kauf vorhanden – kein Trend darstellbar"
- [ ] Zeitachse korrekt skaliert (auch wenn Käufe Monate auseinanderliegen)

## Edge Cases
- Produkt wurde nur einmal gekauft → Hinweis statt Chart
- Produkt wurde mit unterschiedlichen Mengen gekauft → Chart zeigt immer Einzelpreis pro Stück (nicht Gesamtpreis)
- Preis ist 0 oder negativ (Leergut) → solche Einträge aus dem Chart ausschließen
- Sehr viele Kaufdaten (50+ Punkte) → Chart bleibt performant und lesbar

## Technical Requirements
- Seite: `src/app/produkte/[name]/page.tsx` oder integriert in Produktseite als Modal/Drawer
- Chart-Library: `recharts` (bereits im Next.js Ökosystem verbreitet)
- API: `GET /api/produkte/[name]/preise` → gibt Array von {datum, preis, einzelpreis, rabatt, bon_nr} zurück

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### A) Component Structure

```
/produkte (bestehende Produktseite)
+-- ProductList (bestehend)
|   +-- Product Row
|       +-- 📈 Chart-Icon/Button → Öffnet Preis-Chart

Preis-Chart (als Drawer/Sheet von rechts)
+-- Sheet Header
|   +-- Produktname (Alias oder Rohname)
|   +-- Schließen-Button
+-- Produktsuche (Autocomplete mit Combobox)
|   +-- Sucht nach Rohname + Alias
|   +-- Produkt wechselbar ohne Sheet zu schließen
+-- Chart-Bereich
|   +-- Linien-Chart (X: Datum, Y: EUR)
|   |   +-- Datenpunkt = ein tatsächlicher Kauf
|   |   +-- Normaler Kauf: blauer Punkt
|   |   +-- Kauf mit Rabatt: orangener Punkt
|   |   +-- Tooltip: Datum, Preis, Originalpreis bei Rabatt, Bon-Nr., Markt
|   +-- Hinweistext bei nur 1 Kauf: "Nur ein Kauf – kein Trend darstellbar"
+-- Preis-Zusammenfassung (unterhalb Chart)
    +-- Niedrigster Preis | Höchster Preis | Ø Durchschnitt
```

Auch direkt über URL erreichbar (`/produkte/[name]/preis`), falls Nutzer per Link auf ein Produkt zugreift.

### B) Data Model

Keine neuen Tabellen nötig. Alle Daten existieren bereits:

**Preisdaten pro Produkt** (aggregiert aus bestehenden Tabellen):
- Aus `receipt_items`: Kaufdatum, Einzelpreis (unit_price_cents), Menge
- Aus `receipts`: Datum, Uhrzeit, Bon-Nummer, Markt-Name
- Aus `item_discounts`: Rabattbetrag pro Artikel (falls vorhanden)
- Aus `product_aliases`: Lesbarer Name für Chart-Titel

**Wichtig:** Das Chart zeigt immer den **Einzelpreis** (unit_price_cents), nicht den Gesamtpreis — so sind verschiedene Mengen vergleichbar.

Gespeichert in: SQLite (`data/ebon.db`) — keine Schema-Änderung nötig.

### C) Tech Decisions

| Entscheidung | Warum |
|---|---|
| **Sheet/Drawer statt eigene Seite** | Nutzer bleibt auf der Produktseite und kann schnell zwischen Produkten wechseln. Ein Sheet von rechts zeigt den Chart im Kontext, ohne Seitenwechsel. |
| **Recharts als Chart-Library** | Recharts ist die meistgenutzte React-Chart-Library im Next.js-Ökosystem. Unterstützt Linien-Charts, Tooltips, responsive Container und Custom-Datenpunkte (für Rabatt-Markierung) out-of-the-box. |
| **Einzelpreis statt Gesamtpreis** | Wenn ein Nutzer 3x denselben Artikel kauft, ist der Gesamtpreis 3× höher — das verzerrt den Trend. Der Einzelpreis zeigt die tatsächliche Preisentwicklung. |
| **Produkt-Suche im Sheet** | Nutzer kann das Produkt wechseln, ohne den Chart-Dialog zu schließen. Ideal um schnell mehrere Produkte zu vergleichen. Verwendet die bestehende Combobox-Komponente (shadcn/ui). |
| **Rabatt-Markierung visuell** | Rabattierte Käufe als orange Punkte statt blau — so erkennt man auf einen Blick, ob ein vermeintlich günstiger Preis nur eine Aktion war. Tooltip zeigt den Originalpreis und den Rabattbetrag. |
| **Mindestens 2 Datenpunkte für Chart** | Ein einzelner Punkt ergibt keinen Trend. Statt eines leeren Charts zeigen wir einen klaren Hinweis. |

### D) API-Endpunkte

| Endpunkt | Zweck |
|---|---|
| `GET /api/produkte/[name]/preise` | Preishistorie für ein Produkt: Datum, Einzelpreis, Rabatt, Bon-Nr., Markt |

Bestehende Endpunkte werden weiterverwendet:
- `GET /api/produkte` — für die Produktsuche im Autocomplete (existiert bereits)

### E) Dependencies

| Paket | Zweck |
|---|---|
| `recharts` | Linien-Chart mit Tooltips, responsive Container, Custom Dots |

Alles andere ist bereits vorhanden:
- shadcn/ui `Sheet`, `Command` (Combobox) — bereits installiert
- `better-sqlite3` — bereits installiert
- `lucide-react` Icons — bereits installiert

### F) Anpassungen an PROJ-3

- In der Produktliste bekommt jede Zeile ein kleines Chart-Icon, das den Preis-Sheet öffnet
- Der Sheet wird per URL-Parameter gesteuert (z.B. `?chart=PRODUKTNAME`), damit er auch per Direktlink erreichbar ist

## Implementation Notes (Frontend)

### What was built
- **API endpoint:** `GET /api/produkte/[name]/preise` — returns price history with discounts, receipt number, and market name
- **PriceChartSheet component** (`src/components/price-chart-sheet.tsx`):
  - Sheet/Drawer opening from right side
  - Recharts LineChart with date on X-axis, EUR on Y-axis
  - Custom dots: blue for normal purchases, orange for discounted ones
  - Custom tooltip showing date, price, original price + discount (if applicable), receipt number, market
  - Product switcher via Combobox (searches by raw name + alias)
  - Summary stats below chart: lowest, average, highest price
  - Single-purchase hint when only 1 data point exists
  - Empty state when no price data found
- **ProductList integration:** TrendingUp icon button in each row opens the chart sheet for that product
- **Dependency:** `recharts` installed

### Deviations from spec
- URL parameter `?chart=PRODUKTNAME` not implemented yet — chart is opened via button click only. Can be added in a follow-up if needed.

## QA Test Results

**QA Date:** 2026-04-10
**Tested by:** QA Engineer (automated)
**Result:** PASS — Production Ready

### Acceptance Criteria Results

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Produktauswahl via Suchfeld mit Autocomplete (Rohname + Alias) | PASS |
| 2 | Linien-Chart zeigt Kaufpreis (Brutto) über Zeit (X: Datum, Y: EUR) | PASS |
| 3 | Jeder Datenpunkt ist ein tatsächlicher Kauf (Datum + Preis) | PASS |
| 4 | Tooltip bei Hover: Datum, Preis, Bon-Nr., Markt | PASS |
| 5 | Rabatt-Datenpunkt visuell markiert (orange) + Tooltip zeigt Originalpreis + Rabatt | PASS |
| 6 | Chart-Titel zeigt Alias (wenn vorhanden) oder Rohname | PASS |
| 7 | Mind. 2 Datenpunkte für Chart; bei 1 Kauf: Hinweistext | PASS |
| 8 | Zeitachse korrekt skaliert | PASS |

### Edge Cases Tested

| Edge Case | Status |
|-----------|--------|
| Produkt nur 1× gekauft → Hinweis statt Chart | PASS |
| Chart zeigt immer Einzelpreis (unit_price_cents), nicht Gesamtpreis | PASS |
| Preis 0 oder negativ (Leergut) → aus Chart ausgeschlossen | PASS |
| Nicht existierendes Produkt → leeres Array, kein Fehler | PASS |
| Sheet schließen und für anderes Produkt erneut öffnen | PASS |
| Produkt im Sheet wechseln ohne Sheet zu schließen | PASS |

### Security Audit

| Test | Status |
|------|--------|
| SQL Injection via Produktname im URL-Parameter | PASS — parameterized query, harmlos |
| Sonderzeichen (äöü, Leerzeichen) im Produktnamen | PASS |
| API gibt keine sensiblen Daten preis | PASS — nur Preisdaten |

### Regression Testing

| Feature | Status |
|---------|--------|
| PROJ-1: eBon Import & Parser | PASS — keine Regression |
| PROJ-2: Bon-Übersicht & Detailansicht | PASS — keine Regression |
| PROJ-3: Produktdatenbank & Alias-Verwaltung | PASS — keine Regression |

### Cross-Browser / Responsive

| Environment | Status |
|-------------|--------|
| Chromium Desktop | PASS |
| Mobile Safari (iPhone 13) | PASS |

### Test Coverage

- **Unit tests:** 25 passed (existing, no regression)
- **E2E tests:** 38 new PROJ-4 tests + 120 existing = 158 passed, 8 skipped
- **Test file:** `tests/PROJ-4-preisentwicklung-chart.spec.ts`

### Bugs Found

None.

### Known Limitations (Low / Accepted)

- URL-Parameter `?chart=PRODUKTNAME` für Direktlink nicht implementiert (im Frontend-Implementation-Notes dokumentiert). Kein Bug, sondern bewusste Scope-Entscheidung — Chart öffnet sich per Button-Klick.

### Production-Ready Decision

**READY** — Alle Acceptance Criteria bestanden, keine Critical/High Bugs, Security Audit bestanden, keine Regressionen.

## Deployment
_To be added by /deploy_
