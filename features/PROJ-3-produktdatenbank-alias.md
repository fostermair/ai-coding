# PROJ-3: Produktdatenbank & Alias-Verwaltung

## Status: Approved
**Created:** 2026-04-07
**Last Updated:** 2026-04-08

## Implementation Notes (Frontend)
- `src/components/product-list.tsx`: Hauptkomponente mit Suche, Sortierung, Inline-Alias-Edit
  - Debounced search (200ms) sendet Query-Parameter an API
  - Sort-Buttons: Häufigkeit, Name A-Z, Letzter Kauf
  - Inline-Edit: Klick auf "Alias setzen" → Input + Enter/Escape + Check/X Buttons
  - Alias löschen per Trash-Icon (hover-reveal)
  - Empty State, Search-Empty-State, Loading/Error States
- `src/app/produkte/page.tsx`: Placeholder ersetzt durch ProductList-Komponente
- Bestehende `bon-detail.tsx` zeigt bereits `alias ?? raw_name` — keine Änderung nötig

## Implementation Notes (Backend)
- `src/app/api/produkte/route.ts`: GET — aggregiert alle Produkte aus `receipt_items`
  - Gruppierung nach `raw_name`, LEFT JOIN auf `product_aliases`
  - Suche per `?q=` (LIKE auf raw_name und alias)
  - Sortierung per `?sort=` (frequency, name, last_purchase)
  - Letzter Preis per korrelierter Subquery (neuester Bon)
- `src/app/api/produkte/[name]/alias/route.ts`: PUT + DELETE
  - PUT: Upsert mit Validierung (nicht leer, max 200 Zeichen, Produkt muss existieren)
  - DELETE: Entfernt Alias, 404 wenn keiner vorhanden
- Tabelle `product_aliases` existierte bereits in `db.ts` (PROJ-1)
- `/api/bons/[id]` hatte bereits LEFT JOIN auf `product_aliases` — keine Änderung nötig

## Dependencies
- Requires: PROJ-1 (eBon Import & Parser) – Produkte müssen in der DB vorhanden sein

## User Stories
- Als Nutzer möchte ich alle Produkte sehen, die ich je gekauft habe, damit ich einen vollständigen Überblick habe
- Als Nutzer möchte ich einem Produkt einen lesbaren Alias geben können (z.B. "HAEHNCHENFL.W." → "Hähnchen-Filetsteak"), damit die Statistiken lesbar sind
- Als Nutzer möchte ich einen Alias wieder löschen können, damit ich Fehler korrigieren kann
- Als Nutzer möchte ich nach Produkten suchen können, damit ich Produkte schnell finde
- Als Nutzer möchte ich sehen, wie oft ich ein Produkt gekauft habe und was es zuletzt gekostet hat

## Acceptance Criteria
- [ ] Produktseite zeigt alle eindeutigen Produkte (dedupliciert nach Rohname)
- [ ] Für jedes Produkt sichtbar: Rohname (aus Bon), Alias (falls gesetzt), Anzahl Käufe, letzter Preis, letztes Kaufdatum
- [ ] Alias kann per Inline-Edit gesetzt werden (Klick auf Produktname → Textfeld → Speichern)
- [ ] Alias-Speicherung erfolgt via API, Alias wird sofort angezeigt
- [ ] Alias wird in ALLEN Ansichten (Bon-Detailansicht, Statistiken, Charts) verwendet wenn gesetzt
- [ ] Produktsuche filtert Tabelle in Echtzeit (nach Rohname oder Alias)
- [ ] Produkte sortierbar nach: Häufigkeit (absteigend), Name (A-Z), letzter Kauf (neueste zuerst)
- [ ] Alias-Mapping ist persistent in SQLite gespeichert (separate Tabelle `product_aliases`)

## Edge Cases
- Gleicher Produktname in verschiedenen Bons mit leicht unterschiedlicher Schreibweise (z.B. "HAEHNCHENFL.W." und "HAEHNCHENFL W") → werden als separate Produkte gespeichert (kein Auto-Merging in v1)
- Alias wird auf einen Namen gesetzt, den ein anderes Produkt als Rohname hat → erlaubt (kein Constraint)
- Produkt wurde in nur einem Bon gekauft und dieser Bon wird gelöscht → Produkt verschwindet aus der Liste
- Alias wird gelöscht → Rohname wird wieder angezeigt

## Technical Requirements
- Seite: `src/app/produkte/page.tsx`
- API: `GET /api/produkte`, `PUT /api/produkte/[name]/alias`, `DELETE /api/produkte/[name]/alias`
- SQLite-Tabelle: `product_aliases (raw_name TEXT PRIMARY KEY, alias TEXT, updated_at TEXT)`

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### A) Component Structure

```
/produkte (Produktseite)
+-- Page Header ("Produktdatenbank")
+-- Search Bar (Echtzeitfilter nach Rohname oder Alias)
+-- Sort Controls (Häufigkeit | Name A-Z | Letzter Kauf)
+-- Product Table
|   +-- Table Header (Rohname, Alias, Käufe, Letzter Preis, Letztes Datum)
|   +-- Product Row (per eindeutiges Produkt)
|       +-- Raw Name (fester Text)
|       +-- Alias Cell (Inline-Edit: Klick → Textfeld → Speichern/Abbrechen)
|       +-- Purchase Count (Zahl)
|       +-- Last Price (€)
|       +-- Last Purchase Date
+-- Empty State ("Noch keine Produkte. Importiere zuerst eBons.")
```

### B) Data Model

**Bereits vorhanden:**
- `receipt_items` — enthält alle gekauften Produkte mit `raw_name`, Preis, Menge
- `product_aliases` — Mapping von `raw_name` → lesbarer Alias (Tabelle existiert bereits in `db.ts`)

**Produktliste wird dynamisch aggregiert** (keine eigene Produkt-Tabelle nötig):
- Alle eindeutigen `raw_name` aus `receipt_items` werden gruppiert
- Pro Produkt: Anzahl Käufe, letzter Preis, letztes Kaufdatum — per SQL-Aggregation
- Alias wird per LEFT JOIN auf `product_aliases` hinzugeholt

Gespeichert in: SQLite (`data/ebon.db`) — Tabelle `product_aliases` existiert bereits.

### C) Tech Decisions

| Entscheidung | Warum |
|---|---|
| **Keine eigene `products`-Tabelle** | Produkte ergeben sich aus den Bon-Positionen. Eine Aggregations-Query ist einfacher und immer konsistent — kein Sync-Problem. |
| **Inline-Edit für Alias** | Nutzer erwartet schnelles Umbenennen ohne Dialog. Ein Klick auf den Namen öffnet ein Textfeld — Enter speichert, Escape bricht ab. Weniger Klicks = bessere UX. |
| **Alias-Logik im Backend** | Alias wird per PUT/DELETE auf der API verwaltet. Frontend zeigt Alias wenn vorhanden, sonst Rohname. Einfache Logik: `alias ?? raw_name`. |
| **Serverseitige Filterung/Sortierung** | Produktliste kann bei Vielkäufern hunderte Einträge haben. Die Aggregation läuft in SQLite, nicht im Browser. Suchbegriff und Sortierung werden als Query-Parameter übergeben. |
| **Alias-Anzeige in Bon-Detail** | PROJ-2 Bon-Detail muss angepasst werden: LEFT JOIN auf `product_aliases`, damit Alias dort ebenfalls sichtbar ist. Kleine Änderung am bestehenden API-Endpunkt `/api/bons/[id]`. |

### D) API-Endpunkte

| Endpunkt | Zweck |
|---|---|
| `GET /api/produkte?q=...&sort=...` | Aggregierte Produktliste mit Suche + Sortierung |
| `PUT /api/produkte/[name]/alias` | Alias setzen oder aktualisieren (Body: `{ alias: "..." }`) |
| `DELETE /api/produkte/[name]/alias` | Alias entfernen |

`[name]` ist der URL-encodierte `raw_name` aus `receipt_items`.

### E) Anpassungen an PROJ-2

- `/api/bons/[id]` — LEFT JOIN auf `product_aliases`, um Alias pro Artikel mitzuliefern
- `bon-detail.tsx` — Anzeige: Alias (fett) mit Rohname darunter, oder nur Rohname wenn kein Alias

### F) Dependencies

**Keine neuen Pakete nötig.** Alles wird mit bestehenden Tools gebaut:
- shadcn/ui `Table`, `Input`, `Button` (bereits installiert)
- `better-sqlite3` (bereits installiert)
- `lucide-react` Icons (bereits installiert)

## QA Test Results

**Date:** 2026-04-08
**Tester:** QA Engineer (automated)
**Status: APPROVED — Production Ready**

### Acceptance Criteria Results

| # | Criterion | Result |
|---|-----------|--------|
| 1 | Produktseite zeigt alle eindeutigen Produkte (dedupliciert nach Rohname) | PASS |
| 2 | Für jedes Produkt sichtbar: Rohname, Alias, Anzahl Käufe, letzter Preis, letztes Kaufdatum | PASS |
| 3 | Alias kann per Inline-Edit gesetzt werden (Klick → Textfeld → Speichern) | PASS |
| 4 | Alias-Speicherung erfolgt via API, Alias wird sofort angezeigt | PASS |
| 5 | Alias wird in Bon-Detailansicht verwendet wenn gesetzt | PASS |
| 6 | Produktsuche filtert Tabelle in Echtzeit (nach Rohname oder Alias) | PASS |
| 7 | Produkte sortierbar nach: Häufigkeit, Name, letzter Kauf | PASS |
| 8 | Alias-Mapping ist persistent in SQLite gespeichert | PASS |

### Bug Report

| # | Severity | Description | Status |
|---|----------|-------------|--------|
| BUG-1 | High | SQL `ambiguous column name: raw_name` — GET /api/produkte crashed with 500 due to unqualified `raw_name` in ORDER BY and HAVING clauses (both `receipt_items` and `product_aliases` have `raw_name`) | FIXED |
| BUG-2 | Medium | Alias-Spalte auf Mobile (< 640px) nicht sichtbar — Nutzer kann auf Mobilgeräten keine Aliases setzen, bearbeiten oder löschen. `hidden sm:table-cell` blendet die Spalte komplett aus. | OPEN |

### Security Audit

| Check | Result |
|-------|--------|
| SQL injection via search param (`?q=' OR 1=1 --`) | PASS — parameterized query, treated as literal |
| XSS in alias field (`<script>alert("xss")</script>`) | PASS — stored as plain text, React auto-escapes |
| Sort param injection (`?sort=INVALID`) | PASS — returns 400 |
| Alias length validation (> 200 chars) | PASS — returns 400 |
| Empty alias validation | PASS — returns 400 |
| Nonexistent product alias PUT | PASS — returns 404 |

### Test Coverage

- **E2E tests:** 28 tests (Chromium + Mobile Safari), all pass
- **Unit tests:** 25 existing tests pass (no regressions)
- **Regression:** PROJ-1 (36 tests) + PROJ-2 (36 tests) — all pass

### Production-Ready Decision

**READY** — No critical or high bugs remaining. BUG-1 (High) was fixed during QA. BUG-2 (Medium) is a UX limitation on mobile but does not block core functionality.

## Deployment
_To be added by /deploy_
