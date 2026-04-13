# PROJ-14: Saisonale Artikel-Markierung — Context Map

## Relevante Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/lib/db.ts` | Erweitern | DB-Migration für `seasonal` Spalte hinzufügen |
| `src/app/api/produkte/route.ts` | Erweitern | `seasonal` zu SELECT hinzufügen, in Antwort normalisieren |
| `src/app/api/produkte/[name]/saison/route.ts` | Neu erstellen | PATCH (toggle) und GET (Monatsdurchschnitte) |
| `src/components/product-list.tsx` | Erweitern | Leaf-Icon, Saison-Spalte, toggle-Aktion |
| `src/components/price-chart-sheet.tsx` | Erweitern | Saison-Datenabruf + SeasonCalendar inline-Komponente |

## Nicht-lesen-Liste
- `src/app/` (außer `src/app/api/produkte/*` und product-list context)
- `src/lib/` (außer `src/lib/db.ts`)
- `src/hooks/` (keine neuen Hooks nötig)
- Test-Dateien bis auf templates

## Kritische Typen & Interfaces

### Product Interface (aktuell aus product-list.tsx)
```typescript
interface Product {
  raw_name: string;
  alias?: string;
  item_count: number;
  first_purchase: string;
  latest_purchase: string;
  avg_price: number;
  min_price: number;
  max_price: number;
  excluded_from_stats: boolean;
  
  // NEU für PROJ-14:
  seasonal?: boolean;
  current_month_season?: "günstig" | "normal" | "teuer" | null;
}
```

### Season Month Data (von GET /api/produkte/[name]/saison)
```typescript
interface SeasonMonth {
  monat: number;           // 1-12
  avg_preis_cents: number;
  kaufanzahl: number;
}

interface SeasonResponse {
  raw_name: string;
  seasonal: boolean;
  monate: SeasonMonth[];
  warning?: string;  // optional: "Basiert auf wenigen Datenpunkten" oder "Zu wenig Daten"
}
```

### Season Classification (berechnet im Frontend)
```typescript
type SeasonCategory = "günstig" | "normal" | "teuer" | null;

interface ClassifiedMonth {
  monat: number;
  avg_preis_cents: number;
  kategorie: SeasonCategory;
  kaufanzahl: number;
  tooltip: string; // "Ø Preis: 1,49 €" oder "Keine Daten"
}
```

## Tests

### Bestehende Tests (zum Referenzieren)
- `src/app/api/produkte/produkte-exclude.test.ts` — Template für PATCH-Handler
- `tests/product-list.e2e.ts` — Produktlisten-E2E-Tests (ggf. erweitern)
- `tests/price-chart-sheet.e2e.ts` — Price-Chart E2E-Tests (ggf. erweitern)

### Neue Tests zu erstellen
- **`src/app/api/produkte/produkte-saison.test.ts`** (nach Backend-Phase)
  - Toggle seasonal flag
  - Month aggregates mit verschiedenen Datenmengen
  - Upsert mit erhaltenen Feldern (alias, excluded_from_stats)
  
- **`src/app/api/produkte/produkte-saison-classification.test.ts`** (nach Backend-Phase)
  - Klassifizierung: Günstig / Normal / Teuer
  - Edge Cases: flat prices, single month, insufficient data

- **`tests/seasonal-marker.e2e.ts`** (nach Frontend)
  - UI: Leaf-Icon und Saison-Spalte in Produktliste
  - Toggle action: seasonal flag setzt/entfernt
  - Saison-Kalender in Detail-Ansicht (nur für saisonale Produkte)

## Design Notes
- **Saisonkalender inline in price-chart-sheet.tsx** — nicht als separate Komponente, folgt dem Muster von ChartTooltip etc.
- **Klassifizierung nur im Frontend** — API liefert nur Monatsdurchschnitte, JS berechnet min/median-basierte Kategorien
- **Datenabruf on-sheet-open** — paralleles Laden mit bestehenden preise/preisentwicklung Fetches
- **Saison-Spalte responsive** — `hidden sm:table-cell` für kleine Bildschirme, bleibt am Ende der Tabelle
