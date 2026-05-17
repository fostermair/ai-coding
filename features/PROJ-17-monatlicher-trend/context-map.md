# PROJ-17: Context Map — Monatlicher Ausgaben-Langzeittrend

**Date:** 2026-05-17  
**Purpose:** Backend and frontend implementation guide for long-term monthly expense trend visualization

---

## Architektur-Übersicht

### Datenfluss
1. Frontend loads `/api/statistiken/monatlich` (with NO `monate` parameter to get ALL months)
2. Backend queries all monthly totals, fills gaps with 0 EUR
3. Frontend renders line/bar chart with all months + average line
4. Separate card in dashboard (NOT filtered by the existing 3M/6M/12M buttons)

### Komponenten-Hierarchie
```
StatistikDashboard
├── Zeitraum-Filter (3M / 6M / 12M / Alle)
├── Grid (2 Spalten)
│   ├── Monatliche Ausgaben (existing) - respects filter
│   ├── Top-10 Produkte (existing) - respects filter
│   ├── Rabatt-Tracking (existing) - respects filter
│   ├── MwSt-Aufteilung (existing) - respects filter
│   └── [NEW] Monatlicher Ausgaben-Langzeittrend
│       ├── LineChart / BarChart (Recharts)
│       ├── Average line (computed on client)
│       └── X-axis: All months in format "Jan 24", "Feb 24", etc.
```

---

## Relevante Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/app/api/statistiken/monatlich/route.ts` | Nur lesen | Bestehendes API, Datenquelle für alle Monate |
| `src/components/statistik-dashboard.tsx` | Erweitern | Neue Karte hinzufügen für Langzeittrend |
| `src/lib/format.ts` | Nur lesen | `formatEuro()` Funktion für Ausgaben |

---

## Kritische Typen & Interfaces

### Monatlich-Daten (aus existierendem API)
```typescript
interface MonatlichData {
  monate: {
    monat: string              // "2024-01", "2024-02", etc.
    ausgaben_cents: number     // Total in cents
  }[]
  vergleich: {
    aktuell_monat: string
    vormonat: string
    diff_cents: number
    diff_prozent: number
  } | null
}
```

### Chart-Ready Format (für Recharts)
```typescript
interface MonthChartDataPoint {
  monat: string              // "2024-01"
  ausgaben_cents: number
  euro: number              // ausgaben_cents / 100
  label: string             // "Jan 24"
}
```

---

## Daten-Modell (Backend)

**Keine neuen Tabellen oder Migrationen nötig.**

Das existierende API `/api/statistiken/monatlich` wird wiederverwendet:
- Zählt alle Transaktionen pro Monat (gefiltert nach: product/concession, positive Preis, nicht ausgeblendet)
- Gibt Monate in ASC Reihenfolge zurück
- **Wichtig:** Lücken (Monate ohne Einkäufe) sind NICHT in der Response enthalten
- **Client-side:** Monate mit Lücken müssen auf 0 EUR gesetzt werden

### Gap-Filling Logik (Client-Side)
```
Input: Monate [2024-01, 2024-02, 2024-04] (03 fehlt)
Output: [2024-01, 2024-02, 2024-03 (0€), 2024-04]
```

---

## Tech-Entscheidungen & Begründungen

| Entscheidung | Alternative | Warum diese |
|---|---|---|
| **Client-Side Gap-Filling** | DB-Side (SQL) | Einfacher, weniger komplexe SQL, kein neuer API-Endpoint nötig |
| **Recharts LineChart** | BarChart | Linien zeigen Trend besser; mit Bereich unter der Kurve optional |
| **Average-Line (horizontal)** | Average-Badge oben | Visuell klarer, zeigt Abweichungen intuitiv |
| **Separate Karte** | Inline mit Monatliche Ausgaben | Spec-Anforderung: unabhängig von 3M/6M/12M Filtern |
| **Keine Pagination** | Lazy-load für viele Monate | Annahme: < 36 Monate realistisch, X-Achse verwaltet Label-Frequency |

---

## API-Änderungen

### GET `/api/statistiken/monatlich`
**Kein neuer Endpoint nötig.**

Bestehender Endpoint wird wiederverwendet. Ohne `?monate=X` Parameter gibt er alle Monate zurück:
```
GET /api/statistiken/monatlich
→ { monate: [...all months], vergleich: null }
```

---

## Dependencies (NPM-Packages)

Alle bereits installiert:
- `recharts` — LineChart, BarChart, ResponsiveContainer
- `react` — State Management
- `tailwindcss` — Styling

**Keine neuen Packages nötig.**

---

## Tests

### Bestehende Tests
| Datei | Aktion | Warum |
|---|---|---|
| (keine) | — | Dashboard-Tests existieren nicht; E2E coverage ausreichend |

### Neue Tests
| Datei | Typ | Zweck |
|---|---|---|
| `tests/e2e/monatlicher-trend.spec.ts` | E2E (Playwright) | Verifies chart renders with all months, average line visible, labels correct |

---

## Nicht-lesen-Liste

- `src/components/ui/` — Standard shadcn components
- `src/app/api/produkte/` — Produkt-APIs (nicht relevant)
- `src/app/api/bons/` — Bon-APIs (nicht relevant)
- `tests/` — Andere Test-Dateien (nicht relevant für diese Feature)

---

## Akzeptanz-Kriterien (zur Validierung)

- [ ] Linien- oder Balkendiagramm zeigt alle verfügbaren Monate (kein Zeitfilter)
- [ ] X-Achse korrekt formatiert: "Jan 24", "Feb 24", etc.
- [ ] Y-Achse: EUR in lesbarer Schrift
- [ ] Monate ohne Einkäufe zeigen 0 EUR (keine Gap in der Kurve)
- [ ] Neue Karte ist unabhängig von 3M/6M/12M Filtern
- [ ] Durchschnittswert wird als horizontale Linie oder Kennzahl angezeigt
- [ ] Performance: < 300ms
- [ ] Edge Case: 1 Monat Daten → zeigt einen Punkt
- [ ] Edge Case: 36+ Monate → X-Achse lesbar (jede 3. oder 4. Beschriftung)
