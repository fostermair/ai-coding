# PROJ-5: Statistik-Dashboard – Context Map

## Relevante Dateien

| Datei | Aktion | Warum relevant |
|-------|--------|---|
| `src/components/statistik-dashboard.tsx` | Nur lesen | Hauptkomponente mit allen 4 Dashboard-Karten |
| `src/app/statistiken/page.tsx` | Nur lesen | Page rendert das StatistikDashboard |
| `src/app/api/statistiken/monatlich/route.ts` | Nur lesen | API für monatliche Ausgaben + Vormonatsvergleich |
| `src/app/api/statistiken/top-produkte/route.ts` | Nur lesen | API für Top-10 Produkte (Häufigste/Teuerste) |
| `src/app/api/statistiken/rabatte/route.ts` | Nur lesen | API für Rabatt-Tracking (Gesamt + monatlich + Top-5 Aktionen) |
| `src/app/api/statistiken/mwst/route.ts` | Nur lesen | API für MwSt-Kategorien (A=7%, B=19%) |
| `src/app/api/statistiken/einkaufskorb-vergleich/vorjahr/route.ts` | Nur lesen | API für Vorjahr-Vergleich (PROJ-16) |
| `src/app/api/statistiken/einkaufskorb-vergleich/voreinkauf/route.ts` | Nur lesen | API für Voreinkauf-Vergleich (PROJ-16) |
| `src/app/api/statistiken/inflation/route.ts` | Nur lesen | API für Preissteigerungs-/Vergünstigungs-Analyse (PROJ-9/PROJ-12) |
| `src/lib/format.ts` | Nur lesen | `formatEuro()` für Währungsformatierung |
| `src/components/price-chart-sheet.tsx` | Nur lesen | PriceChartSheet Modal für Preisentwicklung (PROJ-4) |

## Kritische Typen & Interfaces

### Dashboard State Types
```typescript
interface MonatlichData {
  monate: { monat: string; ausgaben_cents: number }[]
  vergleich: {
    aktuell_monat: string
    vormonat: string
    diff_cents: number
    diff_prozent: number
  } | null
}

interface TopProdukteData {
  produkte: {
    raw_name: string
    alias: string | null
    kaufhaeufigkeit: number
    gesamt_cents: number
  }[]
}

interface RabatteData {
  gesamt_ersparnis_cents: number
  monatlich: { monat: string; ersparnis_cents: number }[]
  top_aktionen: { beschreibung: string; anzahl: number; gesamt_cents: number }[]
}

interface MwstData {
  kategorien: {
    tax_code: string
    label: string
    gesamt_cents: number
    anteil_prozent: number
  }[]
  gesamt_cents: number
}

interface InflationData {
  teuer: { raw_name: string; alias: string | null; avg_vorjahr_cents: number; avg_aktuell_cents: number; aenderung_prozent: number }[]
  guenstiger: { raw_name: string; alias: string | null; avg_vorjahr_cents: number; avg_aktuell_cents: number; aenderung_prozent: number }[]
}

interface EinkaufsverbgleichResponse {
  kann_vergleichen: boolean
  reason?: string
  letzter_einkauf?: { datum: string; gesamt_cents: number }
  vergleich?: { datum: string; typ: "vorjahr" | "voreinkauf"; gesamt_cents: number }
  vergleich_stats?: {
    differenz_cents: number
    differenz_prozent: number
    produkte_gezaehlt: number
    produkte_gesamt: number
  }
}

type Zeitraum = "3" | "6" | "12" | "alle"
type TopSort = "frequency" | "spending" | "preissteigerung" | "verguenstigung"
```

## High-Level Architecture

### Component Structure (Visual)
```
/statistiken Page
└── StatistikDashboard
    ├── Dashboard Header + Zeitraum-Filter (3M | 6M | 12M | Alle)
    │
    └── Dashboard Grid (responsive: 1 Spalte mobil, 2 Spalten Desktop)
        ├── Karte 1: Monatliche Ausgaben
        │   ├── Month-over-month comparison badge
        │   └── Bar chart (recharts)
        │
        ├── Karte 2: Top-10 Produkte
        │   ├── Tabs: Häufigste | Teuerste | Preissteigerung | Vergünstigung
        │   ├── Rangliste mit Produktname, Häufigkeit/Ausgaben
        │   └── Klick → PriceChartSheet Modal (PROJ-4)
        │
        ├── Karte 3: Rabatt-Tracking
        │   ├── Gesamt-Ersparnis (große Zahl)
        │   ├── Monthly bar chart (recharts)
        │   └── Top-5 Rabattaktionen Liste
        │
        └── Karte 4: MwSt-Aufteilung
            ├── Donut chart (recharts) für A vs. B
            └── Legende mit absoluten Beträgen
```

### Data Flow
1. **Initiiales Laden:** `fetchAll()` ruft alle 4 Basis-APIs parallel auf (monatlich, rabatte, mwst, excluded_count, vorjahr_vergleich, voreinkauf_vergleich, inflation)
2. **Zeitraum-Filter:** Globaler Filter (`Zeitraum`) steuert alle Charts via Query-Parameter
3. **Top-10 Tabs:** 
   - "Häufigste" und "Teuerste" rufen `/api/statistiken/top-produkte?sort=frequency|spending` auf
   - "Preissteigerung" und "Vergünstigung" zeigen Daten aus der `inflation` API
4. **Lokale State:** React `useState` für UI-Zustand (Loading, Charts, ausgewählter Tab)
5. **Datenbank:** SQLite aggregiert aus `receipts`, `receipt_items`, `item_discounts` (keine Änderung an Schema nötig)

### Key Dependencies
| Package | Version | Nutzen |
|---------|---------|--------|
| `recharts` | ^2.x | Bar, Line, Pie Charts mit Tooltips + Responsivität |
| shadcn/ui | Card, Tabs, Skeleton, Badge | UI-Komponenten |
| `lucide-react` | Icons für Dashboard-Karten |

## API Endpoints

| Endpunkt | Query-Params | Response | Genutzt für |
|----------|--------------|----------|----------|
| `GET /api/statistiken/monatlich` | `?monate=3\|6\|12` | `MonatlichData` (monate + vergleich) | Monatliche Ausgaben Chart + Badge |
| `GET /api/statistiken/top-produkte` | `?monate=3\|6\|12&sort=frequency\|spending` | `TopProdukteData` | Top-10 Tabs (Häufigste/Teuerste) |
| `GET /api/statistiken/rabatte` | `?monate=3\|6\|12` | `RabatteData` | Rabatt-Tracking Karte |
| `GET /api/statistiken/mwst` | `?monate=3\|6\|12` | `MwstData` | MwSt-Donut Chart |
| `GET /api/statistiken/inflation` | `?monate=3\|6\|12` | `InflationData` (teuer/guenstiger) | Top-10 Tabs: Preissteigerung/Vergünstigung |
| `GET /api/statistiken/einkaufskorb-vergleich/vorjahr` | — | `EinkaufsverbgleichResponse` | Einkaufskorb-Vergleich (PROJ-16) |
| `GET /api/statistiken/einkaufskorb-vergleich/voreinkauf` | — | `EinkaufsverbgleichResponse` | Einkaufskorb-Vergleich (PROJ-16) |
| `GET /api/produkte?filter=excluded` | — | Excluded count | Empty-State Logik |

## Nicht-Lesen-Liste

Diese Dateien sind NOT relevant und sollten NICHT gelesen werden:
- `src/components/` — Alle anderen Komponenten (außer `price-chart-sheet.tsx` und `statistik-dashboard.tsx`)
- `src/app/import/`, `src/app/bon/`, `src/app/produkte/` — Andere Feature-Pages
- `src/app/api/bons/`, `src/app/api/import/` — APIs für andere Features
- `src/lib/db.ts` — Datenbankinitialisierung (Details nicht nötig)
- Tests für PROJ-1, PROJ-2, PROJ-3, etc. — Nur PROJ-5 Tests lesen

## Tests

### Bestehende Tests (lesen + optional anpassen)

| Datei | Typ | Aktion | Warum relevant |
|-------|-----|--------|---|
| `tests/PROJ-5-statistik-dashboard.spec.ts` | E2E (Playwright) | Regression prüfen | Tests alle AC + Edge Cases + Security |

**Tests prüfen:**
- ✅ Alle 4 API-Endpunkte liefern korrekte Struktur
- ✅ Zeitraum-Filter funktioniert (3M, 6M, 12M, Alle)
- ✅ Top-10 Tabs wechseln korrekt
- ✅ Charts rendern auf Desktop + Mobile
- ✅ PriceChartSheet öffnet sich bei Klick
- ✅ Security: malicious Parameter werden gefiltert
- ✅ Empty state wenn keine Bons

### Neue Tests

Keine neuen Tests nötig. Feature ist bereits implementiert und vollständig getestet.
- E2E Tests: 66 Tests bestanden (AC + Edge Cases + Security)
- Unit Tests: 0 nötig (keine neuen Hooks/Utils)

## Tech Decisions (bereits implementiert)

| Entscheidung | Warum |
|---|---|
| **Dashboard-Grid mit 4 Karten** | Alle KPIs auf einen Blick, kein Seitenumbruch nötig. Responsive: 1 Spalte mobil, 2 Spalten Desktop. |
| **Globaler Zeitraum-Filter** | Ein Filter steuert alle Charts gleichzeitig → konsistente Daten-Ansicht. |
| **Recharts für alle Charts** | Unterstützt Bar, Line, Pie, ist responsive, bereits für PROJ-4 installiert. |
| **4 separate API-Endpunkte** | Jede Query ist einfach und lädt parallel → schneller Seitenaufbau. |
| **Top-10 Tabs (4 Optionen)** | Häufigste/Teuerste (direkt), Preissteigerung/Vergünstigung (aus inflation API). Tabs sparen Platz. |
| **PriceChartSheet Modal** | Wiederverwendung aus PROJ-4 — keine doppelte UI-Logik. |

## Feature Status
- **Status:** Approved (Implementation + QA bestanden)
- **Frontend:** ✅ Vollständig implementiert
- **Backend:** ✅ Alle 4 APIs implementiert
- **Tests:** ✅ 66 E2E Tests bestanden, keine Regressionen
- **Nächster Schritt:** Deployment (wenn `/deploy` aufgerufen wird)

---
*Diese Context Map wurde während der Architektur-Phase automatisch erstellt. Sie führt Downstream-Agents (Frontend, Backend, QA) durch die Feature mit minimalem zusätzlichem Kontext.*
