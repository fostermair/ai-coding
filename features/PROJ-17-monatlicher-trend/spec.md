# PROJ-17: Monatlicher Ausgaben-Langzeittrend

## Status: Approved
**Created:** 2026-05-17
**Last Updated:** 2026-05-18
**QA Completed:** 2026-05-18
**Architecture:** ✅ Context map created (`context-map.md`)
**Frontend:** 🟡 Implemented (`src/components/statistik-dashboard.tsx`)
**Feature Folder:** `features/PROJ-17-monatlicher-trend/`

## Dependencies
- PROJ-1 (eBon Import & Parser)
- PROJ-5 (Statistik-Dashboard – bestehende monatliche Ansicht)

## User Stories
- Als Nutzer möchte ich alle meine Monatseinkäufe als Zeitreihe sehen (ohne Zeitfilter), damit ich langfristige Ausgaben-Trends über mehrere Jahre erkennen kann.
- Als Nutzer möchte ich im selben Chart erkennbare Muster erkennen (z.B. saisonale Unterschiede), damit ich meine Ausgabengewohnheiten besser verstehe.

## Acceptance Criteria
- [x] Ein Linien- oder Balkendiagramm zeigt alle verfügbaren Monate als Zeitreihe (ohne Kürzung durch einen Zeitfilter)
- [x] Die X-Achse zeigt Monat + Jahr (z.B. "Jan 24", "Feb 24", ..., "Mai 26")
- [x] Die Y-Achse zeigt Ausgaben in EUR
- [x] Monate ohne Einkäufe werden als 0 EUR dargestellt (kein Gap in der Kurve)
- [x] Das neue Diagramm ist vom bestehenden "Monatliche Ausgaben"-Widget (3M/6M/12M) getrennt – eigene Karte im Dashboard
- [x] Ein Durchschnittswert (über alle Monate) wird als horizontale Linie oder Kennzahl angezeigt

## Edge Cases
- Nur 1 Monat mit Daten → Diagramm zeigt einen einzelnen Datenpunkt (kein Fehler)
- Lücken von mehreren Monaten ohne Einkäufe → werden als 0 EUR gefüllt
- Sehr viele Monate (z.B. 36+) → X-Achse wird mit jeder 3. oder 4. Beschriftung lesbar gehalten

## Technical Requirements
- Performance: < 300ms
- Die bestehende `/api/statistiken/monatlich`-Route kann erweitert oder eine neue Route `GET /api/statistiken/monatlich-alle` kann erstellt werden
- Der Zeitfilter der bestehenden Karte wird NICHT verändert

## Implementation Notes

### Frontend (PROJ-17 Frontend)
**Completed:** 2026-05-18

**What was built:**
- New card "Monatlicher Ausgaben-Langzeittrend" added to StatistikDashboard
- Uses Recharts LineChart for visualization
- Client-side gap-filling: months without purchases show 0 EUR
- Average line displayed as horizontal dashed reference line with label
- Average value also shown as metric below chart
- X-axis intelligently spaced: shows all labels if ≤12 months, else shows every 3rd/4th label
- Card spans full width (md:col-span-2) and is independent of time filters

**Implementation Details:**
- Helper function `fillMonthGaps()` fills missing months with 0 EUR (YYYY-MM format)
- Helper function `calculateAverage()` computes average across all months
- Custom tooltip `LangzeitstrendTooltip` shows month and amount on hover
- Reuses existing `/api/statistiken/monatlich` endpoint (without `monate` parameter)
- Performance: API call + client-side processing < 300ms

**Files Modified:**
- `src/components/statistik-dashboard.tsx`: Added new card, helpers, imports
- Test file created: `tests/PROJ-17-monatlicher-trend.spec.ts`

### Backend
**Status:** ✅ Complete (2026-05-18)

The existing `/api/statistiken/monatlich` endpoint is reused without the `monate` parameter to fetch all months. No database changes or new API endpoints were created.

**E2E Tests:**
- Test file created: `tests/PROJ-17-monatlicher-trend.spec.ts`
- Covers:
  - API endpoint returns all months in correct format
  - API performance < 300ms
  - Chart renders with all months
  - X-axis formatting (Jan 24, Feb 24, etc.)
  - Y-axis shows EUR currency
  - Average line displayed with value
  - Card is independent of time filters
  - Edge cases (single month, gaps, 36+ months)
  - Responsive design (mobile 375px, tablet 768px, desktop 1440px)
