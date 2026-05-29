# Context Map: PROJ-49 — Statistik-Drill-Down

## Relevante Dateien

| Datei | Aktion | Warum relevant |
|-------|--------|----------------|
| `src/components/statistik-dashboard.tsx` | Erweitern | Haupt-Datei: onClick-Handler für Balken + Zeilen, PriceChartSheet-State |
| `src/components/bon-list.tsx` | Erweitern | `useSearchParams` ergänzen um `from`/`to` zu lesen und an API weiterzugeben |
| `src/components/price-chart-sheet.tsx` | Nur lesen | Bestehende Sheet-Komponente, wird in statistik-dashboard neu eingebunden |
| `src/app/api/bons/route.ts` | Nur lesen | Bereits `from`/`to` Query-Parameter vorhanden (Zeile 34-35) |
| `src/app/page.tsx` | Nur lesen | Rendert `<BonList />` ohne Props — kein Änderungsbedarf |

## Kritische Typen & Interfaces

### Monatstrend — Recharts Bar onClick Payload
```ts
// Recharts liefert als onClick-Argument:
interface BarClickPayload {
  activePayload: Array<{ payload: { monat: string; ausgaben_cents: number } }>
}
// monat hat Format "YYYY-MM"
```

Navigationsziel:
```ts
// monat = "2026-03"
const from = `${monat}-01`
const to = `${monat}-31` // SQLite DATE-Vergleich toleriert das
router.push(`/?from=${from}&to=${to}`)
```

### bon-list.tsx — useSearchParams-Erweiterung
```ts
import { useSearchParams } from "next/navigation"
const searchParams = useSearchParams()
const fromParam = searchParams.get("from")   // "YYYY-MM-DD" | null
const toParam   = searchParams.get("to")     // "YYYY-MM-DD" | null
// In fetchBons(): URL += fromParam ? `&from=${fromParam}` : ""
```

### PriceChartSheet-Props (aus price-chart-sheet.tsx lesen)
```ts
// Vor Implementierung: Props der Komponente in price-chart-sheet.tsx prüfen
// Wird in statistik-dashboard.tsx als zusätzlicher State gebraucht:
const [selectedProduct, setSelectedProduct] = useState<string | null>(null)
```

### Top-Produkte-Zeile — onClick
```ts
// In der bestehenden Produkt-Zeile (Tabelle/Liste) onClick hinzufügen:
onClick={() => setSelectedProduct(product.raw_name)}
// className ergänzen: "cursor-pointer hover:bg-muted/50"
```

### Kategorien-Drill-Down
```ts
// In PROJ-38-Card (statistik-dashboard.tsx):
onClick={() => router.push(`/produkte?category=${encodeURIComponent(category)}`)}
// className: "cursor-pointer hover:bg-muted/50"
```

## Umsetzungsreihenfolge

1. **Monatstrend-Balken → Bon-Liste** (einfachste Änderung, zwei Dateien)
2. **Top-Produkte → PriceChartSheet** (eine Datei, nur statistik-dashboard)
3. **Kategorien-Drill-Down** (bereits Teil von PROJ-38-Card, kein Extra-Aufwand)

## Visuelles Feedback (US4)

Alle anklickbaren Elemente brauchen:
- Recharts `<Bar>`: `style={{ cursor: 'pointer' }}` auf dem Bar-Element
- Tabellenzeilen: `className="cursor-pointer hover:bg-muted/50 transition-colors"`

## Nicht-lesen-Liste

- `src/app/api/statistiken/` — API-Routes werden nicht geändert
- `src/lib/` — keine Lib-Änderungen
- `src/app/api/produkte/` — nicht betroffen
- `src/components/product-list.tsx` — nicht betroffen (PriceChartSheet wird direkt in statistik-dashboard eingebunden)
- `src/components/ui/` — shadcn-Primitives, nicht ändern

## Tests

### Bestehende Tests
| Datei | Aktion |
|-------|--------|
| *(keine relevanten Unit-Tests für Statistik-Dashboard)* | — |

### Neue Tests
| Datei | Typ | Inhalt |
|-------|-----|--------|
| `tests/statistik-drill-down.spec.ts` | E2E (Playwright) | Monatstrend-Click navigiert zur Bon-Liste mit korrektem Filter; Top-Produkte-Click öffnet Sheet |
