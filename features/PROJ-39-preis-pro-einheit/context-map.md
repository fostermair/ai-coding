# Context Map: PROJ-39 — Preis-pro-Einheit-Normalisierung

## Relevante Dateien

| Datei | Aktion | Warum relevant |
|-------|--------|----------------|
| `src/lib/db.ts` | Erweitern | DB-Migration: 3 neue nullable Spalten auf `receipt_items` |
| `src/lib/unit-parser.ts` | Neu erstellen | Kern-Parsing-Logik: `parseUnit(rawName, unitPriceCents)` |
| `src/lib/unit-parser.test.ts` | Neu erstellen | Unit-Tests für alle Pattern-Beispiele + Edge Cases |
| `src/app/api/import/route.ts` | Erweitern | `parseUnit()` nach jedem `receipt_item`-INSERT aufrufen |
| `src/app/api/paperless/sync/route.ts` | Erweitern | Dasselbe für Paperless-Sync |
| `src/app/api/admin/backfill-units/route.ts` | Neu erstellen | Backfill-Endpoint: alle `receipt_items` mit NULL-Einheit normalisieren |
| `src/app/api/produkte/route.ts` | Erweitern | `price_per_unit_cents` + `normalized_unit` des letzten Kaufs im SELECT |
| `src/components/product-list.tsx` | Erweitern | Neue optionale Spalte "€/Einheit" |
| `src/lib/format.ts` | Nur lesen | Bestehende Format-Utilities (formatEuro, formatDate) |
| `src/lib/parser/rewe.ts` | Nur lesen | Verstehen wie `receipt_items` beim eBon-Import erzeugt werden |

## Kritische Typen & Interfaces

### ParseUnitResult (neu in `unit-parser.ts`)
```ts
interface ParseUnitResult {
  normalized_amount: number | null   // Basismenge in g, ml oder Stück
  normalized_unit: 'g' | 'ml' | 'Stück' | null
  price_per_unit_cents: number | null // €/100g, €/100ml oder €/Stück
}
```

### Product (in `product-list.tsx`, erweitern)
```ts
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
  inflation_cagr_pct: number | null
  seasonal?: boolean
  current_month_season?: "günstig" | "normal" | "teuer" | null
  category: string
  category_source: "auto" | "manual"
  // NEU (PROJ-39):
  price_per_unit_cents: number | null
  normalized_unit: 'g' | 'ml' | 'Stück' | null
}
```

### DB-Migration (in `db.ts` nach bestehendem Muster)
```ts
const itemCols = db.prepare("PRAGMA table_info(receipt_items)").all() as Array<{ name: string }>
if (!itemCols.some((c) => c.name === "normalized_amount")) {
  db.exec("ALTER TABLE receipt_items ADD COLUMN normalized_amount REAL")
}
if (!itemCols.some((c) => c.name === "normalized_unit")) {
  db.exec("ALTER TABLE receipt_items ADD COLUMN normalized_unit TEXT")
}
if (!itemCols.some((c) => c.name === "price_per_unit_cents")) {
  db.exec("ALTER TABLE receipt_items ADD COLUMN price_per_unit_cents INTEGER")
}
```

## Pattern-Tabelle für unit-parser.ts

| Input-Beispiel | normalized_amount | normalized_unit | Bemerkung |
|----------------|-------------------|-----------------|-----------|
| `250G`, `250 G`, `250GR`, `250 GR` | 250 | g | |
| `1KG`, `0.5KG`, `0,5KG` | 1000 / 500 / 500 | g | KG → ×1000 |
| `1L`, `1 L`, `1LT`, `1 LT` | 1000 | ml | L → ×1000 |
| `500ML`, `500 ML` | 500 | ml | |
| `0,5L`, `0.5L` | 500 | ml | |
| `6ST`, `6 ST`, `6STK`, `6 STK` | 6 | Stück | |
| `6X` (ohne Einheit danach) | 6 | Stück | |
| `4X250G` | 1000 | g | Multi-Pack: 4×250 |
| `6X1L` | 6000 | ml | Multi-Pack: 6×1000 |

Preis-Berechnung:
- g/ml: `Math.round(unitPriceCents / normalizedAmount * 100)` → €/100g oder €/100ml
- Stück: `Math.round(unitPriceCents / normalizedAmount)` → €/Stück

## Nicht-lesen-Liste

- `src/app/api/bestellung/` — Bestellung-Import schreibt in `bestellung_items`, nicht `receipt_items`
- `src/app/api/avis/` — AVIS-Matching, nicht relevant
- `src/app/api/konto/` — Kontoauszug, nicht relevant
- `src/components/statistik-dashboard.tsx` — nicht betroffen
- `src/lib/avis-matching.ts` — nicht betroffen
- `src/components/ui/` — shadcn-Primitives, nicht ändern

## Tests

### Bestehende Tests
| Datei | Aktion |
|-------|--------|
| `src/lib/parser/rewe.test.ts` | Regression prüfen — Parser-Logik nicht verändert |
| `src/app/api/produkte/produkte-preistrend.test.ts` | Regression prüfen — `product-list` API erweitert |

### Neue Tests
| Datei | Typ | Inhalt |
|-------|-----|--------|
| `src/lib/unit-parser.test.ts` | Unit | Alle Patterns aus der Tabelle + Edge Cases (Fallback NULL, negative Preise, Dezimaltrennzeichen) |
