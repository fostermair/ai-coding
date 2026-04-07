# PROJ-3: Produktdatenbank & Alias-Verwaltung

## Status: Planned
**Created:** 2026-04-07
**Last Updated:** 2026-04-07

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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
