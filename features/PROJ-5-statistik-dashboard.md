# PROJ-5: Statistik-Dashboard

## Status: In Progress
**Created:** 2026-04-07
**Last Updated:** 2026-04-10

## Dependencies
- Requires: PROJ-1 (eBon Import & Parser) – Datengrundlage
- Requires: PROJ-3 (Produktdatenbank & Alias-Verwaltung) – Alias-Namen für lesbare Darstellung

## User Stories
- Als Nutzer möchte ich meine monatlichen Ausgaben als Trend sehen, damit ich meinen Konsum über Zeit nachvollziehe
- Als Nutzer möchte ich die Produkte sehen, die ich am häufigsten kaufe, damit ich meine Stamm-Einkäufe kenne
- Als Nutzer möchte ich sehen, wie viel ich durch Rabatte gespart habe (Rabatt-Tracking), damit ich den Wert von Aktionen einschätzen kann
- Als Nutzer möchte ich meine Ausgaben nach MwSt-Kategorie aufgeschlüsselt sehen (Lebensmittel vs. Nicht-Lebensmittel), damit ich mein Ausgabenprofil verstehe

## Acceptance Criteria

### Monatliche Ausgaben-Trends
- [ ] Balken- oder Linien-Chart: X-Achse = Monat/Jahr, Y-Achse = Gesamtausgaben in EUR
- [ ] Vergleich zum Vormonat sichtbar (absolut und prozentual, z.B. "+12% vs. Vormonat")
- [ ] Zeitraum-Filter: letzte 3 Monate, 6 Monate, 12 Monate, alles

### Häufigste Produkte
- [ ] Top-10-Liste der am häufigsten gekauften Produkte (nach Anzahl der Einkäufe)
- [ ] Darstellung: Produktname (Alias wenn vorhanden), Kaufhäufigkeit, Gesamtausgaben für dieses Produkt
- [ ] Zweite Ansicht: Top-10 nach Gesamtausgaben (welche Produkte kosten mich am meisten?)
- [ ] Klick auf Produkt führt zur Preisentwicklungs-Ansicht (PROJ-4)

### Rabatt-Tracking
- [ ] Gesamt-Ersparnis durch Rabatte (Summe aller negativen Rabatt-Positionen)
- [ ] Ersparnis aufgeteilt nach Monat als Balkendiagramm
- [ ] Liste der häufigsten Rabattaktionen (z.B. "Weihn. Süßwaren 50%")

### MwSt-Kategorien-Aufteilung
- [ ] Donut/Pie-Chart: Anteil A (19%) vs. B (7%) an Gesamtausgaben
- [ ] Absolute Beträge zusätzlich sichtbar

## Edge Cases
- Weniger als 2 Monate Daten → Trend-Chart zeigt nur vorhandene Daten, kein Vormonatsvergleich
- Alle Bons gelöscht → Dashboard zeigt Leer-Zustand mit Hinweis
- Bon mit negativer Summe (Leergut-Rückgabe) → wird in Monatsstatistik korrekt als negativ eingerechnet

## Technical Requirements
- Seite: `src/app/statistiken/page.tsx`
- API: `GET /api/statistiken/monatlich`, `GET /api/statistiken/top-produkte`, `GET /api/statistiken/rabatte`, `GET /api/statistiken/mwst`
- Chart-Library: `recharts`

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### A) Component Structure

```
/statistiken (bestehende Placeholder-Seite)
+-- Dashboard Header
|   +-- Titel "Statistiken"
|   +-- Beschreibungstext
|
+-- Zeitraum-Filter (oben rechts)
|   +-- Toggle-Group: 3M | 6M | 12M | Alle
|   +-- Gilt für ALLE Karten/Charts gleichzeitig
|
+-- Dashboard Grid (responsive: 1 Spalte mobil, 2 Spalten Desktop)
|
|   +-- Karte 1: Monatliche Ausgaben
|   |   +-- Vormonats-Vergleich (Badge: "+12% vs. Vormonat")
|   |   +-- Balken-Chart (X: Monat/Jahr, Y: EUR)
|   |   +-- Tooltip: Monat, Gesamtausgaben
|   |
|   +-- Karte 2: Top-10 Produkte
|   |   +-- Tabs: "Häufigste" | "Teuerste"
|   |   +-- Rangliste mit Platz, Produktname (Alias), Kaufhäufigkeit/Ausgaben
|   |   +-- Klick auf Produkt → öffnet Preis-Chart (PROJ-4 PriceChartSheet)
|   |
|   +-- Karte 3: Rabatt-Tracking
|   |   +-- Gesamt-Ersparnis (große Zahl oben)
|   |   +-- Balken-Chart: monatliche Ersparnisse (X: Monat, Y: EUR)
|   |   +-- Top-5 Rabattaktionen (Name + Häufigkeit + Betrag)
|   |
|   +-- Karte 4: MwSt-Aufteilung
|       +-- Donut-Chart: Anteil A (7% MwSt) vs. B (19% MwSt)
|       +-- Legende mit absoluten Beträgen
|
+-- Leer-Zustand (wenn keine Bons importiert)
    +-- Icon + Hinweis: "Importiere eBons für Statistiken"
    +-- Button → /import
```

### B) Data Model

Keine neuen Tabellen nötig. Alle Daten werden aus bestehenden Tabellen aggregiert:

**Monatliche Ausgaben:**
- Aus `receipts`: Gruppierung nach Monat/Jahr des `receipt_date`, Summe der `total_amount_cents`
- Vormonats-Vergleich: Differenz zwischen aktuellem und vorherigem Monat (absolut + prozentual)

**Top-10 Produkte:**
- Aus `receipt_items`: Gruppierung nach `raw_name`, Zählung der Einträge (Häufigkeit) und Summe der `total_price_cents` (Gesamtausgaben)
- Aus `product_aliases`: Lesbarer Name für die Anzeige
- Nur Positionen mit `item_type = 'product'` oder `'concession'`, und `unit_price_cents > 0` (kein Leergut)

**Rabatt-Tracking:**
- Aus `item_discounts`: Summe aller `amount_cents` = Gesamtersparnis
- Gruppiert nach Monat (über den Bon des dazugehörigen Artikels)
- Häufigste Rabattaktionen: Gruppierung nach `description`, Zählung + Summe

**MwSt-Aufteilung:**
- Aus `receipt_items`: Gruppierung nach `tax_code` (A = 7% Lebensmittel, B = 19% Nicht-Lebensmittel)
- Summe der `total_price_cents` pro Kategorie

Gespeichert in: SQLite (`data/ebon.db`) — keine Schema-Änderung nötig.

### C) Tech Decisions

| Entscheidung | Warum |
|---|---|
| **Alles auf einer Seite (Dashboard-Grid)** | Der Nutzer soll alle Kennzahlen auf einen Blick sehen, ohne zwischen Seiten zu wechseln. Ein Grid mit Karten ist das Standard-Pattern für Dashboards und funktioniert responsive (1 Spalte mobil, 2 Spalten Desktop). |
| **Globaler Zeitraum-Filter** | Ein einziger Filter steuert alle Charts gleichzeitig. So kann der Nutzer z.B. "letzte 3 Monate" wählen und sieht konsistente Daten in allen Karten — kein Durcheinander mit unterschiedlichen Zeiträumen. |
| **Balken-Chart für Monatsausgaben (statt Linie)** | Balken eignen sich besser für diskrete Zeiträume (Monate). Jeder Balken = 1 Monat. Bei einer Linie würde man einen kontinuierlichen Verlauf suggerieren, der bei monatlichen Summen irreführend wäre. |
| **Tabs für Top-10 (Häufigkeit vs. Ausgaben)** | Zwei Perspektiven auf dieselbe Frage: "Was kaufe ich am meisten?" (Häufigkeit) vs. "Wofür gebe ich am meisten aus?" (Gesamtbetrag). Tabs sparen Platz und erlauben schnellen Wechsel. |
| **Donut-Chart für MwSt** | Ein Donut zeigt Anteile am Ganzen — ideal für 2 Kategorien (7% vs. 19%). Der Nutzer erkennt sofort, ob er mehr für Lebensmittel oder Nicht-Lebensmittel ausgibt. |
| **Recharts wiederverwenden** | Bereits für PROJ-4 installiert. Unterstützt Bar-, Line- und Pie-Charts mit Tooltips und responsive Container. Kein neues Paket nötig. |
| **PriceChartSheet wiederverwenden** | Klick auf ein Produkt in der Top-10-Liste öffnet den bestehenden Preis-Sheet aus PROJ-4. Kein neues UI nötig — konsistentes Erlebnis. |
| **4 separate API-Endpunkte** | Jeder Chart hat seine eigene Datenquelle. Das hält die Queries einfach und erlaubt der Seite, alle 4 parallel zu laden (schnellerer Seitenaufbau). Wenn ein Query langsam ist, blockiert er nicht die anderen. |

### D) API-Endpunkte

| Endpunkt | Zweck |
|---|---|
| `GET /api/statistiken/monatlich?monate=3` | Monatliche Gesamtausgaben + Vormonatsvergleich. Parameter `monate` filtert Zeitraum (3, 6, 12 oder leer = alles) |
| `GET /api/statistiken/top-produkte?monate=3&sort=frequency` | Top-10 Produkte. `sort` = `frequency` (Häufigste) oder `spending` (Teuerste) |
| `GET /api/statistiken/rabatte?monate=3` | Gesamt-Ersparnis, monatliche Ersparnisse, Top-5 Rabattaktionen |
| `GET /api/statistiken/mwst?monate=3` | Ausgaben nach MwSt-Kategorie (A vs. B) |

Bestehende Endpunkte werden weiterverwendet:
- `GET /api/produkte` — für Produktnamen/Aliase (bereits vorhanden)

### E) Dependencies

Keine neuen Pakete nötig. Alles existiert bereits:
- `recharts` — Charts (bereits installiert für PROJ-4)
- shadcn/ui `Card`, `Tabs`, `Skeleton`, `Badge` — bereits installiert
- `lucide-react` Icons — bereits installiert

### F) Anpassungen an bestehende Features

- **PROJ-4 Integration:** Klick auf ein Produkt in der Top-10-Liste öffnet den `PriceChartSheet` aus PROJ-4. Die bestehende Komponente wird unverändert wiederverwendet.
- **Bestehende Statistiken-Seite:** Die Placeholder-Seite (`src/app/statistiken/page.tsx`) wird mit dem Dashboard-Inhalt ersetzt.

## Implementation Notes (Frontend + Backend)

### What was built
- **4 API endpoints:**
  - `GET /api/statistiken/monatlich` — monthly spending with month-over-month comparison
  - `GET /api/statistiken/top-produkte` — top-10 products by frequency or spending
  - `GET /api/statistiken/rabatte` — total savings, monthly savings chart, top-5 discount actions
  - `GET /api/statistiken/mwst` — spending by VAT category (A=7%, B=19%)
  - All endpoints support `?monate=3|6|12` filter parameter
- **StatistikDashboard component** (`src/components/statistik-dashboard.tsx`):
  - Global time filter (3M / 6M / 12M / All) controls all cards simultaneously
  - Card 1: Monthly spending bar chart + month-over-month comparison badge
  - Card 2: Top-10 products with tabs (Häufigste / Teuerste), click opens PROJ-4 PriceChartSheet
  - Card 3: Discount tracking — total savings, monthly bar chart, top-5 discount actions list
  - Card 4: VAT donut chart with legend and absolute amounts
  - Empty state when no receipts imported
  - Loading skeletons during data fetch
  - All 4 API calls run in parallel for fast page load
- **Page:** Replaced placeholder `src/app/statistiken/page.tsx` with dashboard

### Deviations from spec
- None. All acceptance criteria addressed in the implementation.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
