# PROJ-10: Preistrend-Indikator in Produktliste

## Status: Planned
**Created:** 2026-04-11
**Last Updated:** 2026-04-11

## Dependencies
- Requires: PROJ-1 (eBon Import & Parser) – Preisdaten müssen vorhanden sein
- Requires: PROJ-3 (Produktdatenbank & Alias-Verwaltung) – Produktliste als Ausgangspunkt

## User Stories
- Als Nutzer möchte ich in der Produktliste auf einen Blick erkennen, ob ein Produkt teurer oder günstiger geworden ist, damit ich ohne Chart-Öffnung einen schnellen Überblick habe
- Als Nutzer möchte ich den konkreten Preistrend (Prozent-Veränderung) neben dem Produkt sehen, damit ich die Größenordnung der Veränderung sofort einschätzen kann

## Acceptance Criteria

### Trend-Indikator-Badge in Produktliste
- [ ] Jedes Produkt in der Produktliste (PROJ-3) zeigt einen Trend-Badge, wenn mind. 2 Käufe vorliegen
- [ ] Badge zeigt: Richtungspfeil + prozentuale Veränderung vom ersten zum letzten Kauf
  - Steigerung: roter Badge mit ↑ (z.B. "↑ 12,3%")
  - Senkung: grüner Badge mit ↓ (z.B. "↓ 5,1%")
  - Gleichbleibend (0%): grauer Badge mit → ("→ 0%")
- [ ] Nur 1 Kauf oder keine Preisdaten → kein Badge (kein Platzhalter, kein "-")
- [ ] Badge ist in der Produktliste als eigene Spalte "Preistrend" dargestellt
- [ ] Klick auf Badge öffnet den Preis-Chart-Sheet (PROJ-4) für das Produkt

### Performance
- [ ] Preistrend-Daten werden zusammen mit der Produktliste in einer API-Antwort geliefert (kein separater Request pro Produkt)
- [ ] Ladezeit der Produktseite erhöht sich um maximal 200ms gegenüber vorher

## Edge Cases
- Produkt hat nur 1 Kauf → kein Badge, keine leere Spalte (Zelle bleibt leer)
- Produkt hat Käufe alle zum identischen Preis → grauer "→ 0%" Badge
- Preis des letzten Kaufs war rabattiert → tatsächlich gezahlter Preis wird verwendet (kein "bereinigter" Preis)
- Leergut-Positionen (Preis ≤ 0) → werden bei der Trendberechnung ausgeschlossen
- Sehr viele Produkte (200+) → Trend-Berechnung läuft in einer einzelnen SQL-Aggregations-Query (kein N+1)

## Technical Requirements
- Erweiterung der bestehenden API: `GET /api/produkte` gibt bereits aggregierte Daten zurück
- Neue Felder in der API-Antwort: `first_price_cents`, `last_price_cents`, `price_trend_pct` (optional, null wenn <2 Käufe)
- Berechnung in SQLite via Subquery (erster und letzter Kaufpreis pro `raw_name`)
- Anpassung von: `src/app/api/produkte/route.ts` + `src/components/product-list.tsx`

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
