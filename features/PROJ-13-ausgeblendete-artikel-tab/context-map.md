# Context Map: PROJ-13 – Ausgeblendete Artikel als separater Tab

**Erstellt:** 2026-04-13
**Feature Spec:** [spec.md](spec.md)

---

## Komponentenstruktur

```
/produkte (Seite)
  └── ProductList                             ← Umbau (Hauptkomponente)
       ├── Tabs (shadcn)                       ← NEU: ersetzt Filter-Buttons
       │    ├── TabsList
       │    │    ├── TabsTrigger "Produkte"    ← Tab 1 (Standard)
       │    │    └── TabsTrigger "Ausgeblendet (N)"  ← Tab 2 mit dynamischer Zahl
       │    ├── TabsContent "produkte"
       │    │    ├── SearchBar + SortButtons   ← unverändert
       │    │    └── ProductTable (aktive Artikel)   ← unverändert, nur anderer Datensatz
       │    └── TabsContent "ausgeblendet"
       │         ├── SearchBar (eigener State) ← separater Suchbegriff
       │         └── ExcludedProductTable      ← gleiche Spalten, anderer Datensatz + Button
       └── PriceChartSheet                     ← unverändert
```

---

## Datenmodell

**Keine API-Änderungen.** Das bestehende `GET /api/produkte` liefert bereits:
- `excluded_from_stats: boolean` für jedes Produkt
- `excluded_count: number` für den Tab-Header

Die Trennung in zwei Listen passiert **rein im Frontend**:
- **Aktive Artikel** = `products.filter(p => !p.excluded_from_stats)`
- **Ausgeblendete Artikel** = `products.filter(p => p.excluded_from_stats)`

Kein zweiter API-Call nötig.

---

## Tech-Entscheidungen

| Entscheidung | Warum |
|---|---|
| `Tabs`-Komponente aus shadcn/ui | Bereits installiert (`src/components/ui/tabs.tsx`); semantisch korrekt; kein neues Package nötig |
| Kein zweiter API-Call für den Ausgeblendet-Tab | Daten sind bereits im `products`-Array mit `excluded_from_stats`-Flag; clientseitige Filterung reicht aus |
| Eigener Such-State per Tab | Suche im Haupt-Tab soll Ausgeblendet-Tab nicht beeinflussen (und umgekehrt) |
| Kein Tab-State persistieren | Spezifikation: nach Reload immer Haupt-Tab aktiv; kein localStorage nötig |
| Filter-Dropdown ersatzlos entfernen | War Übergangslösung; Tab-Struktur macht ihn obsolet |
| Optimistic Update beibehalten | Beim Ein-/Ausblenden soll der Artikel sofort verschwinden, ohne Reload — gleiche Logik wie bisher |

---

## Relevante Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/components/product-list.tsx` | Umbau | Haupt-Umbau: Filter-Dropdown → Tabs; State-Splitting; ExcludedTable |
| `src/components/ui/tabs.tsx` | Nur lesen | Bereits installierte shadcn-Komponente — Referenz für korrekte Nutzung |
| `src/app/api/produkte/route.ts` | Nur lesen | Keine Änderungen; Referenz für `excluded_count` und `excluded_from_stats` |

---

## Kritische Typen & Interfaces (inline)

### Bestehende Typen in `product-list.tsx` — keine Änderung an den Interfaces:

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
  inflation_cagr_pct: number | null
}

interface ProdukteResponse {
  products: Product[]
  total_count: number
  excluded_count: number
}

type SortKey = "frequency" | "name" | "last_purchase"

// FilterKey wird ENTFERNT — nicht mehr benötigt nach Tab-Umbau
// type FilterKey = "all" | "active" | "excluded"  ← weg
```

### State-Änderungen in `ProductList`:

```typescript
// Entfernen:
const [filter, setFilter] = useState<FilterKey>("all")

// Hinzufügen:
const [excludedSearch, setExcludedSearch] = useState("") // eigene Suche für Ausgeblendet-Tab
```

### API-Call-Änderung:
- `filter`-Parameter aus dem Fetch-Call entfernen (API liefert immer alle Produkte)
- Client-seitig splitten: `activeProducts` und `excludedProducts`

---

## Tests

### Bestehende Tests — prüfen & ggf. anpassen

| Datei | Behandlung | Grund |
|---|---|---|
| `tests/PROJ-3-produktdatenbank-alias.spec.ts` | Regression prüfen | Testet Produktliste — Filter-Buttons könnten referenziert werden |
| `tests/PROJ-8-produkt-statistik-ausblendung.spec.ts` | Regression prüfen | Testet Ausblenden/Einblenden — betroffen von Tab-Umbau |
| `src/app/api/produkte/produkte-exclude.test.ts` | Kein Einfluss | Unit-Test der API, kein Frontend-Bezug |

### Neue Tests

| Datei | Typ | Inhalt |
|---|---|---|
| `tests/PROJ-13-ausgeblendete-artikel-tab.spec.ts` | E2E (Playwright) | Tab-Navigation, Ausgeblendet-Tab mit N im Header, Einblenden direkt im Tab, leere Zustände |

---

## Nicht-lesen-Liste

- `src/app/api/bons/` — Bon-Import, irrelevant
- `src/app/api/import/` — Import-Route, irrelevant
- `src/app/api/statistiken/` — irrelevant
- `src/app/api/produkte/[name]/` — alle Sub-Routes (alias, exclude, preise, preisentwicklung) unverändert
- `src/components/statistik-dashboard.tsx` — irrelevant
- `src/components/bon-*.tsx` — irrelevant
- `src/components/price-chart-sheet.tsx` — keine Änderungen
- `src/components/ui/` — nur `tabs.tsx` lesen, Rest ignorieren
