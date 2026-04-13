# PROJ-13: Ausgeblendete Artikel als separater Tab

## Status: Planned
**Created:** 2026-04-12
**Last Updated:** 2026-04-12
**Feature Folder:** `features/PROJ-13-ausgeblendete-artikel-tab/`

## Dependencies
- Requires: PROJ-3 (Produktdatenbank & Alias-Verwaltung) – Produktliste als Ausgangspunkt
- Requires: PROJ-8 (Produkt-Ausblendung für Statistiken) – Ausblenden-Logik

## User Stories
- Als Nutzer möchte ich, dass ausgeblendete Artikel **nicht mehr in der Haupttabelle** erscheinen, damit die Produktliste übersichtlicher wird und ich mich auf relevante Produkte konzentrieren kann.
- Als Nutzer möchte ich ausgeblendete Artikel in einem **eigenen Tab "Ausgeblendet"** einsehen können, damit ich den Überblick über alle ausgeblendeten Produkte behalte und sie bei Bedarf wieder einblenden kann.
- Als Nutzer möchte ich im Tab-Header sehen, wie viele Produkte ausgeblendet sind (z.B. "Ausgeblendet (5)"), damit ich die Anzahl ohne Tabwechsel erkenne.

## Acceptance Criteria

### Haupt-Tab "Produkte"
- [ ] Der Haupt-Tab zeigt standardmäßig nur **nicht-ausgeblendete** Artikel (equivalent zum bisherigen Filter "Aktiv")
- [ ] Der bisherige Dropdown-Filter (Alle / Aktiv / Ausgeblendet) entfällt ersatzlos
- [ ] Suche, Sortierung und alle anderen Aktionen (Alias vergeben, Ausblenden) bleiben unverändert

### Tab "Ausgeblendet (N)"
- [ ] Ein zweiter Tab zeigt alle ausgeblendeten Artikel in einer separaten Tabelle
- [ ] Die Zahl N im Tab-Header zeigt die aktuelle Anzahl ausgeblendeter Artikel
- [ ] Tabelle enthält die gleichen Spalten wie die Haupttabelle (Name, Alias, Anzahl Käufe, Letzter Kauf, Preistrend)
- [ ] Jeder Eintrag hat einen Button "Wieder einblenden" (analog zu PROJ-8) der direkt in dieser Tabelle funktioniert
- [ ] Nach Einblenden eines Artikels verschwindet er sofort aus dem Ausgeblendet-Tab und erscheint in der Hauptliste

### Konsistenz
- [ ] Beim Ausblenden eines Artikels im Haupt-Tab verschwindet er sofort aus der Hauptliste (kein Reload nötig)
- [ ] Die Gesamtzahl im Tab-Header aktualisiert sich automatisch nach Aktionen

## Edge Cases
- Keine ausgeblendeten Artikel → Tab "Ausgeblendet (0)" ist sichtbar, zeigt leeren Zustand mit Hinweistext
- Nutzer blendet letzten aktiven Artikel aus → Haupttabelle zeigt Leer-Zustand mit Hinweis
- Suche im Ausgeblendet-Tab: Suche filtert nur die ausgeblendeten Artikel (kein Tab-übergreifendes Suchen)
- Seitenreload → gewählter Tab wird nicht persistiert (Default: Haupt-Tab aktiv)

## Technical Requirements
- Keine API-Änderungen nötig: bestehende `GET /api/produkte` liefert bereits `excluded_from_stats` Flag
- Refactoring in `src/components/product-list.tsx`: FilterKey "all"/"active"/"excluded" → Tab-Struktur via shadcn `Tabs`-Komponente
- Tabs-Komponente: `src/components/ui/tabs.tsx` ist bereits installiert
- State: Zwei separate gefilterte Listen aus dem gleichen API-Response berechnen (kein zweiter API-Call)
