# PROJ-36: Transaktions-Kategorien

## Status: Approved
**Created:** 2026-05-28
**Last Updated:** 2026-05-28
**Feature Folder:** `features/PROJ-36-transaktions-kategorien/`

## Dependencies
- PROJ-24 (Kontoauszug-Import) — Transaktionen müssen existieren
- PROJ-26 (Transaktions-Anreicherung) — `transaction_aliases`-Tabelle und Beschreibungs-Matching als Vorlage

---

## Übersicht

Transaktionen aus dem Kontoauszug können einer Kategorie zugeordnet werden. Die Kategorie wird regelbasiert auf Basis der Transaktionsbeschreibung vergeben (z.B. alle Transaktionen, deren Beschreibung „REWE" enthält → Kategorie „Lebensmittel"). Kategorieregeln werden in einem eigenen Reiter der Transaktionsansicht verwaltet.

---

## User Stories

- Als Nutzer möchte ich Kategorieregeln definieren können (Beschreibungsmuster → Kategoriename), damit jede passende Transaktion automatisch einer Kategorie zugeordnet wird.
- Als Nutzer möchte ich alle Kategorieregeln in einem eigenen Reiter der Transaktionsansicht tabellarisch sehen und bearbeiten können.
- Als Nutzer möchte ich in der Transaktionsliste sehen, welcher Kategorie eine Transaktion zugeordnet ist.
- Als Nutzer möchte ich Kategorieregeln anlegen, bearbeiten und löschen können, ohne die Seite neu zu laden.
- Als Nutzer möchte ich, dass die Kategorie einer Transaktion automatisch aktualisiert wird, wenn ich eine passende Regel ändere oder hinzufüge.

---

## Acceptance Criteria

### Datenhaltung
- [ ] Neue Tabelle `transaction_categories` mit Feldern: `id INTEGER PK`, `muster TEXT NOT NULL` (Beschreibungsmuster, case-insensitiv), `kategorie TEXT NOT NULL`, `created_at TEXT`
- [ ] Das Muster ist ein einfacher Substring-Match gegen `beschreibung` der Transaktion (kein Regex)
- [ ] Mehrere Muster können auf dieselbe Kategorie zeigen (z.B. „REWE" und „rewe sagt danke" → „Lebensmittel")
- [ ] Transaktionen erhalten ihre Kategorie zur Laufzeit durch JOIN / Matching — keine gespeicherte Kategorie pro Transaktion

### Kategorien-Reiter
- [ ] In der Transaktionsansicht gibt es einen neuen Reiter „Kategorien"
- [ ] Der Reiter zeigt eine Tabelle mit Spalten: Muster | Kategorie | Aktionen (Bearbeiten / Löschen)
- [ ] Eine neue Regel kann über ein Formular direkt im Reiter angelegt werden (Felder: Muster, Kategoriename)
- [ ] Bearbeitung einer Regel öffnet ein Inline-Edit oder Dialog mit denselben Feldern
- [ ] Löschen einer Regel zeigt eine Bestätigung und entfernt die Regel sofort aus der Liste

### Transaktionsliste
- [ ] In der Transaktionsliste wird die zugeordnete Kategorie pro Transaktion angezeigt (z.B. als Badge oder Spalte)
- [ ] Transaktionen ohne Kategorie zeigen kein Badge (kein Fehler, kein Platzhalter)
- [ ] Kategorie-Anzeige aktualisiert sich nach Regel-Änderungen ohne manuellen Reload

### API
- [ ] `GET /api/konto/transactions/categories` — Alle Kategorieregeln
- [ ] `POST /api/konto/transactions/categories` — Neue Regel anlegen
- [ ] `PUT /api/konto/transactions/categories/[id]` — Regel aktualisieren
- [ ] `DELETE /api/konto/transactions/categories/[id]` — Regel löschen
- [ ] `GET /api/konto/transactions` gibt Kategorie pro Transaktion zurück (via Matching im SQL oder App-Layer)

---

## Edge Cases

- Zwei Regeln matchen dieselbe Transaktion (z.B. „REWE" und „REWE SAGT DANKE") → die spezifischere Regel (längeres Muster) gewinnt; bei gleicher Länge: zuletzt angelegte Regel
- Muster ist leer → Anlegen nicht möglich, Validierungsfehler
- Kategoriename ist leer → Anlegen nicht möglich, Validierungsfehler
- Regel gelöscht → betroffene Transaktionen verlieren ihre Kategorie sofort (kein Orphan-Zustand, da keine gespeicherte Zuweisung)
- Regel bearbeitet (Muster geändert) → alte Transaktionen verlieren Kategorie, neue passende erhalten sie automatisch
- Sehr viele Regeln (>100) → Matching muss clientseitig oder per SQL-LIKE effizient bleiben

---

## Technical Notes (für /architecture)
- Matching erfolgt via `LIKE '%muster%'` in SQLite oder im App-Layer nach dem Laden
- Kein Regex-Support in v1 (nur Substring)
- Die Tabelle `transaction_categories` ist analog zu `transaction_aliases` aufgebaut
- Kein separater "Kategorie-Stammdaten"-Layer nötig — Kategorienamen entstehen durch Eingabe (kein Enum)

---

<!-- Subsequent phases add their own files to this folder:
     - context-map.md  ← /architecture
     - qa-results.md   ← /qa
     - deployment.md   ← /deploy
-->
