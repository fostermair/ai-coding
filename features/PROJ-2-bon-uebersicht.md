# PROJ-2: Bon-Übersicht & Detailansicht

## Status: Planned
**Created:** 2026-04-07
**Last Updated:** 2026-04-07

## Dependencies
- Requires: PROJ-1 (eBon Import & Parser) – Bons müssen in der DB vorhanden sein

## User Stories
- Als Nutzer möchte ich alle importierten Bons in einer sortierten Liste sehen, damit ich einen Überblick habe
- Als Nutzer möchte ich einen Bon anklicken können, um alle Einzelpositionen zu sehen
- Als Nutzer möchte ich Bons nach Datum filtern können, damit ich Einkäufe in einem Zeitraum finden kann
- Als Nutzer möchte ich einen Bon löschen können, damit ich Fehlimporte bereinigen kann
- Als Nutzer möchte ich in der Detailansicht sehen, welche Rabatte auf welche Produkte angewendet wurden

## Acceptance Criteria
- [ ] Übersichtsseite zeigt alle Bons als Tabelle/Liste: Datum, Uhrzeit, Markt, Bon-Nr., Anzahl Artikel, Summe, Zahlungsart
- [ ] Liste ist standardmäßig nach Datum absteigend sortiert (neueste zuerst)
- [ ] Filterung nach Datumsbereich möglich (Von-Bis Datepicker)
- [ ] Klick auf einen Bon öffnet Detailansicht
- [ ] Detailansicht zeigt: alle Produktzeilen mit Name (Alias wenn vorhanden), Menge, Einzelpreis, Gesamtpreis, MwSt-Code
- [ ] Rabatte werden direkt unter dem zugehörigen Produkt angezeigt (eingerückt, negativ, rot)
- [ ] Pfand- und Leergut-Positionen werden als eigene Gruppe dargestellt
- [ ] MwSt-Aufschlüsselung (A/B) am Ende der Detailansicht sichtbar
- [ ] Bon kann aus der Detailansicht gelöscht werden (mit Bestätigungs-Dialog)
- [ ] Gesamt-Anzahl importierter Bons und Gesamtausgaben als Summary-Header sichtbar

## Edge Cases
- Keine Bons importiert → leere Liste mit Hinweis "Noch keine Bons importiert – verwende den Import"
- Bon mit negativer Summe (Leergut-Rückgabe) → wird korrekt mit "-" in der Liste angezeigt
- Detailansicht für Bon mit Konzessionär-Artikel → separater Block mit Konzessionär-Info
- Filtern ergibt keine Treffer → leere Liste mit Hinweis

## Technical Requirements
- Seite: `src/app/page.tsx` (Hauptseite = Bon-Übersicht)
- Detailansicht: `src/app/bon/[id]/page.tsx`
- Daten via API Route: `GET /api/bons` und `GET /api/bons/[id]`
- DELETE: `DELETE /api/bons/[id]`

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
