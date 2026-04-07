# PROJ-5: Statistik-Dashboard

## Status: Planned
**Created:** 2026-04-07
**Last Updated:** 2026-04-07

## Dependencies
- Requires: PROJ-1 (eBon Import & Parser) – Datengrundlage
- Requires: PROJ-3 (Produktdatenbank & Alias-Verwaltung) – Alias-Namen für lesbare Darstellung

## User Stories
- Als Nutzer möchte ich meine monatlichen Ausgaben als Trend sehen, damit ich meinen Konsum über Zeit nachvollziehe
- Als Nutzer möchte ich die Produkte sehen, die ich am häufigsten kaufe, damit ich meine Stamm-Einkäufe kenne
- Als Nutzer möchte ich sehen, wie viel ich durch Rabatte gespart habe (Rabatt-Tracking), damit ich den Wert von Aktionen einschätzen kann
- Als Nutzer möchte ich meine Ausgaben nach MwSt-Kategorie aufgeschlüsselt sehen (Lebensmittel vs. Nicht-Lebensmittel), damit ich mein Ausgabenprofil verstehe

## Acceptance Criteria

### Monatliche Ausgaben-Trends
- [ ] Balken- oder Linien-Chart: X-Achse = Monat/Jahr, Y-Achse = Gesamtausgaben in EUR
- [ ] Vergleich zum Vormonat sichtbar (absolut und prozentual, z.B. "+12% vs. Vormonat")
- [ ] Zeitraum-Filter: letzte 3 Monate, 6 Monate, 12 Monate, alles

### Häufigste Produkte
- [ ] Top-10-Liste der am häufigsten gekauften Produkte (nach Anzahl der Einkäufe)
- [ ] Darstellung: Produktname (Alias wenn vorhanden), Kaufhäufigkeit, Gesamtausgaben für dieses Produkt
- [ ] Zweite Ansicht: Top-10 nach Gesamtausgaben (welche Produkte kosten mich am meisten?)
- [ ] Klick auf Produkt führt zur Preisentwicklungs-Ansicht (PROJ-4)

### Rabatt-Tracking
- [ ] Gesamt-Ersparnis durch Rabatte (Summe aller negativen Rabatt-Positionen)
- [ ] Ersparnis aufgeteilt nach Monat als Balkendiagramm
- [ ] Liste der häufigsten Rabattaktionen (z.B. "Weihn. Süßwaren 50%")

### MwSt-Kategorien-Aufteilung
- [ ] Donut/Pie-Chart: Anteil A (19%) vs. B (7%) an Gesamtausgaben
- [ ] Absolute Beträge zusätzlich sichtbar

## Edge Cases
- Weniger als 2 Monate Daten → Trend-Chart zeigt nur vorhandene Daten, kein Vormonatsvergleich
- Alle Bons gelöscht → Dashboard zeigt Leer-Zustand mit Hinweis
- Bon mit negativer Summe (Leergut-Rückgabe) → wird in Monatsstatistik korrekt als negativ eingerechnet

## Technical Requirements
- Seite: `src/app/statistiken/page.tsx`
- API: `GET /api/statistiken/monatlich`, `GET /api/statistiken/top-produkte`, `GET /api/statistiken/rabatte`, `GET /api/statistiken/mwst`
- Chart-Library: `recharts`

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_
