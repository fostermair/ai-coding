# PROJ-8: Produkt-Ausblendung für Statistiken

## Status: Approved
**Created:** 2026-04-11
**Last Updated:** 2026-04-11

## Dependencies
- Requires: PROJ-1 (eBon Import & Parser) – Produktdaten müssen vorhanden sein
- Requires: PROJ-3 (Produktdatenbank & Alias-Verwaltung) – Produktliste als Ausgangspunkt
- Requires: PROJ-5 (Statistik-Dashboard) – betroffene Statistiken

## User Stories
- Als Nutzer möchte ich ein Produkt für die Statistiken deaktivieren können, damit Pfandartikel und Leergut meine Ausgabenanalyse nicht verfälschen
- Als Nutzer möchte ich deaktivierte Produkte in der Produktliste klar erkennbar sehen, damit ich den Überblick behalte
- Als Nutzer möchte ich ein deaktiviertes Produkt wieder aktivieren können, damit ich Fehler korrigieren kann
- Als Nutzer möchte ich beim Importieren von Bons sehen, dass Pfandartikel bereits ausgeblendet sind

## Acceptance Criteria

### Deaktivierungs-Toggle in Produktliste
- [ ] Jedes Produkt in der Produktliste hat einen Toggle/Schalter "In Statistiken anzeigen" (standardmäßig aktiv)
- [ ] Deaktivierte Produkte werden in der Produktliste visuell abgedimmt/durchgestrichen dargestellt
- [ ] Status-Änderung wird sofort per API gespeichert (optimistic update)
- [ ] Filterbar: Produktliste kann nach Status gefiltert werden (Alle / Aktiv / Ausgeblendet)

### Auswirkung auf Statistiken (PROJ-5)
- [ ] Deaktivierte Produkte fließen NICHT in folgende Statistiken ein:
  - Monatliche Ausgaben (Gesamtausgaben)
  - Top-10 Produkte (Häufigkeit & Ausgaben)
  - MwSt-Kategorien-Aufteilung
- [ ] Deaktivierte Produkte fließen NICHT in den Preisentwicklungs-Chart (PROJ-4) Autocomplete ein
- [ ] Rabatt-Tracking ist NICHT betroffen (Rabatte können auch auf Pfandartikel angewendet werden — separates Tracking)
- [ ] Statistik-Dashboard zeigt einen Hinweis, wenn ausgeblendete Produkte existieren (z.B. "X Produkte ausgeblendet")

### Persistenz
- [ ] Ausblendungs-Status ist persistent in SQLite gespeichert
- [ ] Status überlebt App-Restart

## Edge Cases
- Produkt wird deaktiviert, während es aktuell im Statistik-Dashboard angezeigt wird → Dashboard refresht beim nächsten Load
- Alle Produkte werden deaktiviert → Statistiken zeigen Leer-Zustand mit passendem Hinweis
- Neues Produkt aus Bon-Import → standardmäßig aktiv (nicht automatisch deaktiviert)
- Produkt hat Alias gesetzt und wird dann deaktiviert → Alias bleibt erhalten
- Bon mit ausschließlich deaktivierten Produkten → Bon-Summe in PROJ-2 Bon-Übersicht bleibt unverändert (Bons werden nicht gefiltert, nur Statistiken)

## Technical Requirements
- Speicherung: Neue Spalte `excluded_from_stats BOOLEAN DEFAULT 0` in Tabelle `product_aliases` (oder separates Flag in `product_aliases`)
- API: `PUT /api/produkte/[name]/stats-toggle` oder Erweiterung des bestehenden PUT-Endpunkts
- Seite: Erweiterung von `src/components/product-list.tsx` (PROJ-3)
- Statistik-APIs müssen WHERE-Bedingung auf `excluded_from_stats = 0` erhalten

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### A) Component Structure

```
ProductList (src/components/product-list.tsx — bestehend, erweitert)
+-- Summary Bar (bestehend)
|   +-- "42 Produkte • 3 ausgeblendet" (neu: Hinweis wenn ausgeblendet > 0)
|
+-- Filter-Leiste (neu, neben bestehender Suche)
|   +-- Toggle-Buttons: Alle | Aktiv | Ausgeblendet
|
+-- Produkttabelle (bestehend, erweitert)
|   +-- Neue Spalte: "Statistiken" (Switch-Toggle, Ein/Aus)
|   +-- Ausgeblendete Zeilen: abgedimmte Darstellung (opacity-50)
|
StatistikDashboard (src/components/statistik-dashboard.tsx — bestehend)
+-- Info-Badge oben rechts (neu): "3 Produkte ausgeblendet" wenn > 0
    +-- Klick → Link zur Produktseite
```

### B) Data Model

Bestehende Tabelle `product_aliases` wird um eine Spalte erweitert:

| Spalte | Typ | Standard | Bedeutung |
|--------|-----|----------|-----------|
| raw_name | Text (PK) | — | Produktname vom Bon |
| alias | Text | null | Lesbarer Name |
| updated_at | Text | — | Zeitstempel letzte Änderung |
| excluded_from_stats | Boolean (0/1) | 0 (aktiv) | Neu: ausgeblendet ja/nein |

Kein neues Schema nötig — die Spalte wird beim App-Start automatisch zur bestehenden Tabelle hinzugefügt (`ALTER TABLE … ADD COLUMN IF NOT EXISTS`). Neue Produkte aus dem Bon-Import bekommen automatisch `excluded_from_stats = 0` (aktiv).

### C) Tech Decisions

| Entscheidung | Warum |
|---|---|
| **Spalte in `product_aliases`, keine neue Tabelle** | Das Flag gehört konzeptionell zur Produktkonfiguration — genau wie der Alias. Kein JOIN auf eine dritte Tabelle nötig. |
| **shadcn Switch-Komponente** | Bereits installiert. Switch ist das standard UX-Pattern für Ein/Aus-Einstellungen. Klarer als eine Checkbox, sofort verständlich. |
| **Eigener API-Endpunkt `PUT /api/produkte/[name]/exclude`** | Trennung von Alias (Text-Inhalt) und Ausblendung (boolean Flag). Klarer, testbarer, kein Multi-Purpose-Endpunkt. |
| **Filter serverseitig in SQL** | Alle Statistiken holen Daten aus dem Backend — die Filterbedingung muss dort sitzen. Frontend-Filter würden nur die Anzeige, nicht die Berechnungen korrigieren. |
| **Optimistic Update im Frontend** | Switch-Toggle fühlt sich sofort an. Bei API-Fehler wird der alte Zustand wiederhergestellt und eine Fehlermeldung angezeigt. |
| **Filterleiste als Query-Parameter** | Konsistent mit bestehendem `?sort=` Pattern. Server liefert nur gefilterte Produkte. |

### D) API-Endpunkte

| Endpunkt | Änderung |
|---|---|
| `PUT /api/produkte/[name]/exclude` | Neu: Body `{ excluded: true/false }` — setzt `excluded_from_stats` |
| `GET /api/produkte?filter=all/active/excluded` | Erweitert: neuer `filter`-Parameter + `excluded_from_stats` Feld in Response |
| `GET /api/statistiken/monatlich` | Erweitert: WHERE `excluded_from_stats = 0` in JOIN |
| `GET /api/statistiken/top-produkte` | Erweitert: WHERE `excluded_from_stats = 0` |
| `GET /api/statistiken/mwst` | Erweitert: WHERE `excluded_from_stats = 0` |
| `GET /api/statistiken/rabatte` | Unverändert (Rabatt-Tracking bleibt vollständig) |

### E) Dependencies

Keine neuen Pakete — alles bereits vorhanden:
- shadcn Switch — bereits installiert (`src/components/ui/switch.tsx`)
- better-sqlite3 — bereits installiert
- lucide-react — bereits installiert

## Implementation Notes (Backend)

### What was built
- **`src/lib/db.ts`** — Migration: `excluded_from_stats INTEGER NOT NULL DEFAULT 0` Spalte wird beim App-Start automatisch zu `product_aliases` hinzugefügt (`PRAGMA table_info` + `ALTER TABLE ADD COLUMN IF NOT EXISTS`)
- **`src/app/api/produkte/route.ts`** (erweitert):
  - Neuer Query-Parameter `?filter=all|active|excluded`
  - `excluded_from_stats` wird per `COALESCE(pa.excluded_from_stats, 0)` in der Produktliste mitgeliefert (als Boolean normalisiert)
  - Neue `excluded_count` in der Response (immer ungefiltert)
  - `NULLIF(pa.alias, '')` stellt sicher dass leere Alias-Strings als `null` behandelt werden
- **`src/app/api/produkte/[name]/exclude/route.ts`** (neu):
  - `PUT` mit Body `{ excluded: boolean }` — validiert Typ, prüft Produkt-Existenz, Upsert mit `ON CONFLICT` (Alias bleibt erhalten)
- **`src/app/api/produkte/[name]/alias/route.ts`** (erweitert):
  - `DELETE` löscht nicht mehr die ganze Zeile wenn `excluded_from_stats = 1` gesetzt ist — stattdessen wird nur `alias = ''` gesetzt (Flag bleibt erhalten)
- **`src/app/api/statistiken/monatlich/route.ts`** (erweitert):
  - Aggregiert jetzt aus `receipt_items` statt `receipts.total_amount_cents`, mit `LEFT JOIN product_aliases` und `COALESCE(pa.excluded_from_stats, 0) = 0` Filter
- **`src/app/api/statistiken/top-produkte/route.ts`** (erweitert):
  - `COALESCE(pa.excluded_from_stats, 0) = 0` Filter hinzugefügt
- **`src/app/api/statistiken/mwst/route.ts`** (erweitert):
  - `COALESCE(pa.excluded_from_stats, 0) = 0` Filter hinzugefügt
- **`src/components/price-chart-sheet.tsx`** (erweitert):
  - Autocomplete-Fetch nutzt jetzt `?filter=active` — ausgeblendete Produkte erscheinen nicht im Preis-Chart Suche

### Deviations from spec
- Rabatt-API (`/api/statistiken/rabatte`) bleibt bewusst ungefiltert — Spec: "Rabatt-Tracking ist NICHT betroffen"
- Monatliche Ausgaben werden nun aus `receipt_items` statt `receipts.total_amount_cents` aggregiert — präziser, da nur tatsächliche Produktpositionen (ohne Pfand) gezählt werden

## Implementation Notes (Frontend)

### What was built
- **`src/components/product-list.tsx`** (erweitert):
  - `excluded_from_stats: boolean` zum `Product`-Interface hinzugefügt
  - `excluded_count: number` zur `ProdukteResponse` hinzugefügt
  - Neuer `filter`-State (`all` / `active` / `excluded`) mit Filter-Buttons in der Toolbar
  - Neue Tabellenspalte "Statistiken" mit shadcn Switch-Toggle (Ein = aktiv, Aus = ausgeblendet)
  - Optimistic update beim Toggle: sofortiges UI-Feedback, Rückgängig bei API-Fehler
  - Ausgeblendete Zeilen: `opacity-50` + `line-through` auf Rohname
  - Summary-Bar zeigt "X ausgeblendet" wenn `excluded_count > 0`
  - Ruft `PUT /api/produkte/[name]/exclude` auf (noch nicht implementiert — Backend folgt)
  - Filter wird als `?filter=active/excluded` Query-Parameter an `/api/produkte` übergeben
- **`src/components/statistik-dashboard.tsx`** (erweitert):
  - Zusätzlicher paralleler Fetch: `GET /api/produkte?filter=excluded`
  - `excludedCount`-State speichert Anzahl ausgeblendeter Produkte
  - Info-Link mit EyeOff-Icon erscheint oberhalb Zeitraum-Filter wenn `excludedCount > 0`
  - Link führt zu `/produkte?filter=excluded` (Produktverwaltung)

### Deviations from spec
- Keine. Alle Acceptance Criteria der Frontend-Änderungen umgesetzt.

## QA Test Results

**Date:** 2026-04-11
**Tester:** QA Engineer (automated)

### Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Jedes Produkt hat einen Statistics-Switch-Toggle | PASS |
| 2 | Switch ist standardmäßig aktiv (checked) | PASS |
| 3 | Toggle-Off dimmt die Produktzeile (opacity-50) | PASS |
| 4 | Status-Änderung wird per API gespeichert (PUT /api/produkte/[name]/exclude) | PASS |
| 5 | Optimistic update: Zeile sofort gedimmt nach Klick | PASS |
| 6 | Re-Aktivierung stellt aktiven Status wieder her | PASS |
| 7 | Filter-Buttons Alle / Aktiv / Ausgeblendet sichtbar | PASS |
| 8 | Filter "Ausgeblendet" zeigt nur ausgeblendete Produkte | PASS |
| 9 | Filter "Aktiv" blendet ausgeblendete Produkte aus | PASS |
| 10 | Filter "Ausgeblendet" Empty-State zeigt Hinweis | PASS |
| 11 | Summary-Bar zeigt "X ausgeblendet" bei excluded_count > 0 | PASS |
| 12 | Summary-Bar zeigt keinen Hinweis wenn keine Produkte ausgeblendet | PASS |
| 13 | GET /api/produkte gibt excluded_from_stats und excluded_count zurück | PASS |
| 14 | filter=active schließt ausgeblendete Produkte aus | PASS |
| 15 | filter=excluded gibt nur ausgeblendete Produkte zurück | PASS |
| 16 | Ungültiger filter-Parameter gibt 400 zurück | PASS |
| 17 | Monatliche Ausgaben-Statistik exkludiert ausgeblendete Produkte | PASS |
| 18 | Top-Produkte-Statistik exkludiert ausgeblendete Produkte | PASS |
| 19 | MwSt-Statistik exkludiert ausgeblendete Produkte | PASS |
| 20 | Rabatt-API bleibt unverändert (Spec: nicht betroffen) | PASS |
| 21 | Preis-Chart Autocomplete zeigt nur aktive Produkte | PASS |
| 22 | Statistik-Dashboard zeigt Ausgeblendet-Hinweis wenn > 0 | PASS |
| 23 | Statistik-Dashboard zeigt keinen Hinweis wenn 0 ausgeblendet | PASS |
| 24 | Ausblendungs-Status überlebt Page-Reload (Persistenz) | PASS |
| 25 | Alias bleibt erhalten wenn Produkt ausgeblendet wird | PASS |
| 26 | Neue Produkte aus Import sind standardmäßig aktiv | PASS |
| 27 | Bon-Detailansicht bleibt von Ausblendung unberührt | PASS |
| 28 | Mobile: Produktseite zeigt Filter-Buttons | PASS |
| 29 | Mobile: Switch-Spalte ausgeblendet (sm breakpoint) | PASS |

**Total: 29/29 Acceptance Criteria PASSED**

### Bugs Found

None.

### Security Audit

- Input validation: `excluded` field type-checked (only boolean accepted, others → 400)
- Product existence checked before update (unknown products → 404)
- No XSS vectors: product names are not rendered as HTML
- No SQL injection: all queries use parameterized statements

No security issues found.

### Automated Tests

**Unit/Integration tests (Vitest):** `src/app/api/produkte/produkte-exclude.test.ts`
- 8 tests — all PASS

**E2E tests (Playwright):** `tests/PROJ-8-produkt-statistik-ausblendung.spec.ts`
- 59 tests passed, 7 skipped (Mobile Safari switch-column hidden below sm breakpoint)

### Notes

- `playwright.config.ts` changed from `fullyParallel: true` (no worker limit) to `workers: 1` — SQLite is shared between browser projects; parallel Chromium + Mobile Safari workers caused non-deterministic state conflicts on exclusion-modifying tests
- Monatliche Ausgaben werden aus `receipt_items` statt `receipts.total_amount_cents` aggregiert (bewusste Abweichung, präziser)

### Production-Ready: YES

## Deployment
_To be added by /deploy_
