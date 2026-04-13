# PROJ-14: Saisonale Artikel-Markierung

## Status: Planned
**Created:** 2026-04-12
**Last Updated:** 2026-04-12
**Feature Folder:** `features/PROJ-14-saisonale-artikel/`

## Dependencies
- Requires: PROJ-1 (eBon Import & Parser) – Preisdaten mit Datum müssen vorhanden sein
- Requires: PROJ-3 (Produktdatenbank & Alias-Verwaltung) – Produktliste als Ausgangspunkt
- Mindestanforderung: Produkt muss Käufe über mehrere Monate verteilt haben

## User Stories
- Als Nutzer möchte ich einzelne Artikel als "saisonal" markieren können, damit das System weiß, dass Preisschwankungen dieses Produkts saisonal bedingt sind.
- Als Nutzer möchte ich für saisonale Artikel sehen, in welchen Monaten der Artikel typischerweise **günstig**, **teuer** oder **normal** ist, damit ich gezielt zum richtigen Zeitpunkt kaufe.
- Als Nutzer möchte ich den aktuellen Monat hervorgehoben sehen ("Jetzt ist Hochsaison / Vorsaison / Günstig-Phase"), damit ich sofort eine Kaufentscheidung treffen kann.

## Acceptance Criteria

### Saisonal markieren
- [ ] In der Produktliste gibt es pro Artikel eine Aktion "Als saisonal markieren" (Toggle, z.B. via Icon-Button oder Switch)
- [ ] Der saisonal-Status wird in der Datenbank persistent gespeichert (`seasonal: boolean`)
- [ ] Saisonale Artikel werden in der Produktliste mit einem Blatt-Icon (🌿 oder Leaf-Icon aus lucide) gekennzeichnet
- [ ] Das Markieren als saisonal löst keine automatische Analyse aus – die Analyse wird bei Aufruf der Detailansicht berechnet

### Saison-Analyse
- [ ] Die Analyse berechnet pro Monat (1–12) den **Durchschnittspreis** über alle verfügbaren Jahre
- [ ] Monate werden in drei Kategorien eingeteilt:
  - **Günstig** (grün): Durchschnittspreis liegt ≤ 10% über dem Jahres-Minimum
  - **Teuer** (rot): Durchschnittspreis liegt ≥ 10% über dem Jahres-Median
  - **Normal** (grau): alle anderen Monate
- [ ] Die Kategorisierung basiert auf dem **Monatsdurchschnitt über alle Kaufjahre** (nicht nur das aktuelle Jahr)
- [ ] Mindestens 2 Käufe in unterschiedlichen Monaten erforderlich, sonst: "Zu wenig Daten für Saisonanalyse"

### Anzeige in der Produktliste
- [ ] Für saisonale Artikel wird in der Produktliste eine zusätzliche Spalte "Saison" angezeigt
- [ ] Die Spalte zeigt den Status für den **aktuellen Monat**: "Günstig", "Normal" oder "Teuer" (farbig)
- [ ] Kein Saison-Status für nicht-saisonal markierte Artikel (Spalte bleibt leer)

### Detailansicht (Saison-Chart)
- [ ] Im Preis-Chart-Sheet erscheint für saisonale Artikel ein Saison-Kalender: 12 Monate als farbige Badges (grün/grau/rot)
- [ ] Der aktuelle Monat ist hervorgehoben (Rahmen oder Bold)
- [ ] Tooltip pro Monat: "Ø Preis: 1,49 €" (Durchschnitt aller Jahre für diesen Monat)

## Edge Cases
- Produkt hat nur Käufe in einem Monat aller Jahre → "Zu wenig Daten" (mind. 2 unterschiedliche Monate nötig)
- Produkt wird als saisonal markiert, hat aber keine Preisschwankungen → alle 12 Monate "Normal"
- Aktueller Monat hat historisch noch keine Kaufdaten → Anzeige "Keine Daten für diesen Monat"
- Nutzer hebt saisonal-Markierung auf → Saison-Spalte und Detailansicht verschwinden, Flag wird zurückgesetzt
- Sehr wenige Datenpunkte (z.B. nur 3 Käufe über 3 Monate) → Analyse wird angezeigt mit Hinweis "Basiert auf wenigen Datenpunkten"

## Technical Requirements
- DB-Migration: neues Feld `seasonal BOOLEAN DEFAULT 0` in der `products`-Tabelle (oder in `product_aliases` wenn dort persistiert)
- Neue API-Route: `PATCH /api/produkte/[name]/seasonal` – setzt seasonal-Flag
- Neue API-Route: `GET /api/produkte/[name]/saison` – gibt Monats-Durchschnittspreise + Kategorisierung zurück
- Erweiterung `GET /api/produkte`: liefert `seasonal` Flag + `current_month_season` ("günstig"/"normal"/"teuer"/null)
- Anpassung `src/components/product-list.tsx`: Leaf-Icon, Saison-Spalte, Toggle-Aktion
- Anpassung `src/components/price-chart-sheet.tsx`: Saison-Kalender-Abschnitt
