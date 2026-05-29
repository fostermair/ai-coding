# Context Map: PROJ-38 — Kategorien-Inflation

## Relevante Dateien

| Datei | Aktion | Warum relevant |
|-------|--------|----------------|
| `src/app/api/statistiken/kategorien-inflation/route.ts` | Neu erstellen | Neuer API-Endpoint |
| `src/components/statistik-dashboard.tsx` | Erweitern | Neue Card "Inflation nach Kategorie" |
| `src/app/api/statistiken/inflation/route.ts` | Nur lesen | Vorlage: YoY-Inflations-Query-Pattern |
| `src/lib/db.ts` | Nur lesen | `product_categories`-Tabellen-Schema (PROJ-45) |
| `src/lib/format.ts` | Nur lesen | `formatEuro` für Preis-Darstellung |

## Kritische Typen & Interfaces

### API Response (`/api/statistiken/kategorien-inflation`)
```ts
interface KategorienInflationItem {
  category: string
  inflation_pct: number | null  // null = nur in einem Jahr vorhanden
  product_count: number
  avg_current_price_cents: number | null
  avg_prev_price_cents: number | null
}

interface KategorienInflationResponse {
  items: KategorienInflationItem[]
  include_excluded: boolean
}
```

### Bestehende DB-Tabellen (bereits vorhanden)

`product_categories` (PROJ-45):
```sql
alias      TEXT PRIMARY KEY,
category   TEXT NOT NULL,
source     TEXT NOT NULL CHECK(source IN ('auto','manual')),
updated_at TEXT NOT NULL DEFAULT (datetime('now'))
```

`product_aliases`:
```sql
raw_name    TEXT PRIMARY KEY,
alias       TEXT NOT NULL,
excluded_from_stats INTEGER NOT NULL DEFAULT 0
```

`receipt_items`:
```sql
raw_name TEXT, item_type TEXT, unit_price_cents INTEGER, ...
```

### JOIN-Kette für Kategorie-Zuweisung
```
receipt_items.raw_name
  → product_aliases.raw_name (LEFT JOIN)
    → product_categories.alias  (LEFT JOIN auf product_aliases.alias)
      → product_categories.category
COALESCE(product_categories.category, 'Sonstiges') AS category
```

## SQL-Strategie (Vorlage: `inflation/route.ts`)

```
WITH yearly_avg AS (
  SELECT
    COALESCE(pc.category, 'Sonstiges') AS category,
    strftime('%Y', r.receipt_date) AS jahr,
    AVG(ri.unit_price_cents) AS avg_cents,
    COUNT(DISTINCT pa.alias) AS product_count
  FROM receipt_items ri
  JOIN receipts r ON r.id = ri.receipt_id
  LEFT JOIN product_aliases pa ON pa.raw_name = ri.raw_name
  LEFT JOIN product_categories pc ON pc.alias = pa.alias
  WHERE ri.unit_price_cents > 0
    AND (ri.item_type = 'product' OR ri.item_type = 'concession')
    AND COALESCE(pa.excluded_from_stats, 0) = 0
    AND strftime('%Y', r.receipt_date) IN (current_year, prev_year)
  GROUP BY category, jahr
),
yoy AS (
  SELECT curr.category,
    ROUND((curr.avg_cents - prev.avg_cents) / prev.avg_cents * 100, 1) AS inflation_pct,
    curr.product_count,
    ROUND(curr.avg_cents) AS avg_current_price_cents,
    ROUND(prev.avg_cents) AS avg_prev_price_cents
  FROM yearly_avg curr
  LEFT JOIN yearly_avg prev ON prev.category = curr.category AND prev.jahr = prev_year
  WHERE curr.jahr = current_year
)
SELECT * FROM yoy ORDER BY inflation_pct DESC NULLS LAST
```

Query-Parameter `?include_excluded=true`:  
Für jetzt: feste Ausschluss-Liste `('Pfand', 'Tabak', 'Drogerie')` wenn `include_excluded = false`. Kategorien mit nur einem Jahr → `inflation_pct = null`.

## Statistik-Dashboard — Card-Position

Aktuelle Card-Reihenfolge in `statistik-dashboard.tsx`:
1. Monatstrend
2. Einkaufskorb-Vergleich
3. **→ Inflation nach Kategorie (NEU, hier einfügen)**
4. Top-Produkte / Häufigste Produkte
5. Artikel-Inflation
6. Rabatte
7. MwSt

## UI-State-Erweiterung

```ts
// In statistik-dashboard.tsx hinzufügen:
const [kategorienInflation, setKategorienInflation] = useState<KategorienInflationData | null>(null)
const [kategorienLoading, setKategorienLoading] = useState(true)
const [includeExcluded, setIncludeExcluded] = useState(false)
```

Badge-Logik:
- `inflation_pct > 0` → rotes Badge mit "+" Präfix
- `inflation_pct < 0` → grünes Badge
- `inflation_pct === 0` → graues Badge "±0%"
- `inflation_pct === null` → graues Badge "(keine Daten)"

## Nicht-lesen-Liste

- `src/app/api/produkte/` — nicht betroffen
- `src/app/api/bons/` — nicht betroffen
- `src/app/api/avis/` — nicht betroffen
- `src/app/api/konto/` — nicht betroffen
- `src/lib/unit-parser.ts` — PROJ-39, nicht relevant

## Tests

### Bestehende Tests
| Datei | Aktion |
|-------|--------|
| `src/app/api/produkte/produkte-inflation-cagr.test.ts` | Regression prüfen |

### Neue Tests
| Datei | Typ | Inhalt |
|-------|-----|--------|
| *(optional)* `src/app/api/statistiken/kategorien-inflation.test.ts` | Integration | Leerer Zustand, Kategorien nur in einem Jahr, include_excluded-Toggle |
