# Context Map: PROJ-10 Preistrend-Indikator

> Erstellt von /architecture – optimiert für Frontend- und Backend-Agents.
> Agents lesen NUR diese Datei + spec.md + die unten gelisteten Dateien.

## Relevante Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/app/api/produkte/route.ts` | Erweitern | Hauptquery bekommt zwei neue Subqueries: `first_price_cents` + `price_trend_pct`-Berechnung |
| `src/components/product-list.tsx` | Erweitern | Neue Tabellenspalte "Preistrend" + neue `PriceTrendBadge`-Subkomponente |
| `src/components/ui/badge.tsx` | Nur lesen | Wird für den farbigen Trend-Badge verwendet (shadcn/ui Primitive) |
| `src/components/price-chart-sheet.tsx` | Nur lesen | Wird beim Klick auf Badge geöffnet – keine Änderungen nötig |
| `src/lib/format.ts` | Nur lesen | `formatEuro` bereits vorhanden – Prozentformatierung analog implementieren |

## Nicht-lesen-Liste

Folgende Dateien sind für dieses Feature **nicht relevant**:
- `src/app/api/produkte/[name]/alias/route.ts`
- `src/app/api/produkte/[name]/exclude/route.ts`
- `src/app/api/produkte/[name]/preisentwicklung/route.ts`
- `src/app/api/bons/` (alle)
- `src/app/api/statistiken/` (alle)
- `src/components/statistik-dashboard.tsx`
- `src/components/bon-list.tsx`
- `src/components/bon-detail.tsx`
- `src/components/import-zone.tsx`

---

## Kritische Typen & Interfaces

### Aktuelles `Product`-Interface (in `product-list.tsx`, Zeile 21–28)
```ts
interface Product {
  raw_name: string
  alias: string | null
  purchase_count: number
  last_price_cents: number
  last_purchase_date: string
  excluded_from_stats: boolean
}
```

### Erweitertes `Product`-Interface (nach diesem Feature)
```ts
interface Product {
  raw_name: string
  alias: string | null
  purchase_count: number
  first_price_cents: number | null   // NEU: Preis beim ersten Kauf (null wenn <2 Käufe oder Preis ≤ 0)
  last_price_cents: number
  price_trend_pct: number | null     // NEU: ((last - first) / first) * 100, null wenn <2 Käufe
  last_purchase_date: string
  excluded_from_stats: boolean
}
```

### Aktuelle API-Antwort (`GET /api/produkte`)
```ts
interface ProdukteResponse {
  products: Product[]
  total_count: number
  excluded_count: number
}
```

---

## Architektur-Entscheidungen

### Berechnung in SQL vs. JavaScript
`price_trend_pct` wird in JavaScript nach dem DB-Query berechnet (aus `first_price_cents` und `last_price_cents`), da SQLite-Divisionen mit Integers vorsichtig behandelt werden müssen. Der API-Layer berechnet den Prozentwert und gibt ihn fertig zurück.

### Subquery-Strategie für `first_price_cents`
Analog zum bestehenden `last_price_cents`-Subquery (der nach `DESC` sortiert), wird ein neuer Subquery für den **ältesten** Kauf eingebaut (sortiert nach `ASC`). Leergut-Positionen (`total_price_cents <= 0`) werden in beiden Subqueries herausgefiltert.

### Badge-Komponente
`PriceTrendBadge` ist eine kleine funktionale Komponente **innerhalb** von `product-list.tsx` (kein eigenes File, da sie sonst nirgends verwendet wird). Sie nimmt `price_trend_pct: number | null` entgegen und rendert:
- `null` → nichts (leere Zelle, kein Platzhalter)
- `> 0` → roter Badge, ↑-Pfeil, z.B. "↑ 12,3%"
- `< 0` → grüner Badge, ↓-Pfeil, z.B. "↓ 5,1%"
- `= 0` → grauer Badge, →-Pfeil, "→ 0%"

Klick auf den Badge ruft `setChartProduct` + `setChartOpen` auf (identisch zum bestehenden Chart-Button).

### Neue Tabellenspalte
Die neue Spalte "Preistrend" wird **zwischen** "Letzter Preis" und "Letzter Kauf" eingefügt. Sie ist `hidden sm:table-cell` (gleiche Responsive-Klasse wie bestehende Spalten).
