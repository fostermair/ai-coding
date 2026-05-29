# PROJ-34: Import-Ansicht mit Reitern & Datei-Historien

## Status: Approved
## Created: 2026-05-27

## Dependencies
- PROJ-1 (eBon Import & Parser)
- PROJ-19 (AVIS-Import)
- PROJ-24 (Kontoauszug-Import)
- PROJ-32 (Bestellbestätigung-Import)

---

## Context

Die Import-Seite enthält aktuell alle vier Import-Bereiche (eBon, AVIS, Bestellungen, Kontoauszüge) in einer einzigen, langen Scroll-Ansicht (`ImportZone`, ~1346 Zeilen). Für bessere Übersichtlichkeit und eine neue Historien-Funktion soll die Seite in fünf Reiter aufgeteilt werden. Reiter 2–4 erhalten zusätzlich eine Tabelle aller bereits importierten Dateien mit Importdatum und eBon-Matching-Status.

---

## User Stories

**US-1 — Reiter-Navigation**
Als Nutzer möchte ich auf der Import-Seite zwischen fünf Reitern wechseln können, damit ich schnell zum gewünschten Import-Bereich gelange, ohne scrollen zu müssen.

**US-2 — eBon-Historientabelle**
Als Nutzer möchte ich im Reiter „eBon" eine Tabelle aller importierten eBon-PDFs sehen (Dateiname, Importdatum, Markt, Bon-Datum, Gesamtbetrag, Kontoauszug-Match-Status), damit ich den Importstatus meiner Bons auf einen Blick erkenne.

**US-3 — AVIS-Historientabelle**
Als Nutzer möchte ich im Reiter „AVIS" eine Tabelle aller importierten AVIS-PDFs sehen (Dateiname, Importdatum, Bestellnummer, verknüpfter eBon falls gematcht), damit ich erkenne, welche AVIS-Dateien erfolgreich einem Bon zugeordnet wurden.

**US-4 — Bestellungen-Historientabelle**
Als Nutzer möchte ich im Reiter „Bestellungen" eine Tabelle aller importierten Bestellbestätigungen sehen (Dateiname, Importdatum, Bestellnummer, Bestelldatum, verknüpfter eBon falls gematcht), damit ich erkenne, welche Bestellungen einem Kassenbon zugeordnet wurden.

**US-5 — Kontoauszüge-Historientabelle**
Als Nutzer möchte ich im Reiter „Kontoauszüge" eine Tabelle aller importierten Kontoauszug-PDFs sehen (Dateiname, Importdatum, Zeitraum, Anzahl Transaktionen), damit ich den Überblick über importierte Kontoauszüge behalte.

---

## Acceptance Criteria

### Reiter-Navigation
- [ ] Die Import-Seite zeigt fünf Reiter: „Import", „eBons", „AVIS", „Bestellungen", „Kontoauszüge"
- [ ] Der aktive Reiter ist visuell hervorgehoben
- [ ] Beim Laden der Seite ist Reiter 1 („Import") aktiv
- [ ] Reiter-Wechsel ist ohne Seitenneuladen möglich (clientseitig)

### Reiter 1 — Import (bisherige Ansicht)
- [ ] Der bestehende `ImportZone`-Inhalt (alle vier Drag-and-drop-Bereiche) bleibt vollständig erhalten und funktionsfähig

### Reiter 2 — eBons
- [ ] Zeigt eine Tabelle aller importierten eBons aus `import_log`
- [ ] Spalten: Dateiname (aus `pdf_path`), Importdatum, Markt, Bon-Datum, Gesamtbetrag, Kontoauszug-Match (✓ / –)
- [ ] Zeilen sind nach Importdatum absteigend sortiert
- [ ] Leerer Zustand: Hinweistext „Noch keine eBons importiert"

### Reiter 3 — AVIS
- [ ] Zeigt eine Tabelle aller importierten AVIS-Dateien aus `import_log`
- [ ] Spalten: Dateiname, Importdatum, Bestellnummer, verknüpfter eBon (Bon-Datum + Betrag oder „–")
- [ ] Matching-Erfolg: grünes Badge wenn eBon gefunden, grau wenn nicht
- [ ] Zeilen sind nach Importdatum absteigend sortiert
- [ ] Leerer Zustand: Hinweistext „Noch keine AVIS importiert"

### Reiter 4 — Bestellungen
- [ ] Zeigt eine Tabelle aller importierten Bestellbestätigungen aus `import_log`
- [ ] Spalten: Dateiname, Importdatum, Bestellnummer, Bestelldatum, Betrag, verknüpfter eBon (Bon-Datum + Betrag oder „–")
- [ ] Matching-Erfolg: grünes Badge wenn eBon gefunden, grau wenn nicht
- [ ] Zeilen sind nach Importdatum absteigend sortiert
- [ ] Leerer Zustand: Hinweistext „Noch keine Bestellungen importiert"

### Reiter 5 — Kontoauszüge
- [ ] Zeigt eine Tabelle aller importierten Kontoauszüge aus `bank_statement_log`
- [ ] Spalten: Dateiname, Importdatum, Zeitraum (von–bis), Anzahl Transaktionen
- [ ] Zeilen sind nach Importdatum absteigend sortiert
- [ ] Leerer Zustand: Hinweistext „Noch keine Kontoauszüge importiert"

---

## Edge Cases
- Wenn `pdf_path` NULL ist (z. B. Paperless-Imports), wird stattdessen eine ID oder „–" angezeigt
- Tabellen sind scrollbar bei vielen Einträgen (max. sichtbare Höhe begrenzt)
- Reiter-Zustand wird beim Navigieren weg und zurück zurückgesetzt (kein URL-State nötig)

---

## Out of Scope
- Löschen von Import-Einträgen aus den Historientabellen
- Filterung oder Suche in den Historientabellen
- Pagination (einfaches Scrollen reicht für MVP)

---

## Neue API-Endpunkte
- `GET /api/import/history?type=ebon` — eBon-Importhistorie mit Kontoauszug-Match-Status
- `GET /api/import/history?type=avis` — AVIS-Importhistorie mit verlinktem eBon
- `GET /api/import/history?type=bestellung` — Bestellung-Importhistorie mit verlinktem eBon
- `GET /api/import/history?type=kontoauszug` — Kontoauszug-Importhistorie

---

## Kritische Dateien
- `src/app/import/page.tsx` — Import-Seite (Reiter-Wrapper)
- `src/components/import-zone.tsx` — Bisherige Import-Ansicht (wird zu Reiter 1)
- `src/lib/db.ts` — Datenbankschema (`import_log`, `bank_statement_log`, `receipts`)
- `features/INDEX.md` — Feature-Tracking
