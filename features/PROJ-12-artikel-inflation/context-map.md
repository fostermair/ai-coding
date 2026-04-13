# Context Map: PROJ-12 – Artikel-Inflation (Jahr-zu-Jahr)

**Erstellt:** 2026-04-13
**Feature Spec:** [spec.md](spec.md)

---

## Komponentenstruktur

```
/produkte (Seite)
  └── ProductList                         ← Erweitern
       ├── ProductTable
       │    └── Neue Spalte: InflationBadge   ← Neu (inline in ProductList)
       │         "Ø Inflation p.a." (+3,2% p.a.)
       └── PriceChartSheet                ← Erweitern
            ├── LineChart (unverändert)
            ├── SummaryStats (unverändert)
            └── PreisentwicklungSection
                 ├── GesamtVeraenderung (unverändert)
                 ├── CAGR-Zeile NEU      ← "Ø Inflation p.a." als Summary
                 └── JahrZuJahrTabelle   ← Erweitern: Teiljahr-Badge pro Zeile
```

---

## Datenmodell

**Keine neuen Tabellen.** Alle Berechnungen sind dynamisch auf Basis der bestehenden `receipt_items`- und `receipts`-Tabellen.

### Neue berechnete Felder

**In `GET /api/produkte` (Liste aller Produkte):**
- `inflation_cagr_pct: number | null` — CAGR über alle verfügbaren Kaufjahre. Null wenn < 2 Kaufjahre.

**In `GET /api/produkte/[name]/preisentwicklung` (Produktdetail):**
- Erweiterung `JahrStat.is_partial_year: boolean` — True wenn das Jahr nicht komplett abgedeckt ist (erstes oder laufendes Jahr)
- Neues Top-Level-Feld `inflation_cagr_pct: number | null` — CAGR für dieses Produkt

### CAGR-Formel
`(letzter_jahres_avg / erster_jahres_avg)^(1 / jahre_abstand) - 1`

- `jahre_abstand` = letztes Kaufjahr − erstes Kaufjahr (nicht Anzahl Zeilen, sondern Zeitabstand in Jahren)
- Erfordert mind. 2 verschiedene Kaufjahre

### Teiljahr-Erkennung
Ein Kalenderjahr gilt als "Teiljahr" wenn:
- Es das erste Datenjahr ist UND der erste Kauf nicht am 1. Januar liegt, ODER
- Es das aktuelle Jahr ist (noch nicht abgeschlossen)

Implementierung: Vergleich von `MIN(datum)` und `MAX(datum)` des Jahres mit `YYYY-01-01` bzw. `YYYY-12-31`.

---

## Tech-Entscheidungen

| Entscheidung | Warum |
|---|---|
| `preisentwicklung`-Route erweitern statt neue `/inflation`-Route | Die Jahr-zu-Jahr-Daten werden dort bereits berechnet — CAGR ist ein additives Feld, kein Parallelaufruf nötig |
| SQLite `strftime('%Y', receipt_date)` | Bereits in `preisentwicklung`-Route genutzt, bewährtes Muster |
| CAGR für Produktliste via Subquery in `GET /api/produkte` | Kein N+1 — alle CAGRs in einem Query für alle Produkte |
| CAGR-Berechnung in JavaScript (nicht SQL) für Detailansicht | Im `preisentwicklung`-Handler laufen die Jahres-Daten bereits durch JS — CAGR kann dort berechnet werden |
| Badge "Teiljahr" nur als kleiner Hinweistext | Nicht als separates UI-Element — klein halten, Info statt Warnung |

---

## Relevante Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/app/api/produkte/route.ts` | Erweitern | Neues Feld `inflation_cagr_pct` via SQL-Subquery |
| `src/app/api/produkte/[name]/preisentwicklung/route.ts` | Erweitern | CAGR + `is_partial_year` Flag berechnen und zurückgeben |
| `src/components/product-list.tsx` | Erweitern | Neue Spalte "Ø Inflation p.a." + `Product`-Interface erweitern |
| `src/components/price-chart-sheet.tsx` | Erweitern | CAGR-Zeile anzeigen + Teiljahr-Hinweis in JahrStat-Tabelle |
| `src/app/api/produkte/[name]/preisentwicklung/preisentwicklung.test.ts` | Nur lesen | Bestehende Tests — nicht brechen |

---

## Kritische Typen & Interfaces (inline)

### `Product` (product-list.tsx, Zeile 23–34) — erweitern um:
```typescript
interface Product {
  raw_name: string
  alias: string | null
  purchase_count: number
  first_price_cents: number | null
  last_price_cents: number
  price_trend_pct: number | null
  trend_from_date: string | null
  trend_to_date: string | null
  last_purchase_date: string
  excluded_from_stats: boolean
  inflation_cagr_pct: number | null   // NEU
}
```

### `JahrStat` (price-chart-sheet.tsx, Zeile 67–71) — erweitern um:
```typescript
interface JahrStat {
  jahr: number
  avg_preis_cents: number
  veraenderung_cents: number | null
  veraenderung_prozent: number | null
  is_partial_year: boolean             // NEU
}
```

### `PreisentwicklungData` (price-chart-sheet.tsx, Zeile 73–81) — erweitern um:
```typescript
interface PreisentwicklungData {
  gesamt: {
    erster_kauf: { datum: string; preis_cents: number }
    letzter_kauf: { datum: string; preis_cents: number }
    veraenderung_cents: number
    veraenderung_prozent: number
  }
  jahre: JahrStat[]
  inflation_cagr_pct: number | null    // NEU
}
```

### API-Response `GET /api/produkte` — neues Feld:
```typescript
// Additiv — kein Breaking Change
{
  products: Array<Product & { inflation_cagr_pct: number | null }>
  total_count: number
  excluded_count: number
}
```

---

## Nicht-lesen-Liste

- `src/components/ui/` — shadcn primitives, keine Änderungen
- `src/app/api/bons/` — Bon-Import, irrelevant
- `src/app/api/import/` — Import-Route, irrelevant
- `src/app/api/statistiken/` — Statistik-Dashboard, irrelevant
- `src/components/statistik-dashboard.tsx` — irrelevant
- `src/components/bon-*.tsx` — Bon-Ansichten, irrelevant
- `tests/` — E2E-Tests werden von QA erstellt
