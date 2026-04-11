# PROJ-9: Preissteigerungs-Analyse

## Status: In Progress
**Created:** 2026-04-11
**Last Updated:** 2026-04-11

## Dependencies
- Requires: PROJ-1 (eBon Import & Parser) – Preisdaten müssen vorhanden sein
- Requires: PROJ-3 (Produktdatenbank & Alias-Verwaltung) – Alias-Namen für lesbare Darstellung
- Requires: PROJ-4 (Preisentwicklungs-Chart) – Analyse wird im bestehenden Chart-Sheet angezeigt

## User Stories
- Als Nutzer möchte ich die Gesamtpreissteigerung eines Produkts vom ersten bis zum letzten Kauf sehen, damit ich verstehe wie stark sich der Preis verändert hat
- Als Nutzer möchte ich die Preissteigerung pro Jahr (Jahr-zu-Jahr) sehen, damit ich inflationsbedingte Veränderungen erkennen kann
- Als Nutzer möchte ich sofort sehen, ob ein Produkt teurer oder günstiger geworden ist, ohne den Chart genau zu analysieren

## Acceptance Criteria

### Gesamt-Preissteigerung (Erster → Letzter Kauf)
- [ ] Im Preis-Chart-Sheet (PROJ-4) wird unterhalb der bestehenden Preis-Zusammenfassung eine neue Sektion "Preisentwicklung" angezeigt
- [ ] Darstellung: "Erster Kauf: X,XX € (Datum) → Letzter Kauf: Y,YY € (Datum)"
- [ ] Prozentuale Gesamtveränderung sichtbar (z.B. "+18,5% seit erstem Kauf")
- [ ] Farbcodierung: Grün bei Preissenkung, Rot bei Preissteigerung, Grau bei unverändertem Preis
- [ ] Nur sichtbar wenn mindestens 2 verschiedene Kaufdaten vorliegen

### Jahr-zu-Jahr-Vergleich
- [ ] Tabelle mit einer Zeile pro Kalenderjahr in dem das Produkt gekauft wurde
- [ ] Spalten: Jahr | Ø Preis im Jahr | Veränderung zum Vorjahr (absolut + %)
- [ ] Erste Jahres-Zeile zeigt keine Vorjahres-Veränderung (kein Vergleich möglich)
- [ ] Nur sichtbar wenn Käufe in mindestens 2 verschiedenen Kalenderjahren vorliegen
- [ ] Wenn Käufe nur in einem Jahr → Hinweis "Noch keine jahresübergreifenden Daten"

### Berechnung
- [ ] Basis ist immer der Einzelpreis (unit_price_cents) — konsistent mit bestehendem Chart
- [ ] Rabattierte Käufe fließen MIT ein (tatsächlich gezahlter Preis)
- [ ] Leergut/Pfand (Preis ≤ 0) wird ausgeschlossen — konsistent mit PROJ-4

## Edge Cases
- Nur 1 Kauf → kein Abschnitt "Preisentwicklung" angezeigt (bestehender Hinweis aus PROJ-4 reicht)
- Alle Käufe im selben Jahr → Jahr-zu-Jahr-Tabelle ausgeblendet, Hinweis wird angezeigt
- Preis ist in allen Käufen identisch → Veränderung zeigt "0,00 € (0%)" in neutralem Grau
- Produkt wurde lange nicht gekauft (Lücke von >1 Jahr) → fehlende Jahre werden NICHT als Zeile angezeigt (nur Jahre mit tatsächlichen Käufen)
- Sehr viele Jahre (10+) → Tabelle ist scrollbar

## Technical Requirements
- Erweiterung der bestehenden API: `GET /api/produkte/[name]/preise` gibt bereits alle Kaufdaten zurück — Berechnung kann im Frontend oder in einer neuen API erfolgen
- Empfehlung: Neue API `GET /api/produkte/[name]/preisentwicklung` für aggregierte Jahres-Statistiken
- Anpassung von: `src/components/price-chart-sheet.tsx` (neuer Abschnitt unterhalb Chart-Zusammenfassung)

---
<!-- Sections below are added by subsequent skills -->

## Implementation Notes
- Frontend extended `src/components/price-chart-sheet.tsx`:
  - Added `PreisentwicklungData` + `JahrStat` interfaces
  - Added `preisentwicklung` state + `fetchPreisentwicklung` callback
  - Added "Preisentwicklung" section below summary stats (guarded by `chartData.length >= 2`)
  - Gesamt-Veränderung card: erster/letzter Kauf mit absoluter + prozentualer Änderung, farbcodiert
  - Jahr-zu-Jahr Tabelle (shadcn Table): nur sichtbar wenn `jahre.length >= 2`, sonst Hinweis-Text
  - Fetch wired to `/api/produkte/[name]/preisentwicklung` — API to be built in `/backend`

## Tech Design (Solution Architect)

### Component Structure

```
PriceChartSheet (existing — extended)
  ├── ProductSwitcher              (existing)
  ├── LineChart + Legend           (existing)
  ├── Summary Stats (Min/Avg/Max)  (existing)
  └── PreisentwicklungSection      ← NEU (unterhalb Summary Stats)
        ├── GesamtVeraenderungCard    (erster→letzter Kauf + %)
        └── JahrVergleichTabelle      (Jahr | Ø Preis | Veränderung YoY)
```

### Data Model (plain language)

**Gesamt-Veränderung** — berechnet aus erstem und letztem Kauf:
- Datum + Preis des ersten Kaufs
- Datum + Preis des letzten Kaufs
- Absolute Veränderung in Cent
- Prozentuale Veränderung

**Jahr-Statistiken** — eine Zeile pro Kalenderjahr mit Käufen:
- Kalenderjahr
- Durchschnittspreis aller Käufe in diesem Jahr (Cent)
- Veränderung zum Vorjahr (absolut + %) — `null` für das erste Jahr

### Tech Decisions

| Entscheidung | Wahl | Warum |
|---|---|---|
| Berechnung | Neue API `/preisentwicklung` | Server-seitige SQL-Aggregation; Jahres-Grouping ist im DB-Layer einfacher |
| UI-Platzierung | `price-chart-sheet.tsx` erweitern | Kein neues Sheet/Modal nötig; fließt natürlich unter Summary-Stats |
| Farbgebung | Tailwind: `text-red-600` / `text-green-600` / `text-gray-500` | Konsistent mit bestehendem Design |
| Tabelle | shadcn/ui `Table` | Bereits installiert |
| Bedingte Anzeige | Guard: `chartData.length >= 2` | API wird nur aufgerufen wenn Chart bereits sichtbar |

### New API: `GET /api/produkte/[name]/preisentwicklung`

Response shape:
```
{
  gesamt: {
    erster_kauf: { datum: string, preis_cents: number },
    letzter_kauf: { datum: string, preis_cents: number },
    veraenderung_cents: number,
    veraenderung_prozent: number
  },
  jahre: Array<{
    jahr: number,
    avg_preis_cents: number,
    veraenderung_cents: number | null,
    veraenderung_prozent: number | null
  }>
}
```

### Dependencies
Keine neuen Pakete — alles bereits installiert (shadcn/ui Table, Tailwind).

---

## Context Map

### Relevante Dateien

| Datei | Aktion | Warum relevant |
|---|---|---|
| `src/components/price-chart-sheet.tsx` | Erweitern | Bekommt neuen `PreisentwicklungSection`-Block unterhalb Summary Stats; neuer State + Fetch für `/preisentwicklung` |
| `src/app/api/produkte/[name]/preisentwicklung/route.ts` | Neu erstellen | Neue API: aggregiert Jahres-Statistiken + Gesamt-Veränderung aus DB |
| `src/app/api/produkte/[name]/preise/route.ts` | Nur lesen | Referenz: gleiche DB-Query-Basis (unit_price_cents > 0, item_type filter) |
| `src/lib/db.ts` | Nur lesen | DB-Client (`getDb()`), gleiche Pattern wie alle anderen API Routes |
| `src/lib/format.ts` | Nur lesen | `formatEuro`, `formatDate` — bereits in price-chart-sheet importiert |

### Kritische Typen & Interfaces

```typescript
// Bestehend in price-chart-sheet.tsx (Zeile 38-45):
interface PricePoint {
  datum: string
  zeit: string
  einzelpreis_cents: number
  rabatt_cents: number
  bon_nr: string
  markt: string
}

// Neu für PROJ-9 API Response:
interface PreisentwicklungData {
  gesamt: {
    erster_kauf: { datum: string; preis_cents: number }
    letzter_kauf: { datum: string; preis_cents: number }
    veraenderung_cents: number
    veraenderung_prozent: number
  }
  jahre: Array<{
    jahr: number
    avg_preis_cents: number
    veraenderung_cents: number | null
    veraenderung_prozent: number | null
  }>
}
```

### Nicht-lesen-Liste
- `src/components/ui/` — shadcn-Primitives, keine Änderungen
- `src/app/api/bons/` — nicht relevant
- `src/app/api/statistiken/` — nicht relevant
- `src/components/statistik-dashboard.tsx` — nicht relevant
- `src/components/product-list.tsx` — nicht relevant
- `tests/` — erst für /qa relevant

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
