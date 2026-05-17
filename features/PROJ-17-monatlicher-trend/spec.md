# PROJ-17: Monatlicher Ausgaben-Langzeittrend

## Status: Planned
**Created:** 2026-05-17
**Last Updated:** 2026-05-17
**Feature Folder:** `features/PROJ-17-monatlicher-trend/`

## Dependencies
- PROJ-1 (eBon Import & Parser)
- PROJ-5 (Statistik-Dashboard – bestehende monatliche Ansicht)

## User Stories
- Als Nutzer möchte ich alle meine Monatseinkäufe als Zeitreihe sehen (ohne Zeitfilter), damit ich langfristige Ausgaben-Trends über mehrere Jahre erkennen kann.
- Als Nutzer möchte ich im selben Chart erkennbare Muster erkennen (z.B. saisonale Unterschiede), damit ich meine Ausgabengewohnheiten besser verstehe.

## Acceptance Criteria
- [ ] Ein Linien- oder Balkendiagramm zeigt alle verfügbaren Monate als Zeitreihe (ohne Kürzung durch einen Zeitfilter)
- [ ] Die X-Achse zeigt Monat + Jahr (z.B. "Jan 24", "Feb 24", ..., "Mai 26")
- [ ] Die Y-Achse zeigt Ausgaben in EUR
- [ ] Monate ohne Einkäufe werden als 0 EUR dargestellt (kein Gap in der Kurve)
- [ ] Das neue Diagramm ist vom bestehenden "Monatliche Ausgaben"-Widget (3M/6M/12M) getrennt – eigene Karte im Dashboard
- [ ] Ein Durchschnittswert (über alle Monate) wird als horizontale Linie oder Kennzahl angezeigt

## Edge Cases
- Nur 1 Monat mit Daten → Diagramm zeigt einen einzelnen Datenpunkt (kein Fehler)
- Lücken von mehreren Monaten ohne Einkäufe → werden als 0 EUR gefüllt
- Sehr viele Monate (z.B. 36+) → X-Achse wird mit jeder 3. oder 4. Beschriftung lesbar gehalten

## Technical Requirements
- Performance: < 300ms
- Die bestehende `/api/statistiken/monatlich`-Route kann erweitert oder eine neue Route `GET /api/statistiken/monatlich-alle` kann erstellt werden
- Der Zeitfilter der bestehenden Karte wird NICHT verändert
